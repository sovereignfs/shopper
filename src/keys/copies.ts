import { type Env } from '../actions/env';
import type { Change } from '../actions/format';
import { moveCategory, renameCategory } from '../actions/categories';
import type { Mutation } from '../actions/format';
import { copyOnList, moveCopies, renameCopies } from '../actions/list-categories';
import type { CategoryRow, ItemRow, ListCategoryRow } from '../actions/rows';
import { OTHER } from '../catalog/categories';
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
  /**
   * Resolves when a list's keys are open, or when the device has waited as long as it will (a page's keys open a moment after the page, and a change made in that moment would find
   * no copy and leave them as they were). Absent where the keys are as they are (the tests'): nothing is waited for.
   */
  ready?(household: string, list: string): Promise<void>;
}

/**
 * The keys a screen gives the copies' functions, from the page's own (`Local.keysOf`): one place, so that the item's panel, Inventory's panel and the Categories tab ask the same way and
 * wait the same bounded time for a list's keys to open (`patience`, in milliseconds). A locked key is not waited for for ever: the change is made, and finds no copy.
 */
export function copyKeysOf(
  keysOf: (
    household: string,
    list?: string,
  ) => Promise<{ encrypted: boolean; ring: Keyring | undefined }>,
  patience = 2000,
): CopyKeys {
  return {
    encrypted: async (household) => (await keysOf(household)).encrypted,
    ringOf: async (household, list) => (await keysOf(household, list)).ring,
    ready: async (household, list) => {
      const until = Date.now() + patience;
      while (Date.now() < until && !(await keysOf(household, list)).ring)
        await new Promise((resolve) => setTimeout(resolve, 100));
    },
  };
}

/** The source key of a category of the person's own on a list, or `undefined` where there can be none (a group not yet encrypted, keys not open). */
export async function sourceKeyOn(
  keys: CopyKeys,
  household: string,
  list: string,
  categoryId: string,
): Promise<string | undefined> {
  if (!(await keys.encrypted(household))) return undefined;
  await keys.ready?.(household, list);
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
 * **A category renamed in Inventory, and its copies with it** (§8.3): the category's own change is committed first, **at once**, then the copies on the lists the person is Admin of
 * are found (after the keys have had a moment to open, `CopyKeys.ready`) and renamed (`renameCopies`, one mutation for each group). **The same function for the screen and the
 * tests**, so that what the tests prove is what the screen does; `commit` is what writes (the device's `commit`), and it returns what it committed, in order. A starter category has no
 * copies. Asked again with the name it has, it makes the copies' changes alone, which is how a rename made while the keys were locked (when no copy can be found,
 * `copiesOfCategory`) reaches them once they are open: nothing is written for a copy that has the name already.
 */
export async function renameCategoryEverywhere(
  db: LocalDatabase,
  keys: CopyKeys,
  env: Env,
  row: CategoryRow,
  name: string | null,
  commit: (mutation: Mutation) => Promise<unknown>,
): Promise<Mutation[]> {
  const done: Mutation[] = [];
  const write = async (mutation: Mutation) => {
    await commit(mutation);
    done.push(mutation);
  };
  const own = renameCategory(env, row, name);
  if (own) await write(own);
  if (row.starterKey !== null || name === null) return done;
  for (const mutation of renameCopies(env, await copiesOfCategory(db, keys, row.id), name))
    await write(mutation);
  return done;
}

/**
 * **A category put in a new place in Inventory, and its copies on the person's own lists with it** (§8.3, the owner's decision of 2026-11-24): the category's own change is committed
 * first, at once, then one mutation for the copies in the person's own group, which take the category's position (a copy on another group's list is in an aisle order that is not
 * theirs, and stays). A starter category has no copies. Asked again with the position it has, it moves the copies alone. A copy made afterwards is where the category is
 * (`categoryOnList`, `carryCategoryOnMove`).
 */
export async function moveCategoryEverywhere(
  db: LocalDatabase,
  keys: CopyKeys,
  env: Env,
  row: CategoryRow,
  position: string,
  commit: (mutation: Mutation) => Promise<unknown>,
): Promise<Mutation[]> {
  const done: Mutation[] = [];
  const write = async (mutation: Mutation) => {
    await commit(mutation);
    done.push(mutation);
  };
  const own = moveCategory(env, row, position);
  if (own) await write(own);
  if (row.starterKey !== null) return done;
  const copies = (await copiesOfCategory(db, keys, row.id)).filter(
    (copy) => copy.householdId === row.householdId,
  );
  for (const mutation of moveCopies(env, copies, position)) await write(mutation);
  return done;
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
      await keys.ready?.(household, item.listId);
      await keys.ready?.(household, input.to);
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
        // In the person's own group the copy is where the category is (§8.3, the owner's decision of 2026-11-24); in another's, last.
        ...(own?.id === household ? { position: category.position } : {}),
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
    // In the person's own group the copy is where the category is, so that a category put first in Inventory is first on a list that gets its copy later (§8.3, the owner's decision
    // of 2026-11-24); in another person's group it is last, since the place is a key in an aisle order that is not the person's.
    ...(own?.id === household ? { position: chosen.position } : {}),
  });
  return { id: plan.id, copy: plan.change, guessed: false };
}

/**
 * **The category of the person's own group that a list's category stands for** (DESIGN.md §8.2: "Remember for next time" also updates the Inventory item): an item's category is a row of the
 * list's group or a list's copy of one, neither of which is a category Inventory can name. A **starter** category is the person's own group's row for the same starter key; a **copy** is the
 * category of theirs whose source key it carries (only the person whose category it is can make that key, `copySourceKey`, so a copy of someone else's finds none); no category is _Other_.
 * `undefined` where there is none: a hidden or deleted category, a copy of another's, keys that are not open (waited for once, `CopyKeys.ready`, and then not held up).
 */
export async function ownCategoryOfListCategory(
  db: LocalDatabase,
  keys: CopyKeys,
  input: { list: { id: string; householdId: string }; categoryId: string | null },
): Promise<string | undefined> {
  const own = (await db.getAll('household')).find((each) => each.own);
  if (!own) return undefined;
  const mine = (await ownerCategoriesOf(db, own.id)).filter(
    (each) => each.deletedAt === null && !each.hidden,
  );
  if (input.categoryId === null) return mine.find((each) => each.starterKey === OTHER)?.id;
  const starter = (await categoriesOf(db, input.list.householdId)).find(
    (each) => each.id === input.categoryId,
  );
  if (starter?.starterKey) {
    const key = starter.starterKey;
    return mine.find((each) => each.starterKey === key)?.id;
  }
  const copy = (await db.getAllFromIndex('list_category', 'byList', input.list.id)).find(
    (each) => each.id === input.categoryId && each.deletedAt === null,
  );
  if (!copy || !(await keys.encrypted(input.list.householdId))) return undefined;
  await keys.ready?.(input.list.householdId, input.list.id);
  const ring = await keys.ringOf(input.list.householdId, input.list.id);
  if (!ring) return undefined;
  for (const each of mine) {
    if (each.starterKey !== null) continue;
    if ((await copySourceKey(ring, input.list.id, each.id)) === copy.sourceKey) return each.id;
  }
  return undefined;
}
