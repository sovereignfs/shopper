import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Env } from '../src/actions/env';
import type { Mutation } from '../src/actions/format';
import { addItem, clearBought, editItem, tickItem } from '../src/actions/items';
import { archiveList, makeList } from '../src/actions/lists';
import type { ItemRow } from '../src/actions/rows';
import { createAuth } from '../src/auth/auth';
import type { AuthSettings } from '../src/auth/config';
import { loadConfig } from '../src/config';
import { processEnv } from '../src/config/env';
import type { KeyRing } from '../src/crypto/keys';
import { getStores } from '../src/db/boot';
import type { Database } from '../src/db/client';
import type { DatabaseConfig } from '../src/db/config';
import { dbAll, dbGet } from '../src/db/exec';
import * as postgresAuth from '../src/db/schema/postgres/auth';
import * as sqliteAuth from '../src/db/schema/sqlite/auth';
import { appTable } from '../src/db/tables';
import { acceptInvitation, createInvitation, liveInvitations } from '../src/households/invitations';
import { dispatch } from '../src/households/ops';
import { resolveLimits } from '../src/limits/config';
import { makeAccountRecords } from '../src/people/account-records';
import { deletePerson } from '../src/sovereign/people';
import { applyMutation } from '../src/sync/apply';
import { starterEntryFor } from '../src/catalog/starter';
import { categoryOfNew } from '../src/lists/adding';
import type { CategoryRow } from '../src/local/rows';

/**
 * A realistic set of accounts for development (task 12.1). Everything goes **through the app's own paths**: accounts through better-auth, persons and
 * households as sign-up makes them, items and lists through the actions and `applyMutation` the sync endpoint uses, people into households by the invitation
 * a person would have sent and accepted, and someone leaving by the operation the dialog calls. So what it makes is what the app would have made, with the
 * checks the app makes, and nothing is written to a table directly.
 *
 * - **Idempotent.** Every id is derived from a name and every mutation has a fixed id, so running it again finds all of it done and changes nothing.
 * - **Local only, and never production.** It makes accounts with a password that is written in this file, so it refuses a database that is not on this
 *   machine and a `NODE_ENV` of production.
 * - **Removes only its own.** `--remove` deletes the three accounts the way a person deleting theirs would (`deletePerson`), and with them the households
 *   nobody else is in; `--reset` is that and then the seed again.
 * - It grows with the features: a feature that has a shape worth looking at adds it here, in the task that builds it.
 *
 * What there is to look at, once seeded: **Seed** (Admin of "My lists": Groceries with open, bought and noted items, a Hardware store list, a Party list that
 * was cleared, an archived list, a link waiting, and two people in it: Seed Two, and Seed Three, who has left but whose item is still there); **Seed Two**, who
 * is in Seed's household and has a household of their own with a list; and **Seed Three**, who left and has a household of their own. A product and an item
 * that two people added at once and that the server folded into one.
 */
export const SEED_PASSWORD = 'shopper-development-only';
export const SEEDS = [
  { key: 'one', email: 'seed@example.test', name: 'Seed' },
  { key: 'two', email: 'seed2@example.test', name: 'Seed Two' },
  { key: 'three', email: 'seed3@example.test', name: 'Seed Three' },
] as const;
type Key = (typeof SEEDS)[number]['key'];

/** Whether a database is on this machine: a file always is, and a service is when its host is. */
export function isLocalDatabase(config: DatabaseConfig): boolean {
  const local = (host: string) =>
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.endsWith('.localhost');
  if (config.dialect === 'postgres') return local(new URL(config.url).hostname);
  if (config.form === 'file') return true;
  return local(new URL(config.url).hostname) && local(new URL(config.adminUrl).hostname);
}

const authSchema = (database: Database) =>
  database.dialect === 'postgres' ? postgresAuth : sqliteAuth;

/** An id made from a name, the same every time (a version 5 UUID's shape from a SHA-1, in no namespace but the seed's). */
const named = (name: string): string => {
  const bytes = createHash('sha1').update(`shopper-seed:${name}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** Each mutation is made with ids that depend on its label and on how many it asked for, so the same seed makes the same ids. */
const envFor = (label: string, now: number): Env => {
  let n = 0;
  return { now, newId: () => named(`${label}:${n++}`) };
};

export interface Stores {
  app: Database;
  auth: Database;
}

export interface SeedContext {
  stores: Stores;
  settings: AuthSettings;
  ring: KeyRing;
  /** The time the seed is made at; the same on every run, so that a second run changes nothing. */
  now: number;
}

interface Who {
  accountId: string;
  personId: string;
  household: string;
}

async function findUser(auth: Database, email: string): Promise<string | undefined> {
  return (
    await dbGet<{ id: string }>(
      auth,
      sql`SELECT id FROM ${authSchema(auth).user} WHERE email = ${email}`,
    )
  )?.id;
}

/** Makes the account through better-auth, with sign-up open for this one call whatever the instance says: it is making a development account. */
async function makeUser(
  auth: Database,
  settings: AuthSettings,
  email: string,
  name: string,
): Promise<string> {
  const instance = createAuth({
    settings: { ...settings, signUp: 'open', local: true },
    name: 'Shopper',
    database: auth,
  });
  const made = await instance.api.signUpEmail({ body: { name, email, password: SEED_PASSWORD } });
  return made.user.id;
}

async function accounts(ctx: SeedContext): Promise<Record<Key, Who>> {
  const out = {} as Record<Key, Who>;
  for (const seed of SEEDS) {
    const accountId =
      (await findUser(ctx.stores.auth, seed.email)) ??
      (await makeUser(ctx.stores.auth, ctx.settings, seed.email, seed.name));
    const { personId, householdId } = await makeAccountRecords(
      ctx.stores.app,
      ctx.ring,
      { id: accountId, name: seed.name, email: seed.email },
      ctx.now,
    );
    out[seed.key] = { accountId, personId, household: householdId };
  }
  return out;
}

/** Sends a mutation as an account, as a device would, and fails loudly if the server refuses it: the seed is meant to be accepted. */
async function send(
  ctx: SeedContext,
  who: Who,
  mutation: Mutation | null,
): Promise<Mutation['changes']> {
  if (!mutation) throw new Error('the seed made an action that says nothing');
  const result = await applyMutation(
    { database: ctx.stores.app, ring: ctx.ring, limits: resolveLimits(() => undefined, []) },
    who.accountId,
    mutation,
    ctx.now,
  );
  if (result.status === 'refused')
    throw new Error(`the seed was refused (${result.reason}): ${result.sentence}`);
  return mutation.changes;
}

/** The household's categories as a device holds them, which is what the add field's own rule (`categoryOfNew`) reads. */
async function categoriesOf(app: Database, household: string): Promise<CategoryRow[]> {
  const rows = await dbAll<{
    id: string;
    starter_key: string | null;
    icon: string | null;
    position: string;
    hidden: number | boolean;
    seq: number | string;
  }>(
    app,
    sql`SELECT id, starter_key, icon, position, hidden, seq FROM ${appTable(app, 'category')} WHERE household_id = ${household}`,
  );
  return rows.map((row) => ({
    id: row.id,
    householdId: household,
    starterKey: row.starter_key,
    name: row.starter_key ?? '',
    icon: row.icon,
    position: row.position,
    hidden: Boolean(row.hidden),
    deletedAt: null,
    seq: Number(row.seq),
  }));
}

/** The first list of a household by position: _Groceries_, made with it. */
async function groceries(app: Database, household: string) {
  const row = await dbGet<{ id: string; created_at: number | string }>(
    app,
    sql`SELECT id, created_at FROM ${appTable(app, 'list')} WHERE household_id = ${household} ORDER BY position, id LIMIT 1`,
  );
  if (!row) throw new Error('a household has no first list');
  return { id: row.id, householdId: household };
}
const listRow = (id: string, householdId: string, name: string, now: number) => ({
  id,
  householdId,
  name,
  position: 'a0',
  clearing: 'manual' as const,
  archivedAt: null,
  deletedAt: null,
  createdAt: now,
  seq: 0,
});

/** An item as a device would hold it just after adding it, from the add's own change: what ticking, editing and clearing are given. */
function itemOf(mutation: Mutation): ItemRow {
  const change = mutation.changes.find((each) => each.table === 'item');
  if (!change) throw new Error('no item in the mutation');
  return {
    id: change.id,
    householdId: mutation.householdId,
    boughtAt: null,
    boughtBy: null,
    clearedAt: null,
    deletedAt: null,
    seq: 0,
    ...(change.fields as Record<string, never>),
  } as unknown as ItemRow;
}

async function isMember(app: Database, household: string, person: string): Promise<boolean> {
  return (
    (await dbGet(
      app,
      sql`SELECT 1 AS yes FROM ${appTable(app, 'member')} WHERE household_id = ${household} AND person_id = ${person}`,
    )) !== undefined
  );
}

/** Puts a person in a household by the invitation a member would send and the person would accept, as the app does. */
async function joinByInvitation(
  ctx: SeedContext,
  host: Who,
  guest: Who,
  label: string,
  when: number,
) {
  const made = await createInvitation(ctx.stores.app, {
    household: host.household,
    accountId: host.accountId,
    personId: host.personId,
    now: ctx.now,
  });
  if (!made.ok) throw new Error(made.refused);
  const accepted = await acceptInvitation(ctx.stores.app, ctx.ring, {
    token: made.token,
    accountId: guest.accountId,
    limits: resolveLimits(() => undefined, []),
    now: when,
  });
  if (accepted.status !== 'joined') throw new Error(`${label} did not join (${accepted.status})`);
}

export interface SeedResult {
  created: boolean;
  people: Record<Key, Who>;
}

export async function runSeed(ctx: SeedContext): Promise<SeedResult> {
  const created = (await findUser(ctx.stores.auth, SEEDS[0].email)) === undefined;
  const people = await accounts(ctx);
  const { one, two, three } = people;
  const { app } = ctx.stores;
  const at = ctx.now;
  // A clock that moves a minute at each step, so that what was added first is first (the order added, who joined first) and not a tie broken by an id.
  let clock = at;
  const env = (label: string) => envFor(label, (clock += 60_000));

  // ---- Seed's own household, "My lists". Everything below happens once: the whole block is skipped when it has been done.
  const done = await isMember(app, one.household, two.personId);
  if (!done) {
    const first = await groceries(app, one.household);
    const groceriesList = listRow(first.id, one.household, 'Groceries', at);

    // Lists: a Hardware store, a Party list, and one put away.
    const hardware = makeList(env('one:list:hardware'), {
      householdId: one.household,
      name: 'Hardware store',
      position: 'a1',
    });
    const party = makeList(env('one:list:party'), {
      householdId: one.household,
      name: 'Party supplies',
      position: 'a2',
    });
    const old = makeList(env('one:list:old'), {
      householdId: one.household,
      name: 'Last summer’s trip',
      position: 'a3',
    });
    const idOf = (mutation: Mutation) => mutation.changes[0]?.id ?? '';
    for (const mutation of [hardware, party, old]) await send(ctx, one, mutation);
    const hardwareList = listRow(idOf(hardware), one.household, 'Hardware store', at);
    const partyList = listRow(idOf(party), one.household, 'Party supplies', at);
    const oldList = listRow(idOf(old), one.household, 'Last summer’s trip', at);

    // Groceries: open, with quantities, units and a note; and some bought.
    // An item is made as the add field makes one: the category and icon the starter catalog (or a guess) gives the name, so that the list is by aisle.
    const categories = new Map<string, CategoryRow[]>();
    const add = async (
      who: Who,
      list: ReturnType<typeof listRow>,
      label: string,
      input: Omit<Parameters<typeof addItem>[1], 'list' | 'last' | 'by'> & { last?: string | null },
    ) => {
      const household = list.householdId;
      if (!categories.has(household)) categories.set(household, await categoriesOf(app, household));
      const rows = categories.get(household) ?? [];
      const mutation = addItem(env(label), {
        list,
        last: null,
        by: who.personId,
        categoryId: categoryOfNew(input.name, [], rows),
        icon: starterEntryFor(input.name)?.icon ?? null,
        ...input,
      });
      await send(ctx, who, mutation);
      return itemOf(mutation);
    };
    const milk = await add(one, groceriesList, 'one:g:milk', {
      name: 'Oat milk',
      quantity: '2',
      unit: 'L',
    });
    await add(one, groceriesList, 'one:g:bread', { name: 'Bread' });
    await add(one, groceriesList, 'one:g:bananas', { name: 'Bananas', quantity: '6', unit: 'pcs' });
    await add(one, groceriesList, 'one:g:spinach', { name: 'Spinach', quantity: '1', unit: 'bag' });
    await add(one, groceriesList, 'one:g:cheese', {
      name: 'Goat cheese',
      note: 'The soft one, not the sharp\nAsk at the counter',
    });
    await add(one, groceriesList, 'one:g:coffee', { name: 'Coffee', quantity: '500', unit: 'g' });
    const rice = await add(one, groceriesList, 'one:g:rice', {
      name: 'Rice',
      quantity: '1',
      unit: 'kg',
    });
    const butter = await add(one, groceriesList, 'one:g:butter', { name: 'Butter' });
    await send(ctx, one, tickItem(env('one:t:rice'), rice, one.personId));
    // Renamed on the list, as a person retypes a name: the item's own name changes and the product is as it was.
    await send(
      ctx,
      one,
      editItem(env('one:e:milk'), milk, { name: 'Oat milk (barista)', note: 'Not the sweet one' }),
    );

    // The hardware store and the party: the party's bought items are cleared.
    await add(one, hardwareList, 'one:h:screws', {
      name: 'Wood screws',
      quantity: '1',
      unit: 'box',
    });
    await add(one, hardwareList, 'one:h:tape', { name: 'Masking tape', note: 'Blue, not green' });
    const cups = await add(one, partyList, 'one:p:cups', {
      name: 'Paper cups',
      quantity: '2',
      unit: 'pack',
    });
    const balloons = await add(one, partyList, 'one:p:balloons', {
      name: 'Balloons',
      quantity: '30',
    });
    await add(one, partyList, 'one:p:candles', { name: 'Candles' });
    const tickedCups = await send(ctx, one, tickItem(env('one:t:cups'), cups, one.personId));
    await send(ctx, one, tickItem(env('one:t:balloons'), balloons, one.personId));
    void tickedCups;
    await send(
      ctx,
      one,
      clearBought(env('one:c:party'), [
        { ...cups, boughtAt: at, boughtBy: one.personId },
        { ...balloons, boughtAt: at, boughtBy: one.personId },
      ]),
    );
    // A list put away, with an item still on it.
    await add(one, oldList, 'one:o:sunscreen', { name: 'Sunscreen' });
    await send(ctx, one, archiveList(env('one:a:old'), oldList));

    // ---- Seed Two joins by a link; they add, tick what Seed added, and both add the same thing at once, which the server folds into one.
    await joinByInvitation(ctx, one, two, 'Seed Two', (clock += 60_000));
    await add(two, groceriesList, 'two:g:pasta', { name: 'Pasta', quantity: '500', unit: 'g' });
    await add(two, groceriesList, 'two:g:tomatoes', { name: 'Tomatoes', quantity: '6' });
    await send(ctx, two, tickItem(env('two:t:butter'), butter, two.personId));
    await add(one, groceriesList, 'one:g:yoghurt', {
      name: 'Yoghurt',
      quantity: '2',
      unit: 'pack',
    });
    await add(two, groceriesList, 'two:g:yoghurt', {
      name: 'Yoghurt',
      quantity: '1',
      unit: 'pack',
    });

    // ---- Seed Three joins, adds something, and leaves: the item stays, shown as theirs and as left.
    await joinByInvitation(ctx, one, three, 'Seed Three', (clock += 60_000));
    await add(three, groceriesList, 'three:g:water', {
      name: 'Sparkling water',
      quantity: '6',
      unit: 'bottle',
    });
    const left = await dispatch(
      { database: app, ring: ctx.ring },
      three.accountId,
      { op: 'member.leave', household: one.household },
      at,
    );
    if (left.status !== 200) throw new Error(`Seed Three could not leave (${left.status})`);
  }

  // ---- Seed Two's own household has a list of its own, and Seed Three's too.
  for (const [who, key] of [
    [two, 'two'],
    [three, 'three'],
  ] as const) {
    const own = await groceries(app, who.household);
    const list = listRow(own.id, who.household, 'Groceries', at);
    const marker = await dbGet(
      app,
      sql`SELECT 1 AS yes FROM ${appTable(app, 'item')} WHERE list_id = ${own.id} LIMIT 1`,
    );
    if (!marker) {
      for (const [index, name] of ['Lemons', 'Olive oil', 'Dog food'].entries()) {
        const rows = await categoriesOf(app, who.household);
        await send(
          ctx,
          who,
          addItem(env(`${key}:own:${index}`), {
            list,
            name,
            last: null,
            by: who.personId,
            categoryId: categoryOfNew(name, [], rows),
            icon: starterEntryFor(name)?.icon ?? null,
          }),
        );
      }
    }
  }

  // ---- A link waiting, from Seed, in "My lists": one, however often this runs.
  const waiting = await liveInvitations(app, ctx.ring, {
    household: one.household,
    accountId: one.accountId,
    now: at,
  });
  if (waiting.length === 0) {
    const made = await createInvitation(app, {
      household: one.household,
      accountId: one.accountId,
      personId: one.personId,
      now: at,
    });
    if (!made.ok) throw new Error(made.refused);
  }
  return { created, people };
}

/** Takes the seed away the way a person deleting their account would, the last to arrive first: the households nobody else is in go with them. */
export async function removeSeed(ctx: Pick<SeedContext, 'stores' | 'ring'>): Promise<number> {
  let removed = 0;
  for (const seed of [...SEEDS].reverse()) {
    const accountId = await findUser(ctx.stores.auth, seed.email);
    if (!accountId) continue;
    await deletePerson(
      { database: ctx.stores.app, authDatabase: ctx.stores.auth, ring: ctx.ring, now: Date.now },
      accountId,
    );
    removed++;
  }
  return removed;
}

/** Counts the rows of the tables the seed writes, for the report. */
async function counts(app: Database): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of ['household', 'member', 'list', 'item', 'product', 'invitation', 'alias']) {
    const row = await dbAll<{ n: number | string }>(
      app,
      sql`SELECT COUNT(*) AS n FROM ${appTable(app, table)}`,
    );
    out[table] = Number(row[0]?.n ?? 0);
  }
  return out;
}

export async function main(argv: string[]): Promise<number> {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'Refused: NODE_ENV is production, and the seed makes accounts with a password that is written in its source.',
    );
    return 1;
  }
  const loaded = loadConfig(processEnv());
  if (!loaded.ok) {
    console.error('The settings are wrong:');
    for (const problem of loaded.problems) console.error(`  - ${problem}`);
    return 1;
  }
  if (!isLocalDatabase(loaded.config.database.database)) {
    console.error(
      'Refused: the database is not on this machine, and the seed makes accounts with a password that is written in its source.',
    );
    return 1;
  }
  if (!loaded.config.auth) {
    console.error(
      'Sign-in is not set up (SHOPPER_AUTH_LOCAL, SHOPPER_AUTH_SECRET, SHOPPER_URL), and the seed needs accounts.',
    );
    return 1;
  }
  const stores = await getStores(loaded.config.database);
  try {
    const context: SeedContext = {
      stores,
      settings: loaded.config.auth,
      ring: loaded.config.encryption,
      // A fixed moment in the recent past, so that a second run is the same run.
      now: Date.UTC(2026, 10, 1, 9, 0, 0),
    };
    const remove = argv.includes('--remove') || argv.includes('--reset');
    if (remove) {
      const removed = await removeSeed(context);
      console.log(
        removed > 0
          ? `Removed ${removed} seed accounts and what only they had.`
          : 'There was no seed.',
      );
    }
    if (argv.includes('--remove')) return 0;
    const result = await runSeed(context);
    const rows = await counts(stores.app);
    console.log(`${result.created ? 'Made' : 'Found'} ${SEEDS.map((s) => s.email).join(', ')}.`);
    console.log(
      `Rows: ${Object.entries(rows)
        .map(([name, n]) => `${n} ${name}`)
        .join(', ')}.`,
    );
    console.log(`Sign in with any of them and the password in scripts/seed.ts (SEED_PASSWORD).`);
    return 0;
  } finally {
    await stores.close();
  }
}
