import { createFakeCore } from '@sovereignfs/sdk/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import { SOVEREIGN_PROVIDER_ID } from '../auth/config';
import type { Database } from '../db/client';
import { openDatabase } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import { householdsOf, membersOf } from '../households/households';
import type { Database as AuthStore } from '@sovereignfs/auth/database';
import { createAuth } from '../auth/auth';
import { movedAuthStore } from '../auth/test-support';
import { RateLimiter } from '../limits/rate';
import { personById } from '../people/people';
import { accountOfSub } from './identity';
import { buildNotices } from './server';

/**
 * Core's notices (DESIGN.md §15.2), end to end through the real wiring (`buildNotices`): `@sovereignfs/auth`'s `coreNotices` against the SDK's
 * fake core, behind Shopper's guards, ending sessions through better-auth on the package, and Shopper's `deletePerson`, on whichever database
 * the leg runs on. What is checked is what the notices promise: whose
 * sessions end and nobody else's, that a deletion leaves nothing personal and every shared household whole, that core's retry is harmless, and that a
 * notice cannot be replayed even by another process.
 */
const { leg } = testTarget();
let app: Database;
let auth: Database;
let store: AuthStore;
beforeAll(async () => {
  ({ database: app } = await freshDatabase('app'));
  await runMigrations(app);
  auth = await openDatabase(testTarget().config, 'auth');
  store = await movedAuthStore(testTarget().config, auth);
});
afterAll(async () => {
  await app.close();
  await auth.close();
  await store.close();
});

const q = (name: string) =>
  auth.dialect === 'postgres' ? sql.raw(`"shopper_auth"."${name}"`) : sql.raw(`"${name}"`);

/**
 * An account in the sign-in store that came in through core as `sub`, with `sessions` sessions, each with the record a sign-in through core
 * leaves (its core session `sid-<n>-<account>`), as `@sovereignfs/auth/core` writes them.
 */
async function viaCore(person: Someone, sub: string, sessions = 2) {
  const now = Date.now();
  const at = auth.dialect === 'postgres' ? sql`to_timestamp(${now / 1000})` : sql`${now}`;
  const later =
    auth.dialect === 'postgres' ? sql`now() + interval '1 day'` : sql`${now + 86_400_000}`;
  await dbRun(
    auth,
    sql`INSERT INTO ${q('users')} (id, name, email, email_verified, created_at, updated_at) VALUES (${person.accountId}, ${person.name}, ${person.email}, ${true}, ${at}, ${at})`,
  );
  await dbRun(
    auth,
    sql`INSERT INTO ${q('accounts')} (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (${`a-${person.accountId}`}, ${sub}, ${SOVEREIGN_PROVIDER_ID}, ${person.accountId}, ${at}, ${at})`,
  );
  for (let i = 0; i < sessions; i++) {
    await dbRun(
      auth,
      sql`INSERT INTO ${q('sessions')} (id, expires_at, token, created_at, updated_at, user_id) VALUES (${`s${i}-${person.accountId}`}, ${later}, ${`t${i}-${person.accountId}`}, ${at}, ${at}, ${person.accountId})`,
    );
    await store.run(
      'INSERT INTO sv_core_sign_ins (session_id, sub, sid, checked_at) VALUES (?, ?, ?, ?)',
      [`s${i}-${person.accountId}`, sub, `sid-${i}-${person.accountId}`, now],
    );
  }
}
const sessionsOf = async (person: Someone) =>
  (
    await dbAll<{ id: string }>(
      auth,
      sql`SELECT id FROM ${q('sessions')} WHERE user_id = ${person.accountId}`,
    )
  ).length;

function world() {
  const core = createFakeCore();
  const sign = createAuth({
    settings: {
      url: 'https://shopper.example.com',
      secret: 'test-secret-'.padEnd(40, 'x'),
      signUp: 'open',
      passwordMinLength: 10,
      local: false,
      sovereign: undefined,
    },
    name: 'Shopper',
    database: store,
  });
  // As `noticeHandlers` makes them, on this core: a restarted process is another `make()`, with nothing of the first in memory.
  const make = () =>
    buildNotices({
      auth: sign,
      authStore: store,
      database: app,
      authDatabase: auth,
      ring: TEST_RING,
      coreUrl: core.url,
      clientId: core.credentials.clientId,
      limiter: new RateLimiter(app),
      fetch: core.fetch,
    });
  return { core, notices: make(), another: make };
}
const form = (field: string, token: string) =>
  new Request('https://shopper.example.com/api/sovereign/notice', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ [field]: token }).toString(),
  });

describe(`core's notices, through the real wiring (${leg})`, () => {
  it('a logout notice ends every session of the person it names, and no one else’s', async () => {
    const { core, notices } = world();
    const ada = await somebody(app, 'Ada');
    const grace = await somebody(app, 'Grace');
    await viaCore(ada, 'sub-ada', 3);
    await viaCore(grace, 'sub-grace', 2);
    const reply = await notices.backChannelLogout(
      form('logout_token', await core.logoutToken({ sub: 'sub-ada' })),
    );
    expect(reply.status).toBe(200);
    expect(await sessionsOf(ada)).toBe(0);
    expect(await sessionsOf(grace)).toBe(2);
    // The account is theirs still: they can sign in again.
    expect(await accountOfSub(store, 'sub-ada')).toBe(ada.accountId);
  });

  it('a logout notice for a person nobody here knows is answered 200 and ends nothing', async () => {
    const { core, notices } = world();
    const lin = await somebody(app, 'Lin');
    await viaCore(lin, 'sub-lin', 1);
    const reply = await notices.backChannelLogout(
      form('logout_token', await core.logoutToken({ sub: 'sub-nobody' })),
    );
    expect(reply.status).toBe(200);
    expect(await sessionsOf(lin)).toBe(1);
  });

  it('an account-deleted notice leaves nothing personal of them and every shared household whole', async () => {
    const { core, notices } = world();
    const ada = await somebody(app, 'AdaD');
    const grace = await somebody(app, 'GraceD');
    const lin = await somebody(app, 'LinD');
    // Ada's household has Grace and Lin; Ada is also a plain member of Lin's.
    await join(app, ada.household, grace, 'member', Date.now() - 2000);
    await join(app, ada.household, lin, 'member', Date.now() - 1000);
    await join(app, lin.household, ada);
    await viaCore(ada, 'sub-ada-d', 2);
    await viaCore(grace, 'sub-grace-d', 1);

    const token = await core.accountDeletedToken({ sub: 'sub-ada-d' });
    const reply = await notices.accountDeleted(form('account_deleted_token', token));
    expect(reply.status).toBe(200);

    // The sign-in store: nothing of Ada's. The person: a name and no account.
    for (const table of ['users', 'accounts', 'sessions'])
      expect(
        await dbAll(
          auth,
          sql`SELECT 1 AS one FROM ${q(table)} WHERE ${sql.raw(table === 'users' ? 'id' : 'user_id')} = ${ada.accountId}`,
        ),
        table,
      ).toHaveLength(0);
    expect(await personById(app, TEST_RING, ada.personId)).toMatchObject({
      name: 'AdaD',
      email: null,
      accountId: null,
      deleted: true,
    });
    expect(await householdsOf(app, TEST_RING, ada.accountId)).toEqual([]);
    expect(await accountOfSub(store, 'sub-ada-d')).toBeNull();

    // The others' lists are whole, Ada's shared list passed to the person on it longest (RFC 0004), and her name stays.
    expect(
      (await membersOf(app, TEST_RING, ada.list, grace.accountId))?.find((m) => m.self)?.role,
    ).toBe('admin');
    expect(
      (await membersOf(app, TEST_RING, ada.list, grace.accountId))?.map((m) => m.name),
    ).toEqual(['GraceD', 'LinD']);
    expect(await membersOf(app, TEST_RING, lin.list, lin.accountId)).toHaveLength(1);
    expect(await sessionsOf(grace)).toBe(1);

    // Core sends a deletion until it is answered, with a new token each time: the second finds nobody and is answered 200 too.
    const again = await notices.accountDeleted(
      form('account_deleted_token', await core.accountDeletedToken({ sub: 'sub-ada-d' })),
    );
    expect(again.status).toBe(200);
  });

  it('a notice cannot be replayed, even to another process that has just started', async () => {
    const { core, notices, another } = world();
    const ada = await somebody(app, 'AdaR');
    await viaCore(ada, 'sub-ada-r', 1);
    const token = await core.logoutToken({ sub: 'sub-ada-r' });
    expect((await notices.backChannelLogout(form('logout_token', token))).status).toBe(200);
    expect(await sessionsOf(ada)).toBe(0);
    // Ada signs in through core again; the same token, to a process that has just started, must not end that session.
    const now = Date.now();
    await store.run(
      'INSERT INTO sessions (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        `again-${ada.accountId}`,
        store.family === 'postgres' ? new Date(now + 86_400_000) : now + 86_400_000,
        `again-token-${ada.accountId}`,
        store.family === 'postgres' ? new Date(now) : now,
        store.family === 'postgres' ? new Date(now) : now,
        ada.accountId,
      ],
    );
    await store.run(
      'INSERT INTO sv_core_sign_ins (session_id, sub, sid, checked_at) VALUES (?, ?, ?, ?)',
      [`again-${ada.accountId}`, 'sub-ada-r', 'sid-again', now],
    );
    const restarted = another();
    const replay = await restarted.backChannelLogout(form('logout_token', token));
    // Refused: its jti is remembered in the store, not in a process (auth.md §8).
    expect(replay.status).toBe(400);
    expect(await sessionsOf(ada)).toBe(1);
  });

  it('a notice that is wrong in any way ends and deletes nothing', async () => {
    const { core, notices } = world();
    const ada = await somebody(app, 'AdaW');
    await viaCore(ada, 'sub-ada-w', 2);
    for (const wrong of ['signature', 'audience', 'expired', 'type'] as const) {
      const logout = await notices.backChannelLogout(
        form('logout_token', await core.logoutToken({ sub: 'sub-ada-w' }, { wrong })),
      );
      const deleted = await notices.accountDeleted(
        form(
          'account_deleted_token',
          await core.accountDeletedToken({ sub: 'sub-ada-w' }, { wrong }),
        ),
      );
      expect([logout.status, deleted.status], wrong).toEqual([400, 400]);
    }
    expect(await sessionsOf(ada)).toBe(2);
    expect(await accountOfSub(store, 'sub-ada-w')).toBe(ada.accountId);
  });

  it('a logout notice that names only a core session ends that session here, and the person’s others stay', async () => {
    const { core, notices } = world();
    const ada = await somebody(app, 'AdaS');
    await viaCore(ada, 'sub-ada-s', 2);
    const reply = await notices.backChannelLogout(
      form('logout_token', await core.logoutToken({ sid: `sid-0-${ada.accountId}` })),
    );
    expect(reply.status).toBe(200);
    expect(await sessionsOf(ada)).toBe(1);
  });

  it('refuses a body larger than a notice can be, unread, and ends nothing', async () => {
    const { core, notices } = world();
    const ada = await somebody(app, 'AdaB');
    await viaCore(ada, 'sub-ada-b', 1);
    const token = await core.logoutToken({ sub: 'sub-ada-b' });
    const reply = await notices.backChannelLogout(
      new Request('https://shopper.example.com/api/sovereign/backchannel-logout', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `${new URLSearchParams({ logout_token: token }).toString()}&pad=${'x'.repeat(17 * 1024)}`,
      }),
    );
    expect(reply.status).toBe(413);
    expect(await sessionsOf(ada)).toBe(1);
  });
});
