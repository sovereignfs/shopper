import type { CategoryRow, InventoryRow } from '../actions/rows';
import { type InventoryEntry, layerInventory } from '../catalog/inventory';
import type { LocalDatabase } from './db';
import { inventoryOf, ownerCategoriesOf } from './store';

/**
 * **What the Inventory screen reads from the device** (DESIGN.md §16.8): the person's own group (where their Inventory and categories live), the entries (the starter catalog
 * with their rows laid over it, `layerInventory`), the rows themselves (what a change is made to), and the group's categories in aisle order, the starter ones as they named
 * them and their own. Pure of React, so it is tested with the device. `undefined` before the device has a group of the person's own.
 */
export interface InventoryData {
  readonly household: string;
  readonly entries: readonly InventoryEntry[];
  readonly rows: readonly InventoryRow[];
  readonly categories: readonly CategoryRow[];
}

export async function inventoryScreenOf(db: LocalDatabase): Promise<InventoryData | undefined> {
  const own = (await db.getAll('household')).find((each) => each.own);
  if (!own) return undefined;
  const rows = await inventoryOf(db);
  return {
    household: own.id,
    entries: layerInventory(rows),
    rows,
    categories: await ownerCategoriesOf(db, own.id),
  };
}
