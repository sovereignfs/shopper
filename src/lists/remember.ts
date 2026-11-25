import { type Env } from '../actions/env';
import type { Mutation } from '../actions/format';
import { type InventoryFields, changeEntry } from '../actions/inventory';
import type { CategoryRow, InventoryRow } from '../actions/rows';
import { entryNamed, layerInventory } from '../catalog/inventory';
import type { Unit } from '../quantity/units';

/**
 * What an item's panel teaches (its "Remember for next time", DESIGN.md §8.2, §9.4): the category, icon and unit the item now has. The category is **a category of the person's own
 * group** (`ownCategoryOfListCategory`): the list's own row or copy of it is not one Inventory can name.
 */
export interface Learned {
  readonly categoryId?: string | null;
  readonly icon?: string | null;
  readonly unit?: Unit | null;
}

/**
 * **"Remember for next time" also updates the Inventory item** (DESIGN.md §8.2), when the person asks: the item's Inventory entry, found by name as everything is (`entryNamed`: an item of
 * their own, or a starter entry renamed or not), takes the category, icon and unit the item was given, and only those that differ from what it has (a starter entry's values count, not
 * the row's). A starter entry with no row gets its override from this, as the Inventory panel's first change does (`changeEntry`). **A separate mutation, to the person's own group,** written
 * after the item's: the item may be on a list in another person's group. `null` when Inventory has no such entry, or has what the item has.
 */
export function updateInventoryFromItem(
  env: Env,
  input: {
    household: string;
    rows: readonly InventoryRow[];
    /** The person's own group's categories, to say what category an entry has (the starter's, unless it was given one). */
    categories: readonly CategoryRow[];
    name: string;
    learned: Learned;
  },
): Mutation | null {
  const { household, rows, categories, name, learned } = input;
  const entry = entryNamed(layerInventory(rows), name);
  if (!entry) return null;
  const fields: { -readonly [K in keyof InventoryFields]: InventoryFields[K] } = {};
  if (learned.icon !== undefined && learned.icon !== entry.icon) fields.icon = learned.icon;
  if (learned.unit !== undefined && learned.unit !== entry.unit) fields.unit = learned.unit;
  if (learned.categoryId !== undefined) {
    const current =
      entry.categoryId ??
      categories.find(
        (each) =>
          each.deletedAt === null &&
          each.starterKey !== null &&
          each.starterKey === entry.categoryKey,
      )?.id ??
      null;
    if (learned.categoryId !== current) fields.categoryId = learned.categoryId;
  }
  if (Object.keys(fields).length === 0) return null;
  return changeEntry(env, household, rows, entry, fields);
}
