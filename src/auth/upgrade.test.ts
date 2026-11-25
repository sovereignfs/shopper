import { hashPassword } from 'better-auth/crypto';
import { passwordsMoving } from '@sovereignfs/auth/server';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database as AuthStore } from '@sovereignfs/auth/database';
import { dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { authTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { type Auth, createAuth } from './auth';
import type { AuthSettings } from './config';
import { migrateAuthStore } from './migrate';
import { openAuthStore } from './store';
import { TestClient, derivedFor } from './test-support';

/**
 * **A 0.2.x auth store signs in after the move** (ADR 0001, `sovereign` task 20.14's review checklist), on whichever database the leg runs
 * on: the store as 0.2.x left it, with a password Shopper never moved (0.1.0's, a hash of the password itself), one it moved (a hash of the
 * sign-in value), an account that came through core, and a session each; then the server's start (`migrateAuthStore`) and Shopper's
 * real sign-in on the package.
 */
const { leg } = testTarget();
const OLD_PASSWORD = 'the password Ada always used';

const SETTINGS: AuthSettings = {
  url: 'http://localhost:3000',
  secret: 'test-secret-'.padEnd(40, 'x'),
  signUp: 'closed',
  passwordMinLength: 10,
  local: true,
  sovereign: undefined,
};

describe(`a 0.2.x auth store, moved at start (${leg})`, () => {
  let legacy: Awaited<ReturnType<typeof freshDatabase>>['database'];
  let store: AuthStore;
  let auth: Auth;
  const visitor = (n: number) => new TestClient(auth, SETTINGS.url).from(`10.7.0.${n}`);

  beforeAll(async () => {
    const fresh = await freshDatabase('auth');
    legacy = fresh.database;
    await runMigrations(legacy);
    const pg = legacy.dialect === 'postgres';
    const at = pg ? sql`now()` : sql`${Date.now()}`;
    const person = (id: string) =>
      dbRun(
        legacy,
        sql`INSERT INTO ${authTable(legacy, 'user')} (id, name, email, email_verified, created_at, updated_at)
            VALUES (${id}, ${id}, ${`${id}@example.test`}, ${true}, ${at}, ${at})`,
      );
    const account = (
      id: string,
      provider: string,
      accountId: string,
      password: string | null,
      derived: boolean,
    ) =>
      dbRun(
        legacy,
        sql`INSERT INTO ${authTable(legacy, 'account')} (id, account_id, provider_id, user_id, password, password_derived, access_token, created_at, updated_at)
            VALUES (${`${id}-${provider}`}, ${accountId}, ${provider}, ${id}, ${password}, ${derived}, ${provider === 'sovereign' ? 'a token genericOAuth kept' : null}, ${at}, ${at})`,
      );
    // Ada: 0.1.0's password, never moved. Bea: moved by 0.2.0 to a hash of her sign-in value. Grace: through core only, with a session.
    await person('ada');
    await account('ada', 'credential', 'ada', await hashPassword(OLD_PASSWORD), false);
    await person('bea');
    await account(
      'bea',
      'credential',
      'bea',
      await hashPassword(derivedFor('Bea’s password')),
      true,
    );
    await person('grace');
    await account('grace', 'sovereign', 'sub-grace', null, false);
    await dbRun(
      legacy,
      sql`INSERT INTO ${authTable(legacy, 'session')} (id, expires_at, token, created_at, updated_at, user_id, key_secret)
          VALUES ('s-grace', ${pg ? sql`now() + interval '1 day'` : sql`${Date.now() + 86_400_000}`}, 'tok', ${at}, ${at}, 'grace', 'K')`,
    );

    // The server's start (`src/db/boot.ts`), twice: the second finds the move done and changes nothing.
    store = await openAuthStore(fresh.config);
    expect(await migrateAuthStore(store)).toBe('moved');
    expect(await migrateAuthStore(store)).toBe('done');
    auth = createAuth({ settings: SETTINGS, name: 'Shopper', database: store });
  });
  afterAll(async () => {
    await store.close();
    await legacy.close();
  });

  it('keeps every account, session and sign-in, under the package’s tables', async () => {
    const count = async (table: string) =>
      Number((await store.run(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]?.n);
    expect(await count('users')).toBe(3);
    expect(await count('accounts')).toBe(3);
    expect(await count('sessions')).toBe(1);
    // genericOAuth's token is gone: core's refresh token is the SDK's alone.
    const { rows } = await store.run(
      "SELECT account_id, access_token FROM accounts WHERE provider_id = 'sovereign'",
    );
    expect(rows).toEqual([{ account_id: 'sub-grace', access_token: null }]);
  });

  it('marks only the password Shopper never moved, so the page sends no other password', async () => {
    const { rows } = await store.run('SELECT user_id FROM sv_legacy_passwords');
    expect(rows.map((row) => row.user_id)).toEqual(['ada']);
  });

  it('signs a password Shopper moved in at once, with its sign-in value', async () => {
    const reply = await visitor(1).post('/api/auth/sign-in/email', {
      email: 'bea@example.test',
      password: 'Bea’s password',
    });
    expect(reply.status).toBe(200);
  });

  it('moves 0.1.0’s password once, at its next sign-in, opening no session, and then signs it in', async () => {
    const client = visitor(2);
    const value = derivedFor('Ada’s new sign-in');
    expect(await passwordsMoving(store)).toBe(true);
    const refused = await client.post('/api/auth/sign-in/email', {
      email: 'ada@example.test',
      password: value,
    });
    expect(refused.status).toBe(401);
    const moved = await client.postRaw('/api/auth/sv/move-password', {
      email: 'ada@example.test',
      previous: OLD_PASSWORD,
      signIn: value,
    });
    expect(moved.status).toBe(200);
    expect(client.has('session_token')).toBe(false);
    const signedIn = await client.post('/api/auth/sign-in/email', {
      email: 'ada@example.test',
      password: value,
    });
    expect(signedIn.status).toBe(200);
    expect(await passwordsMoving(store)).toBe(false);
  });

  it('gives a new session its key secret from the package, keyed by the account', async () => {
    const client = visitor(3);
    await client.post('/api/auth/sign-in/email', {
      email: 'bea@example.test',
      password: 'Bea’s password',
    });
    const reply = await client.get('/api/auth/sv/key-secret', { 'sec-fetch-site': 'same-origin' });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      sub: 'bea',
      secret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
  });
});
