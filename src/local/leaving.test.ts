import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, callAs, join, somebody } from '../access/test-support';
import type { Env } from '../actions/env';
import { addItem } from '../actions/items';
import type { Database } from '../db/client';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import { OPERATIONS } from '../households/ops';
import type { EndpointDeps } from '../sync/endpoint';
import { listViewOf } from './listview';
import { householdsOf, listsOf } from './store';
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
            })
          : await callAs(database, OPERATIONS, ada, {
              op: 'member.remove',
              household: ada.household,
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
});
