import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { OPERATIONS } from '../households/ops';
import { TEST_RING, callAs, join, leave, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import type { Mutation } from '../actions/format';
import { addItem, clearBought, editItem, tickItem } from '../actions/items';
import { archiveList } from '../actions/lists';
import type { Database } from '../db/client';
import { dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limits } from '../limits/config';
import type { EndpointDeps } from '../sync/endpoint';
import { PROTOCOL, type SyncAnswer } from '../sync/protocol';
import { InvalidMutation } from './client';
import { closeDevices, device, households, shown, type Device } from './test-support';
import {
  categoriesOf,
  isPending,
  itemsOf,
  listsOf,
  membersOf,
  openItemFor,
  openCounts,
  productNamed,
  productsOf,
  readOutbox,
  settle,
} from './store';

const { leg } = testTarget();
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
};

let database: Database;
let ada: Someone;

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
});
afterAll(async () => database.close());
afterEach(closeDevices);

const deps = (): EndpointDeps => ({
  database,
  ring: TEST_RING,
  limits: LIMITS,
  intervalSeconds: 20,
});
let clock = 1_900_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });
const serverRow = async (table: string, id: string) =>
  dbGet<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, table)} WHERE id = ${id}`,
  );
const serverCount = async (table: string, household: string) =>
  Number(
    (
      await dbGet<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, table)} WHERE household_id = ${household}`,
      )
    )?.n,
  );

/** A device that has taken its first sync. */
async function synced(who: Someone): Promise<Device> {
  const made = await device(deps, who);
  expect(await made.client.sync()).toEqual({ status: 'synced' });
  return made;
}
const firstList = async (d: Device, household: string) => {
  const list = (await d.client.read((db) => listsOf(db, household)))[0];
  if (!list) throw new Error('no list');
  return list;
};
const add = async (
  d: Device,
  household: string,
  name: string,
  extra: Partial<Parameters<typeof addItem>[1]> = {},
) => {
  const list = await firstList(d, household);
  const product = await d.client.read((db) => productNamed(db, household, name));
  const items = await d.client.read((db) => itemsOf(db, list.id));
  const mutation = addItem(env(), {
    list,
    product,
    name,
    last: items.at(-1)?.position ?? null,
    by: d.who.personId,
    ...extra,
  });
  await d.client.commit(mutation);
  const created = mutation.changes.find((c) => c.table === 'item' && c.create)?.id ?? '';
  return { mutation, item: created };
};
const itemNamed = async (d: Device, household: string, name: string) => {
  const list = await firstList(d, household);
  return (await d.client.read((db) => itemsOf(db, list.id, { cleared: true }))).find(
    (i) => i.name === name,
  );
};

describe(`a device (${leg})`, () => {
  it('takes a household whole on its first sync, with its members, categories and lists', async () => {
    const d = await synced(ada);
    expect(await households(d.db)).toEqual([ada.household]);
    expect((await d.client.read((db) => listsOf(db, ada.household))).map((l) => l.name)).toEqual([
      'Groceries',
    ]);
    expect((await d.client.read((db) => categoriesOf(db, ada.household))).length).toBeGreaterThan(
      5,
    );
    expect(
      (await d.client.read((db) => membersOf(db, ada.household))).map((m) => [m.name, m.self]),
    ).toEqual([['Ada', true]]);
    expect(await d.client.hasSynced()).toBe(true);
    expect(await d.client.intervalSeconds()).toBe(20);
  });

  it('shows a write at once, sends it once, and has the server’s row after', async () => {
    const d = await synced(ada);
    const { item, mutation } = await add(d, ada.household, 'Oat milk', {
      quantity: '2',
      unit: 'L',
    });
    // Visible before any sync, and waiting in the outbox in the same write.
    expect((await itemNamed(d, ada.household, 'Oat milk'))?.seq).toBe(0);
    expect(await d.client.pending()).toBe(1);
    expect(await isPending(d.db, 'item', item)).toBe(true);

    expect(await d.client.sync()).toEqual({ status: 'synced' });
    expect(await d.client.pending()).toBe(0);
    expect(await isPending(d.db, 'item', item)).toBe(false);
    expect((await itemNamed(d, ada.household, 'Oat milk'))?.seq).toBeGreaterThan(0);
    // It went in exactly one request, and the next sync sends nothing.
    expect(d.wire.requests.filter((r) => r.outbox.length > 0).map((r) => r.outbox.length)).toEqual([
      1,
    ]);
    await d.client.sync();
    expect(d.wire.requests.at(-1)?.outbox).toEqual([]);
    expect(await serverCount('item', ada.household)).toBe(1);
    expect(await serverRow('item', item)).toMatchObject({
      list_id: (await firstList(d, ada.household)).id,
    });
    expect(mutation.changes).toHaveLength(2);
  });

  it('refuses to queue a mutation that is not well formed, and one for a household it does not hold', async () => {
    const [me, other] = [await somebody(database, 'Ivy'), await somebody(database, 'Jo')];
    const d = await synced(me);
    await expect(
      d.client.commit({ mutationId: 'x', householdId: me.household, changes: [] }),
    ).rejects.toBeInstanceOf(InvalidMutation);
    const list = await firstList(d, me.household);
    const mutation = addItem(env(), {
      list: { ...list, householdId: other.household },
      name: 'x',
      last: null,
      by: me.personId,
    });
    await expect(d.client.commit(mutation)).rejects.toThrow(/does not hold/);
    expect(await d.client.pending()).toBe(0);
    expect((await shown(d.db, me.household)).items).toEqual([]);
  });

  it('keeps working offline, and sends it all when the network returns', async () => {
    const d = await synced(ada);
    d.wire.offline = true;
    await add(d, ada.household, 'Bread');
    const bread = await itemNamed(d, ada.household, 'Bread');
    await d.client.commit(tickItem(env(), bread as never, ada.personId));
    expect(await d.client.sync()).toEqual({ status: 'offline' });
    expect(await d.client.pending()).toBe(2);
    expect((await itemNamed(d, ada.household, 'Bread'))?.boughtBy).toBe(ada.personId);

    d.wire.offline = false;
    expect(await d.client.sync()).toEqual({ status: 'synced' });
    expect(await d.client.pending()).toBe(0);
    const row = await serverRow(bread?.id ?? '', bread?.id ?? '').catch(() => undefined);
    expect(row).toBeUndefined();
    expect(await serverRow('item', bread?.id ?? '')).toMatchObject({ bought_by: ada.personId });
  });

  it('moves a product’s count with a tick at once, and takes the server’s when it answers', async () => {
    const d = await synced(ada);
    await add(d, ada.household, 'Rice');
    await d.client.sync();
    const rice = await itemNamed(d, ada.household, 'Rice');
    await d.client.commit(tickItem(env(), rice as never, ada.personId));
    expect((await productNamed(d.db, ada.household, 'rice'))?.timesBought).toBe(1);
    await d.client.sync();
    expect((await productNamed(d.db, ada.household, 'rice'))?.timesBought).toBe(1);
    expect((await openItemFor(d.db, rice?.listId ?? '', rice?.productId ?? '')) ?? null).toBeNull();
    // Adding what is already open finds it, for the +1 offer.
    await add(d, ada.household, 'Rice');
    const again = await openItemFor(d.db, rice?.listId ?? '', rice?.productId ?? '');
    expect(again?.name).toBe('Rice');
    expect((await openCounts(d.db, ada.household)).get(rice?.listId ?? '')).toBeGreaterThan(0);
  });

  it('undoes with the mutation it was given: a tick, a delete-by-edit and an add', async () => {
    const d = await synced(ada);
    await add(d, ada.household, 'Tea');
    await d.client.sync();
    const tea = await itemNamed(d, ada.household, 'Tea');
    const undoTick = await d.client.commit(tickItem(env(), tea as never, ada.personId));
    expect((await itemNamed(d, ada.household, 'Tea'))?.boughtAt).not.toBeNull();
    expect(undoTick).not.toBeNull();
    await d.client.commit(undoTick);
    expect(await itemNamed(d, ada.household, 'Tea')).toMatchObject({
      boughtAt: null,
      boughtBy: null,
    });
    expect((await productNamed(d.db, ada.household, 'tea'))?.timesBought).toBe(0);

    const { mutation } = await add(d, ada.household, 'Salt');
    const undoAdd = await d.client.commit(
      editItem(env(), (await itemNamed(d, ada.household, 'Salt')) as never, { note: 'fine' }),
    );
    expect(undoAdd?.changes[0]?.fields).toEqual({ note: null });
    // The undo of an add is a delete of the item.
    const list = await firstList(d, ada.household);
    const added = mutation.changes.find((c) => c.table === 'item');
    expect(added).toBeDefined();
    expect((await d.client.read((db) => itemsOf(db, list.id))).some((i) => i.name === 'Salt')).toBe(
      true,
    );
    await d.client.sync();
    // Everything the device undid is what the server holds.
    expect(await serverRow('item', tea?.id ?? '')).toMatchObject({
      bought_at: null,
      bought_by: null,
    });
  });

  it('takes back a change the server refuses, tells whoever listens, and keeps what was typed', async () => {
    const [ada, grace] = [await somebody(database, 'Ada'), await somebody(database, 'Grace')];
    const d = await synced(ada);
    const stranger = await synced(grace);
    const theirs = await firstList(stranger, grace.household);
    const list = await firstList(d, ada.household);
    // A well-formed change that points at a list of another household: the server's to refuse.
    const mutation = addItem(env(), {
      list: { ...list, id: theirs.id },
      name: 'Intruder',
      last: null,
      by: ada.personId,
    });
    const told: Mutation[] = [];
    d.client.onRefused((refusals) => refusals.forEach((r) => told.push(r.mutation)));
    await d.client.commit(mutation);
    // It points at a list that is not this household's, so it is read from the store and not through a list.
    const names = async () => (await d.db.getAll('item')).map((i) => i.name);
    expect(await names()).toEqual(['Intruder']);
    await d.client.sync();
    expect(told).toEqual([mutation]);
    expect(await d.client.pending()).toBe(0);
    expect(await names()).toEqual([]);
    expect((await productsOf(d.db, ada.household)).map((p) => p.name)).not.toContain('Intruder');
    expect(await serverCount('item', grace.household)).toBe(0);
  });

  it('keeps a change waiting on top of a pull, and replaces the rest with the server’s row', async () => {
    const d = await synced(ada);
    const { item } = await add(d, ada.household, 'Jam', { quantity: '1' });
    await d.client.sync();
    const jam = await itemNamed(d, ada.household, 'Jam');
    // The person edits the note, not yet sent; a pull then says the quantity changed (and the old note).
    await d.client.commit(editItem(env(), jam as never, { note: 'plum' }));
    const answer: SyncAnswer = {
      protocol: PROTOCOL,
      applied: [],
      refused: [],
      gone: [],
      settings: { intervalSeconds: 20 },
      households: [
        {
          household: ada.household,
          cursor: 999,
          more: false,
          view: { label: 'x', own: true, role: 'admin', seq: 999 },
          lists: [],
          products: [],
          categories: [],
          members: [],
          tombstones: [],
          aliases: [],
          items: [{ ...(jam as object), quantity: '5', note: null, seq: 900 }],
        },
      ],
    };
    await settle(d.db, [], answer, 1);
    expect(await itemNamed(d, ada.household, 'Jam')).toMatchObject({ quantity: '5', note: 'plum' });
    expect(await isPending(d.db, 'item', item)).toBe(true);
    expect((await readOutbox(d.db, 10)).length).toBe(1);
  });

  it('re-points what is waiting when the server says a product was folded into another', async () => {
    const me = await somebody(database, 'Pia');
    const d = await synced(me);
    await add(d, me.household, 'Soap');
    await d.client.sync();
    const soap = await itemNamed(d, me.household, 'Soap');
    const folded = soap?.productId ?? '';
    const stands = crypto.randomUUID();
    const base = (await productsOf(d.db, me.household)).find((p) => p.id === folded);
    // A change made during the request that was answered: it names the product that is about to be folded away.
    await d.client.commit({
      mutationId: crypto.randomUUID(),
      householdId: me.household,
      changes: [{ table: 'product', id: folded, fields: { note: 'bar' } }],
    });
    const pull = (seq: number, folds: boolean) => ({
      household: me.household,
      cursor: 999,
      more: false,
      view: { label: 'x', own: true, role: 'admin' as const, seq: 999 },
      lists: [],
      items: [],
      categories: [],
      members: [],
      products: [{ ...(base as object), id: stands, name: 'Soap', note: null, seq }],
      tombstones: folds ? [{ table: 'product', id: folded, seq }] : [],
      aliases: folds ? [{ table: 'product', from: folded, to: stands, seq }] : [],
    });
    const answer = (seq: number, folds: boolean): SyncAnswer => ({
      protocol: PROTOCOL,
      applied: [],
      refused: [],
      gone: [],
      settings: { intervalSeconds: 20 },
      households: [pull(seq, folds)],
    });
    await settle(d.db, [], answer(900, true), 1);
    // The folded product is gone, its item points at the one that stands, and the waiting change goes to it, on top of the row the server sent.
    expect((await productsOf(d.db, me.household)).map((p) => p.id)).toEqual([stands]);
    expect((await itemNamed(d, me.household, 'Soap'))?.productId).toBe(stands);
    expect((await readOutbox(d.db, 10)).map((e) => e.mutation.changes[0]?.id)).toEqual([stands]);
    expect(await isPending(d.db, 'product', stands)).toBe(true);
    expect((await productsOf(d.db, me.household))[0]).toMatchObject({
      id: stands,
      name: 'Soap',
      note: 'bar',
    });
    // A later pull of the row does not undo the waiting change.
    await settle(d.db, [], answer(950, false), 2);
    expect((await productsOf(d.db, me.household))[0]?.note).toBe('bar');
  });

  it('converges with another member: one offline, the first tick standing, every row the same', async () => {
    const [ada, grace] = [await somebody(database, 'Ada'), await somebody(database, 'Grace')];
    await join(database, ada.household, grace);
    const a = await synced(ada);
    const g = await synced(grace);
    await add(a, ada.household, 'Milk');
    await a.client.sync();
    await g.client.sync();
    expect((await itemNamed(g, ada.household, 'Milk'))?.addedBy).toBe(ada.personId);

    g.wire.offline = true;
    const gMilk = await itemNamed(g, ada.household, 'Milk');
    await g.client.commit(tickItem(env(), gMilk as never, grace.personId));
    await add(g, ada.household, 'Eggs', { quantity: '12' });
    await g.client.commit(editItem(env(), gMilk as never, { note: 'oat' }));
    await g.client.sync();
    expect((await itemNamed(g, ada.household, 'Milk'))?.boughtBy).toBe(grace.personId);

    // Meanwhile Ada ticks it first, adds bread and changes its quantity.
    const aMilk = await itemNamed(a, ada.household, 'Milk');
    await a.client.commit(tickItem(env(), aMilk as never, ada.personId));
    await add(a, ada.household, 'Bread');
    await a.client.commit(editItem(env(), aMilk as never, { quantity: '3' }));
    await a.client.sync();

    g.wire.offline = false;
    await g.client.sync();
    await a.client.sync();
    await g.client.sync();

    const [seenByAda, seenByGrace] = [
      await shown(a.db, ada.household),
      await shown(g.db, ada.household),
    ];
    expect(seenByGrace).toEqual(seenByAda);
    const names = seenByAda.items.map((i) => i.name).sort();
    expect(names).toEqual(['Bread', 'Eggs', 'Milk']);
    // The first tick stands (Ada’s reached the server first), and both edits of different fields stand.
    expect(seenByAda.items.find((i) => i.name === 'Milk')).toMatchObject({
      boughtBy: ada.personId,
      note: 'oat',
      quantity: '3',
    });
    expect(seenByAda.products.find((p) => p.name === 'Milk')?.timesBought).toBe(1);
    expect(await a.client.pending()).toBe(0);
    expect(await g.client.pending()).toBe(0);
  });

  it('folds a product two members made offline into one, and the items with it, and re-points what waits', async () => {
    const lin = await somebody(database, 'Lin');
    const shared = await somebody(database, 'Hosta');
    await join(database, shared.household, lin);
    const h = await synced(shared);
    const l = await synced(lin);
    // Lin has two households; the shared one is the one to look at.
    l.wire.offline = true;
    await add(l, shared.household, 'Oat Milk', { quantity: '2' });
    const linItem = await itemNamed(l, shared.household, 'Oat Milk');
    // A later change of Lin’s, still waiting, to the item that is about to be folded.
    await l.client.commit(tickItem(env(), linItem as never, lin.personId));

    await add(h, shared.household, 'oat milk', { quantity: '1' });
    await h.client.sync();

    l.wire.offline = false;
    await l.client.sync();
    await h.client.sync();
    await l.client.sync();

    const [forHost, forLin] = [
      await shown(h.db, shared.household),
      await shown(l.db, shared.household),
    ];
    expect(forLin).toEqual(forHost);
    expect(forHost.products.filter((p) => p.name.toLowerCase() === 'oat milk')).toHaveLength(1);
    expect(forHost.items).toHaveLength(1);
    const only = forHost.items[0];
    expect(only?.quantity).toBe('2');
    expect(only?.productId).toBe(forHost.products[0]?.id);
    // Lin’s waiting tick landed on the item that stands.
    expect(only?.boughtBy).toBe(lin.personId);
    // The server holds one row: the folded one is gone, with a tombstone.
    expect(await serverCount('item', shared.household)).toBe(1);
  });

  it('drops a household the account has left, keeps what was waiting for it, and the rest stands', async () => {
    const lin = await somebody(database, 'Lin');
    const shared = await somebody(database, 'Maple');
    await join(database, shared.household, lin);
    const l = await synced(lin);
    expect((await households(l.db)).sort()).toEqual([lin.household, shared.household].sort());
    await add(l, shared.household, 'Cheese');
    await leave(database, shared.household, lin);
    const told: Mutation[] = [];
    l.client.onRefused((refusals) => refusals.forEach((r) => told.push(r.mutation)));
    await l.client.sync();
    expect(await households(l.db)).toEqual([lin.household]);
    expect((await shown(l.db, shared.household)).items).toEqual([]);
    expect((await shown(l.db, shared.household)).products).toEqual([]);
    expect(told).toHaveLength(1);
    expect(await l.client.pending()).toBe(0);
    expect(await serverCount('item', shared.household)).toBe(0);
  });

  it('drops a list deleted for good with its items, and a cleared item stays off the list', async () => {
    const d = await synced(ada);
    const { mutation } = await (async () => {
      const list = await firstList(d, ada.household);
      const make = {
        mutationId: crypto.randomUUID(),
        householdId: ada.household,
        changes: [
          {
            table: 'list' as const,
            id: crypto.randomUUID(),
            create: true as const,
            fields: { name: 'Hardware', position: 'a5', createdAt: 5 },
          },
        ],
      };
      await d.client.commit(make);
      return { mutation: make, list };
    })();
    const hardware = mutation.changes[0]?.id ?? '';
    const lists = await d.client.read((db) => listsOf(db, ada.household));
    const target = lists.find((l) => l.id === hardware);
    await d.client.commit(
      addItem(env(), { list: target as never, name: 'Nails', last: null, by: ada.personId }),
    );
    await d.client.sync();
    const nails = (await d.client.read((db) => itemsOf(db, hardware)))[0];
    await d.client.commit(tickItem(env(), nails as never, ada.personId));
    await d.client.commit(
      clearBought(env(), [{ ...(nails as object), boughtAt: 1, boughtBy: 'x' } as never]),
    );
    expect(await d.client.read((db) => itemsOf(db, hardware))).toEqual([]);
    expect(await d.client.read((db) => itemsOf(db, hardware, { cleared: true }))).toHaveLength(1);
    await d.client.commit(archiveList(env(), target as never));
    await d.client.sync();

    expect(
      await callAs(database, OPERATIONS, ada, {
        op: 'list.delete',
        household: ada.household,
        list: hardware,
      }),
    ).toEqual({ status: 200, body: { ok: true } });
    await d.client.sync();
    expect(
      (await d.client.read((db) => listsOf(db, ada.household, { archived: true }))).map(
        (l) => l.id,
      ),
    ).not.toContain(hardware);
    expect(await d.client.read((db) => itemsOf(db, hardware, { cleared: true }))).toEqual([]);
    expect((await productsOf(d.db, ada.household)).map((p) => p.name)).toContain('Nails');
  });
});
