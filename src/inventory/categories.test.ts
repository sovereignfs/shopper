import { describe, expect, it } from 'vitest';
import type { CategoryRow, InventoryRow } from '../actions/rows';
import { between } from '../actions/position';
import { OTHER, STARTER_CATEGORIES, STARTER_POSITIONS } from '../catalog/categories';
import { layerInventory } from '../catalog/inventory';
import { lastPosition, linesOf, nameTaken } from './categories';

/** What the Categories tab shows (DESIGN.md §16.8, §8.3): the aisle order, with what can be done to each and how many items are under it. */
const GROUP = '10000000-0000-4000-8000-000000000001';
const starter: CategoryRow[] = STARTER_CATEGORIES.map((each, index) => ({
  id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  householdId: GROUP,
  starterKey: each.key,
  name: each.name,
  icon: each.icon,
  position: STARTER_POSITIONS[index] ?? 'a0',
  hidden: false,
  deletedAt: null,
  seq: 1,
}));
const GARDEN: CategoryRow = {
  id: '20000000-0000-4000-8000-0000000000aa',
  householdId: GROUP,
  starterKey: null,
  name: 'Garden',
  icon: null,
  // Between Produce and Bakery, the first two.
  position: between(STARTER_POSITIONS[0] ?? null, STARTER_POSITIONS[1] ?? null),
  hidden: false,
  deletedAt: null,
  seq: 1,
};
const rowOf = (over: Partial<InventoryRow>): InventoryRow => ({
  id: crypto.randomUUID(),
  householdId: GROUP,
  starterKey: null,
  name: null,
  note: null,
  categoryId: null,
  icon: null,
  unit: null,
  quantity: null,
  recurring: false,
  hidden: false,
  deletedAt: null,
  createdAt: 1,
  seq: 1,
  ...over,
});
const lineOf = (lines: ReturnType<typeof linesOf>, name: string) => {
  const found = lines.find((each) => each.category.name === name);
  if (!found) throw new Error(`no line ${name}`);
  return found;
};

describe('the lines of the Categories tab', () => {
  it('are in the aisle order, the person’s own among the starter ones where their position puts them, hidden ones too, a deleted one not', () => {
    const hidden = starter.map((each) =>
      each.starterKey === 'bakery' ? { ...each, hidden: true } : each,
    );
    const deleted = {
      ...GARDEN,
      id: '20000000-0000-4000-8000-0000000000bb',
      name: 'Old',
      deletedAt: 5,
    };
    const lines = linesOf([GARDEN, deleted, ...hidden].reverse(), []);
    const order = lines.map((each) => each.category.name);
    expect(order.slice(0, 3)).toEqual(['Produce', 'Garden', 'Bakery']);
    expect(order).not.toContain('Old');
    expect(lineOf(lines, 'Bakery').category.hidden).toBe(true);
    expect(order).toHaveLength(starter.length + 1);
  });

  it('say what can be done: a starter category is not deleted, Other is not hidden, one of the person’s own is deleted too', () => {
    const lines = linesOf([...starter, GARDEN], []);
    expect(lineOf(lines, 'Produce')).toMatchObject({ canHide: true, canDelete: false });
    expect(lines.find((each) => each.category.starterKey === OTHER)).toMatchObject({
      canHide: false,
      canDelete: false,
    });
    expect(lineOf(lines, 'Garden')).toMatchObject({ canHide: true, canDelete: true });
  });

  it('draw the icon it has, else the starter’s, else the default, and say a starter category has been given a name', () => {
    const renamed = starter.map((each) =>
      each.starterKey === 'dairy-eggs' ? { ...each, name: 'Milk and eggs', icon: null } : each,
    );
    const lines = linesOf([...renamed, { ...GARDEN, icon: 'carrot' }], []);
    expect(lineOf(lines, 'Garden').icon).toBe('carrot');
    expect(lineOf(lines, 'Milk and eggs')).toMatchObject({ icon: 'milk', renamed: true });
    expect(lineOf(lines, 'Produce').renamed).toBe(false);
    expect(lineOf(linesOf([{ ...GARDEN, icon: 'not-an-icon' }], []), 'Garden').icon).toBe(
      'shopping-basket',
    );
  });

  it('count the items of Inventory under each, those whose category is hidden under Other', () => {
    const entries = layerInventory([
      rowOf({ name: 'Spade', categoryId: GARDEN.id }),
      rowOf({ name: 'Rake', categoryId: GARDEN.id }),
    ]);
    const lines = linesOf([...starter, GARDEN], entries);
    expect(lineOf(lines, 'Garden').count).toBe(2);
    const other = lines.find((each) => each.category.starterKey === OTHER)?.count ?? 0;
    const hiddenGarden = linesOf([...starter, { ...GARDEN, hidden: true }], entries);
    expect(lineOf(hiddenGarden, 'Garden').count).toBe(0);
    expect(hiddenGarden.find((each) => each.category.starterKey === OTHER)?.count).toBe(other + 2);
  });
});

describe('a name taken, and the last place', () => {
  it('is a name another live category has, by what a person would call the same, and never the category itself', () => {
    const all = [...starter, GARDEN];
    expect(nameTaken(all, 'garden')).toBe(true);
    expect(nameTaken(all, '  GARDEN ')).toBe(true);
    expect(nameTaken(all, 'Garden', GARDEN.id)).toBe(false);
    expect(nameTaken(all, 'Yard')).toBe(false);
    expect(nameTaken([{ ...GARDEN, deletedAt: 3 }], 'Garden')).toBe(false);
  });

  it('is the largest position of a live category, or none', () => {
    expect(lastPosition([])).toBeNull();
    expect(
      lastPosition([
        GARDEN,
        { ...GARDEN, id: 'b', position: 'zz' },
        { ...GARDEN, id: 'c', position: 'zzz', deletedAt: 1 },
      ]),
    ).toBe('zz');
  });
});
