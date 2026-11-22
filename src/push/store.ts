import { sql } from 'drizzle-orm';
import type {
  ClaimedPush,
  PushMessage,
  PushStore,
  QueuedPush,
  Subscription,
} from '@sovereignfs/push';
import { MAX_DEVICES } from '@sovereignfs/push';
import type { KeyRing } from '../crypto/keys';
import { sealRow, unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { appTable } from '../db/tables';

/**
 * Shopper's devices and waiting pushes (RFC 0002), in its own database, as `@sovereignfs/push` asks of a store: every method names the account where it
 * acts for one, a device's keys are sealed by the server under its own key (DESIGN.md §13.4) and given back opened, and a claim is one statement, so that
 * two runners never send one push. There are no foreign keys (DESIGN.md §20.1): what a cascade would do is written out, device and pushes together.
 */
const PURPOSE = 'push_device';

export function pushStore(database: Database, ring: KeyRing): PushStore {
  const devices = appTable(database, 'push_device');
  const outbox = appTable(database, 'push_outbox');
  // Sealed as any sealed row is (`src/crypto/sealed.ts`), so that a new server key re-wraps them with the rest (`src/crypto/rotate.ts`).
  const sealKeys = (subscription: Subscription) =>
    sealRow(
      PURPOSE,
      subscription.endpoint,
      { p256dh: subscription.p256dh, auth: subscription.auth },
      ring,
    );
  const openKeys = (endpoint: string, sealed: string): { p256dh: string; auth: string } => {
    const opened = unsealRow(PURPOSE, endpoint, sealed, ring);
    return { p256dh: String(opened.p256dh ?? ''), auth: String(opened.auth ?? '') };
  };

  return {
    async saveDevice(account, subscription, now) {
      // A device that was another account's takes none of that account's pushes with it.
      await dbRun(
        database,
        sql`DELETE FROM ${outbox} WHERE endpoint = ${subscription.endpoint} AND account_id <> ${account}`,
      );
      await dbRun(
        database,
        sql`INSERT INTO ${devices} (id, account_id, sealed, saved_at)
            VALUES (${subscription.endpoint}, ${account}, ${sealKeys(subscription)}, ${now})
            ON CONFLICT (id) DO UPDATE SET account_id = excluded.account_id, sealed = excluded.sealed, saved_at = excluded.saved_at`,
      );
      // Ten devices an account: the ones turned on longest ago go, with their pushes.
      const kept = await dbAll<{ endpoint: string }>(
        database,
        sql`SELECT id AS endpoint FROM ${devices} WHERE account_id = ${account} ORDER BY saved_at DESC, id`,
      );
      const extra = kept.slice(MAX_DEVICES);
      for (const { endpoint } of extra) await this.removeDevice(account, endpoint);
    },
    async removeDevice(account, endpoint) {
      await dbRun(
        database,
        sql`DELETE FROM ${outbox} WHERE endpoint = ${endpoint} AND account_id = ${account}`,
      );
      await dbRun(
        database,
        sql`DELETE FROM ${devices} WHERE id = ${endpoint} AND account_id = ${account}`,
      );
    },
    async devices(account) {
      const rows = await dbAll<{ endpoint: string; sealed: string }>(
        database,
        sql`SELECT id AS endpoint, sealed FROM ${devices} WHERE account_id = ${account} ORDER BY saved_at, id`,
      );
      return rows.map((row) => ({ endpoint: row.endpoint, ...openKeys(row.endpoint, row.sealed) }));
    },
    async removeAccount(account) {
      await dbRun(database, sql`DELETE FROM ${outbox} WHERE account_id = ${account}`);
      await dbRun(database, sql`DELETE FROM ${devices} WHERE account_id = ${account}`);
    },
    async forget(endpoint) {
      await dbRun(database, sql`DELETE FROM ${outbox} WHERE endpoint = ${endpoint}`);
      await dbRun(database, sql`DELETE FROM ${devices} WHERE id = ${endpoint}`);
    },
    async enqueue(items: readonly QueuedPush[]) {
      for (const item of items)
        // Only for a device that is the account's: a push is never queued for another's.
        await dbRun(
          database,
          sql`INSERT INTO ${outbox} (id, account_id, endpoint, message, attempts, due_at, claimed_until, expires_at)
              SELECT ${item.id}, ${item.account}, ${item.endpoint}, ${JSON.stringify(item.message)}, 0, ${item.dueAt}, 0, ${item.expiresAt}
              FROM ${devices} WHERE id = ${item.endpoint} AND account_id = ${item.account}`,
        );
    },
    async claim(now, leaseMs, batch) {
      const claimed = await dbAll<{
        id: string;
        account_id: string;
        endpoint: string;
        message: string;
        attempts: number | string;
        due_at: number | string;
        expires_at: number | string;
      }>(
        database,
        database.dialect === 'postgres'
          ? sql`UPDATE ${outbox} SET attempts = attempts + 1, claimed_until = ${now + leaseMs}
                WHERE id IN (SELECT id FROM ${outbox} WHERE due_at <= ${now} AND claimed_until <= ${now}
                             ORDER BY due_at, id LIMIT ${batch} FOR UPDATE SKIP LOCKED)
                  AND due_at <= ${now} AND claimed_until <= ${now}
                RETURNING id, account_id, endpoint, message, attempts, due_at, expires_at`
          : sql`UPDATE ${outbox} SET attempts = attempts + 1, claimed_until = ${now + leaseMs}
                WHERE id IN (SELECT id FROM ${outbox} WHERE due_at <= ${now} AND claimed_until <= ${now}
                             ORDER BY due_at, id LIMIT ${batch})
                  AND due_at <= ${now} AND claimed_until <= ${now}
                RETURNING id, account_id, endpoint, message, attempts, due_at, expires_at`,
      );
      const out: ClaimedPush[] = [];
      for (const row of claimed) {
        const device = await dbAll<{ sealed: string }>(
          database,
          sql`SELECT sealed FROM ${devices} WHERE id = ${row.endpoint} AND account_id = ${row.account_id}`,
        );
        const found = device[0];
        if (!found) continue;
        out.push({
          id: row.id,
          account: row.account_id,
          endpoint: row.endpoint,
          message: JSON.parse(row.message) as PushMessage,
          dueAt: Number(row.due_at),
          expiresAt: Number(row.expires_at),
          attempts: Number(row.attempts),
          subscription: { endpoint: row.endpoint, ...openKeys(row.endpoint, found.sealed) },
        });
      }
      // In the order they fell due: what a statement that changes rows answers comes in no order of its own.
      return out.sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));
    },
    async done(id) {
      await dbRun(database, sql`DELETE FROM ${outbox} WHERE id = ${id}`);
    },
    async later(id, at) {
      await dbRun(
        database,
        sql`UPDATE ${outbox} SET due_at = ${at}, claimed_until = 0 WHERE id = ${id}`,
      );
    },
    async drop(id) {
      await dbRun(database, sql`DELETE FROM ${outbox} WHERE id = ${id}`);
    },
  };
}
