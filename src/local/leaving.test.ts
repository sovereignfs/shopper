import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, callAs, join, joinList, somebody } from '../access/test-support';
import type { Env } from '../actions/env';
import { addItem, editItem } from '../actions/items';
import { makeList } from '../actions/lists';
import type { Database } from '../db/client';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import { OPERATIONS } from '../households/ops';
import type { EndpointDeps } from '../sync/endpoint';
import { listViewOf } from './listview';
import { householdsOf, itemsOf, listsOf, productsOf } from './store';
import { closeDevices, device } from './test-support';

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
  },
  intervalSeconds: 20,
});
let clock = 1_900_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });

describe(`what a device does when its person leaves or is removed (${leg})`, () => {
  for (const how of ['leaves', 'is removed'] as const) {
    it(`drops the household at the next sync when a Member ${how}, and the others still name them as left`, async () => {
      const ada = await somebody(database, `Ada-${how}`);
      const grace = await somebody(database, `Grace-${how}`);
      await join(database, ada.household, grace);
      const adas = await device(deps, ada);
      const graces = await device(deps, grace);
      await adas.client.sync();
      await graces.client.sync();
      const list = (await adas.client.read((db) => listsOf(db, ada.household)))[0];
      if (!list) throw new Error('no list');
      // Grace adds something to Ada's household, then goes.
      const mine = (await graces.client.read((db) => listsOf(db, ada.household)))[0];
      if (!mine) throw new Error('Grace has no list');
      await graces.client.commit(
        addItem(env(), { list: mine, name: 'Oat milk', last: null, by: grace.personId }),
      );
      await graces.client.sync();
      expect((await graces.client.read(householdsOf)).map((h) => h.id).sort()).toEqual(
        [ada.household, grace.household].sort(),
      );

      const reply =
        how === 'leaves'
          ? await callAs(database, OPERATIONS, grace, {
              op: 'member.leave',
              household: ada.household,
              list: ada.list,
            })
          : await callAs(database, OPERATIONS, ada, {
              op: 'member.remove',
              household: ada.household,
              list: ada.list,
              person: grace.personId,
            });
      expect(reply.status).toBe(200);

      // Grace's device: the household is gone from it at the next sync, and her own is still there.
      await graces.client.sync();
      expect((await graces.client.read(householdsOf)).map((h) => h.id)).toEqual([grace.household]);
      expect(await graces.client.read((db) => listsOf(db, ada.household))).toEqual([]);

      // Ada's device: Grace is still named on what she added, as having left.
      await adas.client.sync();
      const view = await adas.client.read((db) => listViewOf(db, list.id));
      if (!view.found) throw new Error('not found');
      const item = view.items.find((each) => each.name === 'Oat milk');
      expect(item?.addedBy).toBe(grace.personId);
      expect(view.names[grace.personId]).toBe(`Grace-${how} (left)`);
      expect(view.shared).toBe(false);
      expect(view.showPeople).toBe(true);
    });
  }

  it('takes one list off the device when its person is removed from it, keeping the other list of the same group (RFC 0004)', async () => {
    const ada = await somebody(database, 'Ada-two-lists');
    const grace = await somebody(database, 'Grace-two-lists');
    const adas = await device(deps, ada);
    await adas.client.sync();
    const made = makeList(env(), {
      householdId: ada.household,
      name: 'Hardware store',
      position: 'a5',
    });
    await adas.client.commit(made);
    await adas.client.sync();
    const hardware = made.changes[0]?.id ?? '';
    await joinList(database, ada.household, ada.list, grace);
    await joinList(database, ada.household, hardware, grace);
    const hardwareRow = (await adas.client.read((db) => listsOf(db, ada.household))).find(
      (l) => l.id === hardware,
    );
    if (!hardwareRow) throw new Error('no Hardware');
    await adas.client.commit(
      addItem(env(), { list: hardwareRow, name: 'Nails', last: null, by: ada.personId }),
    );
    await adas.client.sync();
    const graces = await device(deps, grace);
    await graces.client.sync();
    expect(
      (await graces.client.read((db) => productsOf(db, ada.household))).some(
        (product) => product.listId === hardware,
      ),
    ).toBe(true);
    expect(
      (await graces.client.read((db) => listsOf(db, ada.household))).map((l) => l.id).sort(),
    ).toEqual([ada.list, hardware].sort());

    const reply = await callAs(database, OPERATIONS, ada, {
      op: 'member.remove',
      household: ada.household,
      list: hardware,
      person: grace.personId,
    });
    expect(reply.status).toBe(200);
    await graces.client.sync();
    expect((await graces.client.read((db) => listsOf(db, ada.household))).map((l) => l.id)).toEqual(
      [ada.list],
    );
    // Its catalog went with it (21.3): nothing of Hardware is suggested to Grace.
    expect(
      (await graces.client.read((db) => productsOf(db, ada.household))).some(
        (product) => product.listId === hardware,
      ),
    ).toBe(false);

    // Ada moves an item from the shared list to the one Grace is no longer on: it leaves Grace's device, and stays on Ada's.
    const groceries = await adas.client.read((db) => listsOf(db, ada.household));
    const shared = groceries.find((l) => l.id === ada.list);
    if (!shared) throw new Error('no Groceries');
    await adas.client.commit(
      addItem(env(), { list: shared, name: 'Light bulbs', last: null, by: ada.personId }),
    );
    await adas.client.sync();
    await graces.client.sync();
    expect((await graces.client.read((db) => itemsOf(db, ada.list))).map((i) => i.name)).toEqual([
      'Light bulbs',
    ]);
    const bulbs = (await adas.client.read((db) => itemsOf(db, ada.list)))[0];
    if (!bulbs) throw new Error('no item');
    const products = await adas.client.read((db) => productsOf(db, ada.household));
    const move = editItem(env(), bulbs, { listId: hardware }, undefined, {
      product: products.find((each) => each.id === bulbs.productId),
      products,
    });
    if (!move) throw new Error('nothing to move');
    await adas.client.commit(move);
    await adas.client.sync();
    await graces.client.sync();
    expect(await graces.client.read((db) => itemsOf(db, ada.list))).toEqual([]);
    expect((await adas.client.read((db) => itemsOf(db, hardware))).map((i) => i.name)).toContain(
      'Light bulbs',
    );
  });

  it('takes an item moved twice, to lists the person is not on, off their device (RFC 0004)', async () => {
    const ada = await somebody(database, 'Ada-twice');
    const grace = await somebody(database, 'Grace-twice');
    const adas = await device(deps, ada);
    await adas.client.sync();
    const lists: string[] = [];
    for (const [name, position] of [
      ['Hardware', 'a5'],
      ['Party', 'a6'],
    ] as const) {
      const made = makeList(env(), { householdId: ada.household, name, position });
      await adas.client.commit(made);
      lists.push(made.changes[0]?.id ?? '');
    }
    await adas.client.sync();
    const [hardware = '', party = ''] = lists;
    await joinList(database, ada.household, ada.list, grace);
    const shared = (await adas.client.read((db) => listsOf(db, ada.household))).find(
      (l) => l.id === ada.list,
    );
    if (!shared) throw new Error('no Groceries');
    await adas.client.commit(
      addItem(env(), { list: shared, name: 'Candles', last: null, by: ada.personId }),
    );
    await adas.client.sync();
    const graces = await device(deps, grace);
    await graces.client.sync();
    expect((await graces.client.read((db) => itemsOf(db, ada.list))).map((i) => i.name)).toEqual([
      'Candles',
    ]);
    for (const to of [hardware, party]) {
      const item = (
        await adas.client.read(async (db) => [
          ...(await itemsOf(db, ada.list)),
          ...(await itemsOf(db, hardware)),
        ])
      )[0];
      if (!item) throw new Error('no item');
      const products = await adas.client.read((db) => productsOf(db, ada.household));
      const move = editItem(env(), item, { listId: to }, undefined, {
        product: products.find((each) => each.id === item.productId),
        products,
      });
      if (!move) throw new Error('nothing to move');
      await adas.client.commit(move);
      await adas.client.sync();
    }
    await graces.client.sync();
    expect(await graces.client.read((db) => itemsOf(db, ada.list))).toEqual([]);
  });
});
