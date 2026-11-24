import { type Env } from '../actions/env';
import type { Change } from '../actions/format';
import { copyOnList } from '../actions/list-categories';
import type { ItemRow, ListCategoryRow } from '../actions/rows';
import { categoryOfNew } from '../lists/adding';
import type { LocalDatabase } from '../local/db';
import { categoriesOf, productsOf } from '../local/store';
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
