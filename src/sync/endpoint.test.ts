import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, leave, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import { addItem, tickItem } from '../actions/items';
import type { ItemRow, ListRow } from '../actions/rows';
import type { Database } from '../db/client';
import { dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limits } from '../limits/config';
import { handleSync } from './endpoint';
import { PROTOCOL, type SyncAnswer } from './protocol';
import { pullHousehold } from './pull';

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
let grace: Someone;
let lin: Someone;
let adaList: string;

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  lin = await somebody(database, 'Lin');
  adaList = String(
    (
      await dbGet<{ id: string }>(
        database,
        sql`SELECT id FROM ${appTable(database, 'list')} WHERE household_id = ${ada.household} LIMIT 1`,
      )
    )?.id,
  );
});
afterAll(async () => database.close());

const deps = () => ({ database, ring: TEST_RING, limits: LIMITS, intervalSeconds: 30 });
let clock = 1_800_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });
const answer = async (
  who: Pick<Someone, 'accountId'>,
  outbox: unknown[] = [],
  cursors: Record<string, number> = {},
): Promise<SyncAnswer> => {
  const reply = await handleSync(deps(), who.accountId, { version: PROTOCOL, outbox, cursors });
  if (reply.status !== 200) throw new Error(`status ${reply.status}`);
  return reply.body;
};
const listRow = (household: string, id: string): ListRow => ({
  id,
  householdId: household,
  name: 'Groceries',
  position: 'a0',
  clearing: 'manual',
  archivedAt: null,
  deletedAt: null,
  createdAt: 1,
  seq: 1,
});
const itemCount = async (household: string) =>
  Number(
    (
      await dbGet<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'item')} WHERE household_id = ${household}`,
      )
    )?.n,
  );

describe(`the sync endpoint (${leg})`, () => {
  it('answers a new device with its households in full: the snapshot, unsealed, at a cursor', async () => {
    const reply = await answer(ada);
    expect(reply.protocol).toBe(PROTOCOL);
    expect(reply.settings.intervalSeconds).toBe(30);
    expect(reply.gone).toEqual([]);
    expect(reply.households.map((h) => h.household)).toEqual([ada.household]);
    const pulled = reply.households[0];
    expect(pulled?.cursor).toBe(pulled?.view.seq);
    expect(pulled?.lists.map((l) => l.name)).toEqual(['Groceries']);
    expect(pulled?.categories.length).toBeGreaterThan(5);
    expect(pulled?.categories.every((c) => typeof c.name === 'string' && c.name !== '')).toBe(true);
    expect(pulled?.members.map((m) => [m.name, m.self])).toEqual([['Ada', true]]);
    // Sealed columns are never on the wire.
    expect(JSON.stringify(reply)).not.toContain('"sealed"');
  });

  it('applies the outbox in order, answers each, and returns only what is past the cursor', async () => {
    const first = await answer(ada);
    const cursor = first.households[0]?.cursor ?? 0;
    const add = addItem(env(), {
      list: listRow(ada.household, adaList),
      name: 'Oat milk',
      last: null,
      by: ada.personId,
      quantity: '2',
      unit: 'L',
    });
    const reply = await answer(ada, [add], { [ada.household]: cursor });
    expect(reply.refused).toEqual([]);
    expect(reply.applied).toMatchObject([{ mutationId: add.mutationId, status: 'applied' }]);
    const pulled = reply.households[0];
    expect(pulled?.items.map((i) => [i.name, i.quantity, i.unit])).toEqual([
      ['Oat milk', '2', 'L'],
    ]);
    expect(pulled?.products.map((p) => p.name)).toEqual(['Oat milk']);
    expect(pulled?.lists).toEqual([]);
    expect(pulled?.cursor).toBeGreaterThan(cursor);

    // Sent again, because the answer was lost: answered as it was, and nothing more is written.
    const again = await answer(ada, [add], { [ada.household]: cursor });
    expect(again.applied).toMatchObject([{ mutationId: add.mutationId, status: 'replayed' }]);
    expect(again.households[0]?.cursor).toBe(pulled?.cursor);

    // And a device that is up to date is told nothing.
    const quiet = await answer(ada, [], { [ada.household]: pulled?.cursor ?? 0 });
    expect(quiet.households[0]).toMatchObject({ items: [], products: [], lists: [], more: false });
  });

  it('answers a refused mutation with its reason and keeps going', async () => {
    const bad = {
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: [{ table: 'item', id: 'not-an-id', fields: {} }],
    };
    const good = addItem(env(), {
      list: listRow(ada.household, adaList),
      name: 'Bread',
      last: null,
      by: ada.personId,
    });
    const reply = await answer(ada, [bad, good]);
    expect(reply.refused).toHaveLength(1);
    expect(reply.refused[0]).toMatchObject({ mutationId: bad.mutationId });
    expect(reply.refused[0]?.sentence).not.toBe('');
    expect(reply.applied).toMatchObject([{ mutationId: good.mutationId, status: 'applied' }]);
  });

  it('shows a second person only their own households, and refuses their writes to another as not found', async () => {
    const theirs = await answer(grace);
    expect(theirs.households.map((h) => h.household)).toEqual([grace.household]);
    expect(JSON.stringify(theirs)).not.toContain('Oat milk');
    // Asking for a household that is not theirs gives nothing, and says only that they do not hold it.
    const asked = await answer(grace, [], { [ada.household]: 0 });
    expect(asked.households.map((h) => h.household)).toEqual([grace.household]);
    expect(asked.gone).toEqual([ada.household]);
    // A write to it is refused the same way as a write to a household that is not there.
    const before = await itemCount(ada.household);
    const intrude = addItem(env(), {
      list: listRow(ada.household, adaList),
      name: 'Spam',
      last: null,
      by: grace.personId,
    });
    const reply = await answer(grace, [intrude]);
    expect(reply.applied).toEqual([]);
    expect(reply.refused).toHaveLength(1);
    const nowhere = {
      ...intrude,
      mutationId: crypto.randomUUID(),
      householdId: crypto.randomUUID(),
    };
    const unknown = await answer(grace, [nowhere]);
    expect(unknown.refused[0]?.reason).toBe(reply.refused[0]?.reason);
    expect(await itemCount(ada.household)).toBe(before);
  });

  it('brings a shared household to a member, the first tick standing, and names it gone when they leave', async () => {
    await join(database, ada.household, lin);
    const all = await answer(ada);
    const item = all.households[0]?.items.find((i) => i.name === 'Oat milk');
    const asRow = (i: Record<string, unknown> | undefined) => i as unknown as ItemRow;
    const adaTick = tickItem(env(), asRow(item), ada.personId);
    const linTick = tickItem(env(), asRow(item), lin.personId);
    await answer(ada, [adaTick]);
    await answer(lin, [linTick]);
    const seen = await answer(lin, [], { [ada.household]: 0 });
    expect(seen.households.map((h) => h.household).sort()).toEqual(
      [ada.household, lin.household].sort(),
    );
    const shared = seen.households.find((h) => h.household === ada.household);
    expect(shared?.items.find((i) => i.name === 'Oat milk')).toMatchObject({
      boughtBy: ada.personId,
    });
    expect(shared?.members.map((m) => m.name).sort()).toEqual(['Ada', 'Lin']);
    // Lin is a Member: Ada's address is not shown to them, and theirs is shown to themselves and to an Admin.
    expect(shared?.members.find((m) => m.name === 'Ada')?.email).toBeNull();
    expect(shared?.members.find((m) => m.name === 'Lin')?.email).toBe(lin.email);
    const adminView = await answer(ada);
    expect(adminView.households[0]?.members.find((m) => m.name === 'Lin')?.email).toBe(lin.email);

    await leave(database, ada.household, lin);
    const after = await answer(lin, [], {
      [ada.household]: shared?.cursor ?? 0,
      [lin.household]: 0,
    });
    expect(after.gone).toEqual([ada.household]);
    expect(after.households.map((h) => h.household)).toEqual([lin.household]);
  });

  it('cuts a page at a whole seq and carries on from its cursor until nothing is left', async () => {
    for (let n = 0; n < 7; n++) {
      const add = addItem(env(), {
        list: listRow(ada.household, adaList),
        name: `Thing ${n}`,
        last: null,
        by: ada.personId,
      });
      await answer(ada, [add]);
    }
    let cursor = 0;
    const seen = new Set<string>();
    for (let guard = 0; guard < 50; guard++) {
      const page = await pullHousehold(
        database,
        TEST_RING,
        ada.accountId,
        ada.household,
        cursor,
        3,
      );
      if (!page) throw new Error('no page');
      for (const i of page.items) seen.add(String(i.id));
      if (!page.more) break;
      expect(page.cursor).toBeGreaterThan(cursor);
      cursor = page.cursor;
    }
    expect(seen.size).toBe(await itemCount(ada.household));
  });

  it('refuses a body that is not a request, and a device made for another protocol', async () => {
    const call = (body: unknown) => handleSync(deps(), ada.accountId, body);
    expect((await call({ nonsense: true })).status).toBe(400);
    expect((await call({ version: PROTOCOL, outbox: 'x', cursors: {} })).status).toBe(400);
    expect(
      (await call({ version: PROTOCOL, outbox: [], cursors: { 'not-an-id': 0 } })).status,
    ).toBe(400);
    expect(await call({ version: PROTOCOL + 1, outbox: [], cursors: {} })).toMatchObject({
      status: 426,
    });
    // An account with no person yet has no households, and that is not an error.
    expect((await answer({ accountId: 'nobody' })).households).toEqual([]);
  });
});
