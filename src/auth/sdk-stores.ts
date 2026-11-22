import type { SessionStore, StoredRecord, TokenStore } from '@sovereignfs/sdk';
import type { Database, Migration } from '@sovereignfs/auth/database';
import { createHash } from 'node:crypto';
import { CryptoError, open, seal } from '../crypto/envelope';
import type { KeyRing } from '../crypto/keys';

/**
 * What the SDK keeps for signing in through core (sdk §9.1, §5.1), in the auth store: the sign-ins still pending, and each person's refresh
 * token, sealed with Shopper's key ring. `@sovereignfs/auth/core` signs in on the SDK's steps; the session itself is the package's.
 */
export const SDK_STORE_MIGRATIONS_TABLE = 'shopper_sdk_store_migrations';

export function sdkStoreMigrations(family: Database['family']): Migration[] {
  const time = family === 'postgres' ? 'bigint' : 'integer';
  return [
    {
      name: '0000_sdk_stores',
      sql: [
        `CREATE TABLE sv_sessions (id text PRIMARY KEY, kind text NOT NULL, sub text, sid text, data text NOT NULL, expires_at ${time} NOT NULL)`,
        'CREATE INDEX sv_sessions_sub ON sv_sessions (sub)',
        'CREATE INDEX sv_sessions_sid ON sv_sessions (sid)',
        'CREATE INDEX sv_sessions_expires ON sv_sessions (expires_at)',
        `CREATE TABLE sv_tokens (sub text PRIMARY KEY, sealed text NOT NULL, fingerprint text NOT NULL, lease_until ${time} NOT NULL DEFAULT 0)`,
      ].join('\n--> statement-breakpoint\n'),
    },
  ];
}

/** The SDK's pending sign-ins (sdk §9.1). Nothing is returned after its expiry. */
export function sdkSessionStore(database: () => Promise<Database>): SessionStore {
  return {
    async get(id) {
      const { rows } = await (
        await database()
      ).run('SELECT kind, sub, sid, data FROM sv_sessions WHERE id = ? AND expires_at > ?', [
        id,
        Date.now(),
      ]);
      const row = rows[0];
      if (!row) return undefined;
      return {
        kind: row.kind as StoredRecord['kind'],
        ...(row.sub ? { sub: String(row.sub) } : {}),
        ...(row.sid ? { sid: String(row.sid) } : {}),
        data: JSON.parse(String(row.data)) as Record<string, unknown>,
      };
    },
    async set(id, record, expiresAt) {
      const db = await database();
      await db.run(
        `INSERT INTO sv_sessions (id, kind, sub, sid, data, expires_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, sub = excluded.sub, sid = excluded.sid, data = excluded.data,
           expires_at = excluded.expires_at`,
        [
          id,
          record.kind,
          record.sub ?? null,
          record.sid ?? null,
          JSON.stringify(record.data),
          expiresAt,
        ],
      );
      // What has expired is of no use to anyone; a small share of writes clears it.
      if (Math.random() < 0.02)
        await db.run('DELETE FROM sv_sessions WHERE expires_at <= ?', [Date.now()]);
    },
    async delete(id) {
      await (await database()).run('DELETE FROM sv_sessions WHERE id = ?', [id]);
    },
    async deleteMatching(match) {
      const db = await database();
      if (match.sub !== undefined)
        await db.run('DELETE FROM sv_sessions WHERE sub = ?', [match.sub]);
      if (match.sid !== undefined)
        await db.run('DELETE FROM sv_sessions WHERE sid = ?', [match.sid]);
    },
  };
}

/** How long one process may hold a person's refresh token while it refreshes it, and how often another looks again. */
const LEASE_MS = 30_000;
const WAIT_MS = 100;

const fingerprint = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * A person's refresh token, sealed. Core rotates it on every use and takes one used twice for theft, so `write` is a conditional update and
 * `lock` takes a lease on the row, so two processes never refresh at once (sdk §5.1). A token sealed under a key the ring no longer has is
 * no token: the person signs in through core again.
 */
export function sdkTokenStore(database: () => Promise<Database>, ring: () => KeyRing): TokenStore {
  const binding = (sub: string) => ({ id: sub, purpose: 'sv_tokens' });
  return {
    async read(sub) {
      const { rows } = await (
        await database()
      ).run('SELECT sealed FROM sv_tokens WHERE sub = ?', [sub]);
      if (!rows[0]) return undefined;
      try {
        return open(String(rows[0].sealed), binding(sub), ring());
      } catch (error) {
        if (error instanceof CryptoError) return undefined;
        throw error;
      }
    },
    async write(sub, next, previous) {
      const db = await database();
      const sealed = seal(next, binding(sub), ring().current);
      if (previous === undefined) {
        const done = await db.run(
          'INSERT INTO sv_tokens (sub, sealed, fingerprint) VALUES (?, ?, ?) ON CONFLICT (sub) DO NOTHING',
          [sub, sealed, fingerprint(next)],
        );
        return done.rowsAffected === 1;
      }
      const done = await db.run(
        'UPDATE sv_tokens SET sealed = ?, fingerprint = ? WHERE sub = ? AND fingerprint = ?',
        [sealed, fingerprint(next), sub, fingerprint(previous)],
      );
      return done.rowsAffected === 1;
    },
    async lock(sub, work) {
      const db = await database();
      const take = async () =>
        (
          await db.run('UPDATE sv_tokens SET lease_until = ? WHERE sub = ? AND lease_until < ?', [
            Date.now() + LEASE_MS,
            sub,
            Date.now(),
          ])
        ).rowsAffected === 1;
      const exists = async () =>
        (await db.run('SELECT 1 AS found FROM sv_tokens WHERE sub = ?', [sub])).rows.length > 0;
      // A token nobody holds yet needs no lease: its first write is conditional. Otherwise wait for the lease, at most as long as one lasts.
      const until = Date.now() + LEASE_MS;
      let held = await take();
      while (!held && (await exists()) && Date.now() <= until) {
        await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
        held = await take();
      }
      try {
        return await work();
      } finally {
        if (held) await db.run('UPDATE sv_tokens SET lease_until = 0 WHERE sub = ?', [sub]);
      }
    },
    async delete(sub) {
      await (await database()).run('DELETE FROM sv_tokens WHERE sub = ?', [sub]);
    },
  };
}
