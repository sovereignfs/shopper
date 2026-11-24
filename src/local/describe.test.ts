import { describe, expect, it } from 'vitest';
import type { Mutation } from '../actions/format';
import { addItem, clearBought, deleteItem, editItem, tickItem, untickItem } from '../actions/items';
import { deleteCategory, makeCategory, moveCategory, renameCategory } from '../actions/categories';
import { makeInventoryItem } from '../actions/inventory';
import { archiveList, makeList } from '../actions/lists';
import { env, item, list } from '../actions/test-support';
import { canMove, describeMutation, refusalToast, remake } from './describe';

const names =
  (map: Record<string, string> = {}) =>
  (table: string, id: string) =>
    map[`${table}:${id}`];
const e = () => env();

describe('saying what a refused change to a category was', () => {
  const category = {
    id: '70000000-0000-4000-8000-000000000001',
    householdId: list().householdId,
    starterKey: null,
    name: 'Garden',
    icon: null,
    position: 'a5',
    hidden: false,
    deletedAt: null,
    seq: 1,
  };
  it('says one made by its name, and a change, a move and a delete by the name of the row', () => {
    const made = makeCategory(e(), {
      householdId: category.householdId,
      name: 'Garden',
      last: null,
    });
    expect(describeMutation(made, names())).toEqual({
      kind: 'inventory',
      what: 'Added the category Garden',
    });
    const lookup = names({ [`category:${category.id}`]: 'Garden' });
    // A rename carries the name it gives, which is what is said, as an item's does.
    expect(describeMutation(renameCategory(e(), category, 'Yard') as Mutation, lookup).what).toBe(
      'Changed the category Yard',
    );
    expect(describeMutation(moveCategory(e(), category, 'a9') as Mutation, lookup).what).toBe(
      'Changed the category Garden',
    );
    expect(describeMutation(deleteCategory(e(), category) as Mutation, lookup)).toEqual({
      kind: 'inventory',
      what: 'Deleted the category Garden',
    });
  });
});

describe('saying what a refused change was', () => {
  it('says an add by the name it carries, and a tick, an edit and a delete by the name of the row', () => {
    const l = list();
    const row = item({ name: 'Milk' });
    const lookup = names({ [`item:${row.id}`]: 'Milk' });
    expect(
      describeMutation(addItem(e(), { list: l, name: 'Oat milk', last: null, by: 'p' }), lookup),
    ).toEqual({ kind: 'add', what: 'Added Oat milk' });
    expect(describeMutation(tickItem(e(), row, 'p') as Mutation, lookup)).toEqual({
      kind: 'tick',
      what: 'Ticked Milk',
    });
    expect(describeMutation(untickItem(e(), { ...row, boughtAt: 1 }) as Mutation, lookup)).toEqual({
      kind: 'untick',
      what: 'Unticked Milk',
    });
    expect(describeMutation(deleteItem(e(), row) as Mutation, lookup)).toEqual({
      kind: 'delete',
      what: 'Deleted Milk',
    });
    expect(describeMutation(editItem(e(), row, { quantity: '4' }) as Mutation, lookup)).toEqual({
      kind: 'edit',
      what: 'Changed Milk',
    });
    expect(
      describeMutation(archiveList(e(), l) as Mutation, names({ [`list:${l.id}`]: 'Groceries' })),
    ).toEqual({ kind: 'archive', what: 'Archived Groceries' });
  });

  it('counts what clearing bought took, and names a list that was made', () => {
    const bought = [
      item({ id: '60000000-0000-4000-8000-000000000001', boughtAt: 1 }),
      item({ id: '60000000-0000-4000-8000-000000000002', boughtAt: 1 }),
    ];
    expect(describeMutation(clearBought(e(), bought) as Mutation, names()).what).toBe(
      'Cleared 2 bought items',
    );
    const made = makeList(e(), {
      name: 'Hardware',
      position: 'a1',
      householdId: list().householdId,
    });
    expect(describeMutation(made, names())).toEqual({
      kind: 'list',
      what: 'Made the list Hardware',
    });
  });

  it('does not fail for a row it knows nothing of', () => {
    expect(describeMutation(tickItem(e(), item(), 'p') as Mutation, names()).what).toBe(
      'Ticked an item',
    );
  });
});

describe('moving a refused change to another list', () => {
  const target = { id: '40000000-0000-4000-8000-0000000000aa', householdId: list().householdId };
  let n = 0;
  const id = () => `70000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

  it('can move what put something on a list, and nothing else', () => {
    expect(canMove(addItem(e(), { list: list(), name: 'x', last: null, by: 'p' }))).toBe(true);
    expect(canMove(tickItem(e(), item(), 'p') as Mutation)).toBe(false);
    expect(canMove(deleteItem(e(), item()) as Mutation)).toBe(false);
    expect(
      canMove({
        mutationId: id(),
        householdId: target.householdId,
        changes: [{ table: 'item', id: item().id, fields: { listId: target.id } }],
      }),
    ).toBe(true);
  });

  it('says what a new name made in Inventory was, and that it is not something to move to another list (§8.8)', () => {
    const made = makeInventoryItem(e(), { householdId: target.householdId, name: 'Zucchini bags' });
    expect(describeMutation(made, names())).toEqual({
      kind: 'inventory',
      what: 'Added Zucchini bags to Inventory',
    });
    expect(canMove(made)).toBe(false);
    expect(refusalToast({ kind: 'inventory', what: 'x' }, 'Inventory is full.')).toEqual({
      title: `Couldn't sync a change`,
      message: 'Inventory is full. It is kept in Settings.',
    });
  });

  it('makes a new mutation with a new id, the item on the other list after its last, the product in its catalog', () => {
    const refused = addItem(e(), { list: list(), name: 'Oat milk', last: null, by: 'p' });
    const moved = remake(refused, target, 'a3', id);
    expect(moved).not.toBeNull();
    expect(moved?.mutationId).not.toBe(refused.mutationId);
    const placed = moved?.changes.find((c) => c.table === 'item');
    expect(placed?.fields.listId).toBe(target.id);
    expect(String(placed?.fields.position) > 'a3').toBe(true);
    // The product it made is the same, in the catalog of the list it goes to (RFC 0004, 21.3).
    const made = refused.changes.find((c) => c.table === 'product');
    expect(moved?.changes.find((c) => c.table === 'product')).toEqual({
      ...made,
      fields: { ...made?.fields, listId: target.id },
    });
    // The one it was made from is not touched.
    expect(refused.changes.find((c) => c.table === 'item')?.fields.listId).toBe(list().id);
  });

  it('leaves the copies of people’s categories behind: the copy the refused change made, and any a row names, which the other list cannot read (§8.3)', () => {
    const mine = '60000000-0000-4000-8000-0000000000c1';
    const older = '60000000-0000-4000-8000-0000000000c2';
    const starter = '60000000-0000-4000-8000-0000000000c3';
    const refused: Mutation = {
      mutationId: id(),
      householdId: target.householdId,
      changes: [
        {
          table: 'list_category',
          id: mine,
          create: true,
          fields: {
            listId: 'x',
            sourceKey: `n3.${'A'.repeat(43)}`,
            name: 'Garden',
            position: 'a5',
          },
        },
        {
          table: 'product',
          id: '60000000-0000-4000-8000-0000000000d1',
          create: true,
          fields: { listId: 'x', name: 'Spade', categoryId: mine },
        },
        {
          table: 'item',
          id: '60000000-0000-4000-8000-0000000000d2',
          create: true,
          fields: { listId: 'x', position: 'a0', categoryId: mine },
        },
        {
          table: 'item',
          id: '60000000-0000-4000-8000-0000000000d3',
          create: true,
          fields: { listId: 'x', position: 'a1', categoryId: older },
        },
        {
          table: 'item',
          id: '60000000-0000-4000-8000-0000000000d4',
          create: true,
          fields: { listId: 'x', position: 'a2', categoryId: starter },
        },
      ],
    };
    const moved = remake(refused, target, null, id, new Set([older]));
    // No copy goes to the other list, and what named one names nothing (it shows under Other); a starter category is every list's and stays.
    expect(moved?.changes.some((c) => c.table === 'list_category')).toBe(false);
    expect(
      moved?.changes.map((c) => [
        c.table,
        c.fields.categoryId === undefined ? '-' : c.fields.categoryId,
      ]),
    ).toEqual([
      ['product', null],
      ['item', null],
      ['item', null],
      ['item', starter],
    ]);
  });

  it('puts several things one after another, and refuses another household’s list and what has no list', () => {
    const two: Mutation = {
      mutationId: id(),
      householdId: target.householdId,
      changes: [
        { table: 'item', id: item().id, create: true, fields: { listId: 'x', position: 'a0' } },
        {
          table: 'item',
          id: '60000000-0000-4000-8000-0000000000ff',
          create: true,
          fields: { listId: 'x', position: 'a0' },
        },
      ],
    };
    const positions = remake(two, target, null, id)?.changes.map((c) => String(c.fields.position));
    expect(positions?.[0] && positions[1] && positions[0] < positions[1]).toBe(true);
    expect(
      remake(two, { ...target, householdId: '10000000-0000-4000-8000-0000000000ff' }, null, id),
    ).toBeNull();
    expect(remake(tickItem(e(), item(), 'p') as Mutation, target, null, id)).toBeNull();
  });
});

describe('what a toast says', () => {
  it('says a tick was put back, and anything else is kept in Settings', () => {
    expect(
      refusalToast({ kind: 'tick', what: 'Ticked Milk' }, 'That is not there any more.'),
    ).toEqual({
      title: "Couldn't tick that off",
      message: 'That is not there any more. It was put back.',
    });
    expect(
      refusalToast({ kind: 'add', what: 'Added Milk' }, 'Groceries has 500 items.').message,
    ).toContain('kept in Settings');
  });
});
