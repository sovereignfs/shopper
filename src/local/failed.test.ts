import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, callAs, join, leave, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import { addItem, tickItem } from '../actions/items';
import { archiveList } from '../actions/lists';
import type { Database } from '../db/client';
import { dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { OPERATIONS } from '../households/ops';
import type { Limits } from '../limits/config';
import type { EndpointDeps } from '../sync/endpoint';
import { type Refusal, failedOf, itemsOf, listsOf } from './store';
import { closeDevices, device, shown, type Device } from './test-support';

const { leg } = testTarget();
/** A value a test has just made, which is there or the test is wrong. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value');
  return value;
}
let limits: Limits;
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
};

let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());
afterEach(async () => {
  limits = LIMITS;
  await closeDevices();
});

const deps = (): EndpointDeps => ({
  database,
  ring: TEST_RING,
  limits: limits ?? LIMITS,
  intervalSeconds: 20,
});
let clock = 1_900_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });
const synced = async (who: Someone): Promise<Device> => {
  const made = await device(deps, who);
  await made.client.sync();
  return made;
};
const lists = (d: Device, household: string, archived = false) =>
  d.client.read((db) => listsOf(db, household, { archived }));
const firstList = async (d: Device, household: string) => {
  const list = (await lists(d, household))[0];
  if (!list) throw new Error('no list');
  return list;
};
const newList = async (d: Device, household: string, name: string, position: string) => {
  const id = crypto.randomUUID();
  await d.client.commit({
    mutationId: crypto.randomUUID(),
    householdId: household,
    changes: [{ table: 'list', id, create: true, fields: { name, position, createdAt: 5 } }],
  });
  await d.client.sync();
  return id;
};
const addTo = async (d: Device, listId: string, household: string, name: string) => {
  const list = must(await d.db.get('list', listId));
  const items = await d.client.read((db) => itemsOf(db, listId, { cleared: true }));
  const mutation = addItem(env(), {
    list: { ...list, householdId: household },
    name,
    last: items.at(-1)?.position ?? null,
    by: d.who.personId,
  });
  await d.client.commit(mutation);
  return mutation;
};
const names = async (d: Device, listId: string) =>
  (await d.client.read((db) => itemsOf(db, listId))).map((i) => i.name);
const onServer = async (listId: string) =>
  Number(
    (
      await dbGet<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'item')} WHERE list_id = ${listId}`,
      )
    )?.n,
  );

describe(`Couldn't sync (${leg})`, () => {
  it('keeps a change refused for a member who has left, says so in a sentence, and can only discard it', async () => {
    const host = await somebody(database, 'Host');
    const lin = await somebody(database, 'Lin');
    await join(database, host.household, lin);
    const d = await synced(lin);
    const list = await firstList(d, host.household);
    const mutation = await addTo(d, list.id, host.household, 'Cheese');
    await leave(database, host.household, lin);
    const told: Refusal[] = [];
    d.client.onRefused((refusals) => told.push(...refusals));

    await d.client.sync();
    expect(await d.client.pending()).toBe(0);
    const failed = await failedOf(d.db);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ reason: 'not_found', what: 'Added Cheese', mutation });
    expect(failed[0]?.sentence).toMatch(/^You're no longer in .+\.$/);
    expect(told.map((r) => r.kind)).toEqual(['add']);
    // Off the screens, and nowhere to move it to in a household that is gone.
    expect((await shown(d.db, host.household)).items).toEqual([]);
    expect(await d.client.move(failed[0]?.n ?? 0, (await firstList(d, lin.household)).id)).toBe(
      false,
    );
    expect(await d.client.failedCount()).toBe(1);

    await d.client.discard(failed[0]?.n ?? 0);
    expect(await d.client.failedCount()).toBe(0);
    expect(await onServer(list.id)).toBe(0);
  });

  it('keeps an add to a list deleted for good, names the list, and moves it to another list as a new mutation', async () => {
    const host = await somebody(database, 'Hosta');
    const guest = await somebody(database, 'Guest');
    await join(database, host.household, guest);
    const a = await synced(host);
    const g = await synced(guest);
    const hardware = await newList(a, host.household, 'Hardware', 'a5');
    await g.client.sync();
    const groceries = await firstList(a, host.household);

    // Guest, offline, adds to Hardware; the host archives it and deletes it for good.
    g.wire.offline = true;
    await addTo(g, hardware, host.household, 'Nails');
    await a.client.commit(archiveList(env(), must(await a.db.get('list', hardware))));
    await a.client.sync();
    expect(
      await callAs(database, OPERATIONS, host, {
        op: 'list.delete',
        household: host.household,
        list: hardware,
      }),
    ).toEqual({ status: 200, body: { ok: true } });

    g.wire.offline = false;
    const told: Refusal[] = [];
    g.client.onRefused((refusals) => told.push(...refusals));
    await g.client.sync();
    const [entry] = await failedOf(g.db);
    expect(entry).toMatchObject({
      reason: 'not_found',
      what: 'Added Nails',
      sentence: 'Hardware was deleted.',
    });
    expect(told).toHaveLength(1);
    expect(await names(g, groceries.id)).toEqual([]);

    expect(await g.client.move(entry?.n ?? 0, groceries.id)).toBe(true);
    // Taken out of Couldn't sync and queued, in the same write, as a new mutation.
    expect(await g.client.failedCount()).toBe(0);
    expect(await g.client.pending()).toBe(1);
    expect(await names(g, groceries.id)).toEqual(['Nails']);
    await g.client.sync();
    expect(await g.client.failedCount()).toBe(0);
    expect(await g.client.pending()).toBe(0);
    expect(await onServer(groceries.id)).toBe(1);
    await a.client.sync();
    expect(await names(a, groceries.id)).toEqual(['Nails']);
  });

  it('keeps an add over a list’s limit with the server’s sentence, and moves it to a list with room', async () => {
    limits = { ...LIMITS, listOpenItems: 2 };
    const me = await somebody(database, 'Limit');
    const d = await synced(me);
    const full = await firstList(d, me.household);
    const roomy = await newList(d, me.household, 'Overflow', 'a5');
    d.wire.offline = true;
    for (const name of ['One', 'Two', 'Three']) await addTo(d, full.id, me.household, name);
    d.wire.offline = false;
    await d.client.sync();

    const failed = await failedOf(d.db);
    expect(failed.map((f) => [f.what, f.reason])).toEqual([['Added Three', 'limit']]);
    expect(failed[0]?.sentence).toMatch(/2/);
    expect(await names(d, full.id)).toEqual(['One', 'Two']);
    expect(await d.client.move(failed[0]?.n ?? 0, roomy)).toBe(true);
    await d.client.sync();
    expect(await names(d, roomy)).toEqual(['Three']);
    expect(await d.client.failedCount()).toBe(0);
  });

  it('puts a refused tick back, and says it was a tick', async () => {
    const host = await somebody(database, 'Hostb');
    const guest = await somebody(database, 'Guestb');
    await join(database, host.household, guest);
    const a = await synced(host);
    const g = await synced(guest);
    const hardware = await newList(a, host.household, 'Tools', 'a5');
    await addTo(a, hardware, host.household, 'Saw');
    await a.client.sync();
    await g.client.sync();
    const saw = must((await g.client.read((db) => itemsOf(db, hardware)))[0]);

    g.wire.offline = true;
    await g.client.commit(must(tickItem(env(), saw, guest.personId)));
    expect((await g.client.read((db) => itemsOf(db, hardware)))[0]?.boughtAt).not.toBeNull();
    await a.client.commit(archiveList(env(), must(await a.db.get('list', hardware))));
    await a.client.sync();
    await callAs(database, OPERATIONS, host, {
      op: 'list.delete',
      household: host.household,
      list: hardware,
    });
    g.wire.offline = false;
    const told: Refusal[] = [];
    g.client.onRefused((refusals) => told.push(...refusals));
    await g.client.sync();
    expect(told.map((r) => [r.kind, r.what])).toEqual([['tick', 'Ticked Saw']]);
    expect(told[0]?.sentence).toBe('Tools was deleted.');
    expect(await g.client.failedCount()).toBe(1);
    // Nothing to move a tick to.
    expect(
      await g.client.move(
        (await failedOf(g.db))[0]?.n ?? 0,
        (await firstList(g, host.household)).id,
      ),
    ).toBe(false);
  });

  it('loses nothing: every mutation sent is applied or kept, and what is kept survives closing the device', async () => {
    limits = { ...LIMITS, listOpenItems: 1 };
    const me = await somebody(database, 'Keep');
    const d = await synced(me);
    const list = await firstList(d, me.household);
    d.wire.offline = true;
    for (const name of ['A', 'B', 'C']) await addTo(d, list.id, me.household, name);
    d.wire.offline = false;
    await d.client.sync();
    const sent = d.wire.requests.flatMap((r) => r.outbox).length;
    const failed = await failedOf(d.db);
    expect(sent).toBe(3);
    expect(failed.length + (await onServer(list.id))).toBe(3);
    expect(await d.client.pending()).toBe(0);

    // It is in the database, and a new connection finds it there.
    const name = d.db.name;
    d.db.close();
    const { openLocal } = await import('./db');
    const again = await openLocal('', name);
    expect((await again.getAll('failed')).map((f) => f.what).sort()).toEqual(
      failed.map((f) => f.what).sort(),
    );
    again.close();
  });

  it('keeps a database from before Couldn’t sync existed, and gives it the store', async () => {
    const { openDB, deleteDB } = await import('idb');
    const name = `shopper-upgrade-${crypto.randomUUID()}`;
    const old = await openDB(name, 1, {
      upgrade(db) {
        for (const store of ['household', 'list', 'item', 'product', 'category'])
          db.createObjectStore(store, { keyPath: 'id' });
        db.createObjectStore('member', { keyPath: ['householdId', 'personId'] });
        db.createObjectStore('shadow', { keyPath: ['table', 'id'] });
        db.createObjectStore('outbox', { keyPath: 'n', autoIncrement: true });
        db.createObjectStore('meta');
      },
    });
    await old.put('meta', 123, 'lastSyncedAt');
    old.close();
    const { openLocal } = await import('./db');
    const upgraded = await openLocal('', name);
    expect(await upgraded.get('meta', 'lastSyncedAt')).toBe(123);
    expect(await upgraded.count('failed')).toBe(0);
    upgraded.close();
    await deleteDB(name);
  });
});
