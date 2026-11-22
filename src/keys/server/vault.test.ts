import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { derivedFor, makeAuth, type TestAuth } from '../../auth/test-support';
import { movePassword, passwordsToMove } from '../../auth/move';
import type { Database } from '../../db/client';
import { dbAll, dbGet, dbRun } from '../../db/exec';
import { runMigrations } from '../../db/migrate';
import { authTable } from '../../db/tables';
import { freshDatabase, testTarget } from '../../db/test-support';
import { bound } from './database';
import { sessionKeySecret } from './secret';
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

describe(`a session's key secret, and moving a 0.1.0 password (${leg})`, () => {
  let t: TestAuth;
  beforeAll(async () => {
    t = await makeAuth({ signUp: 'open' });
  });
  afterAll(async () => t.close());

  const signUp = async (email: string) => {
    const client = t.client();
    const reply = await client.post('/api/auth/sign-up/email', {
      name: 'Ada',
      email,
      password: 'a long enough password',
    });
    expect(reply.status).toBe(200);
    return reply.body.user.id as string;
  };
  const sessionsOf = (accountId: string) =>
    dbAll<{ id: string; key_secret: string | null }>(
      t.database,
      sql`SELECT id, key_secret FROM ${authTable(t.database, 'session')} WHERE user_id = ${accountId}`,
    );

  it('is made with every session, given only to the session’s own account, and is never in what the session’s API answers', async () => {
    const ada = await signUp('ada-secret@example.test');
    const grace = await signUp('grace-secret@example.test');
    const session = (await sessionsOf(ada))[0];
    if (!session) throw new Error('no session');
    expect(session?.key_secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await sessionKeySecret(t.database, session.id, ada)).toBe(session?.key_secret);
    expect(await sessionKeySecret(t.database, session.id, grace)).toBeUndefined();
    const reply = await t.client().post('/api/auth/sign-in/email', {
      email: 'ada-secret@example.test',
      password: 'a long enough password',
    });
    expect(JSON.stringify(reply.body)).not.toContain('keySecret');
  });

  it('is made for a session from before, once', async () => {
    const lin = await signUp('lin-secret@example.test');
    const session = (await sessionsOf(lin))[0];
    if (!session) throw new Error('no session');
    await dbRun(
      t.database,
      sql`UPDATE ${authTable(t.database, 'session')} SET key_secret = NULL WHERE id = ${session.id}`,
    );
    const made = await sessionKeySecret(t.database, session.id, lin);
    expect(made).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await sessionKeySecret(t.database, session.id, lin)).toBe(made);
  });

  it('moves a 0.1.0 password once, only with that password, and then signs in with the derived value', async () => {
    const email = 'old-account@example.test';
    // Made through the server, not a request: the tests above have used up this address's sign-ups for the window.
    const made = await t.auth.api.signUpEmail({
      body: { name: 'Old', email, password: derivedFor('anything') },
    });
    const accountId = made.user.id;
    const account = authTable(t.database, 'account');
    // As 0.1.0 left it: a hash of the password itself.
    await dbRun(
      t.database,
      sql`UPDATE ${account} SET password = ${await hashPassword('the old password')}, password_derived = ${false} WHERE user_id = ${accountId}`,
    );
    expect(await passwordsToMove(t.database)).toBe(true);
    const deps = {
      authDatabase: t.database,
      limiter: { take: async () => ({ ok: true as const }) },
    };
    const signIn = derivedFor('the new password');

    await movePassword(deps, { email, password: 'a wrong guess', signIn });
    await movePassword(deps, { email, password: derivedFor('x'), signIn });
    const stored = async () =>
      (await dbGet<{ password: string; password_derived: unknown }>(
        t.database,
        sql`SELECT password, password_derived FROM ${account} WHERE user_id = ${accountId}`,
      )) ?? { password: '', password_derived: null };
    const unmoved = await stored();
    expect(await verifyPassword({ hash: unmoved.password, password: 'the old password' })).toBe(
      true,
    );

    await movePassword(deps, {
      email: ` ${email.toUpperCase()} `,
      password: 'the old password',
      signIn,
    });
    const moved = await stored();
    expect(await verifyPassword({ hash: moved.password, password: signIn })).toBe(true);
    expect(Boolean(moved.password_derived)).toBe(true);
    expect(await passwordsToMove(t.database)).toBe(false);

    // Once: the old password moves nothing again.
    await movePassword(deps, {
      email,
      password: 'the old password',
      signIn: derivedFor('another'),
    });
    const after = await stored();
    expect(after.password).toBe(moved.password);
    const reply = await t.client().post('/api/auth/sign-in/email', {
      email,
      password: 'the new password',
    });
    expect(reply.status).toBe(200);
  });

  it('counts a move by the address, and stops when the limiter says so', async () => {
    const taken: string[] = [];
    await movePassword(
      {
        authDatabase: t.database,
        limiter: { take: async (key) => (taken.push(key), { ok: false, retryAfterMs: 1 }) },
      },
      { email: 'someone@example.test', password: 'p', signIn: derivedFor('p') },
    );
    expect(taken).toHaveLength(1);
    expect(taken[0]).not.toContain('someone');
  });
});
