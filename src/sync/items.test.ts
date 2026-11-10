import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOT_FOUND, TEST_RING, callAs, join, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import type { Mutation } from '../actions/format';
import {
  addItem,
  clearBought,
  deleteItem,
  editItem,
  restoreItem,
  tickItem,
  unclearBought,
  untickItem,
} from '../actions/items';
import { archiveList, makeList } from '../actions/lists';
import type { ItemRow, ListRow, ProductRow } from '../actions/rows';
import { unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { OPERATIONS } from '../households/ops';
import type { Limits } from '../limits/config';
import { type ApplyResult, applyMutation } from './apply';
import { foldItemFields, withoutSecondTick } from './items';

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
  await join(database, ada.household, grace);
  adaList = await firstList(ada.household);
});
afterAll(async () => database.close());

const deps = (limits: Limits = LIMITS) => ({ database, ring: TEST_RING, limits });
let clock = 1_800_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });
const ok = (r: ApplyResult) => {
  if (r.status === 'refused') throw new Error(`refused: ${r.reason}: ${r.sentence}`);
  return r;
};
const send = (who: Someone, m: Mutation | null) => {
  if (!m) throw new Error('nothing to say');
  return applyMutation(deps(), who.accountId, m);
};
async function firstList(household: string): Promise<string> {
  const row = await dbGet<{ id: string }>(
    database,
    sql`SELECT id FROM ${appTable(database, 'list')} WHERE household_id = ${household} ORDER BY position LIMIT 1`,
  );
  return row?.id ?? '';
}
const listRow = (id: string, household: string): ListRow => ({
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
const rowOf = async (table: string, id: string) =>
  dbGet<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, table)} WHERE id = ${id}`,
  );
const asItem = (row: Record<string, unknown> | undefined, name = 'x'): ItemRow => ({
  id: String(row?.id),
  householdId: String(row?.household_id),
  listId: String(row?.list_id),
  productId: String(row?.product_id),
  name,
  note: null,
  quantity: String(row?.quantity),
  unit: (row?.unit as ItemRow['unit']) ?? null,
  categoryId: (row?.category_id as string | null) ?? null,
  icon: (row?.icon as string | null) ?? null,
  position: String(row?.position),
  addedBy: String(row?.added_by),
  addedAt: Number(row?.added_at),
  boughtAt: (row?.bought_at as number | null) ?? null,
  boughtBy: (row?.bought_by as string | null) ?? null,
  clearedAt: (row?.cleared_at as number | null) ?? null,
  deletedAt: (row?.deleted_at as number | null) ?? null,
  seq: Number(row?.seq),
});
const asProduct = (row: Record<string, unknown> | undefined): ProductRow => ({
  id: String(row?.id),
  householdId: String(row?.household_id),
  name: 'x',
  note: null,
  categoryId: (row?.category_id as string | null) ?? null,
  icon: (row?.icon as string | null) ?? null,
  defaultQuantity: (row?.default_quantity as string | null) ?? null,
  defaultUnit: (row?.default_unit as ProductRow['defaultUnit']) ?? null,
  timesBought: Number(row?.times_bought),
  lastBoughtAt: (row?.last_bought_at as number | null) ?? null,
  lastAddedAt: null,
  deletedAt: null,
  createdAt: 1,
  seq: 1,
});
/** Adds an item as someone does, and returns the ids of the item and its product. */
async function add(
  who: Someone,
  list: string,
  household: string,
  name: string,
  extra: Partial<Parameters<typeof addItem>[1]> = {},
) {
  const result = ok(
    await send(
      who,
      addItem(env(), {
        list: listRow(list, household),
        name,
        last: null,
        by: who.personId,
        ...extra,
      }),
    ),
  );
  const item = result.changed.find((c) => c.table === 'item')?.id ?? '';
  return { result, item, product: String((await rowOf('item', item))?.product_id) };
}
const count = async (table: string, where: ReturnType<typeof sql>) =>
  Number(
    (
      await dbGet<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, table)} WHERE ${where}`,
      )
    )?.n,
  );

describe(`adding an item (${leg})`, () => {
  it('makes the product and the item in one mutation, seals the name and note, and keeps the position', async () => {
    const { item, product } = await add(ada, adaList, ada.household, 'Oat milk', {
      quantity: '2',
      unit: 'L',
      note: 'the green one',
      icon: 'milk',
    });
    const row = await rowOf('item', item);
    expect(row).toMatchObject({
      household_id: ada.household,
      list_id: adaList,
      product_id: product,
      quantity: '2',
      unit: 'L',
      icon: 'milk',
      added_by: ada.personId,
      bought_at: null,
    });
    expect(unsealRow('item', item, String(row?.sealed), TEST_RING)).toEqual({
      name: 'Oat milk',
      note: 'the green one',
    });
    expect(JSON.stringify(row)).not.toContain('Oat milk');
    expect(JSON.stringify(row)).not.toContain('green');
    expect((await rowOf('product', product))?.default_unit).toBe('L');
  });

  it('comes with what the product remembers on the next add of another name’s product', async () => {
    const first = await add(ada, adaList, ada.household, 'Flour', { quantity: '500', unit: 'g' });
    // Tick it so that the list has room, then add the same product again: it is a new item of the same product, with the same defaults.
    ok(await send(ada, tickItem(env(), asItem(await rowOf('item', first.item)), ada.personId)));
    const product = asProduct(await rowOf('product', first.product));
    const second = ok(
      await send(
        ada,
        addItem(env(), {
          list: listRow(adaList, ada.household),
          product,
          name: 'Flour',
          last: null,
          by: ada.personId,
        }),
      ),
    );
    const newItem = await rowOf('item', second.changed.find((c) => c.table === 'item')?.id ?? '');
    expect(newItem).toMatchObject({ quantity: '500', unit: 'g', product_id: first.product });
  });
});

describe(`the first tick stands (${leg})`, () => {
  it('lets the first of two ticks stand, ignores the second, and counts the product as bought once', async () => {
    const { item, product } = await add(ada, adaList, ada.household, 'Butter');
    const open = asItem(await rowOf('item', item));
    const first = tickItem(env(), open, ada.personId);
    const second = tickItem(env(), open, grace.personId);
    const a = ok(await send(ada, first));
    ok(await send(grace, second));
    const row = await rowOf('item', item);
    expect(row).toMatchObject({ bought_by: ada.personId });
    expect(Number(row?.bought_at)).toBe(Number(first?.changes[0]?.fields.boughtAt));
    expect(a.status).toBe('applied');
    expect(Number((await rowOf('product', product))?.times_bought)).toBe(1);
    expect(Number((await rowOf('product', product))?.last_bought_at)).toBe(
      Number(first?.changes[0]?.fields.boughtAt),
    );
  });

  it('unticks, which takes the count back and never below nothing, and a tick of an unticked item stands again', async () => {
    const { item, product } = await add(ada, adaList, ada.household, 'Cream');
    ok(await send(ada, tickItem(env(), asItem(await rowOf('item', item)), ada.personId)));
    ok(await send(grace, untickItem(env(), asItem(await rowOf('item', item)))));
    expect(await rowOf('item', item)).toMatchObject({ bought_at: null, bought_by: null });
    expect(Number((await rowOf('product', product))?.times_bought)).toBe(0);
    ok(await send(grace, tickItem(env(), asItem(await rowOf('item', item)), grace.personId)));
    expect((await rowOf('item', item))?.bought_by).toBe(grace.personId);
    expect(Number((await rowOf('product', product))?.times_bought)).toBe(1);
  });

  it('is pure about the rule', () => {
    expect(withoutSecondTick(5, { boughtAt: 9, boughtBy: 'x', note: 'n' })).toEqual({ note: 'n' });
    expect(withoutSecondTick(null, { boughtAt: 9, boughtBy: 'x' })).toEqual({
      boughtAt: 9,
      boughtBy: 'x',
    });
    expect(withoutSecondTick(5, { boughtAt: null, boughtBy: null })).toEqual({
      boughtAt: null,
      boughtBy: null,
    });
  });
});

describe(`the same thing made twice (${leg})`, () => {
  it('two devices adding the same product to one list end with one item, the larger quantity, both notes, the earlier adder, and one alias', async () => {
    const eA = { ...env(), now: 1_900_000_000_000 };
    const eB = { ...env(), now: 1_900_000_005_000 };
    // B's device is the first to add, A's the second to arrive: the earlier adder is named whichever comes first.
    const b = ok(
      await send(
        grace,
        addItem(eB, {
          list: listRow(adaList, ada.household),
          name: 'Eggs',
          quantity: '6',
          note: 'free range',
          last: null,
          by: grace.personId,
        }),
      ),
    );
    const a = ok(
      await send(
        ada,
        addItem(eA, {
          list: listRow(adaList, ada.household),
          name: 'eggs',
          quantity: '12',
          note: 'large',
          last: null,
          by: ada.personId,
        }),
      ),
    );
    const items = await dbAll<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'item')} WHERE household_id = ${ada.household} AND list_id = ${adaList} AND product_id = ${String((await rowOf('item', b.changed.find((c) => c.table === 'item')?.id ?? ''))?.product_id)}`,
    );
    expect(items).toHaveLength(1);
    const survivor = items[0];
    expect(survivor).toMatchObject({
      quantity: '12',
      added_by: ada.personId,
      added_at: 1_900_000_000_000,
    });
    expect(unsealRow('item', String(survivor?.id), String(survivor?.sealed), TEST_RING)).toEqual({
      name: 'Eggs',
      note: 'free range\nlarge',
    });
    expect(a.folds.map((f) => f.table).sort()).toEqual(['item', 'product']);
    expect(
      await count('alias', sql`household_id = ${ada.household} AND table_name = 'item'`),
    ).toBeGreaterThanOrEqual(1);
    // Exactly one product too.
    expect(
      await count(
        'product',
        sql`household_id = ${ada.household} AND name_key = ${String(survivor?.product_id ? (await rowOf('product', String(survivor.product_id)))?.name_key : '')}`,
      ),
    ).toBe(1);
  });

  it('makes a second row with "add another anyway", and when the units differ, and not for a bought one', async () => {
    const first = await add(ada, adaList, ada.household, 'Cheese', { quantity: '1', unit: 'pcs' });
    const product = asProduct(await rowOf('product', first.product));
    const send2 = (extra: Partial<Parameters<typeof addItem>[1]>) =>
      send(
        ada,
        addItem(env(), {
          list: listRow(adaList, ada.household),
          product,
          name: 'Cheese',
          last: null,
          by: ada.personId,
          ...extra,
        }),
      );
    const anyway = ok(await send2({ anyway: true }));
    const differentUnit = ok(await send2({ unit: 'kg', quantity: '2' }));
    const open = await count(
      'item',
      sql`list_id = ${adaList} AND product_id = ${first.product} AND bought_at IS NULL`,
    );
    expect(open).toBe(3);
    expect(anyway.folds).toEqual([]);
    expect(differentUnit.folds).toEqual([]);
    // Bought is not open: a new add is a new item.
    for (const c of await dbAll<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'item')} WHERE list_id = ${adaList} AND product_id = ${first.product}`,
    ))
      ok(await send(ada, tickItem(env(), asItem(await rowOf('item', c.id)), ada.personId)));
    expect(ok(await send2({})).folds).toEqual([]);
  });

  it('follows a product that was folded: an item made for the product the other device made ends on the survivor, folded into its item', async () => {
    const eA = env();
    const eB = env();
    const a = ok(
      await send(
        ada,
        addItem(eA, {
          list: listRow(adaList, ada.household),
          name: 'Tofu',
          last: null,
          by: ada.personId,
        }),
      ),
    );
    const b = ok(
      await send(
        grace,
        addItem(eB, {
          list: listRow(adaList, ada.household),
          name: 'TOFU',
          last: null,
          by: grace.personId,
        }),
      ),
    );
    const survivor = await rowOf('item', a.changed.find((c) => c.table === 'item')?.id ?? '');
    expect(b.folds).toHaveLength(2);
    expect(
      await count(
        'item',
        sql`list_id = ${adaList} AND product_id = ${String(survivor?.product_id)}`,
      ),
    ).toBe(1);
  });

  it('is pure about what a fold takes', () => {
    const existing = { quantity: '2', note: null, addedBy: 'a', addedAt: 10 };
    expect(
      foldItemFields(existing, { quantity: '5', note: 'n', addedBy: 'b', addedAt: 5 }),
    ).toEqual({ quantity: '5', note: 'n', addedAt: 5, addedBy: 'b' });
    expect(foldItemFields(existing, { quantity: '1', addedBy: 'b', addedAt: 50 })).toEqual({});
    expect(foldItemFields({ ...existing, note: 'x' }, { note: 'x' })).toEqual({});
    expect(foldItemFields({ ...existing, note: 'x' }, { note: 'y' })).toEqual({ note: 'x\ny' });
  });
});

describe(`limits, references and the list an item is on (${leg})`, () => {
  it('refuses an open item past the list’s limit with the limit’s sentence, and bought, cleared and deleted ones do not count', async () => {
    const owner = await somebody(database, 'Limited');
    const list = await firstList(owner.household);
    const small = { ...LIMITS, listOpenItems: 2 };
    const addTo = (name: string) =>
      applyMutation(
        deps(small),
        owner.accountId,
        addItem(env(), {
          list: listRow(list, owner.household),
          name,
          last: null,
          by: owner.personId,
        }),
      );
    const a = ok(await addTo('One'));
    ok(await addTo('Two'));
    expect(await addTo('Three')).toEqual({
      status: 'refused',
      reason: 'limit',
      sentence: 'A list can hold at most 2 open items, and this one holds them all.',
    });
    const id = a.changed.find((c) => c.table === 'item')?.id ?? '';
    ok(
      await applyMutation(
        deps(small),
        owner.accountId,
        tickItem(env(), asItem(await rowOf('item', id)), owner.personId),
      ),
    );
    ok(await addTo('Three'));
    // Restoring a deleted item past the limit is refused as well.
    const two = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'item')} WHERE list_id = ${list} AND bought_at IS NULL ORDER BY added_at LIMIT 1`,
    );
    ok(
      await applyMutation(
        deps(small),
        owner.accountId,
        deleteItem(env(), asItem(await rowOf('item', two?.id ?? ''))),
      ),
    );
    ok(await addTo('Four'));
    expect(
      await applyMutation(
        deps(small),
        owner.accountId,
        restoreItem(env(), asItem(await rowOf('item', two?.id ?? ''))),
      ),
    ).toMatchObject({ reason: 'limit' });
  });

  it('refuses an item for another household’s list, product or person, and for a list that is gone, all as not found', async () => {
    const theirs = await firstList(lin.household);
    expect(
      await send(
        ada,
        addItem(env(), {
          list: listRow(theirs, ada.household),
          name: 'Sneak',
          last: null,
          by: ada.personId,
        }),
      ),
    ).toMatchObject({ reason: 'not_found' });
    const { product } = await add(lin, theirs, lin.household, 'Their thing');
    const other = asProduct(await rowOf('product', product));
    expect(
      await send(
        ada,
        addItem(env(), {
          list: listRow(adaList, ada.household),
          product: { ...other, householdId: ada.household },
          name: 'x',
          last: null,
          by: ada.personId,
        }),
      ),
    ).toMatchObject({ reason: 'not_found' });
    expect(
      await send(
        ada,
        addItem(env(), {
          list: listRow(adaList, ada.household),
          name: 'y',
          last: null,
          by: lin.personId,
        }),
      ),
    ).toMatchObject({ reason: 'not_found' });
    expect(
      await send(
        ada,
        addItem(env(), {
          list: listRow(crypto.randomUUID(), ada.household),
          name: 'z',
          last: null,
          by: ada.personId,
        }),
      ),
    ).toMatchObject({ reason: 'not_found' });
  });

  it('restores an archived list when an item is added to it', async () => {
    const e = env();
    const made = ok(
      await send(
        ada,
        makeList(e, { householdId: ada.household, name: 'Hardware', position: 'c0' }),
      ),
    );
    const list = made.changed[0]?.id ?? '';
    ok(await send(ada, archiveList(e, listRow(list, ada.household))));
    expect((await rowOf('list', list))?.archived_at).not.toBeNull();
    await add(ada, list, ada.household, 'Screws');
    expect((await rowOf('list', list))?.archived_at).toBeNull();
  });
});

describe(`clearing, deleting and deleting a list (${leg})`, () => {
  it('clears every bought item in one mutation, which is one undo, and the items stay bought', async () => {
    const owner = await somebody(database, 'Clearer');
    const list = await firstList(owner.household);
    const ids: string[] = [];
    for (const name of ['Plums', 'Pears', 'Figs']) {
      const added = ok(
        await applyMutation(
          deps(),
          owner.accountId,
          addItem(env(), {
            list: listRow(list, owner.household),
            name,
            last: null,
            by: owner.personId,
          }),
        ),
      );
      ids.push(added.changed.find((c) => c.table === 'item')?.id ?? '');
    }
    for (const id of ids.slice(0, 2))
      ok(
        await applyMutation(
          deps(),
          owner.accountId,
          tickItem(env(), asItem(await rowOf('item', id)), owner.personId),
        ),
      );
    const all = await Promise.all(ids.map(async (id) => asItem(await rowOf('item', id))));
    const cleared = ok(await applyMutation(deps(), owner.accountId, clearBought(env(), all)));
    expect(cleared.changed).toHaveLength(2);
    for (const id of ids.slice(0, 2))
      expect(await rowOf('item', id)).toMatchObject({
        cleared_at: expect.any(Number),
        bought_at: expect.any(Number),
      });
    expect((await rowOf('item', ids[2] ?? ''))?.cleared_at).toBeNull();
    const now = await Promise.all(ids.map(async (id) => asItem(await rowOf('item', id))));
    ok(await applyMutation(deps(), owner.accountId, unclearBought(env(), now)));
    for (const id of ids) expect((await rowOf('item', id))?.cleared_at).toBeNull();
  });

  it('edits an item field by field, and an edit restores a deleted one', async () => {
    const { item } = await add(ada, adaList, ada.household, 'Jam');
    const row = () => rowOf('item', item).then((r) => asItem(r, 'Jam'));
    ok(await send(ada, editItem(env(), await row(), { note: 'strawberry' })));
    ok(await send(grace, editItem(env(), await row(), { quantity: '3' })));
    expect(await rowOf('item', item)).toMatchObject({ quantity: '3' });
    ok(await send(ada, deleteItem(env(), await row())));
    expect((await rowOf('item', item))?.deleted_at).not.toBeNull();
    ok(
      await send(grace, editItem(env(), { ...(await row()), deletedAt: null }, { icon: 'apple' })),
    );
    expect(await rowOf('item', item)).toMatchObject({ icon: 'apple', deleted_at: null });
  });

  it('deleting a list for good removes its items', async () => {
    const e = env();
    const made = ok(
      await send(ada, makeList(e, { householdId: ada.household, name: 'Temp', position: 'd0' })),
    );
    const list = made.changed[0]?.id ?? '';
    const { item } = await add(ada, list, ada.household, 'Temp thing');
    ok(await send(ada, archiveList(e, listRow(list, ada.household))));
    expect(
      await callAs(database, OPERATIONS, ada, {
        op: 'list.delete',
        household: ada.household,
        list,
      }),
    ).toMatchObject({ status: 200 });
    expect(await rowOf('item', item)).toBeUndefined();
    expect(
      await callAs(database, OPERATIONS, grace, {
        op: 'list.delete',
        household: ada.household,
        list,
      }),
    ).toEqual(NOT_FOUND);
  });
});
