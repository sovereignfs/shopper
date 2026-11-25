import type { Env } from '../actions/env';
import type { Mutation } from '../actions/format';
import type { ItemEdit } from '../actions/items';
import { type CopyKeys, ownCategoryOfListCategory } from '../keys/copies';
import type { LocalDatabase } from '../local/db';
import { inventoryContextOf, ownerCategoriesOf } from '../local/store';
import { type Learned, updateInventoryFromItem } from './remember';

/**
 * **"Remember for next time" updating the Inventory item, from what the device holds now** (DESIGN.md §8.2): the Inventory rows and the person's own categories as they are when this is
 * called, the item's category turned into the person's own category it stands for (`ownCategoryOfListCategory`; a category that stands for none of theirs is left out, and the icon and
 * unit are still taught), the planned change (`updateInventoryFromItem`) and its commit. The item's panel calls it in its own line of writes, one after another, so that the second of two quick
 * edits is planned from the first's result (an untouched starter entry gets its override, and then a change of it); the tests call the same function. Returns what was committed, or `null` when there was nothing to write.
 */
export async function rememberInInventory(
  db: LocalDatabase,
  keys: CopyKeys,
  env: Env,
  input: {
    list: { id: string; householdId: string };
    name: string;
    edit: Pick<ItemEdit, 'categoryId' | 'icon' | 'unit'>;
  },
  commit: (mutation: Mutation) => Promise<unknown>,
): Promise<Mutation | null> {
  const inventory = await inventoryContextOf(db);
  if (!inventory) return null;
  const { edit } = input;
  const learned: { -readonly [K in keyof Learned]: Learned[K] } = {};
  if (edit.icon !== undefined) learned.icon = edit.icon;
  if (edit.unit !== undefined) learned.unit = edit.unit;
  if (edit.categoryId !== undefined) {
    const own = await ownCategoryOfListCategory(db, keys, {
      list: input.list,
      categoryId: edit.categoryId,
    });
    if (own !== undefined) learned.categoryId = own;
  }
  const mutation = updateInventoryFromItem(env, {
    household: inventory.household,
    rows: inventory.rows,
    categories: await ownerCategoriesOf(db, inventory.household),
    name: input.name,
    learned,
  });
  if (!mutation) return null;
  await commit(mutation);
  return mutation;
}
