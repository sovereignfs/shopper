import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import { addItem, tickItem } from '../actions/items';
import { archiveList, makeList } from '../actions/lists';
import type { Database } from '../db/client';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import type { EndpointDeps } from '../sync/endpoint';
import { type Place, placesOf } from './places';
import { closeDevices, device, type Device } from './test-support';
import { itemsOf } from './store';

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
const synced = async (who: Someone): Promise<Device> => {
  const made = await device(deps, who);
  await made.client.sync();
  return made;
};
const places = (d: Device) => d.client.read(placesOf);
const named = (place: Place | undefined) => place?.lists.map((entry) => entry.list.name);

describe(`the places the sidebar shows (${leg})`, () => {
  it('has the person’s own household first, called "My lists", with its first list', async () => {
    const me = await somebody(database, 'Ada');
    const d = await synced(me);
    const [own, ...rest] = await places(d);
    expect(rest).toEqual([]);
    expect(own?.household).toMatchObject({ id: me.household, own: true, label: 'My lists' });
    expect(named(own)).toEqual(['Groceries']);
    expect(own?.lists[0]).toMatchObject({ open: 0, synced: true });
  });

  it('shows each household of a person in two, their own first, each with its own lists', async () => {
    const host = await somebody(database, 'Hosta');
    const guest = await somebody(database, 'Gus');
    await join(database, host.household, guest);
    const d = await synced(guest);
    const found = await places(d);
    expect(found.map((p) => [p.household.id, p.household.own])).toEqual([
      [guest.household, true],
      [host.household, false],
    ]);
    expect(found.map((p) => p.household.label)).toEqual(['My lists', 'Hosta’s lists']);
    // Five lists between them, each only in its own household.
    for (const [household, name] of [
      [guest.household, 'Pharmacy'],
      [guest.household, 'Hardware'],
      [host.household, 'Party'],
      [host.household, 'Garden'],
    ] as const) {
      const last =
        (await places(d)).find((p) => p.household.id === household)?.nextPosition ?? 'a1';
      await d.client.commit(makeList(env(), { householdId: household, name, position: last }));
    }
    const after = await places(d);
    expect(after.reduce((n, p) => n + p.lists.length, 0)).toBe(6);
    expect(named(after.find((p) => p.household.id === guest.household))).toEqual([
      'Groceries',
      'Pharmacy',
      'Hardware',
    ]);
    expect(named(after.find((p) => p.household.id === host.household))).toEqual([
      'Groceries',
      'Party',
      'Garden',
    ]);
  });

  it('counts the open items of each list, and the count moves as items are added, ticked and deleted', async () => {
    const me = await somebody(database, 'Counter');
    const d = await synced(me);
    const list = (await places(d))[0]?.lists[0]?.list;
    if (!list) throw new Error('no list');
    const open = async () => (await places(d))[0]?.lists[0]?.open;
    for (const name of ['Milk', 'Bread', 'Eggs'])
      await d.client.commit(addItem(env(), { list, name, last: null, by: me.personId }));
    expect(await open()).toBe(3);
    const milk = (await d.client.read((db) => itemsOf(db, list.id))).find((i) => i.name === 'Milk');
    if (!milk) throw new Error('no milk');
    const undo = await d.client.commit(tickItem(env(), milk, me.personId));
    expect(await open()).toBe(2);
    await d.client.commit(undo);
    expect(await open()).toBe(3);
    await d.client.sync();
    expect(await open()).toBe(3);
  });

  it('marks a list the server has not answered for, and not after it has', async () => {
    const me = await somebody(database, 'Fresh');
    const d = await synced(me);
    d.wire.offline = true;
    const own = (await places(d))[0];
    await d.client.commit(
      makeList(env(), {
        householdId: me.household,
        name: 'Hardware',
        position: own?.nextPosition ?? 'a1',
      }),
    );
    expect((await places(d))[0]?.lists.map((l) => [l.list.name, l.synced])).toEqual([
      ['Groceries', true],
      ['Hardware', false],
    ]);
    d.wire.offline = false;
    await d.client.sync();
    expect((await places(d))[0]?.lists.map((l) => l.synced)).toEqual([true, true]);
  });

  it('puts archived lists aside, and gives a new one a place after every list, archived too', async () => {
    const me = await somebody(database, 'Archivist');
    const d = await synced(me);
    const own = (await places(d))[0];
    const second = makeList(env(), {
      householdId: me.household,
      name: 'Old',
      position: own?.nextPosition ?? 'a1',
    });
    await d.client.commit(second);
    const old = (await places(d))[0]?.lists.find((l) => l.list.name === 'Old')?.list;
    if (!old) throw new Error('no list');
    await d.client.commit(archiveList(env(), old));
    const found = (await places(d))[0];
    expect(named(found)).toEqual(['Groceries']);
    expect(found?.archived.map((l) => l.name)).toEqual(['Old']);
    expect((found?.nextPosition ?? '') > old.position).toBe(true);
    // A list made after is after the archived one.
    await d.client.commit(
      makeList(env(), {
        householdId: me.household,
        name: 'New',
        position: found?.nextPosition ?? 'a9',
      }),
    );
    const lists = (await places(d))[0]?.lists.map((l) => l.list);
    expect((lists?.find((l) => l.name === 'New')?.position ?? '') > old.position).toBe(true);
  });
});
