import { sql } from 'drizzle-orm';
import { is } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Database } from '../db/client';
import { openDatabase } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import * as sqliteApp from '../db/schema/sqlite/app';
import * as sqliteAuth from '../db/schema/sqlite/auth';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { householdsOf, membersOf, readHousehold } from '../households/households';
import { personById } from '../people/people';
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
  member: 'ended (left_at), or deleted with a household nobody else is in',
  category: 'a household’s, deleted with it',
  list: 'a household’s, deleted with it',
  item: 'a household’s, deleted with it; who added and who ticked stay under their name, with no account',
  product:
    'a household’s, deleted with it; what a person added stays under their name, with no account',
  rate_bucket: 'deleted where its key carries the account id',
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
    const person = await personById(app, TEST_RING, ada.personId);
    expect(person).toMatchObject({ name: 'Ada', email: null, accountId: null, deleted: true });
    const raw = await dbAll<Record<string, unknown>>(
      app,
      sql`SELECT * FROM ${appTable(app, 'person')} WHERE id = ${ada.personId}`,
    );
    expect(JSON.stringify(raw)).not.toContain('ada');
    expect(raw[0]?.core_sub).toBeNull();
    expect(await householdsOf(app, TEST_RING, ada.accountId)).toEqual([]);

    // Her household lives on, Grace its Admin; her name stays on the member list; the others' own households are intact; and the others' accounts are.
    expect((await readHousehold(app, TEST_RING, ada.household, grace.accountId))?.role).toBe(
      'admin',
    );
    const members = await membersOf(app, TEST_RING, ada.household, grace.accountId);
    expect(members?.map((m) => [m.name, m.role])).toEqual([
      ['Grace', 'admin'],
      ['Lin', 'member'],
    ]);
    expect((await readHousehold(app, TEST_RING, lin.household, lin.accountId))?.role).toBe('admin');
    expect(await membersOf(app, TEST_RING, lin.household, lin.accountId)).toHaveLength(1);
    expect(await count(auth, authTable('user'), sql`id = ${grace.accountId}`)).toBe(1);
    expect(await count(auth, authTable('session'), sql`user_id = ${grace.accountId}`)).toBe(1);
    expect(
      await count(app, appTable(app, 'rate_bucket'), sql`"key" LIKE ${`%:${grace.accountId}`}`),
    ).toBe(1);
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
    expect((await readHousehold(app, TEST_RING, twice.household, other.accountId))?.role).toBe(
      'admin',
    );

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
