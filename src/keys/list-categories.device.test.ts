import 'fake-indexeddb/auto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, callAs, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import { deleteCategory, makeCategory, renameCategory } from '../actions/categories';
import { makeInventoryItem } from '../actions/inventory';
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
    await d.client.commit(planned.mutation);
    await d.client.sync();
    return { planned, category };
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
    expect(added.category).toEqual({ id: adas?.id, copy: null });
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
