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
import { householdsOf, membersOf, readHousehold } from '../households/households';
import { RateLimiter } from '../limits/rate';
import { personById } from '../people/people';
import { handleAccountDeleted, handleBackChannelLogout, type NoticeDeps } from './http';
import { accountOfSub, endSessionsOf } from './identity';
import { deletePerson } from './people';
import { sdkVerifiers, seenBy } from './verifiers';

/**
 * Core's notices (DESIGN.md §15.2), end to end through the real wiring: the SDK's verifiers against its fake core, the handlers, the lookup of a person by
 * their `sub`, and the real `endSessionsOf` and `deletePerson` on whichever database the leg runs on. What is checked is what the notices promise: whose
 * sessions end and nobody else's, that a deletion leaves nothing personal and every shared household whole, that core's retry is harmless, and that a
 * notice cannot be replayed even by another process.
 */
const { leg } = testTarget();
let app: Database;
let auth: Database;
beforeAll(async () => {
  ({ database: app } = await freshDatabase('app'));
  await runMigrations(app);
  auth = await openDatabase(testTarget().config, 'auth');
  await runMigrations(auth);
});
afterAll(async () => {
  await app.close();
  await auth.close();
});

const q = (name: string) =>
  auth.dialect === 'postgres' ? sql.raw(`"shopper_auth"."${name}"`) : sql.raw(`"${name}"`);

/** An account in the sign-in store that came in through core as `sub`, with `sessions` sessions. */
async function viaCore(person: Someone, sub: string, sessions = 2) {
  const now = Date.now();
  const at = auth.dialect === 'postgres' ? sql`to_timestamp(${now / 1000})` : sql`${now}`;
  await dbRun(
    auth,
    sql`INSERT INTO ${q('user')} (id, name, email, email_verified, created_at, updated_at) VALUES (${person.accountId}, ${person.name}, ${person.email}, ${true}, ${at}, ${at})`,
  );
  await dbRun(
    auth,
    sql`INSERT INTO ${q('account')} (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (${`a-${person.accountId}`}, ${sub}, ${SOVEREIGN_PROVIDER_ID}, ${person.accountId}, ${at}, ${at})`,
  );
  for (let i = 0; i < sessions; i++)
    await dbRun(
      auth,
      sql`INSERT INTO ${q('session')} (id, expires_at, token, created_at, updated_at, user_id) VALUES (${`s${i}-${person.accountId}`}, ${at}, ${`t${i}-${person.accountId}`}, ${at}, ${at}, ${person.accountId})`,
    );
}
const sessionsOf = async (person: Someone) =>
  (
    await dbAll<{ id: string }>(
      auth,
      sql`SELECT id FROM ${q('session')} WHERE user_id = ${person.accountId}`,
    )
  ).length;

function world() {
  const core = createFakeCore();
  const make = () =>
    ({
      verify: sdkVerifiers({
        coreUrl: core.url,
        clientId: core.credentials.clientId,
        seen: seenBy(new RateLimiter(app)),
        fetch: core.fetch,
      }),
      people: {
        endSessions: async (sub: string) => {
          const account = await accountOfSub(auth, sub);
          return account === null ? 0 : endSessionsOf(auth, account);
        },
        deletePerson: async (sub: string) => {
          const account = await accountOfSub(auth, sub);
          if (account !== null)
            await deletePerson(
              { database: app, authDatabase: auth, ring: TEST_RING, now: Date.now },
              account,
            );
        },
      },
      limiter: new RateLimiter(app),
      log: () => undefined,
    }) satisfies NoticeDeps;
  return { core, deps: make(), another: make };
}
const form = (field: string, token: string) =>
  new Request('https://shopper.example.com/api/sovereign/notice', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ [field]: token }).toString(),
  });

describe(`core's notices, through the real wiring (${leg})`, () => {
  it('a logout notice ends every session of the person it names, and no one else’s', async () => {
    const { core, deps } = world();
    const ada = await somebody(app, 'Ada');
    const grace = await somebody(app, 'Grace');
    await viaCore(ada, 'sub-ada', 3);
    await viaCore(grace, 'sub-grace', 2);
    const reply = await handleBackChannelLogout(
      form('logout_token', await core.logoutToken({ sub: 'sub-ada', sid: 'core-1' })),
      deps,
    );
    expect(reply.status).toBe(200);
    expect(await sessionsOf(ada)).toBe(0);
    expect(await sessionsOf(grace)).toBe(2);
    // The account is theirs still: they can sign in again.
    expect(await accountOfSub(auth, 'sub-ada')).toBe(ada.accountId);
  });

  it('a logout notice for a person nobody here knows is answered 200 and ends nothing', async () => {
    const { core, deps } = world();
    const lin = await somebody(app, 'Lin');
    await viaCore(lin, 'sub-lin', 1);
    const reply = await handleBackChannelLogout(
      form('logout_token', await core.logoutToken({ sub: 'sub-nobody' })),
      deps,
    );
    expect(reply.status).toBe(200);
    expect(await sessionsOf(lin)).toBe(1);
  });

  it('an account-deleted notice leaves nothing personal of them and every shared household whole', async () => {
    const { core, deps } = world();
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
    const reply = await handleAccountDeleted(form('account_deleted_token', token), deps);
    expect(reply.status).toBe(200);

    // The sign-in store: nothing of Ada's. The person: a name and no account.
    for (const table of ['user', 'account', 'session'])
      expect(
        await dbAll(
          auth,
          sql`SELECT 1 AS one FROM ${q(table)} WHERE ${sql.raw(table === 'user' ? 'id' : 'user_id')} = ${ada.accountId}`,
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
    expect(await accountOfSub(auth, 'sub-ada-d')).toBeNull();

    // The others' households are whole, Ada's passed to the member who had been in longest, and her name stays.
    expect((await readHousehold(app, TEST_RING, ada.household, grace.accountId))?.role).toBe(
      'admin',
    );
    expect(
      (await membersOf(app, TEST_RING, ada.household, grace.accountId))?.map((m) => m.name),
    ).toEqual(['GraceD', 'LinD']);
    expect(await membersOf(app, TEST_RING, lin.household, lin.accountId)).toHaveLength(1);
    expect(await sessionsOf(grace)).toBe(1);

    // Core sends a deletion until it is answered, with a new token each time: the second finds nobody and is answered 200 too.
    const again = await handleAccountDeleted(
      form('account_deleted_token', await core.accountDeletedToken({ sub: 'sub-ada-d' })),
      deps,
    );
    expect(again.status).toBe(200);
  });

  it('a notice cannot be replayed, even to another process that has just started', async () => {
    const { core, deps, another } = world();
    const ada = await somebody(app, 'AdaR');
    await viaCore(ada, 'sub-ada-r', 1);
    const token = await core.logoutToken({ sub: 'sub-ada-r' });
    expect((await handleBackChannelLogout(form('logout_token', token), deps)).status).toBe(200);
    const restarted = another();
    const replay = await handleBackChannelLogout(form('logout_token', token), restarted);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toEqual({ error: 'invalid_request' });
  });

  it('a notice that is wrong in any way ends and deletes nothing', async () => {
    const { core, deps } = world();
    const ada = await somebody(app, 'AdaW');
    await viaCore(ada, 'sub-ada-w', 2);
    for (const wrong of ['signature', 'audience', 'expired', 'type'] as const) {
      const logout = await handleBackChannelLogout(
        form('logout_token', await core.logoutToken({ sub: 'sub-ada-w' }, { wrong })),
        deps,
      );
      const deleted = await handleAccountDeleted(
        form(
          'account_deleted_token',
          await core.accountDeletedToken({ sub: 'sub-ada-w' }, { wrong }),
        ),
        deps,
      );
      expect([logout.status, deleted.status], wrong).toEqual([400, 400]);
    }
    expect(await sessionsOf(ada)).toBe(2);
    expect(await accountOfSub(auth, 'sub-ada-w')).toBe(ada.accountId);
  });
});
