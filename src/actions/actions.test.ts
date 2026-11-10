import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addItem,
  addToOpen,
  clearBought,
  deleteItem,
  editItem,
  moveItem,
  restoreItem,
  tickItem,
  unclearBought,
  untickItem,
} from './items';
import { archiveList, makeList, renameList, reorderList, restoreList } from './lists';
import type { Mutation } from './format';
import { validateMutation } from './validate';
import {
  CATEGORY,
  HOUSEHOLD,
  OTHER_PERSON,
  PERSON,
  env,
  item,
  list,
  product,
} from './test-support';

const valid = (mutation: Mutation | null): Mutation => {
  if (!mutation) throw new Error('expected a mutation');
  const verdict = validateMutation(mutation);
  if (!verdict.ok)
    throw new Error(`the action made a mutation that does not validate: ${verdict.problem}`);
  return mutation;
};

describe('adding an item', () => {
  it('makes the product and the item together when the household has none, with what was given, and the product remembers it', () => {
    const e = env();
    const m = valid(
      addItem(e, {
        list: list(),
        name: 'Oat milk',
        quantity: '2',
        unit: 'L',
        categoryId: CATEGORY,
        icon: 'milk',
        last: null,
        by: PERSON,
      }),
    );
    expect(m.householdId).toBe(HOUSEHOLD);
    expect(m.changes.map((c) => [c.table, c.create])).toEqual([
      ['product', true],
      ['item', true],
    ]);
    const [p, i] = m.changes;
    expect(p?.fields).toMatchObject({
      name: 'Oat milk',
      defaultQuantity: '2',
      defaultUnit: 'L',
      categoryId: CATEGORY,
      icon: 'milk',
      lastAddedAt: e.now,
      createdAt: e.now,
    });
    expect(i?.fields).toMatchObject({
      productId: p?.id,
      name: 'Oat milk',
      quantity: '2',
      unit: 'L',
      addedBy: PERSON,
      addedAt: e.now,
    });
    // Every id is the device's own, and the mutation has one.
    expect(new Set([m.mutationId, p?.id, i?.id]).size).toBe(3);
  });

  it('comes with what the product remembers, and says only that the product was added to, not what it already has', () => {
    const e = env();
    const m = valid(
      addItem(e, {
        list: list(),
        product: product({ defaultQuantity: '1.5', defaultUnit: 'kg', icon: 'apple' }),
        name: 'Oat milk',
        last: 'a3',
        by: PERSON,
      }),
    );
    const [p, i] = m.changes;
    expect(p).toEqual({ table: 'product', id: product().id, fields: { lastAddedAt: e.now } });
    expect(i?.fields).toMatchObject({
      productId: product().id,
      quantity: '1.5',
      unit: 'kg',
      icon: 'apple',
      categoryId: CATEGORY,
    });
  });

  it('lets what was given win over what the product remembers, including nothing', () => {
    const m = valid(
      addItem(env(), {
        list: list(),
        product: product(),
        name: 'Oat milk',
        quantity: '3',
        unit: null,
        icon: null,
        last: null,
        by: PERSON,
      }),
    );
    expect(m.changes[1]?.fields).toMatchObject({ quantity: '3', unit: null, icon: null });
  });

  it('puts the item after the last of its category', () => {
    const [a, b] = [
      valid(addItem(env(), { list: list(), name: 'a', last: null, by: PERSON })).changes[1]?.fields
        .position,
      valid(addItem(env(), { list: list(), name: 'b', last: 'a0', by: PERSON })).changes[1]?.fields
        .position,
    ];
    expect(String(b) > String(a ?? '')).toBe(true);
    expect(String(b) > 'a0').toBe(true);
  });

  it('is a pure function of its arguments: the same input and the same ids make the same mutation', () => {
    const input = { list: list(), name: 'Bread', last: null, by: PERSON };
    expect(addItem(env(), input)).toEqual(addItem(env(), input));
  });
});

describe('adding one more of what is open', () => {
  it('goes up by one for a counted unit and by the last quantity for a measured one', () => {
    expect(
      valid(addToOpen(env(), item({ quantity: '2', unit: 'pcs' })))?.changes[0]?.fields,
    ).toEqual({ quantity: '3' });
    expect(
      valid(
        addToOpen(env(), item({ quantity: '500', unit: 'g' }), product({ defaultQuantity: '250' })),
      )?.changes[0]?.fields,
    ).toEqual({ quantity: '750' });
    expect(
      valid(addToOpen(env(), item({ quantity: '1', unit: null })))?.changes[0]?.fields,
    ).toEqual({ quantity: '2' });
  });

  it('says nothing, rather than a sum that is too large', () => {
    expect(addToOpen(env(), item({ quantity: '999999.999', unit: 'pcs' }))).toBeNull();
  });
});

describe('editing an item', () => {
  it('sends only the fields that differ', () => {
    const m = valid(
      editItem(env(), item(), { name: 'Oat milk', quantity: '3', note: 'the green one' }),
    );
    expect(m.changes).toHaveLength(1);
    expect(m.changes[0]).toMatchObject({
      table: 'item',
      id: item().id,
      fields: { quantity: '3', note: 'the green one' },
    });
    expect(Object.keys(m.changes[0]?.fields ?? {}).sort()).toEqual(['note', 'quantity']);
  });

  it('says nothing when nothing differs, and refuses a quantity that is not one', () => {
    expect(editItem(env(), item(), { name: 'Oat milk', quantity: '2' })).toBeNull();
    expect(editItem(env(), item(), {})).toBeNull();
    expect(editItem(env(), item(), { quantity: '2.50' })).toBeNull();
    expect(editItem(env(), item(), { quantity: '0' })).toBeNull();
  });

  it('teaches the product the category, icon and unit when asked, in the same mutation', () => {
    const p = product({ icon: 'milk', defaultUnit: 'L' });
    const m = valid(
      editItem(env(), item(), { icon: 'apple', unit: 'kg', quantity: '3' }, { product: p }),
    );
    expect(m.changes.map((c) => c.table)).toEqual(['item', 'product']);
    expect(m.changes[1]).toEqual({
      table: 'product',
      id: p.id,
      fields: { icon: 'apple', defaultUnit: 'kg' },
    });
    // Not asked: the item alone.
    expect(valid(editItem(env(), item(), { icon: 'apple' })).changes.map((c) => c.table)).toEqual([
      'item',
    ]);
  });

  it('moves an item to another list of the household in the same way', () => {
    const m = valid(editItem(env(), item(), { listId: '40000000-0000-4000-8000-000000000002' }));
    expect(m.changes[0]?.fields).toEqual({ listId: '40000000-0000-4000-8000-000000000002' });
  });
});

describe('ticking, unticking, deleting and clearing', () => {
  it('ticks an open item with the time and the person, and the first tick stands', () => {
    const e = env();
    expect(valid(tickItem(e, item(), PERSON)).changes[0]?.fields).toEqual({
      boughtAt: e.now,
      boughtBy: PERSON,
    });
    const bought = item({ boughtAt: 5, boughtBy: OTHER_PERSON });
    expect(tickItem(env(), bought, PERSON)).toBeNull();
    expect(tickItem(env(), item({ deletedAt: 5 }), PERSON)).toBeNull();
    expect(
      tickItem(env(), item({ boughtAt: 5, boughtBy: PERSON, clearedAt: 6 }), PERSON),
    ).toBeNull();
  });

  it('unticks only a bought item', () => {
    expect(
      valid(untickItem(env(), item({ boughtAt: 5, boughtBy: PERSON }))).changes[0]?.fields,
    ).toEqual({ boughtAt: null, boughtBy: null });
    expect(untickItem(env(), item())).toBeNull();
  });

  it('deletes and restores, each only when it changes something', () => {
    const e = env();
    expect(valid(deleteItem(e, item())).changes[0]?.fields).toEqual({ deletedAt: e.now });
    expect(deleteItem(env(), item({ deletedAt: 3 }))).toBeNull();
    expect(valid(restoreItem(env(), item({ deletedAt: 3 }))).changes[0]?.fields).toEqual({
      deletedAt: null,
    });
    expect(restoreItem(env(), item())).toBeNull();
  });

  it('moves an item to a position, and to another list when told', () => {
    expect(valid(moveItem(env(), item(), { position: 'a1' })).changes[0]?.fields).toEqual({
      position: 'a1',
    });
    const other = '40000000-0000-4000-8000-000000000002';
    expect(
      valid(moveItem(env(), item(), { position: 'a1', listId: other })).changes[0]?.fields,
    ).toEqual({ position: 'a1', listId: other });
    expect(moveItem(env(), item({ position: 'a1' }), { position: 'a1' })).toBeNull();
  });

  it('clears every bought item in one mutation, and not the open, the cleared or the deleted, and undoing it brings the same back', () => {
    const e = env();
    const items = [
      item({ id: '60000000-0000-4000-8000-0000000000a1', boughtAt: 1, boughtBy: PERSON }),
      item({ id: '60000000-0000-4000-8000-0000000000a2' }),
      item({
        id: '60000000-0000-4000-8000-0000000000a3',
        boughtAt: 1,
        boughtBy: PERSON,
        clearedAt: 2,
      }),
      item({
        id: '60000000-0000-4000-8000-0000000000a4',
        boughtAt: 1,
        boughtBy: PERSON,
        deletedAt: 2,
      }),
      item({ id: '60000000-0000-4000-8000-0000000000a5', boughtAt: 1, boughtBy: OTHER_PERSON }),
    ];
    const cleared = valid(clearBought(e, items));
    expect(cleared.changes.map((c) => c.id)).toEqual([items[0]?.id, items[4]?.id]);
    for (const c of cleared.changes) expect(c.fields).toEqual({ clearedAt: e.now });
    expect(clearBought(env(), [items[1] as never])).toBeNull();
    expect(clearBought(env(), [])).toBeNull();

    const back = valid(
      unclearBought(
        env(),
        items.map((i) =>
          cleared.changes.some((c) => c.id === i.id) ? { ...i, clearedAt: e.now } : i,
        ),
      ),
    );
    expect(back.changes.map((c) => c.id).sort()).toEqual(
      [items[0]?.id, items[2]?.id, items[4]?.id].sort(),
    );
    for (const c of back.changes) expect(c.fields).toEqual({ clearedAt: null });
    expect(unclearBought(env(), [])).toBeNull();
  });
});

describe('the actions on lists', () => {
  it('makes a list with a manual clearing rule and its own id', () => {
    const e = env();
    const m = valid(makeList(e, { householdId: HOUSEHOLD, name: 'Pharmacy', position: 'a1' }));
    expect(m.changes[0]).toMatchObject({
      table: 'list',
      create: true,
      fields: { name: 'Pharmacy', position: 'a1', clearing: 'manual', createdAt: e.now },
    });
  });

  it('renames, reorders, archives and restores, each only when it changes something', () => {
    const e = env();
    expect(valid(renameList(e, list(), 'Food')).changes[0]?.fields).toEqual({ name: 'Food' });
    expect(renameList(env(), list(), 'Groceries')).toBeNull();
    expect(valid(reorderList(env(), list(), 'a1')).changes[0]?.fields).toEqual({ position: 'a1' });
    expect(reorderList(env(), list(), 'a0')).toBeNull();
    expect(valid(archiveList(e, list())).changes[0]?.fields).toEqual({ archivedAt: e.now });
    expect(archiveList(env(), list({ archivedAt: 1 }))).toBeNull();
    expect(valid(restoreList(env(), list({ archivedAt: 1 }))).changes[0]?.fields).toEqual({
      archivedAt: null,
    });
    expect(restoreList(env(), list())).toBeNull();
  });
});

describe('what the actions are', () => {
  const folder = path.resolve(__dirname);
  const sources = readdirSync(folder).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'test-support.ts',
  );

  it('pure: nothing in src/actions imports the server, the browser, a store, a clock or the network', () => {
    const forbidden =
      /from '(\.\.\/(db|auth|sync|local|config|crypto|access|households|people|screens|ui|sovereign|mail|jobs)\b[^']*|next\/[^']*|react[^']*|node:[^']*|drizzle-orm[^']*|idb)'/;
    const offenders = sources.filter((file) =>
      forbidden.test(readFileSync(path.join(folder, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
    expect(sources.length).toBeGreaterThan(5);
  });

  it('does not read the clock or the random source: both are given', () => {
    const offenders = sources.filter((file) =>
      /Date\.now\(|new Date\(|Math\.random\(|crypto\.randomUUID\(/.test(
        readFileSync(path.join(folder, file), 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
