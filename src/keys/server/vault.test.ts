import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../db/client';
import { dbAll, dbRun } from '../../db/exec';
import { runMigrations } from '../../db/migrate';
import { freshDatabase, testTarget } from '../../db/test-support';
import { bound } from './database';
import { vaultOf } from './vault';

const { leg } = testTarget();

describe('a statement in the vault’s shape', () => {
  it('binds each argument where its placeholder was, and never into the text', () => {
    const query = bound('SELECT * FROM t WHERE a = ? AND b = ?', ['x', "y'; DROP TABLE t; --"]);
    expect(query.queryChunks.length).toBeGreaterThan(3);
    expect(JSON.stringify(query.queryChunks)).not.toContain('DROP TABLE t; --"]}');
  });

  it('refuses a statement whose placeholders and arguments do not match', () => {
    expect(() => bound('SELECT ?', [])).toThrow(/placeholders/);
  });
});

describe(`Shopper's vault (${leg})`, () => {
  let app: Database;
  beforeAll(async () => {
    ({ database: app } = await freshDatabase('app'));
    await runMigrations(app);
    // Twice, as two starts would: the second changes nothing.
    await runMigrations(app);
  });
  afterAll(async () => app.close());

  it('has one vault id, made once and kept', async () => {
    const first = await vaultOf(app).vaultId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await vaultOf(app).vaultId()).toBe(first);
  });

  it('gives a person their own records, and another person none of them', async () => {
    const vault = vaultOf(app);
    const salt = Buffer.alloc(32, 1).toString('base64url');
    await dbRun(
      app,
      sql`INSERT INTO sv_key_accounts (user_id, suite, unlock_salt, signing_public, signing_private, created_at) VALUES ('ada', 1, ${salt}, ${salt}, '{}', ${Date.now()})`,
    );
    expect((await vault.read('ada')).account?.unlockSalt).toBe(salt);
    const other = await vault.read('grace');
    expect(other.account).toBeUndefined();
    expect(other.waysIn).toEqual([]);
  });

  it('deletes every record of a person, and no one else’s', async () => {
    await dbRun(
      app,
      sql`INSERT INTO sv_key_accounts (user_id, suite, unlock_salt, signing_public, signing_private, created_at) VALUES ('lin', 1, 's', 'p', '{}', ${Date.now()})`,
    );
    await vaultOf(app).deleteAccount('ada');
    const left = await dbAll<{ user_id: string }>(app, sql`SELECT user_id FROM sv_key_accounts`);
    expect(left.map((row) => row.user_id)).toEqual(['lin']);
  });
});
