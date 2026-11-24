import { describe, expect, it } from 'vitest';
import type { CategoryRow, InventoryRow } from '../actions/rows';
import { STARTER_CATEGORIES, STARTER_POSITIONS } from '../catalog/categories';
import { type InventoryEntry, layerInventory } from '../catalog/inventory';
import { NO_FILTERS, type InventoryFilters, categoryOfEntry, matches, sectionsOf } from './screen';

/** What the Inventory screen shows (DESIGN.md §16.8): grouped by category in the aisle order, searchable and filtered, an entry under Other when its category is gone. */
const GROUP = '10000000-0000-4000-8000-000000000001';
const categories: CategoryRow[] = STARTER_CATEGORIES.map((each, index) => ({
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
const starterRow = (key: string) => {
  const found = categories.find((each) => each.starterKey === key);
  if (!found) throw new Error(`no category ${key}`);
  return found;
};
const HARDWARE: CategoryRow = {
  id: '20000000-0000-4000-8000-0000000000aa',
  householdId: GROUP,
  starterKey: null,
  name: 'Hardware',
  icon: null,
  position: 'zz',
  hidden: false,
  deletedAt: null,
  seq: 1,
};
const row = (over: Partial<InventoryRow>): InventoryRow => ({
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
const entries = (rows: InventoryRow[]) => layerInventory(rows);
const names = (found: readonly InventoryEntry[]) => found.map((each) => each.name);
const all = (rows: InventoryRow[], filters: Partial<InventoryFilters> = {}, cats = categories) =>
  sectionsOf(entries(rows), cats, { ...NO_FILTERS, ...filters });

describe('which category an entry is shown under', () => {
  it('is the person’s own choice, else the starter entry’s by its key, else Other', () => {
    const layered = entries([
      row({ name: 'Claw hammer', categoryId: HARDWARE.id }),
      row({ starterKey: 'bread' }),
      row({ name: 'Mystery thing' }),
    ]);
    const find = (name: string) => layered.find((each) => each.name === name) as InventoryEntry;
    const [mine, bread, odd] = [find('Claw hammer'), find('Bread'), find('Mystery thing')];
    const cats = [...categories, HARDWARE];
    expect(categoryOfEntry(mine, cats)?.name).toBe('Hardware');
    expect(categoryOfEntry(bread, cats)?.starterKey).toBe('bakery');
    expect(categoryOfEntry(odd, cats)?.starterKey).toBe('other');
  });

  it('is Other for a category that is hidden or deleted, until the entry is moved', () => {
    const entry = entries([row({ name: 'Claw hammer', categoryId: HARDWARE.id })]).find(
      (each) => each.name === 'Claw hammer',
    ) as InventoryEntry;
    for (const gone of [{ hidden: true }, { deletedAt: 5 }])
      expect(categoryOfEntry(entry, [...categories, { ...HARDWARE, ...gone }])?.starterKey).toBe(
        'other',
      );
  });
});

describe('searching', () => {
  it('finds an entry by its name, a starter entry by the name it had when it was renamed, and by an alias, whatever the capitals and spaces', () => {
    const [sourdough] = entries([row({ starterKey: 'bread', name: 'Sourdough' })]).filter(
      (each) => each.starterKey === 'bread',
    );
    expect(matches(sourdough as InventoryEntry, 'sour')).toBe(true);
    expect(matches(sourdough as InventoryEntry, '  BREAD ')).toBe(true);
    expect(matches(sourdough as InventoryEntry, 'milk')).toBe(false);
    const withAlias = entries([]).find((each) => each.aliases.length > 0) as InventoryEntry;
    expect(matches(withAlias, `${withAlias.aliases[0]?.toUpperCase()}`)).toBe(true);
    expect(matches(withAlias, '')).toBe(true);
  });
});

describe('the screen’s sections', () => {
  it('group every entry by category in the aisle order, the person’s own after the starter ones where it is placed, each in name order, and leave out what is empty', () => {
    const rows = [
      row({ name: 'Good bin bags', categoryId: starterRow('household').id }),
      row({ name: 'Claw hammer', categoryId: HARDWARE.id }),
    ];
    const sections = all(rows, {}, [...categories, HARDWARE]);
    const keys = sections.map((section) => section.category.starterKey ?? section.category.name);
    // The starter order, with Hardware where its position puts it, and nothing that has no entry in it.
    expect(keys.indexOf('produce')).toBeLessThan(keys.indexOf('bakery'));
    expect(keys.indexOf('household')).toBeLessThan(keys.indexOf('Hardware'));
    expect(sections.every((section) => section.entries.length > 0)).toBe(true);
    const household = sections.find((section) => section.category.starterKey === 'household');
    expect(names(household?.entries ?? [])).toContain('Good bin bags');
    for (const section of sections) {
      const sorted = [...section.entries].sort((a, b) => a.name.localeCompare(b.name));
      expect(section.entries).toEqual(sorted);
    }
  });

  it('are filtered by category, recurring or once, and mine, starter or hidden, and by what was typed', () => {
    const rows = [
      row({ name: 'Good bin bags', recurring: true, categoryId: starterRow('household').id }),
      row({ name: 'Claw hammer', categoryId: HARDWARE.id }),
      row({ starterKey: 'bread', recurring: true }),
      row({ starterKey: 'apple', hidden: true }),
    ];
    const cats = [...categories, HARDWARE];
    const flat = (filters: Partial<InventoryFilters>) =>
      all(rows, filters, cats).flatMap((section) => names(section.entries));
    expect(flat({ category: HARDWARE.id })).toEqual(['Claw hammer']);
    expect(flat({ kind: 'recurring' }).sort()).toEqual(['Bread', 'Good bin bags']);
    expect(flat({ kind: 'once' })).toContain('Claw hammer');
    expect(flat({ kind: 'once' })).not.toContain('Bread');
    expect(flat({ source: 'mine' }).sort()).toEqual(['Claw hammer', 'Good bin bags']);
    expect(flat({ source: 'starter' })).toContain('Bread');
    expect(flat({ source: 'starter' })).not.toContain('Claw hammer');
    expect(flat({ source: 'hidden' })).toEqual(['Apple']);
    expect(flat({ query: 'hammer' })).toEqual(['Claw hammer']);
    // Together: the person's own recurring items.
    expect(flat({ source: 'mine', kind: 'recurring' })).toEqual(['Good bin bags']);
    // All shows a hidden entry too, so that it can be shown again.
    expect(flat({})).toContain('Apple');
  });
});
