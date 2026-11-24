import { sql } from 'drizzle-orm';
import type { Database as AuthStore } from '@sovereignfs/auth/database';
import { movedAuthStore } from '../auth/test-support';
import { is } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstList, TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Database } from '../db/client';
import { openDatabase } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import * as sqliteApp from '../db/schema/sqlite/app';
import { appTable } from '../db/tables';
import { AUTH_TABLES, freshDatabase, testTarget } from '../db/test-support';
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
  inventory_item:
    'the account’s own, in its own group: deleted with the person whether or not the group stays for a list that passed on, with what folds and deletes of it left',
  rate_bucket: 'deleted where its key carries the account id',
  account_settings: 'the account’s own, deleted by account_id',
  list_key:
    'a person’s copy of a list’s keys: deleted with the person, when they leave the list, and with the list',
  household_key:
    'a member’s copy of a household’s keys: deleted with the person, and with a household nobody else is in',
  push_device: 'the account’s own devices for push, deleted by account_id',
  push_outbox: 'pushes waiting for the account’s devices, deleted with them',
};
/** The auth store's tables, `@sovereignfs/auth`'s since the move (ADR 0001), and what deleting a person does to each. */
const DECIDED_AUTH: Record<string, string> = {
  users: 'deleted',
  sessions: 'deleted',
  accounts: 'deleted',
  verifications: 'deleted, found by the address',
  two_factors: 'deleted',
  passkeys: 'deleted',
  sv_key_secrets: 'a session’s, deleted with the account’s sessions',
  sv_core_sign_ins: 'a session’s, deleted with the account’s sessions',
  sv_legacy_passwords: 'deleted',
  sv_tokens: 'core’s refresh token, kept under the account’s core sub: deleted',
  rate_limits:
    'keyed by address or by a hash of it, not by person, and swept when its window is over: not an account’s',
  sv_core_notices: 'core’s notices by their jti, kept until they expire: no person’s',
  sv_sessions: 'sign-ins through core still pending, which run out: no account’s yet',
  sv_auth_adoption: 'the record of the move: no person’s',
  sv_auth_migrations: 'a migration history: no person’s',
  sv_core_sign_in_migrations: 'a migration history: no person’s',
  shopper_sdk_store_migrations: 'a migration history: no person’s',
};

const namesIn = (module: Record<string, unknown>): string[] =>
  Object.values(module)
    .filter((value): value is SQLiteTable => is(value, SQLiteTable))
    .map((table) => getTableConfig(table).name);

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
    sql`INSERT INTO ${q('users')} (id, name, email, email_verified, created_at, updated_at) VALUES (${person.accountId}, ${person.name}, ${person.email}, ${false}, ${at}, ${at})`,
  );
  await dbRun(
    auth,
    sql`INSERT INTO ${q('sessions')} (id, expires_at, token, created_at, updated_at, user_id) VALUES (${`s-${person.accountId}`}, ${at}, ${`t-${person.accountId}`}, ${at}, ${at}, ${person.accountId})`,
  );
  await dbRun(
    auth,
    sql`INSERT INTO ${q('accounts')} (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (${`a-${person.accountId}`}, ${person.accountId}, 'credential', ${person.accountId}, 'hash', ${at}, ${at})`,
  );
  await dbRun(
    auth,
    sql`INSERT INTO ${q('verifications')} (id, identifier, value, expires_at, created_at, updated_at) VALUES (${`v-${person.accountId}`}, ${person.email}, 'v', ${at}, ${at}, ${at})`,
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
  // Their copy of a list's keys, given by a link (RFC 0004).
  await dbRun(
    app,
    sql`INSERT INTO ${appTable(app, 'list_key')} (list_id, person_id, household_id, epoch, record, created_at) VALUES (${'l-' + person.personId}, ${person.personId}, ${person.household}, 1, 'lr1', ${now})`,
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
    expect(Object.keys(DECIDED_AUTH).sort()).toEqual([...AUTH_TABLES].sort());
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
      sql`UPDATE ${authTable('users')} SET email = ${PLANTED_EMAIL} WHERE id = ${ada.accountId}`,
    );
    // What the package keeps of Ada beside better-auth's rows: her session's key secret and its core sign-in, the mark on her password,
    // and, through her sign-in through core, core's refresh token under her sub.
    const stamp = Date.now();
    await store.run(
      'INSERT INTO accounts (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        `core-${ada.accountId}`,
        `sub-${ada.accountId}`,
        'sovereign',
        ada.accountId,
        store.family === 'postgres' ? new Date(stamp) : stamp,
        store.family === 'postgres' ? new Date(stamp) : stamp,
      ],
    );
    await store.run(
      'INSERT INTO sv_key_secrets (session_id, secret, created_at) VALUES (?, ?, ?)',
      [`s-${ada.accountId}`, 'secret', stamp],
    );
    await store.run('INSERT INTO sv_core_sign_ins (session_id, sub, checked_at) VALUES (?, ?, ?)', [
      `s-${ada.accountId}`,
      `sub-${ada.accountId}`,
      stamp,
    ]);
    await store.run('INSERT INTO sv_legacy_passwords (user_id, until) VALUES (?, ?)', [
      ada.accountId,
      stamp + 1000,
    ]);
    await store.run('INSERT INTO sv_tokens (sub, sealed, fingerprint) VALUES (?, ?, ?)', [
      `sub-${ada.accountId}`,
      'sealed',
      'f',
    ]);

    const preview = await previewLeaving(app, TEST_RING, ada.accountId);
    expect(preview.map((p) => [p.own, p.outcome, p.to])).toEqual([
      [true, 'passes', 'Grace'],
      [false, 'left', null],
    ]);

    const done = await deletePerson(deps(), ada.accountId);
    expect(done).toEqual({ passed: 1, deleted: 0, left: 1 });

    // Nothing personal of Ada's is left: the sign-in store, the counters, the link from her person to her account.
    for (const [table, where] of [
      ['sv_key_secrets', 'session_id'],
      ['sv_core_sign_ins', 'session_id'],
      ['sv_legacy_passwords', 'user_id'],
    ] as const)
      expect(
        Number(
          (
            await store.run(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where} = ?`, [
              where === 'session_id' ? `s-${ada.accountId}` : ada.accountId,
            ])
          ).rows[0]?.n,
        ),
        table,
      ).toBe(0);
    expect(
      Number(
        (
          await store.run('SELECT COUNT(*) AS n FROM sv_tokens WHERE sub = ?', [
            `sub-${ada.accountId}`,
          ])
        ).rows[0]?.n,
      ),
    ).toBe(0);
    for (const table of ['users', 'sessions', 'accounts'])
      expect(
        await count(
          auth,
          authTable(table),
          sql`${sql.raw(table === 'users' ? 'id' : 'user_id')} = ${ada.accountId}`,
        ),
        table,
      ).toBe(0);
    expect(await count(auth, authTable('verifications'), sql`identifier = ${PLANTED_EMAIL}`)).toBe(
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
    expect(await count(app, appTable(app, 'list_key'), sql`person_id = ${ada.personId}`)).toBe(0);
    for (const table of ['sv_key_accounts', 'sv_key_wraps'])
      expect(await count(app, sql.raw(table), sql`user_id = ${ada.accountId}`), table).toBe(0);
    const person = await personById(app, TEST_RING, ada.personId);
    expect(person).toMatchObject({ name: 'Ada', email: null, accountId: null, deleted: true });
    const raw = await dbAll<Record<string, unknown>>(
      app,
      sql`SELECT * FROM ${appTable(app, 'person')} WHERE id = ${ada.personId}`,
    );
    // Not the address, in plain text (a word like `ada` alone can be in a random id).
    expect(JSON.stringify(raw).toLowerCase()).not.toContain(ada.email.toLowerCase());
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
    expect(await count(auth, authTable('users'), sql`id = ${grace.accountId}`)).toBe(1);
    expect(await count(auth, authTable('sessions'), sql`user_id = ${grace.accountId}`)).toBe(1);
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
            inventoryItems: 5000,
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

  it('deletes a person’s Inventory whether or not their group stays for a list that passed on, with what folds of it left, and leaves another person’s alone (23.3)', async () => {
    const ada = await somebody(app, 'Ada-inventory');
    const grace = await somebody(app, 'Grace-inventory');
    // Grace is on Ada's list, so Ada's group carries on after her: its lists are Grace's, its Inventory was Ada's alone.
    await join(app, ada.household, grace);
    const send = (account: string, household: string, changes: unknown[]) =>
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
            inventoryItems: 5000,
          },
        },
        account,
        { mutationId: crypto.randomUUID(), householdId: household, changes },
      );
    const item = (name: string) => ({
      table: 'inventory_item',
      id: crypto.randomUUID(),
      create: true,
      fields: { name, createdAt: 1, recurring: 0, hidden: 0 },
    });
    // Two of Ada's, one made twice so that a fold leaves an alias and a tombstone of no list, and one of Grace's, in her own group.
    expect((await send(ada.accountId, ada.household, [item('Ada bin bags')])).status).toBe(
      'applied',
    );
    expect((await send(ada.accountId, ada.household, [item('ada  BIN bags')])).status).toBe(
      'applied',
    );
    expect((await send(grace.accountId, grace.household, [item('Grace bin bags')])).status).toBe(
      'applied',
    );
    await seedAuth(ada);
    const inventory = (household: string) =>
      count(app, appTable(app, 'inventory_item'), sql`household_id = ${household}`);
    const leftovers = async (household: string) =>
      (await count(
        app,
        appTable(app, 'alias'),
        sql`household_id = ${household} AND table_name = 'inventory_item'`,
      )) +
      (await count(
        app,
        appTable(app, 'tombstone'),
        sql`household_id = ${household} AND table_name = 'inventory_item'`,
      ));
    expect(await inventory(ada.household)).toBe(1);
    expect(await leftovers(ada.household)).toBeGreaterThan(0);

    await deletePerson(deps(), ada.accountId);
    // The group stays (Grace is on its list), and none of Ada's Inventory with it.
    expect(await count(app, appTable(app, 'household'), sql`id = ${ada.household}`)).toBe(1);
    expect(await inventory(ada.household)).toBe(0);
    expect(await leftovers(ada.household)).toBe(0);
    // Grace's own is as it was.
    expect(await inventory(grace.household)).toBe(1);
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
      sql`DELETE FROM ${authTable('sessions')} WHERE user_id = ${halfway.accountId} RETURNING id`,
    );
    await dbAll(
      auth,
      sql`DELETE FROM ${authTable('accounts')} WHERE user_id = ${halfway.accountId} RETURNING id`,
    );
    await dbAll(
      auth,
      sql`DELETE FROM ${authTable('users')} WHERE id = ${halfway.accountId} RETURNING id`,
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
