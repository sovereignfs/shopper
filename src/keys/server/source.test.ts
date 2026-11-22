import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SOVEREIGN_PROVIDER_ID } from '../../auth/config';
import { type Database, openDatabase } from '../../db/client';
import { dbRun } from '../../db/exec';
import { runMigrations } from '../../db/migrate';
import { freshDatabase, testTarget } from '../../db/test-support';

/**
 * **Where a core account's key comes from** (RFC 0001, DESIGN.md §13.2): an account that came through core alone gets its key from core, bound to its
 * `sub`, which is where better-auth keeps it, the account id of its sign-in through core. Read from anywhere else, every core account had no key source:
 * nothing was encrypted, and core was never asked, so nobody was shown a recovery kit.
 */
const stores = vi.hoisted(() => ({ app: undefined as unknown, auth: undefined as unknown }));
const password = vi.hoisted(() => ({ has: new Set<string>() }));
vi.mock('../../db/boot', () => ({
  getDatabase: async () => stores.app,
  getAuthDatabase: async () => stores.auth,
}));
vi.mock('../../auth/password', () => ({
  accountHasPassword: async (id: string) => password.has.has(id),
}));
vi.mock('../../auth/server', () => ({
  authSettings: () => ({ sovereign: { issuer: 'https://core.test', clientId: 'shopper-client' } }),
}));
vi.mock('../../config/current', () => ({ getConfig: () => ({ url: 'https://shopper.test/' }) }));
vi.mock('./vault', () => ({ getVaultId: async () => 'vault-1' }));

const { keySourceOf } = await import('./source');

const { leg } = testTarget();
let app: Database;
let auth: Database;
beforeAll(async () => {
  ({ database: app } = await freshDatabase('app'));
  await runMigrations(app);
  auth = await openDatabase(testTarget().config, 'auth');
  await runMigrations(auth);
  stores.app = app;
  stores.auth = auth;
});
afterAll(async () => {
  await app.close();
  await auth.close();
});

const q = (name: string) =>
  auth.dialect === 'postgres' ? sql.raw(`"shopper_auth"."${name}"`) : sql.raw(`"${name}"`);

/** An account in the sign-in store, with a sign-in row of `provider` whose account id is `accountIdThere`, as better-auth writes them. */
async function account(id: string, provider: string, accountIdThere: string) {
  const now = Date.now();
  const at = auth.dialect === 'postgres' ? sql`to_timestamp(${now / 1000})` : sql`${now}`;
  await dbRun(
    auth,
    sql`INSERT INTO ${q('user')} (id, name, email, email_verified, created_at, updated_at) VALUES (${id}, ${'Ada'}, ${`${id}@example.test`}, ${true}, ${at}, ${at})`,
  );
  await dbRun(
    auth,
    sql`INSERT INTO ${q('account')} (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (${`a-${id}`}, ${accountIdThere}, ${provider}, ${id}, ${at}, ${at})`,
  );
}

describe(`an account's key source (${leg})`, () => {
  it('is core, bound to the sub of the account’s sign-in through core', async () => {
    const id = crypto.randomUUID();
    const sub = `sub-${crypto.randomUUID()}`;
    await account(id, SOVEREIGN_PROVIDER_ID, sub);
    expect(await keySourceOf(id)).toEqual({
      kind: 'core',
      sub,
      core: 'https://core.test',
      clientId: 'shopper-client',
      returnTo: 'https://shopper.test/keys/return',
    });
  });

  it('is the vault for an account with a password, and none for one with neither', async () => {
    const withPassword = crypto.randomUUID();
    await account(withPassword, 'credential', withPassword);
    password.has.add(withPassword);
    expect(await keySourceOf(withPassword)).toEqual({
      kind: 'vault',
      sub: withPassword,
      vaultId: 'vault-1',
    });
    const neither = crypto.randomUUID();
    await account(neither, 'some-other-provider', 'x');
    expect(await keySourceOf(neither)).toBeUndefined();
  });
});
