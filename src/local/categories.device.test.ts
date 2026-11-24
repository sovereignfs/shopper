import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import {
  deleteCategory,
  hideCategory,
  makeCategory,
  moveCategory,
  renameCategory,
  setCategoryIcon,
  showCategory,
} from '../actions/categories';
import { STARTER_CATEGORIES } from '../catalog/categories';
import type { Database } from '../db/client';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import type { EndpointDeps } from '../sync/endpoint';
import { categoriesOf, failedOf, ownerCategoriesOf } from './store';
import { closeDevices, device, type Device } from './test-support';

/**
 * A group's categories on a device (task 23.3, DESIGN.md §8.3): made and changed offline and shown at once, **through the merge that keeps what waits to be sent**
 * (a pull no longer overwrites it), the same on a second device of the account, and for anyone else on a list of the group only the starter ones, by the code's
 * names; and a list's screens group by the starter ones alone.
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
const owned = (d: Device, who: Someone) =>
  d.client.read((db) => ownerCategoriesOf(db, who.household));
const starters = (d: Device, who: Someone) =>
  d.client.read((db) => categoriesOf(db, who.household));
const row = async (
  d: Device,
  who: Someone,
  find: (c: { starterKey: string | null; name: string }) => boolean,
) => {
  const found = (await owned(d, who)).find(find);
  if (!found) throw new Error('no such category');
  return found;
};

describe(`a person’s categories on their devices (${leg})`, () => {
  it('are made, renamed, put in order, hidden and deleted offline, shown at once, and the same on a second device once synced', async () => {
    const me = await somebody(database, 'Ada');
    const first = await synced(me);
    const second = await synced(me);
    expect((await owned(first, me)).length).toBe(STARTER_CATEGORIES.length);
    first.wire.offline = true;
    const made = makeCategory(env(), {
      householdId: me.household,
      name: 'Hardware',
      last: (await owned(first, me)).at(-1)?.position ?? null,
    });
    await first.client.commit(made);
    const hardware = await row(first, me, (c) => c.name === 'Hardware');
    expect(hardware).toMatchObject({ starterKey: null, hidden: false });
    await first.client.commit(
      renameCategory(env(), hardware, 'Hardware and tools') ?? (undefined as never),
    );
    await first.client.commit(setCategoryIcon(env(), hardware, 'apple') ?? (undefined as never));
    const produce = await row(first, me, (c) => c.starterKey === 'produce');
    await first.client.commit(
      renameCategory(env(), produce, 'Fruit and veg') ?? (undefined as never),
    );
    await first.client.commit(
      hideCategory(env(), await row(first, me, (c) => c.starterKey === 'deli')) ??
        (undefined as never),
    );
    // At once, from the device alone.
    expect((await row(first, me, (c) => c.starterKey === 'produce')).name).toBe('Fruit and veg');
    expect((await row(first, me, (c) => c.starterKey === 'deli')).hidden).toBe(true);
    first.wire.offline = false;
    await first.client.sync();
    await second.client.sync();
    for (const d of [first, second]) {
      const rows = await owned(d, me);
      expect(rows.find((c) => c.starterKey === 'produce')?.name).toBe('Fruit and veg');
      expect(rows.find((c) => c.starterKey === 'deli')?.hidden).toBe(true);
      expect(rows.find((c) => c.starterKey === null)).toMatchObject({
        name: 'Hardware and tools',
        icon: 'apple',
      });
    }
    // A starter given the code's name again shows it at once, and so does the other device after a sync.
    await second.client.commit(
      renameCategory(env(), await row(second, me, (c) => c.starterKey === 'produce'), null) ??
        (undefined as never),
    );
    expect((await row(second, me, (c) => c.starterKey === 'produce')).name).toBe('Produce');
    await second.client.sync();
    await first.client.sync();
    expect((await row(first, me, (c) => c.starterKey === 'produce')).name).toBe('Produce');
    // Put in order, shown again, deleted: the same.
    const deli = await row(first, me, (c) => c.starterKey === 'deli');
    await first.client.commit(showCategory(env(), deli) ?? (undefined as never));
    const own = await row(first, me, (c) => c.starterKey === null);
    await first.client.commit(moveCategory(env(), own, 'a0') ?? (undefined as never));
    await first.client.commit(deleteCategory(env(), own) ?? (undefined as never));
    await first.client.sync();
    await second.client.sync();
    expect((await owned(second, me)).some((c) => c.starterKey === null)).toBe(false);
    expect((await row(second, me, (c) => c.starterKey === 'deli')).hidden).toBe(false);
    // Nothing was refused on the way.
    expect(await first.client.read((db) => db.getAll('failed'))).toEqual([]);
    expect(await second.client.read((db) => db.getAll('failed'))).toEqual([]);
  });

  it('keep what waits to be sent when a pull arrives, merged by field with what another device did meanwhile', async () => {
    const me = await somebody(database, 'Merge');
    const first = await synced(me);
    const second = await synced(me);
    first.wire.offline = true;
    const bakery = await row(first, me, (c) => c.starterKey === 'bakery');
    await first.client.commit(renameCategory(env(), bakery, 'Bread') ?? (undefined as never));
    // The other device puts it first in the aisle order and syncs while the first is offline.
    await second.client.commit(
      moveCategory(env(), await row(second, me, (c) => c.starterKey === 'bakery'), 'Zz') ??
        (undefined as never),
    );
    await second.client.sync();
    first.wire.offline = false;
    await first.client.sync();
    await second.client.sync();
    for (const d of [first, second])
      expect(await row(d, me, (c) => c.starterKey === 'bakery')).toMatchObject({
        name: 'Bread',
        position: 'Zz',
      });
  });

  it('are offered to a list only as the starter ones, by the code’s names: another person on a list of the group has none of the owner’s own, nor what they named a starter', async () => {
    const host = await somebody(database, 'Hostess');
    const guest = await somebody(database, 'Guest');
    await join(database, host.household, guest);
    const hostDevice = await synced(host);
    await hostDevice.client.commit(
      makeCategory(env(), {
        householdId: host.household,
        name: 'Hostess’s secret shelf',
        last: null,
      }),
    );
    await hostDevice.client.commit(
      renameCategory(
        env(),
        await row(hostDevice, host, (c) => c.starterKey === 'pantry'),
        'Hostess’s cupboard',
      ) ?? (undefined as never),
    );
    await hostDevice.client.sync();
    // On the owner's device a list groups by the starter categories, and the owner's Categories tab has all of them.
    expect((await starters(hostDevice, host)).every((c) => c.starterKey !== null)).toBe(true);
    expect((await starters(hostDevice, host)).length).toBe(STARTER_CATEGORIES.length);
    expect((await owned(hostDevice, host)).length).toBe(STARTER_CATEGORIES.length + 1);
    const guestDevice = await synced(guest);
    const theirs = await guestDevice.client.read((db) =>
      db.getAllFromIndex('category', 'byHousehold', host.household),
    );
    expect(theirs.length).toBe(STARTER_CATEGORIES.length);
    expect(JSON.stringify(theirs)).not.toContain('Hostess');
    expect(theirs.find((c) => c.starterKey === 'pantry')?.name).toBe('Pantry');
  });

  it('puts a category over the limit into Couldn’t sync with the sentence of it, takes the row back, and an Undo of a starter’s name gives the code’s back as nothing', async () => {
    const me = await somebody(database, 'Limited');
    const small = (): EndpointDeps => ({
      ...deps(),
      limits: { ...deps().limits, householdCategories: STARTER_CATEGORIES.length + 1 },
    });
    const d = await device(small, me);
    await d.client.sync();
    await d.client.commit(
      makeCategory(env(), { householdId: me.household, name: 'One', last: null }),
    );
    await d.client.commit(
      makeCategory(env(), { householdId: me.household, name: 'Two', last: null }),
    );
    await d.client.sync();
    const rows = await owned(d, me);
    expect(rows.filter((c) => c.starterKey === null).map((c) => c.name)).toEqual(['One']);
    const failed = await d.client.read(failedOf);
    expect(failed).toHaveLength(1);
    expect(JSON.stringify(failed[0])).toContain('at most');
    // The Undo of a name given to a starter category: the code's name again, said as nothing and not as the text it happens to be.
    const bakery = await row(d, me, (c) => c.starterKey === 'bakery');
    const rename = renameCategory(env(), bakery, 'Bread');
    if (!rename) throw new Error('no change');
    const undo = await d.client.commit(rename);
    expect(undo?.changes[0]?.fields).toEqual({ name: null });
  });
});
