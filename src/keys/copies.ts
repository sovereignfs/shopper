import { type Env } from '../actions/env';
import type { Change } from '../actions/format';
import { moveCategory, renameCategory } from '../actions/categories';
import type { Mutation } from '../actions/format';
import { copyOnList, moveCopies, renameCopies } from '../actions/list-categories';
import type { CategoryRow, ItemRow, ListCategoryRow } from '../actions/rows';
import { categoryOfNew } from '../lists/adding';
import type { LocalDatabase } from '../local/db';
import type { InventoryEntry } from '../catalog/inventory';
import { categoriesOf, ownerCategoriesOf, productsOf } from '../local/store';
import { type Keyring, copySourceKey } from './household';

/**
 * **What a device does with a list's copies of people's categories that needs the keys** (DESIGN.md §8.3, decisions 15 to 17): make the source key of one of the person's
 * own categories on a list, find the copies of it on the lists they are Admin of (to rename them), and carry an item's category with it when the item moves to another list.
 * The actions (`src/actions/list-categories.ts`) are pure and hold no key; these are given the keys, as the page has them (`Local.keysOf`), and read the device's store.
 */
export interface CopyKeys {
  /** Whether the group has moved to device encryption: a group the server seals has no copies, and its lists offer the starter categories alone. */
  encrypted(household: string): boolean | Promise<boolean>;
  /** A list's keyring in a group, or `undefined` while the app key is locked or the list's keys are not here. */
  ringOf(household: string, list: string): Promise<Keyring | undefined>;
}

/** The source key of a category of the person's own on a list, or `undefined` where there can be none (a group not yet encrypted, keys not open). */
export async function sourceKeyOn(
  keys: CopyKeys,
  household: string,
  list: string,
  categoryId: string,
): Promise<string | undefined> {
  if (!(await keys.encrypted(household))) return undefined;
  const ring = await keys.ringOf(household, list);
  return ring ? copySourceKey(ring, list, categoryId) : undefined;
}

/**
 * **The live copies of one of the person's categories on the lists they are Admin of** (§8.3): renaming the category renames them, and no others, since a copy is changed by
 * the list's Admin. Found by making the category's source key on each such list: only the person whose category it is can make it, so only their device finds them.
 */
export async function copiesOfCategory(
  db: LocalDatabase,
  keys: CopyKeys,
  categoryId: string,
): Promise<ListCategoryRow[]> {
  const found: ListCategoryRow[] = [];
  for (const list of await db.getAll('list')) {
    if (list.deletedAt !== null) continue;
    const members = await db.getAllFromIndex('member', 'byList', list.id);
    if (!members.some((member) => member.self && member.leftAt === null && member.role === 'admin'))
      continue;
    const sourceKey = await sourceKeyOn(keys, list.householdId, list.id, categoryId);
    if (!sourceKey) continue;
    const copy = (await db.getAllFromIndex('list_category', 'byList', list.id)).find(
      (each) => each.sourceKey === sourceKey && each.deletedAt === null,
    );
    if (copy) found.push(copy);
  }
  return found;
}

/**
 * **A category renamed in Inventory, and its copies with it** (§8.3): the mutations to commit, in order: the category's own, then the copies on the lists the person is Admin of
 * (`renameCopies`, one for each group). **The same function for the screen and the tests**, so that what the tests prove is what the screen does. A starter category has no copies.
 * Asked again with the name it has, it makes the copies' changes alone, which is how a rename made while the keys were not open (when no copy can be found, `copiesOfCategory`)
 * reaches them once they are: nothing is written for a copy that has the name already.
 */
export async function renameCategoryEverywhere(
  db: LocalDatabase,
  keys: CopyKeys,
  env: Env,
  row: CategoryRow,
  name: string | null,
): Promise<Mutation[]> {
  const own = renameCategory(env, row, name);
  const copies =
    row.starterKey === null && name !== null ? await copiesOfCategory(db, keys, row.id) : [];
  return [...(own ? [own] : []), ...(name === null ? [] : renameCopies(env, copies, name))];
}

/**
 * **A category put in a new place in Inventory, and its copies on the person's own lists with it** (§8.3, the owner's decision of 2026-11-24): the category's own mutation, then one
 * for the copies in the person's own group, which take the category's position (a copy on another group's list is in an aisle order that is not theirs, and stays). A starter category
 * has no copies. Asked again with the position it has, it moves the copies alone.
 */
export async function moveCategoryEverywhere(
  db: LocalDatabase,
  keys: CopyKeys,
  env: Env,
  row: CategoryRow,
  position: string,
): Promise<Mutation[]> {
  const own = moveCategory(env, row, position);
  const copies =
    row.starterKey === null
      ? (await copiesOfCategory(db, keys, row.id)).filter(
          (copy) => copy.householdId === row.householdId,
        )
      : [];
  return [...(own ? [own] : []), ...moveCopies(env, copies, position)];
}

/**
 * What an item's move to another list takes with it: its category on the new list and the category of the product made there (each `undefined` when it needs no change),
 * and the copy to make there first, if one is needed.
 */
export interface Carry {
  readonly item: string | null | undefined;
  readonly product: string | null | undefined;
  readonly copy: Change | null;
}

/**
 * **An item's category when it moves to another list** (§8.3, decision 17), and the category of **the product the move makes there** (the server refuses either that names
 * a copy of the list it leaves): a starter category stays as it was; a copy of the list it leaves is **carried** if the person moving it holds that category (a copy of it is
 * made on the new list in the same change, or the new list's own is used), and otherwise the item takes the starter category its name guesses, or _Other_. `undefined` when
 * nothing changes. Checking whether the person holds the category is making the source key of each of theirs on the old list: the copy says only a key, and never which category.
 */
export async function carryCategoryOnMove(
  db: LocalDatabase,
  keys: CopyKeys,
  env: Env,
  input: { item: ItemRow; product?: { categoryId: string | null } | undefined; to: string },
): Promise<Carry | undefined> {
  const { item } = input;
  const made = new Map<string, { id: string; change: Change | null }>();
  let rings: [Keyring, Keyring] | undefined;
  const resolve = async (
    categoryId: string | null,
  ): Promise<{ id: string | null; change: Change | null } | undefined> => {
    if (categoryId === null) return undefined;
    const copy = await db.get('list_category', categoryId);
    // A starter category (or one this device does not know) is valid on every list of the group as it is.
    if (!copy || copy.listId !== item.listId) return undefined;
    const household = copy.householdId;
    const guess = async () => ({
      id: categoryOfNew(
        item.name,
        await productsOf(db, household),
        await categoriesOf(db, household),
      ),
      change: null,
    });
    if (!(await keys.encrypted(household))) return guess();
    if (!rings) {
      const [from, to] = [
        await keys.ringOf(household, item.listId),
        await keys.ringOf(household, input.to),
      ];
      if (!from || !to) return guess();
      rings = [from, to];
    }
    const own = (await db.getAll('household')).find((each) => each.own);
    const mine = own
      ? (await db.getAllFromIndex('category', 'byHousehold', own.id)).filter(
          (category) => category.starterKey === null && category.deletedAt === null,
        )
      : [];
    for (const category of mine) {
      if ((await copySourceKey(rings[0], item.listId, category.id)) !== copy.sourceKey) continue;
      const sourceKey = await copySourceKey(rings[1], input.to, category.id);
      // The item and its product share one copy.
      const known = made.get(sourceKey);
      if (known) return { id: known.id, change: null };
      const copies = await db.getAllFromIndex('list_category', 'byList', input.to);
      const positions = [
        ...copies.map((each) => each.position),
        ...(await categoriesOf(db, household)).map((each) => each.position),
      ];
      const plan = copyOnList(env, {
        listId: input.to,
        sourceKey,
        name: copy.name || category.name,
        copies,
        last: positions.length === 0 ? null : positions.reduce((a, b) => (a > b ? a : b)),
      });
      made.set(sourceKey, { id: plan.id, change: plan.change });
      return { id: plan.id, change: plan.change };
    }
    return guess();
  };
  const forItem = await resolve(item.categoryId);
  const forProduct = await resolve(input.product?.categoryId ?? null);
  if (!forItem && !forProduct) return undefined;
  return {
    item: forItem?.id,
    product: forProduct?.id,
    copy: [...made.values()].find((each) => each.change)?.change ?? null,
  };
}

/**
 * **An Inventory item's category on a list** (§8.3, §16.8, _Add to a list_): the category an item added from Inventory takes there, and the copy to make there first, if one is needed.
 * The entry names a row of **the person's own group** (or, for a starter entry as it is, a starter key), which is never an id to put on an item of another group's list:
 *
 *  - a **starter category** is the list's group's row for the same starter key (a hidden one is not used);
 *  - one of the person's **own** is the list's copy of it, found or made under the list's keys (`sourceKeyOn`: on their own lists too), which is `copy` for the caller to put first in
 *    the mutation; and where there can be none (a group the server still seals, keys not open) the guess, as a name nobody categorised;
 *  - a category that is hidden, deleted or not one the device knows, and an entry that has none, take the guess (`categoryOfNew`): the starter category its name says, or _Other_.
 */
export async function categoryOnList(
  db: LocalDatabase,
  keys: CopyKeys,
  env: Env,
  input: {
    entry: Pick<InventoryEntry, 'name' | 'categoryId' | 'categoryKey'>;
    list: { id: string; householdId: string };
  },
): Promise<{ id: string | null; copy: Change | null; guessed: boolean }> {
  const { entry, list } = input;
  const household = list.householdId;
  const guess = async () => ({
    guessed: true,
    id: categoryOfNew(
      entry.name,
      await productsOf(db, household),
      await categoriesOf(db, household),
    ),
    copy: null,
  });
  const own = (await db.getAll('household')).find((each) => each.own);
  const chosen =
    entry.categoryId !== null && own
      ? (await ownerCategoriesOf(db, own.id)).find((each) => each.id === entry.categoryId)
      : undefined;
  if (entry.categoryId !== null && (!chosen || chosen.hidden)) return guess();
  const starter = chosen ? chosen.starterKey : entry.categoryKey;
  if (starter !== null) {
    const there = (await categoriesOf(db, household)).find(
      (each) => each.starterKey === starter && !each.hidden,
    );
    return there ? { id: there.id, copy: null, guessed: false } : guess();
  }
  if (!chosen) return guess();
  const sourceKey = await sourceKeyOn(keys, household, list.id, chosen.id);
  if (!sourceKey) return guess();
  const copies = await db.getAllFromIndex('list_category', 'byList', list.id);
  const positions = [
    ...copies.map((each) => each.position),
    ...(await categoriesOf(db, household)).map((each) => each.position),
  ];
  const plan = copyOnList(env, {
    listId: list.id,
    sourceKey,
    name: chosen.name,
    copies,
    last: positions.length === 0 ? null : positions.reduce((a, b) => (a > b ? a : b)),
  });
  return { id: plan.id, copy: plan.change, guessed: false };
}
