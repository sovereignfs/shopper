import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import { addItem, tickItem } from '../actions/items';
import { archiveList, makeList } from '../actions/lists';
import type { Database } from '../db/client';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import type { EndpointDeps } from '../sync/endpoint';
import { WEEK_MS, glanceOf, homeOf } from './home';
import { rememberList } from './listview';
import { placesOf } from './places';
import { itemsOf, listsOf } from './store';
import { closeDevices, device, type Device } from './test-support';

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
const synced = async (who: Someone): Promise<Device> => {
  const made = await device(deps, who);
  await made.client.sync();
  return made;
};
const home = (d: Device) => d.client.read((db) => homeOf(db, clock + 1000));
const named = (tiles: readonly { list: { name: string } }[] | undefined) =>
  tiles?.map((tile) => tile.list.name);

describe('the figures at a glance', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_900_000_000_000;

  it('counts the items ticked in the last seven days, and not older ones, open ones or deleted ones', () => {
    const glance = glanceOf({
      open: 4,
      now,
      items: [
        { boughtAt: now - DAY, deletedAt: null },
        { boughtAt: now - WEEK_MS, deletedAt: null },
        { boughtAt: now - WEEK_MS - 1, deletedAt: null },
        { boughtAt: null, deletedAt: null },
        { boughtAt: now - DAY, deletedAt: now - 1 },
      ],
      products: [],
    });
    expect(glance.open).toBe(4);
    expect(glance.boughtThisWeek).toBe(2);
    expect(glance.mostBought).toEqual([]);
  });

  it('names the products bought most, one for the same name on two lists, first spelling kept, three at most, never one not bought', () => {
    const glance = glanceOf({
      open: 0,
      now,
      items: [],
      products: [
        { name: 'Milk', timesBought: 3 },
        { name: ' milk ', timesBought: 4 },
        { name: 'Bread', timesBought: 5 },
        { name: 'Eggs', timesBought: 2 },
        { name: 'Apples', timesBought: 2 },
        { name: 'Salt', timesBought: 1 },
        { name: 'Never', timesBought: 0 },
      ],
    });
    // Milk is 7, Bread 5, and Apples and Eggs tie at 2, by name.
    expect(glance.mostBought).toEqual([
      { name: 'Milk', times: 7 },
      { name: 'Bread', times: 5 },
      { name: 'Apples', times: 2 },
    ]);
  });
});

describe(`what Home shows (${leg})`, () => {
  it('is nothing until the device has its households, and a new account’s Continue is its Groceries, which has never had an item', async () => {
    const me = await somebody(database, 'Ada');
    const d = await device(deps, me);
    expect(await home(d)).toBeUndefined();
    await d.client.sync();
    const found = await home(d);
    expect(named(found?.own)).toEqual(['Groceries']);
    expect(found?.continue?.list.name).toBe('Groceries');
    expect(found?.fresh).toBe(true);
    expect(found?.shared).toEqual([]);
    expect(found?.archived).toEqual([]);
    expect(found?.glance).toEqual({ open: 0, boughtThisWeek: 0, mostBought: [] });
  });

  it('continues on the list used last, and on the first one when it has been archived or is not there', async () => {
    const me = await somebody(database, 'Continuer');
    const d = await synced(me);
    const first = (await d.client.read((db) => listsOf(db, me.household)))[0];
    if (!first) throw new Error('no list');
    const position = (await d.client.read(placesOf))[0]?.nextPosition ?? 'a1';
    await d.client.commit(
      makeList(env(), { householdId: me.household, name: 'Hardware', position }),
    );
    const hardware = (await d.client.read((db) => listsOf(db, me.household))).find(
      (list) => list.name === 'Hardware',
    );
    if (!hardware) throw new Error('no hardware');
    expect((await home(d))?.continue?.list.name).toBe('Groceries');
    await d.client.read((db) => rememberList(db, hardware.id));
    expect((await home(d))?.continue?.list.name).toBe('Hardware');
    // Archived, it is no longer the one to continue on, and is behind the toggle.
    await d.client.commit(archiveList(env(), hardware));
    const after = await home(d);
    expect(after?.continue?.list.name).toBe('Groceries');
    expect(named(after?.own)).toEqual(['Groceries']);
    expect(named(after?.archived)).toEqual(['Hardware']);
  });

  it('counts what is open and what was bought this week across the lists, and names what is bought most once the server has counted it', async () => {
    const me = await somebody(database, 'Counter');
    const d = await synced(me);
    const list = (await d.client.read((db) => listsOf(db, me.household)))[0];
    if (!list) throw new Error('no list');
    for (const name of ['Milk', 'Bread', 'Eggs'])
      await d.client.commit(addItem(env(), { list, name, last: null, by: me.personId }));
    const milk = (await d.client.read((db) => itemsOf(db, list.id))).find((i) => i.name === 'Milk');
    if (!milk) throw new Error('no milk');
    await d.client.commit(tickItem(env(), milk, me.personId));
    await d.client.sync();
    const found = await home(d);
    expect(found?.fresh).toBe(false);
    expect(found?.continue?.open).toBe(2);
    expect(found?.glance).toMatchObject({ open: 2, boughtThisWeek: 1 });
    expect(found?.glance.mostBought).toEqual([{ name: 'Milk', times: 1 }]);
    // A week later what was ticked is no longer this week's.
    const later = await d.client.read((db) => homeOf(db, clock + WEEK_MS + 60_000));
    expect(later?.glance.boughtThisWeek).toBe(0);
  });

  it('puts the person’s own lists before those shared with them, with whose each is and who is on it', async () => {
    const host = await somebody(database, 'Hosta');
    const guest = await somebody(database, 'Gus');
    await join(database, host.household, guest);
    const d = await synced(guest);
    const found = await home(d);
    expect(named(found?.own)).toEqual(['Groceries']);
    expect(named(found?.shared)).toEqual(['Groceries']);
    // Their own list is theirs alone: no one else to show. The one shared with them says whose it is and who is on it, in the order they joined.
    expect(found?.own[0]).toMatchObject({ by: null, people: [] });
    expect(found?.shared[0]?.by).toBe('Hosta');
    expect(found?.shared[0]?.people).toEqual(['Hosta', 'Gus']);
  });
});
