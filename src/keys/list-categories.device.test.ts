import 'fake-indexeddb/auto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, callAs, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import { deleteCategory, makeCategory, renameCategory } from '../actions/categories';
import { changeInventoryItem, deleteInventoryItem, makeInventoryItem } from '../actions/inventory';
import type { ItemRow, ListRow } from '../actions/rows';
import type { Unit } from '../quantity/units';
import { rememberInInventory } from '../lists/remember-on-device';
import { layerInventory } from '../catalog/inventory';
import { addItem, editItem } from '../actions/items';
import { makeList } from '../actions/lists';
import {
  copyOnList,
  deleteCopy,
  putCategoryOnList,
  renameCopies,
  renameCopy,
} from '../actions/list-categories';
import { STARTER_CATEGORIES } from '../catalog/categories';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { OPERATIONS } from '../households/ops';
import { SyncClient } from '../local/client';
import { type LocalDatabase, deleteLocal, localName, openLocal } from '../local/db';
import { listViewOf, categoriesOfList } from '../local/listview';
import { planAdd, planAddFromInventory } from '../lists/adding';
import { planAddOnDevice } from '../lists/add-on-device';
import { type Suggestion, suggest } from '../catalog/suggest';
import { rowListOf } from '../local/row-list';
import {
  categoriesOf,
  failedOf,
  inventoryContextOf,
  inventoryOf,
  itemsOf,
  listCategoriesOf,
  listsOf,
  ownerCategoriesOf,
} from '../local/store';
import { type Wire, serverTransport } from '../local/test-support';
import type { EndpointDeps } from '../sync/endpoint';
import {
  carryCategoryOnMove,
  categoryOnList,
  copiesOfCategory,
  moveCategoryEverywhere,
  renameCategoryEverywhere,
  sourceKeyOn,
  type CopyKeys,
} from './copies';
import { deriveListKeyring, wrapListKeyring } from './household';
import { Mover } from './mover';
import { moveHousehold, moveInput, moveManifest } from './server/move';
import { EncryptionMemory, encryptingTransport } from './transport';

/**
 * **A list's copies of people's categories on their devices** (task 23.3, DESIGN.md §8.3, decisions 15 to 17), through the device's own transport and the real `Mover`
 * against the server: the owner of a moved group and a Member of one of its lists, who holds only that list's keys. A Member puts their own category on the list, which is a copy
 * of it under the list's keys, named by their item; the Admin renames the copies with the category, and the Member cannot; a deleted copy is made again; an item that moves
 * carries its category; and a guest who holds only a list's keys still opens it when the owner has categories of their own. The marker is a word that must be in no row.
 */
const { leg } = testTarget();
const MARKER = 'MARKERcopy8Garden';
let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());

const opened: LocalDatabase[] = [];
const names: string[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await deleteLocal('', name);
});

const deps = (): EndpointDeps => ({
  database,
  ring: TEST_RING,
  limits: {
    householdMembers: 20,
    accountHouseholds: 20,
    householdLists: 100,
    listOpenItems: 500,
    householdProducts: 5000,
    inventoryItems: 5000,
    householdCategories: 100,
    accountCards: 100,
  },
  intervalSeconds: 20,
});
let clock = 1_900_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });
const appKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const memoryStore = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

/** A device as the page makes one (`react.tsx`): the transport that encrypts and opens, and the one row-to-list lookup. */
async function deviceOf(who: Someone, key: CryptoKey, lookup: boolean = true) {
  const name = localName(`${who.accountId}-${crypto.randomUUID()}`);
  names.push(name);
  const db = await openLocal('', name);
  opened.push(db);
  const wire: Wire = { offline: false, requests: [] };
  const memory = new EncryptionMemory(memoryStore(), `k-${crypto.randomUUID()}`);
  const client = new SyncClient({
    db,
    transport: encryptingTransport(
      serverTransport(deps, who, wire),
      { appKey: () => key },
      memory,
      lookup ? rowListOf(db) : async () => undefined,
      undefined,
      async (id) => {
        const item = await db.get('item', id);
        return item ? { name: item.name, note: item.note } : undefined;
      },
      async (id) => (await db.get('inventory_item', id))?.starterKey,
    ),
    now: () => (clock += 1000),
  });
  const keys: CopyKeys = {
    encrypted: (household) => memory.isEncrypted(household),
    ringOf: (household, list) => memory.listKeyring(household, list, key),
  };
  return { who, db, wire, client, memory, key, keys };
}
type Dev = Awaited<ReturnType<typeof deviceOf>>;

const moveFetch =
  (who: Someone): typeof fetch =>
  async (input, init) => {
    const url = new URL(String(input), 'http://shopper.test');
    if (!init?.method || init.method === 'GET') {
      const manifest = await moveManifest(
        { database, ring: TEST_RING },
        url.searchParams.get('household') ?? '',
        who.accountId,
      );
      return manifest
        ? Response.json({ ok: true, ...manifest })
        : Response.json({ ok: false }, { status: 404 });
    }
    const body: unknown = JSON.parse(String(init.body));
    const parsed = moveInput.safeParse(body);
    const household = (body as { household?: string }).household ?? '';
    if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
    const result = await moveHousehold(
      { database, ring: TEST_RING },
      household,
      who.accountId,
      parsed.data,
    );
    return Response.json(result, {
      status: result.ok ? 200 : result.why === 'not-movable' ? 404 : 409,
    });
  };

/** A person's group moved to device encryption by the real `Mover`, and the device that moved it. */
async function movedDevice(who: Someone): Promise<Dev> {
  const key = await appKey();
  const dev = await deviceOf(who, key);
  await dev.client.sync();
  expect(await new Mover(dev.memory, moveFetch(who)).run([who.household], key)).toBe(true);
  await dev.client.sync();
  return dev;
}

/** Gives a guest a list of someone's moved group as a link does: a place on the list, and the guest's own copy of the list's keys. */
async function share(owner: Dev, list: string, guest: Dev) {
  const link = await import('../households/invitations');
  const made = await link.createInvitation(database, {
    household: owner.who.household,
    list,
    accountId: owner.who.accountId,
    personId: owner.who.personId,
    now: Date.now(),
    wrappedKey: `lk2.${'a'.repeat(16)}.${'b'.repeat(32)}`,
  });
  if (!made.ok) throw new Error(made.refused);
  const joined = await link.acceptInvitation(database, TEST_RING, {
    token: made.token,
    accountId: guest.who.accountId,
    limits: deps().limits,
    now: Date.now(),
  });
  if (joined.status !== 'joined') throw new Error(joined.status);
  const group = await owner.memory.keyring(owner.who.household, owner.key);
  if (!group) throw new Error('no keyring');
  const record = await wrapListKeyring(guest.key, await deriveListKeyring(group, list), {
    person: guest.who.personId,
    list,
  });
  const reply = await callAs(database, OPERATIONS, guest.who, {
    op: 'list.key.mine',
    household: owner.who.household,
    list,
    record,
  });
  expect(reply.status).toBe(200);
}

/** Ada's moved group with Groceries and Hardware, and Grace, who has a moved group of her own, a Member of Groceries with its keys alone. */
async function world(name: string) {
  const ada = await somebody(database, `${name}-Ada`);
  const grace = await somebody(database, `${name}-Grace`);
  const a = await movedDevice(ada);
  const g = await movedDevice(grace);
  const made = makeList(env(), { householdId: ada.household, name: 'Hardware', position: 'a5' });
  await a.client.commit(made);
  await a.client.sync();
  const hardware = made.changes[0]?.id ?? '';
  await share(a, ada.list, g);
  await g.client.sync();
  return { ada, grace, a, g, hardware };
}

/** A category of the person's own, made on their device, and its id. */
async function ownCategory(d: Dev, name: string): Promise<string> {
  const made = makeCategory(env(), { householdId: d.who.household, name, last: null });
  await d.client.commit(made);
  await d.client.sync();
  return made.changes[0]?.id ?? '';
}

const copiesOn = (d: Dev, list: string) => d.client.read((db) => listCategoriesOf(db, list));
const serverCopies = () =>
  dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'list_category')}`,
  );

/** Puts a category of the person's own on a list, in a mutation of its own, the way an Admin adds one to their aisle order. */
async function putOn(d: Dev, household: string, list: string, categoryId: string, name: string) {
  const sourceKey = await sourceKeyOn(d.keys, household, list, categoryId);
  if (!sourceKey) throw new Error('no source key');
  const copies = await d.client.read((db) => db.getAllFromIndex('list_category', 'byList', list));
  const put = putCategoryOnList(env(), {
    householdId: household,
    listId: list,
    sourceKey,
    name,
    copies,
  });
  if (!put) throw new Error('already there');
  await d.client.commit(put.mutation);
  await d.client.sync();
  return put.id;
}

describe(`a guest who holds only a list’s keys (${leg})`, () => {
  it('opens the list when the owner of a moved group has categories of their own and has named a starter, and sees the starter by the code’s name', async () => {
    const { ada, a, g } = await world('Guest');
    await ownCategory(a, `Hardware ${MARKER}`);
    const produce = (await a.client.read((db) => ownerCategoriesOf(db, ada.household))).find(
      (row) => row.starterKey === 'produce',
    );
    if (!produce) throw new Error('no starter category');
    await a.client.commit(
      renameCategory(env(), produce, `Fruit and veg ${MARKER}`) ?? (undefined as never),
    );
    // Then Ada adds an item to Groceries: a page of the group the guest could not open would be dropped whole, and with it this.
    await a.client.commit(
      addItem(env(), {
        list: (await a.client.read((db) => listsOf(db, ada.household)))[0] ?? (undefined as never),
        name: 'Milk after the rename',
        last: null,
        by: ada.personId,
      }),
    );
    await a.client.sync();
    await g.client.sync();
    expect((await g.client.read((db) => itemsOf(db, ada.list))).map((row) => row.name)).toContain(
      'Milk after the rename',
    );
    // The guest has the list, and no page of the group was dropped for what it cannot open.
    expect((await g.client.read((db) => listsOf(db, ada.household))).map((l) => l.id)).toEqual([
      ada.list,
    ]);
    const starters = await g.client.read((db) => categoriesOf(db, ada.household));
    expect(starters).toHaveLength(STARTER_CATEGORIES.length);
    expect(starters.find((row) => row.starterKey === 'produce')?.name).toBe('Produce');
    const held = await g.client.read((db) => db.getAll('category'));
    expect(JSON.stringify(held)).not.toContain(MARKER);
    // Not one of the owner's own categories is on the guest's device, nor the ciphertext of a name they gave a starter.
    expect(held.filter((row) => row.starterKey === null)).toEqual([]);
    expect(held.some((row) => 'encrypted' in row)).toBe(false);
    expect(await failedOf(g.db)).toEqual([]);
    // Ada's own device reads them all.
    expect(
      (await a.client.read((db) => ownerCategoriesOf(db, ada.household))).find(
        (row) => row.starterKey === 'produce',
      )?.name,
    ).toBe(`Fruit and veg ${MARKER}`);
  });
});

describe(`a list’s copies of people’s categories on devices (${leg})`, () => {
  it('are made by a Member for their own category with an item that names it, read by the Admin under the list’s keys, and say no id of the Member’s in any column of the group', async () => {
    const { ada, grace, a, g } = await world('Member');
    const garden = await ownCategory(g, `Garden ${MARKER}`);
    // Grace, a Member of Groceries, adds an item and puts her own category on the list: a copy, and the item naming it, in one mutation.
    await g.client.commit(
      addItem(env(), {
        list: (await g.client.read((db) => listsOf(db, ada.household)))[0] ?? (undefined as never),
        name: 'Spade',
        last: null,
        by: grace.personId,
      }),
    );
    await g.client.sync();
    const spade = (await g.client.read((db) => itemsOf(db, ada.list))).find(
      (row) => row.name === 'Spade',
    );
    if (!spade) throw new Error('no item');
    const sourceKey = await sourceKeyOn(g.keys, ada.household, ada.list, garden);
    if (!sourceKey) throw new Error('no source key');
    const plan = copyOnList(env(), {
      listId: ada.list,
      sourceKey,
      name: `Garden ${MARKER}`,
      copies: [],
      last: null,
    });
    await g.client.commit({
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: [
        ...(plan.change ? [plan.change] : []),
        { table: 'item', id: spade.id, fields: { categoryId: plan.id } },
      ],
    });
    await g.client.sync();
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    // Ada reads the copy's name under the list's keys, and her list groups the item under it.
    expect((await copiesOn(a, ada.list)).map((row) => row.name)).toEqual([`Garden ${MARKER}`]);
    const view = await a.client.read((db) => listViewOf(db, ada.list));
    if (!view.found) throw new Error('not found');
    expect(view.categories.find((row) => row.id === plan.id)?.name).toBe(`Garden ${MARKER}`);
    expect(view.items.find((row) => row.id === spade.id)?.categoryId).toBe(plan.id);
    // The server holds ciphertext and an HMAC: no marker, and no id of Grace's category or of her group in any column of the group.
    const rows = await serverCopies();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sealed).toBe('');
    expect(JSON.stringify(rows)).not.toContain(MARKER);
    for (const table of [
      'list_category',
      'item',
      'product',
      'category',
      'list_member',
      'tombstone',
      'alias',
    ]) {
      const found = await dbAll<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${appTable(database, table)} WHERE household_id = ${ada.household}`,
      );
      expect(JSON.stringify(found), table).not.toContain(garden);
      expect(JSON.stringify(found), table).not.toContain(grace.household);
    }
  });

  it('are renamed with the category by the Admin of each list that has one, which needs the transport to know a copy’s list, and the Member cannot rename the Admin’s', async () => {
    const { ada, a, g, hardware } = await world('Rename');
    const hammers = await ownCategory(a, 'Hammers');
    const first = await putOn(a, ada.household, ada.list, hammers, 'Hammers');
    const second = await putOn(a, ada.household, hardware, hammers, 'Hammers');
    await g.client.sync();
    expect((await copiesOn(g, ada.list)).map((row) => row.id)).toEqual([first]);
    // Renamed in Inventory: the copies on the lists she is Admin of are found by their source key on each list, and renamed in mutations of their own.
    const found = await a.client.read((db) => copiesOfCategory(db, a.keys, hammers));
    expect(found.map((row) => row.id).sort()).toEqual([first, second].sort());
    const category = (await a.client.read((db) => ownerCategoriesOf(db, ada.household))).find(
      (row) => row.id === hammers,
    );
    if (!category) throw new Error('no category');
    await a.client.commit(renameCategory(env(), category, 'Tools') ?? (undefined as never));
    for (const mutation of renameCopies(env(), found, 'Tools')) await a.client.commit(mutation);
    await a.client.sync();
    await g.client.sync();
    expect(await failedOf(a.db)).toEqual([]);
    expect((await copiesOn(a, hardware)).map((row) => row.name)).toEqual(['Tools']);
    expect((await copiesOn(g, ada.list)).map((row) => row.name)).toEqual(['Tools']);
    // Grace is a Member of Groceries: her rename of the Admin's copy is refused, put into Couldn't sync, and the row is as it was.
    const theirs = (await copiesOn(g, ada.list))[0];
    if (!theirs) throw new Error('no copy');
    await g.client.commit(renameCopy(env(), theirs, 'Grace’s name') ?? (undefined as never));
    expect((await copiesOn(g, ada.list))[0]?.name).toBe('Grace’s name');
    await g.client.sync();
    expect(await failedOf(g.db)).toHaveLength(1);
    expect((await copiesOn(g, ada.list))[0]?.name).toBe('Tools');
    expect((await copiesOn(a, ada.list))[0]?.name).toBe('Tools');
  });

  it('are made again after the Admin deletes one, and an item naming the new one names the one that stands', async () => {
    const { ada, a, g } = await world('Again');
    const shelf = await ownCategory(a, 'Shelves');
    const first = await putOn(a, ada.household, ada.list, shelf, 'Shelves');
    await g.client.sync();
    await a.client.commit(
      deleteCopy(env(), (await copiesOn(a, ada.list))[0] ?? (undefined as never)) ??
        (undefined as never),
    );
    await a.client.sync();
    await g.client.sync();
    expect(await copiesOn(a, ada.list)).toEqual([]);
    // The category is put on the list again, by its owner, on a device that holds no live copy: a new copy under the same source key, and an item naming it.
    const sourceKey = await sourceKeyOn(a.keys, ada.household, ada.list, shelf);
    if (!sourceKey) throw new Error('no source key');
    const copies = await a.client.read((db) =>
      db.getAllFromIndex('list_category', 'byList', ada.list),
    );
    const plan = copyOnList(env(), {
      listId: ada.list,
      sourceKey,
      name: 'Shelves',
      copies,
      last: null,
    });
    expect(plan.change).not.toBeNull();
    expect(plan.id).not.toBe(first);
    await a.client.commit(
      addItem(env(), {
        list: (await a.client.read((db) => listsOf(db, ada.household)))[0] ?? (undefined as never),
        name: 'Bracket',
        last: null,
        by: ada.personId,
      }),
    );
    const bracket = (await a.client.read((db) => itemsOf(db, ada.list))).find(
      (r) => r.name === 'Bracket',
    );
    if (!bracket) throw new Error('no item');
    await a.client.commit({
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: [
        ...(plan.change ? [plan.change] : []),
        { table: 'item', id: bracket.id, fields: { categoryId: plan.id } },
      ],
    });
    await a.client.sync();
    await g.client.sync();
    for (const d of [a, g]) {
      const live = await copiesOn(d, ada.list);
      expect(live.map((row) => row.id)).toEqual([first]);
      expect(live[0]?.name).toBe('Shelves');
      expect(await failedOf(d.db)).toEqual([]);
    }
    expect(
      (await a.client.read((db) => itemsOf(db, ada.list))).find((r) => r.id === bracket.id)
        ?.categoryId,
    ).toBe(first);
  });

  it('are carried by an item that moves to another list when the person moving it holds the category, and are left to a guess when they do not', async () => {
    const { ada, a, g, hardware } = await world('Move');
    const nails = await ownCategory(a, 'Nails');
    const copy = await putOn(a, ada.household, ada.list, nails, 'Nails');
    await a.client.commit(
      addItem(env(), {
        list: (await a.client.read((db) => listsOf(db, ada.household)))[0] ?? (undefined as never),
        name: 'Tacks',
        last: null,
        by: ada.personId,
      }),
    );
    const tacks = (await a.client.read((db) => itemsOf(db, ada.list))).find(
      (r) => r.name === 'Tacks',
    );
    if (!tacks) throw new Error('no item');
    await a.client.commit(editItem(env(), tacks, { categoryId: copy }) ?? (undefined as never));
    await a.client.sync();
    await g.client.sync();
    const named = (await a.client.read((db) => itemsOf(db, ada.list))).find(
      (r) => r.id === tacks.id,
    );
    if (!named) throw new Error('no item');
    // Ada holds Nails: a copy of it is made on Hardware in the move, and the item and its new product name it.
    const carry = await carryCategoryOnMove(a.db, a.keys, env(), { item: named, to: hardware });
    expect(carry?.copy).not.toBeNull();
    const products = await a.client.read((db) =>
      db.getAllFromIndex('product', 'byHousehold', ada.household),
    );
    const move = editItem(
      env(),
      named,
      { listId: hardware },
      undefined,
      { product: products.find((p) => p.id === named.productId), products },
      carry,
    );
    if (!move) throw new Error('no move');
    const undo = await a.client.commit(move);
    await a.client.sync();
    expect(await failedOf(a.db)).toEqual([]);
    const there = (await copiesOn(a, hardware))[0];
    expect(there?.name).toBe('Nails');
    expect(
      (await a.client.read((db) => itemsOf(db, hardware))).find((r) => r.id === tacks.id)
        ?.categoryId,
    ).toBe(there?.id);
    // The Undo of the move puts the item back on the first list with the category it had, and leaves the copy it made (a Member's delete of it would be refused).
    expect(undo?.changes.some((change) => change.table === 'list_category')).toBe(false);
    expect(undo?.changes.find((change) => change.table === 'item')?.fields).toMatchObject({
      listId: ada.list,
      categoryId: copy,
    });
    // Grace, a Member who does not hold Nails, moves another item of that copy: it is not carried, and the move is not refused for it.
    await a.client.commit(
      addItem(env(), {
        list: (await a.client.read((db) => listsOf(db, ada.household)))[0] ?? (undefined as never),
        name: 'Pins',
        last: null,
        by: ada.personId,
      }),
    );
    const pins = (await a.client.read((db) => itemsOf(db, ada.list))).find(
      (r) => r.name === 'Pins',
    );
    if (!pins) throw new Error('no item');
    await a.client.commit(editItem(env(), pins, { categoryId: copy }) ?? (undefined as never));
    await a.client.sync();
    await g.client.sync();
    const theirs = (await g.client.read((db) => itemsOf(db, ada.list))).find(
      (r) => r.id === pins.id,
    );
    if (!theirs) throw new Error('no item');
    // Grace is on Groceries only: she cannot move it to Hardware; the carry is asked for a list of the group she does not hold keys to, and says nothing carried.
    const guess = await carryCategoryOnMove(g.db, g.keys, env(), { item: theirs, to: hardware });
    expect(guess?.copy ?? null).toBeNull();
    expect(guess?.item).not.toBe(copy);
    // A starter category, and no category, need nothing carried.
    expect(
      await carryCategoryOnMove(a.db, a.keys, env(), {
        item: { ...named, categoryId: null },
        to: ada.list,
      }),
    ).toBeUndefined();
    const lists = await a.client.read((db) => categoriesOfList(db, ada.household, ada.list));
    expect(lists.some((row) => row.id === copy && row.name === 'Nails')).toBe(true);
  });

  it('are renamed while their make still waits to be sent, and carry the category of the product a move makes as well as the item’s', async () => {
    const { ada, a, hardware } = await world('Pending');
    const pegs = await ownCategory(a, 'Pegs');
    // Offline: the category is put on Groceries, and the copy renamed before either has been sent. The row is the device's alone, with no row at the server, so the
    // transport must still know its list.
    a.wire.offline = true;
    const sourceKey = await sourceKeyOn(a.keys, ada.household, ada.list, pegs);
    if (!sourceKey) throw new Error('no source key');
    const put = putCategoryOnList(env(), {
      householdId: ada.household,
      listId: ada.list,
      sourceKey,
      name: 'Pegs',
      copies: [],
    });
    if (!put) throw new Error('already there');
    await a.client.commit(put.mutation);
    const waiting = (await copiesOn(a, ada.list))[0];
    if (!waiting) throw new Error('no copy');
    await a.client.commit(renameCopy(env(), waiting, 'Tent pegs') ?? (undefined as never));
    a.wire.offline = false;
    await a.client.sync();
    expect(await failedOf(a.db)).toEqual([]);
    expect((await copiesOn(a, ada.list)).map((row) => row.name)).toEqual(['Tent pegs']);
    // An item with a starter category whose product remembers the copy moves to Hardware: the product made there must not name the copy of Groceries, or the server refuses it.
    await a.client.commit(
      addItem(env(), {
        list: (await a.client.read((db) => listsOf(db, ada.household)))[0] ?? (undefined as never),
        name: 'Mallet',
        last: null,
        by: ada.personId,
      }),
    );
    const mallet = (await a.client.read((db) => itemsOf(db, ada.list))).find(
      (r) => r.name === 'Mallet',
    );
    if (!mallet) throw new Error('no item');
    await a.client.commit({
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: [{ table: 'product', id: mallet.productId, fields: { categoryId: put.id } }],
    });
    await a.client.sync();
    const item = (await a.client.read((db) => itemsOf(db, ada.list))).find(
      (r) => r.id === mallet.id,
    );
    const products = await a.client.read((db) =>
      db.getAllFromIndex('product', 'byHousehold', ada.household),
    );
    const product = products.find((p) => p.id === item?.productId);
    if (!item || !product) throw new Error('no item');
    expect(product.categoryId).toBe(put.id);
    const carry = await carryCategoryOnMove(a.db, a.keys, env(), { item, product, to: hardware });
    expect(carry?.product).toBeDefined();
    expect(carry?.product).not.toBe(put.id);
    const move = editItem(
      env(),
      item,
      { listId: hardware },
      undefined,
      { product, products },
      carry,
    );
    if (!move) throw new Error('no move');
    await a.client.commit(move);
    await a.client.sync();
    expect(await failedOf(a.db)).toEqual([]);
    const made = (
      await a.client.read((db) => db.getAllFromIndex('product', 'byHousehold', ada.household))
    ).find((p) => p.listId === hardware && p.name === 'Mallet');
    expect(made?.categoryId).toBe(carry?.product);
    expect((await copiesOn(a, hardware)).map((row) => row.id)).toContain(carry?.product);
  });
});

describe(`a new name added to a list makes an Inventory item (${leg})`, () => {
  it('of the person who typed it, in their own group and not in the group the list is in, once, encrypted, and none for a name they have', async () => {
    const { ada, grace, a, g } = await world('Fill');
    const typed = {
      kind: 'new',
      name: `Zucchini bags ${MARKER}`,
      icon: null,
      quantity: null,
      unit: null,
    } as const;
    // Grace, a Member of Ada's Groceries, adds a name nobody has typed: the item goes on Ada's list, and the Inventory item goes to Grace's own group.
    const plan = async () => {
      const now = await g.client.read((db) => listViewOf(db, ada.list));
      if (!now.found || !now.me) throw new Error('not found');
      const inventory = await g.client.read(inventoryContextOf);
      const planned = planAdd(
        env(),
        {
          list: now.list,
          products: now.products,
          items: now.items,
          categories: now.categories,
          me: now.me,
          ...(inventory ? { inventory } : {}),
        },
        typed,
      );
      if (!planned || 'refused' in planned) throw new Error('nothing planned');
      return planned;
    };
    const first = await plan();
    expect(first.mutation.householdId).toBe(ada.household);
    expect(first.also?.householdId).toBe(grace.household);
    await g.client.commit(first.mutation);
    if (first.also) await g.client.commit(first.also);
    await g.client.sync();
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    const mine = await g.client.read(inventoryOf);
    expect(mine.map((row) => [row.name, row.recurring])).toEqual([[typed.name, false]]);
    // Ada's Inventory is her own: nothing of Grace's reached it, and the server holds none of it in plain text.
    expect(await a.client.read(inventoryOf)).toEqual([]);
    const rows = await dbAll<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'inventory_item')}`,
    );
    expect(rows.filter((row) => row.household_id === ada.household)).toEqual([]);
    const hers = rows.filter((row) => row.household_id === grace.household);
    expect(hers).toHaveLength(1);
    expect(hers[0]?.sealed).toBe('');
    expect(JSON.stringify(hers)).not.toContain(MARKER);
    // The same name again: the list has its product now, and her Inventory has the item, so nothing more is made.
    const again = await plan();
    expect(again.also).toBeUndefined();
  });
});

describe(`an Inventory item added to a list (${leg})`, () => {
  /** An item of the person's own Inventory, with a category or none, and its address (`own:<id>`). */
  async function ownItem(d: Dev, name: string, categoryId: string | null): Promise<string> {
    const made = makeInventoryItem(env(), {
      householdId: d.who.household,
      name,
      ...(categoryId ? { categoryId } : {}),
    });
    await d.client.commit(made);
    await d.client.sync();
    return `own:${made.changes[0]?.id ?? ''}`;
  }

  /** _Add to a list_ as the panel makes it: the category on that list, the plan from the item's own fields, written and sent. */
  async function addFrom(d: Dev, key: string, list: string) {
    const entry = layerInventory(await d.client.read(inventoryOf)).find((each) => each.key === key);
    if (!entry) throw new Error('no such item');
    const view = await d.client.read((db) => listViewOf(db, list));
    if (!view.found || !view.me) throw new Error('not found');
    const category = await categoryOnList(d.db, d.keys, env(), { entry, list: view.list });
    const planned = planAddFromInventory(
      env(),
      {
        list: view.list,
        products: view.products,
        items: view.items,
        categories: view.categories,
        me: view.me,
      },
      entry,
      category,
    );
    if (!planned || 'refused' in planned) throw new Error('nothing planned');
    const undo = await d.client.commit(planned.mutation);
    await d.client.sync();
    return { planned, category, undo };
  }

  it('makes the list’s copy of a category of the person’s own, once, as a Member on another person’s list, accepted, and the Admin reads it', async () => {
    const { ada, grace, a, g } = await world('AddOwn');
    const garden = await ownCategory(g, `Garden ${MARKER}`);
    const spade = await ownItem(g, `Spade ${MARKER}`, garden);
    const rake = await ownItem(g, 'Rake', garden);

    const first = await addFrom(g, spade, ada.list);
    expect(first.category.copy).not.toBeNull();
    expect(first.planned.mutation.householdId).toBe(ada.household);
    expect(first.planned.mutation.changes.map((each) => each.table)).toEqual([
      'list_category',
      'product',
      'item',
    ]);
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    // Ada reads the copy's name under the list's keys, and the item under it.
    expect((await copiesOn(a, ada.list)).map((row) => row.name)).toEqual([`Garden ${MARKER}`]);
    const view = await a.client.read((db) => listViewOf(db, ada.list));
    if (!view.found) throw new Error('not found');
    const item = view.items.find((row) => row.name === `Spade ${MARKER}`);
    expect(item?.categoryId).toBe(first.category.id);
    expect(item?.icon).toBeNull();

    // Undo of that add takes the item off and leaves the copy, which a Member cannot delete: an undo that took it too would be refused whole.
    expect(first.undo).not.toBeNull();
    await g.client.commit(first.undo);
    await g.client.sync();
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    const after = await a.client.read((db) => listViewOf(db, ada.list));
    if (!after.found) throw new Error('not found');
    expect(after.items.filter((row) => row.name === `Spade ${MARKER}`)).toEqual([]);
    expect((await copiesOn(a, ada.list)).map((row) => row.name)).toEqual([`Garden ${MARKER}`]);

    // A second item of the same category finds the copy and makes no other.
    const second = await addFrom(g, rake, ada.list);
    expect(second.category.copy).toBeNull();
    expect(second.category.id).toBe(first.category.id);
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    expect((await copiesOn(a, ada.list)).map((row) => row.name)).toEqual([`Garden ${MARKER}`]);
    expect((await serverCopies()).filter((row) => row.household_id === ada.household)).toHaveLength(
      1,
    );
    // Nothing of it is in plain text, and no id of Grace's category or group is in the group.
    for (const table of ['list_category', 'item', 'product']) {
      const found = await dbAll<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${appTable(database, table)} WHERE household_id = ${ada.household}`,
      );
      expect(JSON.stringify(found), table).not.toContain(MARKER);
      expect(JSON.stringify(found), table).not.toContain(garden);
      expect(JSON.stringify(found), table).not.toContain(grace.household);
    }
  });

  it('takes the category Inventory has over the one the list’s product remembers, as a Member, and leaves the product', async () => {
    const { ada, a, g } = await world('AddProduct');
    const garden = await ownCategory(g, 'Garden');
    const tools = await ownCategory(g, 'Tools');
    const spade = await ownItem(g, 'Spade', garden);
    // The first add makes the product, which remembers Garden; Undo takes the item off and leaves it.
    const first = await addFrom(g, spade, ada.list);
    await g.client.commit(first.undo);
    await g.client.sync();
    const products = () =>
      dbAll<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${appTable(database, 'product')} WHERE household_id = ${ada.household}`,
      );
    const before = await products();
    expect(before).toHaveLength(1);
    // Inventory is changed to Tools; adding again puts the item under Tools, a second copy, and the product is as it was.
    const row = (await g.client.read(inventoryOf)).find((each) => `own:${each.id}` === spade);
    if (!row) throw new Error('no row');
    const moved = changeInventoryItem(env(), row, { categoryId: tools });
    if (moved) await g.client.commit(moved);
    await g.client.sync();
    const second = await addFrom(g, spade, ada.list);
    expect(second.category.copy).not.toBeNull();
    expect(second.category.id).not.toBe(first.category.id);
    expect(second.planned.mutation.changes.map((each) => each.table)).toEqual([
      'list_category',
      'product',
      'item',
    ]);
    expect(
      second.planned.mutation.changes.find((each) => each.table === 'product')?.create,
    ).toBeUndefined();
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    const view = await a.client.read((db) => listViewOf(db, ada.list));
    if (!view.found) throw new Error('not found');
    expect(
      view.items.find((row) => row.name === 'Spade' && row.deletedAt === null)?.categoryId,
    ).toBe(second.category.id);
    expect(view.products.find((row) => row.name === 'Spade')?.categoryId).toBe(first.category.id);
    expect(await products()).toHaveLength(1);
    expect((await copiesOn(a, ada.list)).map((row) => row.name).sort()).toEqual([
      'Garden',
      'Tools',
    ]);
  });

  it('puts the copy on the person’s own list too, and a starter category is the list’s group’s row and not an id of the person’s group', async () => {
    const { ada, grace, a, g } = await world('AddStarter');
    const garden = await ownCategory(a, 'Garden');
    const spade = await ownItem(a, 'Spade', garden);
    const onOwn = await addFrom(a, spade, ada.list);
    expect(onOwn.category.copy).not.toBeNull();
    expect(await failedOf(a.db)).toEqual([]);
    expect((await copiesOn(a, ada.list)).map((row) => row.name)).toEqual(['Garden']);

    // Grace's Banana is a starter entry: its category is Produce, as Ada's group has it, a row Grace's group does not share.
    const banana = layerInventory(await g.client.read(inventoryOf)).find(
      (each) => each.key === 'starter:banana',
    );
    expect(banana?.categoryKey).toBe('produce');
    const hers = (await g.client.read((db) => categoriesOf(db, grace.household))).find(
      (each) => each.starterKey === 'produce',
    );
    const adas = (await g.client.read((db) => categoriesOf(db, ada.household))).find(
      (each) => each.starterKey === 'produce',
    );
    expect(adas?.id).toBeDefined();
    expect(hers?.id).not.toBe(adas?.id);
    const added = await addFrom(g, 'starter:banana', ada.list);
    expect(added.category).toEqual({ id: adas?.id, copy: null, guessed: false });
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    const view = await a.client.read((db) => listViewOf(db, ada.list));
    if (!view.found) throw new Error('not found');
    const item = view.items.find((row) => row.name === 'Banana');
    expect(item).toMatchObject({
      categoryId: adas?.id,
      icon: 'banana',
      unit: 'pcs',
      quantity: '6',
    });
  });

  it('takes the guess for an item with no category and for one whose category was deleted, and is accepted', async () => {
    const { ada, a, g } = await world('AddGuess');
    const plain = await ownItem(g, 'Zorblax', null);
    const gone = await ownCategory(g, 'Gone');
    const stale = await ownItem(g, 'Quuxle', gone);
    const category = await g.client.read((db) => ownerCategoriesOf(db, g.who.household));
    const row = category.find((each) => each.id === gone);
    if (!row) throw new Error('no category');
    const deleted = deleteCategory(env(), row);
    if (deleted) await g.client.commit(deleted);
    await g.client.sync();
    for (const key of [plain, stale]) {
      const added = await addFrom(g, key, ada.list);
      expect(added.category.copy).toBeNull();
      const other = (await g.client.read((db) => categoriesOf(db, ada.household))).find(
        (each) => each.starterKey === 'other',
      );
      expect(added.category.id).toBe(other?.id);
    }
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
  });

  it('makes no copy where the server still seals the group, and takes the guess', async () => {
    const who = await somebody(database, 'AddSealed');
    const d = await deviceOf(who, await appKey());
    await d.client.sync();
    const before = (await serverCopies()).length;
    const garden = await ownCategory(d, 'Garden');
    const spade = await ownItem(d, 'Spade', garden);
    const added = await addFrom(d, spade, who.list);
    expect(added.category.copy).toBeNull();
    expect(await failedOf(d.db)).toEqual([]);
    expect((await serverCopies()).length).toBe(before);
  });
});

describe(`an Inventory item chosen in the add field (${leg})`, () => {
  /** An item of the person's own Inventory, with a category or none, and what it says. */
  async function ownItem(d: Dev, name: string, categoryId: string | null, recurring = false) {
    const made = makeInventoryItem(env(), {
      householdId: d.who.household,
      name,
      quantity: '2',
      unit: 'pack',
      icon: 'cookie',
      recurring,
      ...(categoryId ? { categoryId } : {}),
    });
    await d.client.commit(made);
    await d.client.sync();
    return made.changes[0]?.id ?? '';
  }

  /** What the field offers for a text on a list, from the device as the screen reads it. */
  async function offered(d: Dev, list: string, text: string) {
    const view = await d.client.read((db) => listViewOf(db, list));
    if (!view.found) throw new Error('not found');
    const rows = await d.client.read(inventoryOf);
    return suggest({
      text,
      products: view.products,
      items: view.items,
      listId: list,
      inventory: layerInventory(rows),
    });
  }

  /** Adds a suggestion as the field does (`planAddOnDevice`, the same function), writes it and sends it. */
  async function addChosen(d: Dev, list: string, suggestion: Suggestion) {
    const view = await d.client.read((db) => listViewOf(db, list));
    if (!view.found || !view.me) throw new Error('not found');
    const planned = await planAddOnDevice(d.db, d.keys, env(), {
      list,
      me: view.me,
      suggestion,
    });
    if (!planned || 'refused' in planned) throw new Error('nothing planned');
    await d.client.commit(planned.mutation);
    if (planned.also) await d.client.commit(planned.also);
    await d.client.sync();
    return planned;
  }

  it('makes the list’s product from the item and the copy of its category first, as a Member on another person’s list, accepted; the same name again is the product, one more, with no second copy', async () => {
    const { ada, a, g } = await world('FieldOwn');
    const garden = await ownCategory(g, `Garden ${MARKER}`);
    await ownItem(g, `Spade ${MARKER}`, garden);
    const [chosen] = await offered(g, ada.list, 'spade');
    expect(chosen).toMatchObject({ kind: 'inventory', name: `Spade ${MARKER}` });

    const first = await addChosen(g, ada.list, chosen as Suggestion);
    expect(first.mutation.householdId).toBe(ada.household);
    expect(first.mutation.changes.map((each) => each.table)).toEqual([
      'list_category',
      'product',
      'item',
    ]);
    // It is in the person's Inventory already: nothing more is made there.
    expect(first.also).toBeUndefined();
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    expect((await copiesOn(a, ada.list)).map((row) => row.name)).toEqual([`Garden ${MARKER}`]);
    const view = await a.client.read((db) => listViewOf(db, ada.list));
    if (!view.found) throw new Error('not found');
    const made = view.items.find((row) => row.name === `Spade ${MARKER}`);
    expect(made).toMatchObject({ quantity: '2', unit: 'pack', icon: 'cookie' });
    expect(made?.categoryId).toBe((await copiesOn(a, ada.list))[0]?.id);

    // The list has a product of the name now: the field offers it, "on the list", and choosing it is one more.
    const [again] = await offered(g, ada.list, 'spade');
    expect(again).toMatchObject({ kind: 'product', onList: { quantity: '2' } });
    const second = await addChosen(g, ada.list, again as Suggestion);
    expect(second.message).toBe(`Added one more Spade ${MARKER}`);
    expect(second.mutation.changes.map((each) => each.table)).toEqual(['item']);
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    expect((await serverCopies()).filter((row) => row.household_id === ada.household)).toHaveLength(
      1,
    );
    // Nothing of it is in plain text, and no id of Grace's category is in the group.
    for (const table of ['list_category', 'item', 'product']) {
      const found = await dbAll<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${appTable(database, table)} WHERE household_id = ${ada.household}`,
      );
      expect(JSON.stringify(found), table).not.toContain(MARKER);
      expect(JSON.stringify(found), table).not.toContain(garden);
    }
  });

  it('is the same added from the text typed, and a list of the person’s own gets the copy in its aisle', async () => {
    const { grace, g } = await world('FieldTyped');
    const garden = await ownCategory(g, 'Garden');
    await ownItem(g, 'Rake', garden);
    const typedName = {
      kind: 'new',
      name: 'rake',
      icon: null,
      quantity: null,
      unit: null,
    } as const;
    const planned = await addChosen(g, grace.list, typedName);
    expect(planned.mutation.changes.map((each) => each.table)).toEqual([
      'list_category',
      'product',
      'item',
    ]);
    expect(await failedOf(g.db)).toEqual([]);
    const view = await g.client.read((db) => listViewOf(db, grace.list));
    if (!view.found) throw new Error('not found');
    expect(view.items.find((row) => row.name === 'Rake')?.name).toBe('Rake');
  });

  it('offers a recurring item that is not on the list first with nothing typed, and adding it takes it off the chips', async () => {
    const { ada, a, g } = await world('FieldStaple');
    await ownItem(g, 'Washing powder', null, true);
    const [chip] = await offered(g, ada.list, '');
    expect(chip).toMatchObject({ kind: 'inventory', name: 'Washing powder' });
    await addChosen(g, ada.list, chip as Suggestion);
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    expect(await offered(g, ada.list, '')).toEqual([]);
  });

  it('is not held where the server still seals the group or the keys are not open: the item takes the guess, and is accepted', async () => {
    const who = await somebody(database, 'FieldSealed');
    const d = await deviceOf(who, await appKey());
    await d.client.sync();
    const garden = await ownCategory(d, 'Garden');
    await ownItem(d, 'Trowel', garden);
    const [chosen] = await offered(d, who.list, 'trow');
    const planned = await addChosen(d, who.list, chosen as Suggestion);
    expect(planned.mutation.changes.map((each) => each.table)).toEqual(['product', 'item']);
    expect(await failedOf(d.db)).toEqual([]);
  });
});

describe(`"Remember for next time" updating the Inventory item (${leg})`, () => {
  async function ownItem(d: Dev, name: string, categoryId: string | null) {
    const made = makeInventoryItem(env(), {
      householdId: d.who.household,
      name,
      icon: 'cookie',
      unit: 'pack',
      ...(categoryId ? { categoryId } : {}),
    });
    await d.client.commit(made);
    await d.client.sync();
    return made.changes[0]?.id ?? '';
  }

  /** Puts an item of that name on a list, as the field does, and returns it. */
  async function onList(d: Dev, list: string, name: string) {
    const view = await d.client.read((db) => listViewOf(db, list));
    if (!view.found || !view.me) throw new Error('not found');
    const planned = await planAddOnDevice(d.db, d.keys, env(), {
      list,
      me: view.me,
      suggestion: { kind: 'new', name, icon: null, quantity: null, unit: null },
    });
    if (!planned || 'refused' in planned) throw new Error('nothing planned');
    await d.client.commit(planned.mutation);
    if (planned.also) await d.client.commit(planned.also);
    await d.client.sync();
    const now = await d.client.read((db) => listViewOf(db, list));
    if (!now.found) throw new Error('not found');
    const made = now.items.find((row) => row.name === name);
    if (!made) throw new Error('not added');
    return { item: made, list: now.list };
  }

  /** The edit the item's panel makes and the Inventory update it then asks for, both written and sent. */
  async function remember(
    d: Dev,
    on: { item: ItemRow; list: ListRow },
    edit: { categoryId?: string | null; icon?: string | null; unit?: Unit | null },
  ) {
    const product =
      (await d.client.read((db) => db.get('product', on.item.productId))) ?? undefined;
    if (!product) throw new Error('no product');
    const mutation = editItem(env(), on.item, edit, { product });
    if (mutation) await d.client.commit(mutation);
    const written = await rememberInInventory(
      d.db,
      d.keys,
      env(),
      { list: on.list, name: product.name, edit },
      (change) => d.client.commit(change),
    );
    await d.client.sync();
    return written;
  }

  it('gives an Inventory item of the person’s own the category of a starter category on another person’s list, as a Member, accepted, in the person’s own group and not Ada’s', async () => {
    const { ada, grace, a, g } = await world('RememberStarter');
    const garden = await ownCategory(g, 'Garden');
    const own = await ownItem(g, `Spade ${MARKER}`, garden);
    const on = await onList(g, ada.list, `Spade ${MARKER}`);
    // The item is moved to Dairy & eggs on Ada's list, which is a row of Ada's group; Inventory is told the person's own row for it.
    const dairyThere = (await g.client.read((db) => categoriesOf(db, ada.household))).find(
      (each) => each.starterKey === 'dairy-eggs',
    );
    const dairyOwn = (await g.client.read((db) => ownerCategoriesOf(db, grace.household))).find(
      (each) => each.starterKey === 'dairy-eggs',
    );
    expect(dairyThere?.id).not.toBe(dairyOwn?.id);
    const written = await remember(g, on, { categoryId: dairyThere?.id ?? null, icon: 'milk' });
    expect(written?.householdId).toBe(grace.household);
    expect(written?.changes[0]).toMatchObject({
      table: 'inventory_item',
      id: own,
      fields: { categoryId: dairyOwn?.id, icon: 'milk' },
    });
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    // Grace's Inventory has it; the server holds none of it in Ada's group, and nothing in plain text.
    expect((await g.client.read(inventoryOf)).find((row) => row.id === own)).toMatchObject({
      categoryId: dairyOwn?.id,
      icon: 'milk',
    });
    expect(await a.client.read(inventoryOf)).toEqual([]);
    const rows = await dbAll<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'inventory_item')}`,
    );
    expect(rows.filter((row) => row.household_id === ada.household)).toEqual([]);
    expect(JSON.stringify(rows)).not.toContain(MARKER);
  });

  it('names the person’s own category when the item is in the list’s copy of it, and none when the copy is another person’s, though the icon and the unit are still given', async () => {
    const { ada, grace, a, g } = await world('RememberCopy');
    const gardenOwn = await ownCategory(g, 'Garden');
    const toolsOwn = await ownCategory(g, 'Tools');
    const adaCategory = await ownCategory(a, 'Hardware');
    const tools = await ownItem(g, 'Hammer', toolsOwn);
    // Grace's own category, as a copy on Ada's list (made by adding one of her items in it), and Ada's own, as a copy there too (the Admin puts it).
    await ownItem(g, 'Spade', gardenOwn);
    const spade = await onList(g, ada.list, 'Spade');
    await putOn(a, ada.household, ada.list, adaCategory, 'Hardware');
    await g.client.sync();
    const hammer = await onList(g, ada.list, 'Hammer');
    const copies = await copiesOn(g, ada.list);
    const gardenCopy = copies.find((row) => row.name === 'Garden');
    const hardwareCopy = copies.find((row) => row.name === 'Hardware');
    expect(gardenCopy).toBeDefined();
    expect(hardwareCopy).toBeDefined();
    // Into Ada's copy first: it stands for none of Grace's categories, so nothing is said of the category, and the icon still is.
    const first = await remember(g, hammer, {
      categoryId: hardwareCopy?.id ?? null,
      icon: 'milk',
    });
    expect(first?.changes[0]?.fields).toEqual({ icon: 'milk' });
    // Then into Garden's copy: that is Grace's category Garden, which Inventory is told.
    const second = await remember(g, hammer, { categoryId: gardenCopy?.id ?? null });
    expect(second?.changes[0]).toMatchObject({ id: tools, fields: { categoryId: gardenOwn } });
    // And into Ada's again, with Hammer now in Garden: still no category, whichever one the item is in.
    const third = await remember(g, hammer, {
      categoryId: hardwareCopy?.id ?? null,
      icon: 'cookie',
    });
    expect(third?.changes[0]?.fields).toEqual({ icon: 'cookie' });
    // The same of a list of the person's own, and of nothing: _Other_.
    expect(
      (
        await rememberInInventory(
          g.db,
          g.keys,
          env(),
          { list: spade.list, name: 'Spade', edit: { categoryId: null } },
          (change) => g.client.commit(change),
        )
      )?.changes[0]?.fields,
    ).toMatchObject({
      categoryId: (await g.client.read((db) => ownerCategoriesOf(db, grace.household))).find(
        (each) => each.starterKey === 'other',
      )?.id,
    });
    await a.client.sync();
    await g.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
  });

  it('makes one override for a starter entry however many edits come, one after another, and leaves a name Inventory has not got alone', async () => {
    const { ada, a, g } = await world('RememberOverride');
    const on = await onList(g, ada.list, 'Banana');
    const first = await remember(g, on, { icon: 'cookie' });
    expect(first?.changes[0]).toMatchObject({
      create: true,
      fields: { starterKey: 'banana', icon: 'cookie' },
    });
    const second = await remember(g, on, { unit: 'pack' });
    expect(second?.changes[0]?.create).toBeUndefined();
    expect(second?.changes[0]?.fields).toEqual({ unit: 'pack' });
    await a.client.sync();
    expect(await failedOf(g.db)).toEqual([]);
    expect(
      (await g.client.read(inventoryOf)).filter((row) => row.starterKey === 'banana'),
    ).toHaveLength(1);
    // A name Inventory has not got: there is nothing to update.
    const none = await onList(g, ada.list, 'Zorblax paste');
    const entries = layerInventory(await g.client.read(inventoryOf));
    expect(entries.find((entry) => entry.name === 'Zorblax paste')).toBeDefined();
    await g.client.commit(
      deleteInventoryItem(
        env(),
        (await g.client.read(inventoryOf)).find((row) => row.name === 'Zorblax paste') as never,
      ),
    );
    expect(await remember(g, none, { icon: 'cookie' })).toBeNull();
  });
});

describe(`a category changed in Inventory, and its copies (${leg})`, () => {
  const rowOf = async (d: Dev, id: string) => {
    const found = (await d.client.read((db) => ownerCategoriesOf(db, d.who.household))).find(
      (each) => each.id === id,
    );
    if (!found) throw new Error('no category');
    return found;
  };
  /** The function the screen calls, with the device's own commit, and then sent; what it committed, in order. */
  const renameEverywhere = async (d: Dev, keys: CopyKeys, id: string, name: string | null) => {
    const done = await renameCategoryEverywhere(d.db, keys, env(), await rowOf(d, id), name, (m) =>
      d.client.commit(m),
    );
    await d.client.sync();
    return done;
  };
  const moveEverywhere = async (d: Dev, keys: CopyKeys, id: string, position: string) => {
    const done = await moveCategoryEverywhere(
      d.db,
      keys,
      env(),
      await rowOf(d, id),
      position,
      (m) => d.client.commit(m),
    );
    await d.client.sync();
    return done;
  };
  const tables = (done: readonly { readonly changes: readonly { readonly table: string }[] }[]) =>
    done.map((each) => each.changes.map((c) => c.table));

  it('renames the category and its copies on the lists the person is Admin of, and a rename made while the keys are not open reaches them when it is asked again', async () => {
    const { ada, a, g, hardware } = await world('Everywhere');
    const garden = await ownCategory(a, 'Garden');
    await putOn(a, ada.household, ada.list, garden, 'Garden');
    await putOn(a, ada.household, hardware, garden, 'Garden');
    await g.client.sync();
    const lockedKeys: CopyKeys = { encrypted: a.keys.encrypted, ringOf: async () => undefined };

    // Keys open: the category and both copies, which Grace, a Member of Groceries, reads.
    const renamed = await renameEverywhere(a, a.keys, garden, 'Yard');
    expect(tables(renamed)).toEqual([['category'], ['list_category', 'list_category']]);
    await g.client.sync();
    expect(await failedOf(a.db)).toEqual([]);
    expect((await copiesOn(a, ada.list)).map((row) => row.name)).toEqual(['Yard']);
    expect((await copiesOn(a, hardware)).map((row) => row.name)).toEqual(['Yard']);
    expect((await copiesOn(g, ada.list)).map((row) => row.name)).toEqual(['Yard']);

    // Keys not open: no copy can be found, so the category alone is renamed.
    expect(tables(await renameEverywhere(a, lockedKeys, garden, 'Park'))).toEqual([['category']]);
    expect((await rowOf(a, garden)).name).toBe('Park');
    expect((await copiesOn(a, ada.list)).map((row) => row.name)).toEqual(['Yard']);

    // Asked again with the name it has, now that they are open: the copies alone, and nothing for what has the name already.
    const again = await renameEverywhere(a, a.keys, garden, 'Park');
    expect(tables(again)).toEqual([['list_category', 'list_category']]);
    await g.client.sync();
    expect(await failedOf(a.db)).toEqual([]);
    expect((await copiesOn(a, hardware)).map((row) => row.name)).toEqual(['Park']);
    expect((await copiesOn(g, ada.list)).map((row) => row.name)).toEqual(['Park']);
    expect(await renameEverywhere(a, a.keys, garden, 'Park')).toEqual([]);
  });

  it('waits a moment for a list’s keys to open before it looks for the copies, as the page needs when a change is made as it loads', async () => {
    const { ada, a, hardware } = await world('Waits');
    const garden = await ownCategory(a, 'Garden');
    await putOn(a, ada.household, ada.list, garden, 'Garden');
    await putOn(a, ada.household, hardware, garden, 'Garden');
    // The keys are open only after the function has waited for them: one that did not wait would find no copy.
    let open = false;
    const opening: CopyKeys = {
      encrypted: a.keys.encrypted,
      ringOf: (household, list) =>
        open ? a.keys.ringOf(household, list) : Promise.resolve(undefined),
      ready: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        open = true;
      },
    };
    const renamed = await renameEverywhere(a, opening, garden, 'Yard');
    expect(tables(renamed)).toEqual([['category'], ['list_category', 'list_category']]);
    expect(open).toBe(true);
    expect((await copiesOn(a, hardware)).map((row) => row.name)).toEqual(['Yard']);
    expect(await failedOf(a.db)).toEqual([]);
  });

  it('gives a starter category a name of the person’s and the usual one back, with no copies to find', async () => {
    const { a, ada } = await world('StarterName');
    const produce = (await a.client.read((db) => ownerCategoriesOf(db, ada.household))).find(
      (each) => each.starterKey === 'produce',
    );
    if (!produce) throw new Error('no produce');
    expect(tables(await renameEverywhere(a, a.keys, produce.id, 'Fruit and veg'))).toEqual([
      ['category'],
    ]);
    expect((await rowOf(a, produce.id)).name).toBe('Fruit and veg');
    await renameEverywhere(a, a.keys, produce.id, null);
    expect((await rowOf(a, produce.id)).name).toBe('Produce');
    expect(await failedOf(a.db)).toEqual([]);
  });

  it('moves the category and its copies on the person’s own lists to one place, which the people on those lists read, and a starter category has no copies to move', async () => {
    const { ada, a, g, hardware } = await world('Moving');
    const garden = await ownCategory(a, 'Garden');
    await putOn(a, ada.household, ada.list, garden, 'Garden');
    await putOn(a, ada.household, hardware, garden, 'Garden');
    const aisle = await a.client.read((db) => ownerCategoriesOf(db, ada.household));
    const [first, second] = aisle.filter((each) => each.starterKey !== null);
    if (!first || !second) throw new Error('no aisle');
    const position = (await import('../actions/position')).between(first.position, second.position);

    const moved = await moveEverywhere(a, a.keys, garden, position);
    expect(tables(moved)).toEqual([['category'], ['list_category', 'list_category']]);
    await g.client.sync();
    expect(await failedOf(a.db)).toEqual([]);
    expect((await rowOf(a, garden)).position).toBe(position);
    expect((await copiesOn(a, ada.list)).map((row) => row.position)).toEqual([position]);
    expect((await copiesOn(a, hardware)).map((row) => row.position)).toEqual([position]);
    expect((await copiesOn(g, ada.list)).map((row) => row.position)).toEqual([position]);

    // Put there again: nothing to write. A starter category moves alone.
    expect(await moveEverywhere(a, a.keys, garden, position)).toEqual([]);
    const produce = aisle.find((each) => each.starterKey === 'produce');
    if (!produce) throw new Error('no produce');
    const last = aisle.at(-1)?.position ?? null;
    const starter = await moveEverywhere(
      a,
      a.keys,
      produce.id,
      (await import('../actions/position')).after(last),
    );
    expect(tables(starter)).toEqual([['category']]);
  });

  it('makes a copy made after the category was moved where the category is, on the person’s own list, and last on a list in another person’s group', async () => {
    const { ada, grace, a, g, hardware } = await world('MadeAfter');
    const { between } = await import('../actions/position');
    const first = (await a.client.read((db) => ownerCategoriesOf(db, ada.household))).filter(
      (each) => each.starterKey !== null,
    );
    const place = between(first[0]?.position ?? null, first[1]?.position ?? null);

    // Ada puts Garden between the first two, before any list has a copy of it; the copy a list gets afterwards is where Garden is.
    const garden = await ownCategory(a, 'Garden');
    await moveEverywhere(a, a.keys, garden, place);
    const onGroceries = (await a.client.read((db) => listsOf(db, ada.household))).find(
      (each) => each.id === ada.list,
    );
    if (!onGroceries) throw new Error('no list');
    const made = await categoryOnList(a.db, a.keys, env(), {
      entry: { name: 'Spade', categoryId: garden, categoryKey: null },
      list: onGroceries,
    });
    expect(made.copy?.fields.position).toBe(place);
    await a.client.commit({
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: made.copy ? [made.copy] : [],
    });
    await a.client.sync();
    expect(await failedOf(a.db)).toEqual([]);
    expect((await copiesOn(a, ada.list)).map((row) => row.position)).toEqual([place]);

    // An item of that category moved to Hardware, her other list: the copy made there is where Garden is too.
    await a.client.commit(
      addItem(env(), { list: onGroceries, name: 'Spade', last: null, by: ada.personId }),
    );
    const item = (await a.client.read((db) => itemsOf(db, ada.list))).find(
      (row) => row.name === 'Spade',
    );
    if (!item) throw new Error('no item');
    await a.client.commit(editItem(env(), item, { categoryId: made.id }) ?? (undefined as never));
    const named = (await a.client.read((db) => itemsOf(db, ada.list))).find(
      (row) => row.id === item.id,
    );
    if (!named) throw new Error('no item');
    const carry = await carryCategoryOnMove(a.db, a.keys, env(), { item: named, to: hardware });
    expect(carry?.copy?.fields.position).toBe(place);

    // Grace, a Member of Ada's Groceries, has a category of her own that she has put first at home: on Ada's list its copy is last, and never at her place, which is no place in Ada's order.
    const hers = await ownCategory(g, 'Fence');
    const herPlace = between(
      null,
      (await g.client.read((db) => ownerCategoriesOf(db, grace.household)))[0]?.position ?? null,
    );
    await moveEverywhere(g, g.keys, hers, herPlace);
    const herCopy = await categoryOnList(g.db, g.keys, env(), {
      entry: { name: 'Post', categoryId: hers, categoryKey: null },
      list: onGroceries,
    });
    expect(herCopy.copy).not.toBeNull();
    expect(herCopy.copy?.fields.position).not.toBe(herPlace);
    expect(String(herCopy.copy?.fields.position) > place).toBe(true);
  });
});
