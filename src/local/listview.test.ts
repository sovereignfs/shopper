import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody } from '../access/test-support';
import type { Env } from '../actions/env';
import { addItem, clearBought, tickItem } from '../actions/items';
import { archiveList, makeList } from '../actions/lists';
import type { Database } from '../db/client';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import type { EndpointDeps } from '../sync/endpoint';
import { landingListOf, listViewOf, rememberList } from './listview';
import { closeDevices, device } from './test-support';
import { itemsOf, listsOf } from './store';

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
  },
  intervalSeconds: 20,
});
let clock = 1_900_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });

describe(`what a list screen reads (${leg})`, () => {
  it('is the list with its items, categories in aisle order, products and who the reader is', async () => {
    const me = await somebody(database, 'Ada');
    const d = await device(deps, me);
    await d.client.sync();
    const list = (await d.client.read((db) => listsOf(db, me.household)))[0];
    if (!list) throw new Error('no list');
    await d.client.commit(addItem(env(), { list, name: 'Oat milk', last: null, by: me.personId }));
    const found = await d.client.read((db) => listViewOf(db, list.id));
    if (!found.found) throw new Error('not found');
    expect(found.items.map((i) => i.name)).toEqual(['Oat milk']);
    expect(found.products.map((p) => p.name)).toEqual(['Oat milk']);
    expect(found.categories.length).toBeGreaterThan(5);
    expect(found.categories.map((c) => c.position)).toEqual(
      [...found.categories.map((c) => c.position)].sort(),
    );
    expect(found.lists.map((each) => each.id)).toContain(list.id);
    expect(found.me).toBe(me.personId);
    expect(found.names[me.personId]).toBe('Ada');
    expect(found.shared).toBe(false);
    expect(found.household).toMatchObject({ id: me.household, own: true });
  });

  it('keeps bought items and leaves out cleared ones, and says the household is shared once someone else is in it, naming whoever left too', async () => {
    const host = await somebody(database, 'Hosta');
    const guest = await somebody(database, 'Gus');
    await join(database, host.household, guest);
    const d = await device(deps, host);
    await d.client.sync();
    const list = (await d.client.read((db) => listsOf(db, host.household)))[0];
    if (!list) throw new Error('no list');
    for (const name of ['A', 'B'])
      await d.client.commit(addItem(env(), { list, name, last: null, by: host.personId }));
    const rows = await d.client.read((db) => itemsOf(db, list.id));
    const a = rows.find((row) => row.name === 'A');
    const b = rows.find((row) => row.name === 'B');
    if (!a || !b) throw new Error('no items');
    await d.client.commit(tickItem(env(), a, host.personId));
    await d.client.commit(tickItem(env(), b, host.personId));
    await d.client.commit(clearBought(env(), [{ ...b, boughtAt: 1, boughtBy: host.personId }]));
    await d.client.sync();
    const shared = await d.client.read((db) => listViewOf(db, list.id));
    if (!shared.found) throw new Error('not found');
    expect(shared.shared).toBe(true);
    expect(shared.items.map((i) => i.name)).toEqual(['A']);
    expect(shared.items[0]?.boughtBy).toBe(host.personId);
    // A member who has left (the device learns of it with the member row, which the removal task writes): still named on what they added, and not counted.
    const member = (await d.db.getAll('member')).find((row) => row.personId === guest.personId);
    if (!member) throw new Error('no member');
    await d.db.put('member', { ...member, leftAt: 5 });
    const after = await d.client.read((db) => listViewOf(db, list.id));
    if (!after.found) throw new Error('not found');
    expect(after.shared).toBe(false);
    expect(after.names[guest.personId]).toBe('Gus');
  });

  it('is not found for a list that is not there, and says whether the device has synced', async () => {
    const me = await somebody(database, 'Nobody');
    const d = await device(deps, me);
    expect(await d.client.read((db) => listViewOf(db, crypto.randomUUID()))).toEqual({
      found: false,
      synced: false,
    });
    await d.client.sync();
    expect(await d.client.read((db) => listViewOf(db, crypto.randomUUID()))).toEqual({
      found: false,
      synced: true,
    });
  });
});

describe(`the list the front address opens (${leg})`, () => {
  it('is nothing before the device has households, then the first list of their own household', async () => {
    const me = await somebody(database, 'Lander');
    const d = await device(deps, me);
    expect(await d.client.read(landingListOf)).toBeUndefined();
    await d.client.sync();
    const first = (await d.client.read((db) => listsOf(db, me.household)))[0];
    expect(await d.client.read(landingListOf)).toBe(first?.id);
  });

  it('is the last list used, while it is there and not archived, and the first again when it is not', async () => {
    const me = await somebody(database, 'Remember');
    const d = await device(deps, me);
    await d.client.sync();
    const own = (await d.client.read((db) => listsOf(db, me.household)))[0];
    const made = makeList(env(), { householdId: me.household, name: 'Second', position: 'a5' });
    await d.client.commit(made);
    const second = made.changes[0]?.id ?? '';
    await d.client.read((db) => rememberList(db, second));
    expect(await d.client.read(landingListOf)).toBe(second);
    const row = await d.db.get('list', second);
    if (!row) throw new Error('no list');
    await d.client.commit(archiveList(env(), row));
    expect(await d.client.read(landingListOf)).toBe(own?.id);
    await d.client.read((db) => rememberList(db, crypto.randomUUID()));
    expect(await d.client.read(landingListOf)).toBe(own?.id);
  });
});
