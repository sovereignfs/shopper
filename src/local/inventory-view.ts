import type { CategoryRow, InventoryRow } from '../actions/rows';
import { type InventoryEntry, layerInventory } from '../catalog/inventory';
import type { LocalDatabase } from './db';
import { landingListOf } from './listview';
import { placesOf } from './places';
import { inventoryOf, ownerCategoriesOf } from './store';

/** A list an item can be added to from Inventory: one the person is on, not archived, with whose it is said when someone else shared it. */
export interface AddTarget {
  readonly id: string;
  readonly name: string;
  readonly by: string | null;
}

/**
 * **What the Inventory screen reads from the device** (DESIGN.md §16.8): the person's own group (where their Inventory and categories live), the entries (the starter catalog
 * with their rows laid over it, `layerInventory`), the rows themselves (what a change is made to), and the group's categories in aisle order, the starter ones as they named
 * them and their own. Pure of React, so it is tested with the device. `undefined` before the device has a group of the person's own.
 */
export interface InventoryData {
  readonly household: string;
  /** The lists an item can be added to, the person's own first, as the sidebar has them. */
  readonly lists: readonly AddTarget[];
  /** The list used last, which _Add to a list_ offers first, if it is one of them. */
  readonly landing: string | null;
  readonly entries: readonly InventoryEntry[];
  readonly rows: readonly InventoryRow[];
  readonly categories: readonly CategoryRow[];
}

export async function inventoryScreenOf(db: LocalDatabase): Promise<InventoryData | undefined> {
  const own = (await db.getAll('household')).find((each) => each.own);
  if (!own) return undefined;
  const rows = await inventoryOf(db);
  const lists = (await placesOf(db)).flatMap((place) =>
    place.lists.map(({ list, by }) => ({ id: list.id, name: list.name, by })),
  );
  const landing = (await landingListOf(db)) ?? null;
  return {
    household: own.id,
    lists,
    landing: lists.some((each) => each.id === landing) ? landing : null,
    entries: layerInventory(rows),
    rows,
    categories: await ownerCategoriesOf(db, own.id),
  };
}
