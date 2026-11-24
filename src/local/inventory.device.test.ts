import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import {
  changeInventoryItem,
  hideInventoryItem,
  makeInventoryItem,
  overrideStarterEntry,
} from '../actions/inventory';
import { layerInventory, offered } from '../catalog/inventory';
import type { Database } from '../db/client';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import type { EndpointDeps } from '../sync/endpoint';
import { inventoryOf } from './store';
import { closeDevices, device, type Device } from './test-support';

/**
 * A person's Inventory on a device (task 23.3, DESIGN.md §8.8): made and changed offline and shown at once, a flag a boolean as a pull hands it, the same on
 * a second device of the account and on none of anyone else's, and two devices that made one thing become one row.
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
let clock = 1_900_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });
const synced = async (who: Someone): Promise<Device> => {
  const made = await device(deps, who);
  await made.client.sync();
  return made;
};
const inventory = (d: Device) => d.client.read(inventoryOf);

describe(`a person’s Inventory on their devices (${leg})`, () => {
  it('is made offline and shown at once with its flags as booleans, and the same on a second device of the account once synced', async () => {
    const me = await somebody(database, 'Ada');
    const first = await synced(me);
    const second = await synced(me);
    first.wire.offline = true;
    await first.client.commit(
      makeInventoryItem(env(), {
        householdId: me.household,
        name: 'Good bin bags',
        recurring: true,
        note: 'the strong ones',
      }),
    );
    // At once, from the device alone: a boolean and not a 1, as a pull will hand it.
    expect(await inventory(first)).toMatchObject([
      { name: 'Good bin bags', recurring: true, hidden: false, note: 'the strong ones' },
    ]);
    first.wire.offline = false;
    await first.client.sync();
    await second.client.sync();
    const there = await inventory(second);
    expect(there).toHaveLength(1);
    expect(there[0]).toMatchObject({
      name: 'Good bin bags',
      recurring: true,
      hidden: false,
      note: 'the strong ones',
    });
    // The server's row is what the first now holds too: nothing waits.
    expect((await inventory(first))[0]).toMatchObject({ recurring: true, hidden: false });
  });

  it('is changed offline too, and a change is taken back by a mutation that says its flags as 0 and 1', async () => {
    const me = await somebody(database, 'Hide');
    const d = await synced(me);
    await d.client.commit(
      makeInventoryItem(env(), { householdId: me.household, name: 'Disposable gloves' }),
    );
    await d.client.sync();
    const row = (await inventory(d))[0];
    if (!row) throw new Error('no row');
    const undo = await d.client.commit(hideInventoryItem(env(), row) ?? (undefined as never));
    expect((await inventory(d))[0]).toMatchObject({ hidden: true });
    expect(undo?.changes[0]?.fields).toEqual({ hidden: 0 });
    if (!undo) throw new Error('no undo');
    await d.client.commit(undo);
    expect((await inventory(d))[0]).toMatchObject({ hidden: false });
    await d.client.sync();
    expect((await inventory(d))[0]).toMatchObject({ hidden: false });
  });

  it('shows a starter entry that was renamed by its new name with its key kept, and offers none that was hidden, on the device that did it and the next', async () => {
    const me = await somebody(database, 'Layer');
    const first = await synced(me);
    const second = await synced(me);
    await first.client.commit(
      overrideStarterEntry(env(), {
        householdId: me.household,
        starterKey: 'bread',
        name: 'Sourdough',
      }),
    );
    await first.client.commit(
      overrideStarterEntry(env(), { householdId: me.household, starterKey: 'apple', hidden: true }),
    );
    await first.client.sync();
    await second.client.sync();
    for (const d of [first, second]) {
      const entries = layerInventory(await inventory(d));
      const bread = entries.find((entry) => entry.starterKey === 'bread');
      expect(bread).toMatchObject({ name: 'Sourdough', overridden: true });
      expect(offered(entries).some((entry) => entry.starterKey === 'apple')).toBe(false);
      expect(offered(entries).some((entry) => entry.name === 'Sourdough')).toBe(true);
    }
  });

  it('becomes one row when two devices made the same thing offline, however each spelled it, and what waited for the folded one follows it', async () => {
    const me = await somebody(database, 'Twice');
    const first = await synced(me);
    const second = await synced(me);
    first.wire.offline = true;
    second.wire.offline = true;
    await first.client.commit(
      makeInventoryItem(env(), { householdId: me.household, name: 'Dish Sponges' }),
    );
    await second.client.commit(
      makeInventoryItem(env(), {
        householdId: me.household,
        name: 'dish  sponges',
        note: 'green ones',
      }),
    );
    const folded = (await inventory(second))[0];
    if (!folded) throw new Error('no row');
    // A change made to the row that is about to be folded, still waiting.
    await second.client.commit(
      changeInventoryItem(env(), folded, { recurring: true }) ?? (undefined as never),
    );
    first.wire.offline = false;
    await first.client.sync();
    second.wire.offline = false;
    await second.client.sync();
    await first.client.sync();
    for (const d of [first, second]) {
      const rows = await inventory(d);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ recurring: true, note: 'green ones' });
    }
  });

  it('is on no device of anyone else: a person on one of the group’s lists pulls none of it', async () => {
    const host = await somebody(database, 'Hostess');
    const guest = await somebody(database, 'Guest');
    await join(database, host.household, guest);
    const hostDevice = await synced(host);
    await hostDevice.client.commit(
      makeInventoryItem(env(), { householdId: host.household, name: 'Hostess’s good tea' }),
    );
    await hostDevice.client.sync();
    expect(await inventory(hostDevice)).toHaveLength(1);

    const guestDevice = await synced(guest);
    // The guest has the group's list, and none of its Inventory, on a device that has pulled everything there is.
    expect(guestDevice.db).toBeDefined();
    expect(
      (await guestDevice.client.read((db) => db.getAll('list'))).some(
        (list) => list.householdId === host.household,
      ),
    ).toBe(true);
    expect(await inventory(guestDevice)).toEqual([]);
    // Their own mutation for the host's group is refused, and goes to Couldn't sync with what was typed.
    const refused = await guestDevice.client.commit(
      makeInventoryItem(env(), { householdId: host.household, name: 'Sneaky' }),
    );
    expect(refused).not.toBeUndefined();
    await guestDevice.client.sync();
    expect((await guestDevice.client.read((db) => db.getAll('failed'))).length).toBe(1);
  });
});
