import 'fake-indexeddb/auto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, joinList, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import { canonicalName } from '../catalog/canonical';
import type { Database } from '../db/client';
import { dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { OPERATIONS } from '../households/ops';
import { callAs } from '../access/test-support';
import {
  type Keyring,
  copySourceKey,
  deriveListKeyring,
  listNameKey,
  newKeyring,
  sealField,
} from '../keys/household';
import { applyMutation } from '../sync/apply';
import type { EndpointDeps } from '../sync/endpoint';
import { LOCAL_VERSION, openLocal } from './db';
import { SyncClient } from './client';
import { itemsOf, listCategoriesOf, productsOf, readOutbox } from './store';
import { serverTransport } from './test-support';
import { closeDevices, device, type Device } from './test-support';

/**
 * A list's copies of people's categories on a device (task 23.3, DESIGN.md §8.3), **the store and the merge**: the version 5 store a version 4 database is given, a pull
 * that carries copies and takes them, a fold of a copy that points what named it at the one that stands, and a list that goes with its copies. (What the device makes of
 * them, encrypts and opens, is the device's logic, tested with it.) The server's copies here are made by its own `applyMutation`; the device's transport is the plain one,
 * which leaves a name as ciphertext and so shows none, and the rows are what is looked at.
 */
const { leg } = testTarget();
let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());
afterEach(closeDevices);

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

describe('the store of copies, version 5', () => {
  it('is given to a database of version 4, which keeps everything it has, with the two indexes a list’s screens and a household’s forgetting use', async () => {
    const { openDB, deleteDB } = await import('idb');
    const name = `shopper-v4-${crypto.randomUUID()}`;
    const old = await openDB(name, 4, {
      upgrade(db) {
        db.createObjectStore('household', { keyPath: 'id' });
        db.createObjectStore('list', { keyPath: 'id' }).createIndex('byHousehold', 'householdId');
        const item = db.createObjectStore('item', { keyPath: 'id' });
        item.createIndex('byList', 'listId');
        item.createIndex('byProduct', 'productId');
        db.createObjectStore('product', { keyPath: 'id' }).createIndex(
          'byHousehold',
          'householdId',
        );
        db.createObjectStore('category', { keyPath: 'id' }).createIndex(
          'byHousehold',
          'householdId',
        );
        db.createObjectStore('shadow', { keyPath: ['table', 'id'] });
        db.createObjectStore('outbox', { keyPath: 'n', autoIncrement: true });
        db.createObjectStore('meta');
        db.createObjectStore('failed', { keyPath: 'n', autoIncrement: true });
        const member = db.createObjectStore('member', { keyPath: ['listId', 'personId'] });
        member.createIndex('byHousehold', 'householdId');
        member.createIndex('byList', 'listId');
        db.createObjectStore('inventory_item', { keyPath: 'id' }).createIndex(
          'byHousehold',
          'householdId',
        );
      },
    });
    await old.put('household', {
      id: 'h1',
      label: 'x',
      own: true,
      role: 'admin',
      seq: 1,
      cursor: 7,
    });
    await old.put('inventory_item', { id: 'i1', householdId: 'h1', recurring: false });
    old.close();
    const upgraded = await openLocal('', name);
    expect(upgraded.version).toBe(LOCAL_VERSION);
    expect(LOCAL_VERSION).toBe(5);
    expect((await upgraded.get('household', 'h1'))?.cursor).toBe(7);
    expect(await upgraded.count('inventory_item')).toBe(1);
    await upgraded.put('list_category', {
      id: 'c1',
      householdId: 'h1',
      listId: 'l1',
      sourceKey: `n3.${'A'.repeat(43)}`,
      name: '',
      icon: null,
      position: 'a5',
      deletedAt: null,
      seq: 1,
    });
    expect(await upgraded.getAllFromIndex('list_category', 'byList', 'l1')).toHaveLength(1);
    expect(await upgraded.getAllFromIndex('list_category', 'byHousehold', 'h1')).toHaveLength(1);
    upgraded.close();
    await deleteDB(name);
  });
});

describe(`a pull that carries a list’s copies (${leg})`, () => {
  let ada: Someone;
  let grace: Someone;
  let heidi: Someone;
  let group: Keyring;
  let hardware = '';
  const rings = new Map<string, Keyring>();
  const ring = async (list: string) => {
    const known = rings.get(list);
    if (known) return known;
    const made = await deriveListKeyring(group, list);
    rings.set(list, made);
    return made;
  };
  const cipher = async (list: string, table: string, row: string, field: string, text: string) =>
    sealField(await ring(list), { list, table, row, field }, text);
  const send = (who: Someone, changes: Mutation['changes'][number][]) =>
    applyMutation(deps(), who.accountId, {
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes,
    });
  const copy = async (list: string, category: string, extra: Record<string, string> = {}) => {
    const id = crypto.randomUUID();
    return {
      table: 'list_category' as const,
      id,
      create: true as const,
      fields: {
        listId: list,
        sourceKey: await copySourceKey(await ring(list), list, category),
        name: await cipher(list, 'list_category', id, 'name', 'Garden'),
        position: 'a5',
        ...extra,
      },
    };
  };
  const synced = async (who: Someone): Promise<Device> => {
    const made = await device(deps, who);
    await made.client.sync();
    return made;
  };
  const copies = (d: Device, list: string) => d.client.read((db) => listCategoriesOf(db, list));

  beforeAll(async () => {
    ada = await somebody(database, 'Ada');
    grace = await somebody(database, 'Grace');
    heidi = await somebody(database, 'Heidi');
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
    );
    group = newKeyring();
    hardware = crypto.randomUUID();
    expect(
      (
        await send(ada, [
          {
            table: 'list',
            id: hardware,
            create: true,
            fields: {
              name: await cipher(hardware, 'list', hardware, 'name', 'Hardware'),
              position: 'a5',
              createdAt: 1,
              clearing: 'manual',
            },
          },
        ])
      ).status,
    ).toBe('applied');
    await joinList(database, ada.household, ada.list, grace);
    await joinList(database, ada.household, hardware, heidi);
  });

  it('takes the copies of the lists the reader is on, in aisle order, and none of another list’s, and a copy by an Admin’s rename comes again as the server has it', async () => {
    const first = await copy(ada.list, crypto.randomUUID(), { position: 'a7' });
    const second = await copy(ada.list, crypto.randomUUID(), { position: 'a3' });
    const elsewhere = await copy(hardware, crypto.randomUUID());
    expect((await send(grace, [first, second])).status).toBe('applied');
    expect((await send(ada, [elsewhere])).status).toBe('applied');
    const mine = await synced(grace);
    expect((await copies(mine, ada.list)).map((row) => row.id)).toEqual([second.id, first.id]);
    expect(await copies(mine, hardware)).toEqual([]);
    const theirs = await synced(heidi);
    expect(await copies(theirs, ada.list)).toEqual([]);
    expect((await copies(theirs, hardware)).map((row) => row.id)).toEqual([elsewhere.id]);
    // The Admin moves one in the aisle order; the Member's device takes it on the next pull.
    expect(
      (await send(ada, [{ table: 'list_category', id: first.id, fields: { position: 'a1' } }]))
        .status,
    ).toBe('applied');
    await mine.client.sync();
    expect((await copies(mine, ada.list)).map((row) => row.id)).toEqual([first.id, second.id]);
  });

  it('takes a fold of a copy without failing the pull, and points an item and a product that named the folded one at the one that stands', async () => {
    const category = crypto.randomUUID();
    const first = await copy(ada.list, category);
    expect((await send(grace, [first])).status).toBe('applied');
    const mine = await synced(grace);
    expect((await copies(mine, ada.list)).some((row) => row.id === first.id)).toBe(true);
    // Another device made the same copy and an item and a product of it; the server folds the copy into the first and stores them naming it.
    const again = await copy(ada.list, category);
    const productId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const product = {
      table: 'product' as const,
      id: productId,
      create: true as const,
      fields: {
        listId: ada.list,
        name: await cipher(ada.list, 'product', productId, 'name', 'Spade'),
        nameKey: await listNameKey(await ring(ada.list), ada.list, canonicalName('Spade')),
        categoryId: again.id,
        createdAt: 1,
      },
    };
    const item = {
      table: 'item' as const,
      id: itemId,
      create: true as const,
      fields: {
        listId: ada.list,
        productId,
        categoryId: again.id,
        name: await cipher(ada.list, 'item', itemId, 'name', 'Spade'),
        quantity: '1',
        position: 'a0',
        addedBy: grace.personId,
        addedAt: 1,
      },
    };
    expect((await send(grace, [again, product, item])).status).toBe('applied');
    // The device holds the folded copy's id on nothing, takes the pull whole (its tombstone and alias included), and has the item and the product naming the one that stands.
    await mine.client.sync();
    const rows = await copies(mine, ada.list);
    expect(rows.some((row) => row.id === again.id)).toBe(false);
    expect(rows.filter((row) => row.sourceKey === first.fields.sourceKey)).toHaveLength(1);
    const items = await mine.client.read((db) => itemsOf(db, ada.list));
    expect(items.find((row) => row.id === itemId)?.categoryId).toBe(first.id);
    const products = await mine.client.read((db) => productsOf(db, ada.household));
    expect(products.find((row) => row.id === productId)?.categoryId).toBe(first.id);
  });

  it('goes from the device with its list when the list is deleted for good', async () => {
    const doomed = crypto.randomUUID();
    expect(
      (
        await send(ada, [
          {
            table: 'list',
            id: doomed,
            create: true,
            fields: {
              name: await cipher(doomed, 'list', doomed, 'name', 'Doomed'),
              position: 'a6',
              createdAt: 1,
              clearing: 'manual',
            },
          },
        ])
      ).status,
    ).toBe('applied');
    const gone = await copy(doomed, crypto.randomUUID());
    expect((await send(ada, [gone])).status).toBe('applied');
    expect(
      (await send(ada, [{ table: 'list', id: doomed, fields: { archivedAt: 2 } }])).status,
    ).toBe('applied');
    const mine = await synced(ada);
    expect((await copies(mine, doomed)).map((row) => row.id)).toEqual([gone.id]);
    expect(
      await callAs(database, OPERATIONS, ada, {
        op: 'list.delete',
        household: ada.household,
        list: doomed,
      }),
    ).toEqual({ status: 200, body: { ok: true } });
    await mine.client.sync();
    expect(await copies(mine, doomed)).toEqual([]);
    expect(
      (await mine.client.read((db) => db.getAll('list_category'))).some(
        (row) => row.id === gone.id,
      ),
    ).toBe(false);
  });

  it('goes from the device with a household the person leaves, and not with another person’s', async () => {
    const mine = await synced(heidi);
    expect((await copies(mine, hardware)).length).toBeGreaterThan(0);
    const reply = await callAs(database, OPERATIONS, heidi, {
      op: 'member.leave',
      household: ada.household,
      list: hardware,
    });
    expect(reply.status).toBe(200);
    await mine.client.sync();
    expect(
      await mine.client.read((db) =>
        db.getAllFromIndex('list_category', 'byHousehold', ada.household),
      ),
    ).toEqual([]);
    // Ada's own device still has them.
    const hers = await synced(ada);
    expect((await copies(hers, hardware)).length).toBeGreaterThan(0);
  });

  it('points what waits to be sent, and the rows made for it on the device, at the copy that stands when the pull says another was folded into it', async () => {
    const category = crypto.randomUUID();
    const first = await copy(ada.list, category);
    expect((await send(grace, [first])).status).toBe('applied');
    const mine = await synced(grace);
    // Offline, the device makes the same copy again (a second device did) and an item and a product of it: all wait, naming the copy it made.
    mine.wire.offline = true;
    // As the device holds it, plain: the transport encrypts what it sends, and here nothing is sent.
    const againId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    await mine.client.commit({
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: [
        {
          table: 'list_category',
          id: againId,
          create: true,
          fields: {
            listId: ada.list,
            sourceKey: first.fields.sourceKey,
            name: 'Garden',
            position: 'a5',
          },
        },
        {
          table: 'product',
          id: productId,
          create: true,
          fields: { listId: ada.list, name: 'Rake', categoryId: againId, createdAt: 1 },
        },
        {
          table: 'item',
          id: itemId,
          create: true,
          fields: {
            listId: ada.list,
            productId,
            categoryId: againId,
            name: 'Rake',
            quantity: '1',
            position: 'a0',
            addedBy: grace.personId,
            addedAt: 1,
          },
        },
      ],
    });
    // A pull arrives first, with the server's word that the copy was folded into the one that stands (nothing is sent with it).
    const wire = { offline: false, requests: [] };
    const real = serverTransport(deps, grace, wire);
    const pulling = new SyncClient({
      db: mine.db,
      transport: async (request) => {
        const reply = await real({ ...request, outbox: [] });
        if (reply.kind !== 'ok') return reply;
        return {
          kind: 'ok',
          answer: {
            ...reply.answer,
            households: reply.answer.households.map((pull) =>
              pull.household === ada.household
                ? {
                    ...pull,
                    aliases: [
                      ...pull.aliases,
                      { table: 'list_category', from: againId, to: first.id, seq: pull.cursor },
                    ],
                  }
                : pull,
            ),
          },
        };
      },
      now: () => Date.now(),
    });
    await pulling.sync();
    // The copy that was folded is gone from the device, and what named it names the one that stands: the rows, and the changes still waiting.
    const rows = await copies(mine, ada.list);
    expect(rows.some((row) => row.id === againId)).toBe(false);
    expect(rows.some((row) => row.id === first.id)).toBe(true);
    expect(
      (await mine.client.read((db) => itemsOf(db, ada.list))).find((row) => row.id === itemId)
        ?.categoryId,
    ).toBe(first.id);
    expect(
      (await mine.client.read((db) => productsOf(db, ada.household))).find(
        (row) => row.id === productId,
      )?.categoryId,
    ).toBe(first.id);
    const waiting = (await mine.client.read((db) => readOutbox(db, 100))).flatMap(
      (entry) => entry.mutation.changes,
    );
    expect(waiting.find((change) => change.id === itemId)?.fields.categoryId).toBe(first.id);
    expect(waiting.find((change) => change.id === productId)?.fields.categoryId).toBe(first.id);
    expect(waiting.some((change) => change.id === againId)).toBe(false);
  });
});
