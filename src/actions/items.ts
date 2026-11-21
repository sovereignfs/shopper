import { addQuantity, isQuantity } from '../quantity/decimal';
import { stepFor, type Unit } from '../quantity/units';
import { canonicalName } from '../catalog/canonical';
import { type Env, changed } from './env';
import type { Change, Mutation } from './format';
import { after } from './position';
import { type ItemRow, type ListRow, type ProductRow, itemState } from './rows';

/**
 * **The actions on items** (DESIGN.md §9, §12.2): each a pure function from an intent and the rows it needs to a mutation, or to `null` when there is
 * nothing to say (an action that would change nothing sends nothing). Nothing here reads a store, a clock or a random source.
 */

export interface AddItem {
  readonly list: ListRow;
  /** The household's product for this name, if the device found one by the normalised name (`src/catalog/name.ts`); otherwise one is made. */
  readonly product?: ProductRow | undefined;
  readonly name: string;
  readonly quantity?: string | undefined;
  readonly unit?: Unit | null | undefined;
  readonly note?: string | null | undefined;
  readonly categoryId?: string | null | undefined;
  readonly icon?: string | null | undefined;
  /** The position of the last item of its category on the list, so that this goes after it; `null` if there is none. */
  readonly last: string | null;
  /** The person adding it. */
  readonly by: string;
  /** "Add another anyway": a second row for what is already open, when it really is two (two brands, with notes). */
  readonly anyway?: boolean | undefined;
}

/**
 * Adds an item to a list. **It comes with what the product remembers** (its default quantity and unit, its category and icon) unless the caller says
 * otherwise, and with the name as typed. If there is no product for the name one is made in the same mutation, with what was given, so that the next add
 * of it comes right. Adding what is already open on the list is not this: that is `addToOpen`, which bumps the quantity (§9.3).
 */
export function addItem(env: Env, input: AddItem): Mutation {
  const { list, product } = input;
  const productId = product?.id ?? env.newId();
  const quantity = input.quantity ?? product?.defaultQuantity ?? '1';
  const unit = input.unit === undefined ? (product?.defaultUnit ?? null) : input.unit;
  const categoryId =
    input.categoryId === undefined ? (product?.categoryId ?? null) : input.categoryId;
  const icon = input.icon === undefined ? (product?.icon ?? null) : input.icon;
  const changes: Change[] = [];
  if (product) {
    changes.push({ table: 'product', id: product.id, fields: { lastAddedAt: env.now } });
  } else {
    changes.push({
      table: 'product',
      id: productId,
      create: true,
      fields: {
        // The list whose catalog it joins (RFC 0004, 21.3).
        listId: list.id,
        name: input.name,
        note: input.note ?? null,
        categoryId,
        icon,
        defaultQuantity: quantity,
        defaultUnit: unit,
        lastAddedAt: env.now,
        createdAt: env.now,
      },
    });
  }
  changes.push({
    table: 'item',
    id: env.newId(),
    create: true,
    ...(input.anyway ? { separate: true as const } : {}),
    fields: {
      listId: list.id,
      productId,
      name: input.name,
      note: input.note ?? null,
      quantity,
      unit,
      categoryId,
      icon,
      position: after(input.last),
      addedBy: input.by,
      addedAt: env.now,
    },
  });
  return { mutationId: env.newId(), householdId: list.householdId, changes };
}

/**
 * Adds one more of what is already open on the list: the quantity goes up by the step (`stepFor`: one for a counted unit, the product's last quantity for a
 * measured one). `null` if the sum would pass the largest quantity, which the caller says in a sentence.
 */
export function addToOpen(env: Env, item: ItemRow, product?: ProductRow): Mutation | null {
  const sum = addQuantity(
    item.quantity,
    stepFor(item.unit, product?.defaultQuantity ?? item.quantity),
  );
  if (sum === undefined) return null;
  return editItem(env, item, { quantity: sum });
}

export interface ItemEdit {
  readonly name?: string;
  readonly quantity?: string;
  readonly unit?: Unit | null;
  readonly categoryId?: string | null;
  readonly icon?: string | null;
  readonly note?: string | null;
  /** Another list of the same household. */
  readonly listId?: string;
}

/**
 * Changes fields of an item, sending **only those that differ**. With `remember` (the dialog's "Remember for next time", on by default, §9.4) the
 * product learns the category, icon and unit the item now has, in the same mutation, so the next add comes right.
 */
export function editItem(
  env: Env,
  item: ItemRow,
  edit: ItemEdit,
  remember?: { product: ProductRow },
  /** What a move to another list needs: the item's product, and the products the device holds, to find the one of the name on the other list. */
  catalog?: { product: ProductRow | undefined; products: readonly ProductRow[] },
): Mutation | null {
  if (edit.quantity !== undefined && !isQuantity(edit.quantity)) return null;
  const fields = changed(item, edit);
  const changes: Change[] = [];
  const moving = edit.listId !== undefined && edit.listId !== item.listId;
  if (moving && edit.listId) {
    // **An item's product is on the item's list** (RFC 0004, 21.3): moved, it takes the product of its name on the other list, or one made there with
    // what this one remembers. Its name and note go again, so that they are encrypted for the other list's keys (21.4).
    const product = catalog?.product;
    const wanted = canonicalName(product?.name ?? item.name);
    const there = catalog?.products.find(
      (each) =>
        each.listId === edit.listId &&
        each.deletedAt === null &&
        canonicalName(each.name) === wanted,
    );
    const productId = there?.id ?? env.newId();
    if (!there)
      changes.push({
        table: 'product',
        id: productId,
        create: true,
        fields: {
          listId: edit.listId,
          name: product?.name ?? item.name,
          note: null,
          categoryId: product?.categoryId ?? item.categoryId,
          icon: product?.icon ?? item.icon,
          defaultQuantity: product?.defaultQuantity ?? item.quantity,
          defaultUnit: product?.defaultUnit ?? item.unit,
          lastAddedAt: env.now,
          createdAt: env.now,
        },
      });
    fields.productId = productId;
    fields.name = edit.name ?? item.name;
    fields.note = edit.note === undefined ? item.note : edit.note;
  }
  if (Object.keys(fields).length > 0) changes.push({ table: 'item', id: item.id, fields });
  if (remember && !moving) {
    const learned = changed(remember.product, {
      categoryId: edit.categoryId,
      icon: edit.icon,
      defaultUnit: edit.unit,
    });
    if (Object.keys(learned).length > 0)
      changes.push({ table: 'product', id: remember.product.id, fields: learned });
  }
  if (changes.length === 0) return null;
  return { mutationId: env.newId(), householdId: item.householdId, changes };
}

/**
 * Ticks an item: bought, now, by this person. **The first tick stands** (DESIGN.md §12.4): ticking one that is already bought, cleared or deleted says
 * nothing, and the server folds a second tick that arrives from a device that did not know.
 */
export function tickItem(env: Env, item: ItemRow, by: string): Mutation | null {
  if (itemState(item) !== 'open') return null;
  return one(env, item, { boughtAt: env.now, boughtBy: by });
}

/** Unticks a bought item: open again. */
export function untickItem(env: Env, item: ItemRow): Mutation | null {
  if (itemState(item) !== 'bought') return null;
  return one(env, item, { boughtAt: null, boughtBy: null });
}

/** Deletes an item at once, with _Undo_ in a toast: it is kept as deleted until pruned (DESIGN.md §9.4, §12.9). */
export function deleteItem(env: Env, item: ItemRow): Mutation | null {
  return item.deletedAt === null ? one(env, item, { deletedAt: env.now }) : null;
}

/** Restores a deleted item: the undo of a delete, and what an edit of a deleted row does (§12.4). */
export function restoreItem(env: Env, item: ItemRow): Mutation | null {
  return item.deletedAt !== null ? one(env, item, { deletedAt: null }) : null;
}

/** Moves an item to a position within its list. To another list is `editItem`'s, which takes the product of the other list with it (RFC 0004). */
export function moveItem(env: Env, item: ItemRow, to: { position: string }): Mutation | null {
  return one(env, item, { position: to.position });
}

/**
 * _Clear bought_: every bought item of a list leaves it, in one mutation, so that it is one undo. They leave the list and stay bought (and, from phase 2,
 * in their trip). `null` if there are none.
 */
export function clearBought(env: Env, items: readonly ItemRow[]): Mutation | null {
  const bought = items.filter((item) => itemState(item) === 'bought');
  const first = bought[0];
  if (!first) return null;
  return {
    mutationId: env.newId(),
    householdId: first.householdId,
    changes: bought.map((item) => ({ table: 'item', id: item.id, fields: { clearedAt: env.now } })),
  };
}

/** The undo of _Clear bought_: the items it cleared come back to the list, bought. */
export function unclearBought(env: Env, items: readonly ItemRow[]): Mutation | null {
  const cleared = items.filter((item) => item.clearedAt !== null && item.deletedAt === null);
  const first = cleared[0];
  if (!first) return null;
  return {
    mutationId: env.newId(),
    householdId: first.householdId,
    changes: cleared.map((item) => ({ table: 'item', id: item.id, fields: { clearedAt: null } })),
  };
}

function one(
  env: Env,
  item: ItemRow,
  fields: Record<string, string | number | null>,
): Mutation | null {
  const differing = changed(item, fields);
  if (Object.keys(differing).length === 0) return null;
  return {
    mutationId: env.newId(),
    householdId: item.householdId,
    changes: [{ table: 'item', id: item.id, fields: differing }],
  };
}
