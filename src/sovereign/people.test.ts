import { sql } from 'drizzle-orm';
import { is } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstList, TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Database } from '../db/client';
import { openDatabase } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import * as sqliteApp from '../db/schema/sqlite/app';
import * as sqliteAuth from '../db/schema/sqlite/auth';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { householdsOf, membersOf, readHousehold } from '../households/households';
import { createInvitation } from '../households/invitations';
import { personById } from '../people/people';
import { addItem } from '../actions/items';
import { makeList } from '../actions/lists';
import { list as listRow } from '../actions/test-support';
import { applyMutation } from '../sync/apply';
import { deletePerson, previewLeaving } from './people';

const { leg } = testTarget();
const PLANTED_EMAIL = 'planted-leaver@example.com';

/**
 * What deleting an account does to each table, **decided for every table there is**: the test below fails for one that is in neither list. A new table
 * that holds something of a person is added here with what happens to it, and is seeded by `seed` so that the test finds what is left.
 */
const DECIDED_APP: Record<string, string> = {
  person: 'kept as a name only: the account link, the core identity and the email are gone',
  household:
    'deleted with the account when nobody else is in it, else passed on; the person leaves it',
  alias: 'a household’s, deleted with it; ids only',
  tombstone: 'a household’s, deleted with it; ids only',
  applied_mutation: 'the account’s own record of what it sent, deleted by account_id',
  invitation:
    'a household’s, deleted with it; the links a person made that are still waiting are revoked, and who accepted one stays as an id',
  member: 'ended (left_at), or deleted with a group nobody else is on',
  list_member:
    'ended (left_at) on a list that carries on, the Admin passing to the person on it longest; deleted with a list nobody else is on',
  category: 'a household’s, deleted with it',
  list: 'a household’s, deleted with it',
  item: 'a household’s, deleted with it; who added and who ticked stay under their name, with no account',
  product:
    'a list’s, deleted with it (21.3); what a person added stays under their name, with no account',
  rate_bucket: 'deleted where its key carries the account id',
  account_settings: 'the account’s own, deleted by account_id',
  household_key:
    'a member’s copy of a household’s keys: deleted with the person, and with a household nobody else is in',
  push_device: 'the account’s own devices for push, deleted by account_id',
  push_outbox: 'pushes waiting for the account’s devices, deleted with them',
};
const DECIDED_AUTH: Record<string, string> = {
  user: 'deleted',
  session: 'deleted',
  account: 'deleted',
  verification: 'deleted, found by the address',
  rate_limit:
    'keyed by address, not by person, and swept when its window is over: not an account’s',
};

const namesIn = (module: Record<string, unknown>): string[] =>
  Object.values(module)
    .filter((value): value is SQLiteTable => is(value, SQLiteTable))
    .map((table) => getTableConfig(table).name);

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

const deps = () => ({
  database: app,
  authDatabase: auth,
  ring: TEST_RING,
  now: () => 1_800_000_000_000,
});

/** An account in the sign-in store, with a session, a sign-in and a pending verification, as sign-up leaves them. */
async function seedAuth(person: Someone) {
  const t = (name: string) => sql.raw(`"${name}"`);
  const q = (name: string) =>
    auth.dialect === 'postgres' ? sql.raw(`"shopper_auth"."${name}"`) : t(name);
  const now = Date.now();
  const at = auth.dialect === 'postgres' ? sql`to_timestamp(${now / 1000})` : sql`${now}`;
  await dbRun(
    auth,
    sql`INSERT INTO ${q('user')} (id, name, email, email_verified, created_at, updated_at) VALUES (${person.accountId}, ${person.name}, ${person.email}, ${false}, ${at}, ${at})`,
  );
  await dbRun(
    auth,
    sql`INSERT INTO ${q('session')} (id, expires_at, token, created_at, updated_at, user_id) VALUES (${`s-${person.accountId}`}, ${at}, ${`t-${person.accountId}`}, ${at}, ${at}, ${person.accountId})`,
  );
  await dbRun(
    auth,
    sql`INSERT INTO ${q('account')} (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (${`a-${person.accountId}`}, ${person.accountId}, 'credential', ${person.accountId}, 'hash', ${at}, ${at})`,
  );
  await dbRun(
    auth,
    sql`INSERT INTO ${q('verification')} (id, identifier, value, expires_at, created_at, updated_at) VALUES (${`v-${person.accountId}`}, ${person.email}, 'v', ${at}, ${at}, ${at})`,
  );
  await dbRun(
    app,
    sql`INSERT INTO ${appTable(app, 'rate_bucket')} ("key", window_start, "count") VALUES (${`delete-account:${person.accountId}`}, ${now}, 1)`,
  );
  await dbRun(
    app,
    sql`INSERT INTO ${appTable(app, 'account_settings')} (account_id, last_list_id, created_at, updated_at) VALUES (${person.accountId}, ${'l-' + person.accountId}, ${now}, ${now})`,
  );
  // Their copy of their household's keys (RFC 0001).
  await dbRun(
    app,
    sql`INSERT INTO ${appTable(app, 'household_key')} (household_id, person_id, epoch, record, created_at) VALUES (${person.household}, ${person.personId}, 1, 'hk1', ${now})`,
  );
  // Their keys in Shopper's vault (RFC 0001), as the SDK's tables hold them.
  await dbRun(
    app,
    sql`INSERT INTO sv_key_accounts (user_id, suite, unlock_salt, signing_public, signing_private, created_at) VALUES (${person.accountId}, 1, 's', 'p', '{}', ${now})`,
  );
  await dbRun(
    app,
    sql`INSERT INTO sv_key_wraps (user_id, way, wrap_id, record, created_at) VALUES (${person.accountId}, 'password', 'w', '{}', ${now})`,
  );
}

const count = async (
  database: Database,
  table: ReturnType<typeof sql>,
  where: ReturnType<typeof sql>,
) =>
  Number(
    (
      await dbAll<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
      )
    )[0]?.n,
  );
const authTable = (name: string) =>
  auth.dialect === 'postgres' ? sql.raw(`"shopper_auth"."${name}"`) : sql.raw(`"${name}"`);

describe(`deleting a person (${leg})`, () => {
  it('decides what happens to every table there is', () => {
    expect(Object.keys(DECIDED_APP).sort()).toEqual(namesIn(sqliteApp).sort());
    expect(Object.keys(DECIDED_AUTH).sort()).toEqual(namesIn(sqliteAuth).sort());
  });

  it('removes what is personal, keeps the name, passes the Admin role to the member who has been in longest, and leaves the others’ households whole', async () => {
    const ada = await somebody(app, 'Ada');
    const grace = await somebody(app, 'Grace');
    const lin = await somebody(app, 'Lin');
    // Ada's household has Grace, then Lin: Grace has been in longest. Ada is also a plain member of Lin's.
    await join(app, ada.household, grace, 'member', Date.now() - 2000);
    await join(app, ada.household, lin, 'member', Date.now() - 1000);
    await join(app, lin.household, ada);
    // The links Ada made that are still waiting, in a household that outlives her and in one she is only a member of.
    for (const household of [ada.household, lin.household]) {
      const made = await createInvitation(app, {
        household,
        list: await firstList(app, household),
        accountId: ada.accountId,
        personId: ada.personId,
        now: 1_799_999_999_000,
      });
      expect(made.ok).toBe(true);
    }
    await seedAuth(ada);
    await seedAuth(grace);
    await dbRun(
      auth,
      sql`UPDATE ${authTable('user')} SET email = ${PLANTED_EMAIL} WHERE id = ${ada.accountId}`,
    );

    const preview = await previewLeaving(app, TEST_RING, ada.accountId);
    expect(preview.map((p) => [p.own, p.outcome, p.to])).toEqual([
      [true, 'passes', 'Grace'],
      [false, 'left', null],
    ]);

    const done = await deletePerson(deps(), ada.accountId);
    expect(done).toEqual({ passed: 1, deleted: 0, left: 1 });

    // Nothing personal of Ada's is left: the sign-in store, the counters, the link from her person to her account.
    for (const table of ['user', 'session', 'account'])
      expect(
        await count(
          auth,
          authTable(table),
          sql`${sql.raw(table === 'user' ? 'id' : 'user_id')} = ${ada.accountId}`,
        ),
        table,
      ).toBe(0);
    expect(await count(auth, authTable('verification'), sql`identifier = ${PLANTED_EMAIL}`)).toBe(
      0,
    );
    expect(
      await count(app, appTable(app, 'rate_bucket'), sql`"key" LIKE ${`%:${ada.accountId}`}`),
    ).toBe(0);
    expect(
      await count(app, appTable(app, 'account_settings'), sql`account_id = ${ada.accountId}`),
    ).toBe(0);
    expect(await count(app, appTable(app, 'household_key'), sql`person_id = ${ada.personId}`)).toBe(
      0,
    );
    for (const table of ['sv_key_accounts', 'sv_key_wraps'])
      expect(await count(app, sql.raw(table), sql`user_id = ${ada.accountId}`), table).toBe(0);
    const person = await personById(app, TEST_RING, ada.personId);
    expect(person).toMatchObject({ name: 'Ada', email: null, accountId: null, deleted: true });
    const raw = await dbAll<Record<string, unknown>>(
      app,
      sql`SELECT * FROM ${appTable(app, 'person')} WHERE id = ${ada.personId}`,
    );
    expect(JSON.stringify(raw)).not.toContain('ada');
    expect(raw[0]?.core_sub).toBeNull();
    expect(await householdsOf(app, TEST_RING, ada.accountId)).toEqual([]);
    expect(
      await count(
        app,
        appTable(app, 'invitation'),
        sql`created_by = ${ada.personId} AND revoked_at IS NULL`,
      ),
    ).toBe(0);
    expect(await count(app, appTable(app, 'invitation'), sql`created_by = ${ada.personId}`)).toBe(
      2,
    );

    // Her shared list lives on, Grace its Admin (RFC 0004); her name stays on the member list; the others' own households are intact; and the others' accounts are.
    const members = await membersOf(app, TEST_RING, ada.list, grace.accountId);
    expect(members?.map((m) => [m.name, m.role])).toEqual([
      ['Grace', 'admin'],
      ['Lin', 'member'],
    ]);
    expect((await readHousehold(app, TEST_RING, lin.household, lin.accountId))?.role).toBe('admin');
    expect(await membersOf(app, TEST_RING, lin.list, lin.accountId)).toHaveLength(1);
    expect(await count(auth, authTable('user'), sql`id = ${grace.accountId}`)).toBe(1);
    expect(await count(auth, authTable('session'), sql`user_id = ${grace.accountId}`)).toBe(1);
    expect(
      await count(app, appTable(app, 'rate_bucket'), sql`"key" LIKE ${`%:${grace.accountId}`}`),
    ).toBe(1);
    expect(
      await count(app, appTable(app, 'account_settings'), sql`account_id = ${grace.accountId}`),
    ).toBe(1);
    expect(await count(app, sql.raw('sv_key_accounts'), sql`user_id = ${grace.accountId}`)).toBe(1);
  });

  it('deletes a list nobody else is on with its catalog, in a group that carries on (21.3)', async () => {
    const ada = await somebody(app, 'Ada-catalog');
    const grace = await somebody(app, 'Grace-catalog');
    // Grace is on Groceries, so the group carries on; Hardware is Ada's alone, with a product of its own.
    await join(app, ada.household, grace);
    const send = (mutation: Parameters<typeof applyMutation>[2]) =>
      applyMutation(
        {
          database: app,
          ring: TEST_RING,
          limits: {
            householdMembers: 20,
            accountHouseholds: 20,
            householdLists: 100,
            listOpenItems: 500,
            householdProducts: 5000,
          },
        },
        ada.accountId,
        mutation,
      );
    const env = { now: 1_800_000_000_000, newId: () => crypto.randomUUID() };
    const made = makeList(env, { householdId: ada.household, name: 'Hardware', position: 'a1' });
    expect((await send(made)).status).toBe('applied');
    const hardware = listRow({ id: made.changes[0]?.id ?? '', householdId: ada.household });
    const screws = addItem(env, { list: hardware, name: 'Screws', last: null, by: ada.personId });
    expect((await send(screws)).status).toBe('applied');
    const product = screws.changes.find((change) => change.table === 'product')?.id ?? '';
    await seedAuth(ada);

    await deletePerson(deps(), ada.accountId);
    expect(await count(app, appTable(app, 'list'), sql`id = ${hardware.id}`)).toBe(0);
    expect(await count(app, appTable(app, 'product'), sql`id = ${product}`)).toBe(0);
    expect(await count(app, appTable(app, 'list'), sql`id = ${ada.list}`)).toBe(1);
  });

  it('deletes a household nobody else is in, with everything of it', async () => {
    const solo = await somebody(app, 'Solo');
    await seedAuth(solo);
    expect(await deletePerson(deps(), solo.accountId)).toEqual({ passed: 0, deleted: 1, left: 0 });
    expect(await count(app, appTable(app, 'household'), sql`id = ${solo.household}`)).toBe(0);
    expect(await count(app, appTable(app, 'member'), sql`household_id = ${solo.household}`)).toBe(
      0,
    );
  });

  it('is safe to run again, and a run that stopped is finished by running it again', async () => {
    const twice = await somebody(app, 'Twice');
    const other = await somebody(app, 'Other');
    await join(app, twice.household, other);
    await seedAuth(twice);
    await deletePerson(deps(), twice.accountId);
    expect(await deletePerson(deps(), twice.accountId)).toEqual({ passed: 0, deleted: 0, left: 0 });
    expect(
      (await membersOf(app, TEST_RING, twice.list, other.accountId))?.find((m) => m.self)?.role,
    ).toBe('admin');

    // A run that stopped after the sign-in store and before the person: the person still names the account, so a second run finds it.
    const halfway = await somebody(app, 'Halfway');
    await seedAuth(halfway);
    await dbAll(
      auth,
      sql`DELETE FROM ${authTable('session')} WHERE user_id = ${halfway.accountId} RETURNING id`,
    );
    await dbAll(
      auth,
      sql`DELETE FROM ${authTable('account')} WHERE user_id = ${halfway.accountId} RETURNING id`,
    );
    await dbAll(
      auth,
      sql`DELETE FROM ${authTable('user')} WHERE id = ${halfway.accountId} RETURNING id`,
    );
    expect((await personById(app, TEST_RING, halfway.personId))?.accountId).toBe(halfway.accountId);
    await deletePerson(deps(), halfway.accountId);
    expect(await personById(app, TEST_RING, halfway.personId)).toMatchObject({
      accountId: null,
      deleted: true,
      email: null,
    });
  });

  it('does nothing for an account it does not know', async () => {
    expect(await deletePerson(deps(), 'no-such-account')).toEqual({
      passed: 0,
      deleted: 0,
      left: 0,
    });
  });
});
