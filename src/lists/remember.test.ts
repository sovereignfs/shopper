import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Change, Mutation } from '../actions/format';
import type { CategoryRow, InventoryRow } from '../actions/rows';
import { env } from '../actions/test-support';
import { layerInventory } from '../catalog/inventory';
import { type Learned, updateInventoryFromItem } from './remember';

/**
 * **"Remember for next time" updating the Inventory item** (DESIGN.md §8.2, task 23.5): the item's Inventory entry takes the category, icon and unit the item was given, and only those that
 * differ from what the entry has; a starter entry with no row gets its override from it; the mutation is for the person's own group.
 */
const OWN = '50000000-0000-4000-8000-0000000000cc';
let n = 0;
const row = (over: Partial<InventoryRow>): InventoryRow => ({
  id: `80000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  householdId: OWN,
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
const category = (
  id: string,
  starterKey: string | null,
  over: Partial<CategoryRow> = {},
): CategoryRow => ({
  id,
  householdId: OWN,
  starterKey,
  name: starterKey ?? id,
  icon: null,
  position: 'a0',
  hidden: false,
  deletedAt: null,
  seq: 1,
  ...over,
});
const PRODUCE = category('c0000000-0000-4000-8000-000000000001', 'produce');
const DAIRY = category('c0000000-0000-4000-8000-000000000002', 'dairy-eggs');
const OTHER = category('c0000000-0000-4000-8000-000000000003', 'other');
const GARDEN = category('c0000000-0000-4000-8000-000000000004', null);
const categories = [PRODUCE, DAIRY, OTHER, GARDEN];

const update = (rows: InventoryRow[], name: string, learned: Learned) =>
  updateInventoryFromItem(env(), { household: OWN, rows, categories, name, learned });
const only = (mutation: Mutation | null): Change => {
  const change = mutation?.changes[0];
  if (!mutation || !change || mutation.changes.length !== 1) throw new Error('expected one change');
  return change;
};

describe('an Inventory item updated from an item (DESIGN.md §8.2)', () => {
  it('gives a starter entry with no row its override, by its key, with what the item was given, in the person’s own group', () => {
    const mutation = update([], 'Banana', { categoryId: DAIRY.id, icon: 'cookie', unit: 'pack' });
    expect(mutation?.householdId).toBe(OWN);
    expect(only(mutation)).toMatchObject({
      table: 'inventory_item',
      create: true,
      fields: { starterKey: 'banana', categoryId: DAIRY.id, icon: 'cookie', unit: 'pack' },
    });
  });

  it('writes only what differs from what the entry has: the starter’s own values count, and so does a category it has by the starter', () => {
    // Banana is a starter entry in Produce, with the banana icon and the unit pcs.
    expect(
      update([], 'Banana', { categoryId: PRODUCE.id, icon: 'banana', unit: 'pcs' }),
    ).toBeNull();
    expect(
      only(update([], 'Banana', { categoryId: PRODUCE.id, icon: 'cookie', unit: 'pcs' })).fields,
    ).toEqual(expect.objectContaining({ icon: 'cookie' }));
    const fields = only(
      update([], 'Banana', { categoryId: PRODUCE.id, icon: 'cookie', unit: 'pcs' }),
    ).fields;
    expect(fields).not.toHaveProperty('categoryId');
    expect(fields).not.toHaveProperty('unit');
  });

  it('changes the row it has, and only the fields that differ', () => {
    const own = row({ name: 'Spade', categoryId: GARDEN.id, icon: 'cookie', unit: 'pcs' });
    expect(
      update([own], 'spade', { categoryId: GARDEN.id, icon: 'cookie', unit: 'pcs' }),
    ).toBeNull();
    const change = only(update([own], 'spade', { categoryId: DAIRY.id, unit: 'pcs' }));
    expect(change).toMatchObject({
      table: 'inventory_item',
      id: own.id,
      fields: { categoryId: DAIRY.id },
    });
    expect(change.create).toBeUndefined();
    expect(Object.keys(change.fields)).toEqual(['categoryId']);
    // A starter entry with a row of its own is changed on that row, not given a second.
    const override = row({ starterKey: 'banana', recurring: true });
    const changed = only(update([override], 'Banana', { icon: 'cookie' }));
    expect(changed).toMatchObject({ id: override.id, fields: { icon: 'cookie' } });
    expect(changed.create).toBeUndefined();
  });

  it('finds the entry by name as everything does: its name now, the name a starter entry had, an alias; and no entry is no update', () => {
    const renamed = row({ starterKey: 'courgette', name: 'Zucchini squash' });
    for (const name of ['Zucchini squash', 'Courgette', 'zucchini'])
      expect(only(update([renamed], name, { icon: 'cookie' })).id).toBe(renamed.id);
    expect(update([], 'Zorblax', { icon: 'cookie' })).toBeNull();
    // A deleted item is not there.
    expect(update([row({ name: 'Gone', deletedAt: 5 })], 'Gone', { icon: 'cookie' })).toBeNull();
  });

  it('gives what the item was cleared of to an item of their own, and makes nothing of it for a starter entry, whose value it then is', () => {
    const own = row({ name: 'Spade', icon: 'cookie', unit: 'pcs' });
    expect(only(update([own], 'Spade', { icon: null, unit: null })).fields).toEqual({
      icon: null,
      unit: null,
    });
    expect(update([], 'Banana', { icon: null, unit: null })).toBeNull();
  });

  it('says Other for an item with no category, and leaves a category alone when none was given', () => {
    const own = row({ name: 'Spade', categoryId: GARDEN.id });
    expect(only(update([own], 'Spade', { categoryId: OTHER.id })).fields).toEqual({
      categoryId: OTHER.id,
    });
    expect(update([own], 'Spade', {})).toBeNull();
    expect(update([own], 'Spade', { icon: undefined })).toBeNull();
  });

  it('property: what it writes, applied, leaves nothing more to write, and never touches a field it was not given', () => {
    const apply = (rows: InventoryRow[], mutation: Mutation): InventoryRow[] => {
      const next = [...rows];
      for (const change of mutation.changes) {
        const at = next.findIndex((each) => each.id === change.id);
        if (change.create)
          next.push(row({ id: change.id, ...(change.fields as Partial<InventoryRow>) }));
        else {
          const found = next[at];
          if (found) next[at] = { ...found, ...(change.fields as Partial<InventoryRow>) };
        }
      }
      return next;
    };
    const iconArb = fc.constantFrom(undefined, null, 'cookie', 'banana', 'milk');
    const unitArb = fc.constantFrom(undefined, null, 'pcs', 'pack', 'L');
    const categoryArb = fc.constantFrom(undefined, PRODUCE.id, DAIRY.id, OTHER.id, GARDEN.id);
    const startArb = fc.constantFrom<InventoryRow[]>(
      [],
      [row({ starterKey: 'banana', recurring: true })],
      [row({ name: 'Spade', icon: 'cookie', categoryId: GARDEN.id })],
    );
    fc.assert(
      fc.property(startArb, iconArb, unitArb, categoryArb, (rows, icon, unit, categoryId) => {
        const name = rows[0]?.name ?? 'Banana';
        const learned: Learned = {
          ...(icon !== undefined ? { icon } : {}),
          ...(unit !== undefined ? { unit: unit as Learned['unit'] } : {}),
          ...(categoryId !== undefined ? { categoryId } : {}),
        };
        const mutation = update(rows, name, learned);
        if (!mutation) return;
        const written = Object.keys(mutation.changes[0]?.fields ?? {});
        for (const field of ['icon', 'unit', 'categoryId'] as const)
          if (learned[field] === undefined) expect(written).not.toContain(field);
        // Written, it is what Inventory says now, so there is nothing more to say. A starter entry cleared of a value is the starter's, which `layerInventory` shows.
        const after = apply(rows, mutation);
        const entry = layerInventory(after).find(
          (each) => each.key === (rows[0]?.name ? `own:${rows[0].id}` : 'starter:banana'),
        );
        if (learned.icon !== undefined && learned.icon !== null)
          expect(entry?.icon).toBe(learned.icon);
        expect(update(after, name, learned)).toBeNull();
      }),
      { numRuns: 200 },
    );
  });
});
