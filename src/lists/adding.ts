import { addItem, addToOpen } from '../actions/items';
import type { Env } from '../actions/env';
import type { Change, Mutation } from '../actions/format';
import { makeInventoryItem } from '../actions/inventory';
import type { InventoryRow, ItemRow, ListRow, ProductRow } from '../actions/rows';
import { type InventoryEntry, inventoryHas } from '../catalog/inventory';
import { OTHER } from '../catalog/categories';
import { canonicalName } from '../catalog/canonical';
import { guessCategory } from '../catalog/guess';
import { starterCategoryFor, starterEntryFor } from '../catalog/starter';
import { normaliseName } from '../catalog/name';
import type { Suggestion } from '../catalog/suggest';
import { isUnit } from '../quantity/units';
import type { CategoryRow } from '../local/rows';
import { lastPositionIn, quantityLabel } from './view';

/**
 * **Adding to a list from the add field** (DESIGN.md §16.6, §9.3), pure, so that the add field, the often-bought chips and the tests make the same
 * mutation. A suggestion becomes one of:
 *
 *  - **one more of what is open** (`addToOpen`), when the product is already open on the list: the quantity goes up by its step and no second row is made;
 *  - **an item of a product the household has**, with what the product remembers (quantity, unit, category, icon);
 *  - **an item and a new product**, for a starter-catalog entry or for text nobody has typed before. The category is the starter entry's, else the
 *    household's guess (`guessCategory`), else _Other_; the household's own category of that kind, so a reordered or renamed aisle is respected.
 *
 * What is typed is a name only: the text is kept as typed (the product's name is sealed, §13.1) and the product is found by its **canonical name**, so
 * _Oat Milk_ typed over _oat milk_ is the same product and is bumped, not doubled.
 */
export interface Adding {
  readonly list: ListRow;
  readonly products: readonly ProductRow[];
  readonly items: readonly ItemRow[];
  readonly categories: readonly CategoryRow[];
  /** The reader's person id in the household. */
  readonly me: string;
  /**
   * The reader's own Inventory (§8.8), as the device holds it, and **their own group**, which is the one it lives in, whatever list this is: a new name added here makes an
   * Inventory item of theirs (`Planned.also`). Absent where the device has no group of the reader's own yet, and nothing is made.
   */
  readonly inventory?: { readonly household: string; readonly rows: readonly InventoryRow[] };
}

export interface Planned {
  readonly mutation: Mutation;
  /**
   * **A new name makes an Inventory item** (DESIGN.md §8.8): a separate mutation to the reader's own group, beside the list's (a list may be another person's group), for a name
   * their Inventory does not have, marked once. It is written after the list's and says nothing to the reader: nobody keeps Inventory up by hand.
   */
  readonly also?: Mutation;
  /** What Undo's toast says: "Added oat milk", "Added one more oat milk". */
  readonly message: string;
}

/** Why nothing was added, in a sentence, when a count would pass the largest quantity. */
export interface Refused {
  readonly refused: string;
}

const openItemOf = (items: readonly ItemRow[], productId: string): ItemRow | undefined =>
  items.find(
    (item) =>
      item.productId === productId &&
      item.boughtAt === null &&
      item.clearedAt === null &&
      item.deletedAt === null,
  );

/** The household's product for a name, by canonical name (so that capitals, spaces and a starter plural do not make a second one). */
export function productNamed(
  products: readonly ProductRow[],
  name: string,
): ProductRow | undefined {
  const wanted = canonicalName(name);
  return products.find(
    (product) => product.deletedAt === null && canonicalName(product.name) === wanted,
  );
}

/** The household's category for a key that is a starter key or the household's own category id; _Other_ if it names neither. */
function categoryFor(categories: readonly CategoryRow[], key: string): CategoryRow | undefined {
  const live = categories.filter((category) => category.deletedAt === null);
  return (
    live.find((category) => category.id === key) ??
    live.find((category) => category.starterKey === key) ??
    live.find((category) => category.starterKey === OTHER)
  );
}

/** The category a new product is given: the starter catalog's, else the household's guess, else _Other_ (`null` if the household has no _Other_). */
export function categoryOfNew(
  name: string,
  products: readonly ProductRow[],
  categories: readonly CategoryRow[],
): string | null {
  const keyOf = (category: CategoryRow): string => category.starterKey ?? category.id;
  const aisle = [...categories]
    .filter((category) => category.deletedAt === null)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  const byId = new Map(categories.map((category) => [category.id, category]));
  const key = guessCategory({
    name,
    starter: starterCategoryFor,
    products: products
      .filter((product) => product.deletedAt === null)
      .map((product) => {
        const category = product.categoryId ? byId.get(product.categoryId) : undefined;
        return { name: product.name, category: category ? keyOf(category) : OTHER };
      }),
    aisle: aisle.map(keyOf),
  });
  return categoryFor(categories, key)?.id ?? null;
}

/**
 * **One more of a product the list has** (§9.3): the quantity of what is open goes up by its step, else an item of the product, with what it remembers. `Refused` when the sum would
 * pass the largest quantity. The head of both ways of adding (`planAdd`, `planAddFromInventory`).
 */
function addOfProduct(env: Env, context: Adding, product: ProductRow): Planned | Refused {
  const { list, items, me } = context;
  const open = openItemOf(items, product.id);
  if (open) {
    const bumped = addToOpen(env, open, product);
    return bumped
      ? { mutation: bumped, message: `Added one more ${product.name}` }
      : { refused: `There is already as much ${product.name} on the list as one item can hold.` };
  }
  return {
    mutation: addItem(env, {
      list,
      product,
      name: product.name,
      last: lastPositionIn(items, product.categoryId),
      by: me,
    }),
    message: `Added ${product.name}`,
  };
}

/**
 * **An Inventory item added to a list** (DESIGN.md §16.8, _Add to a list_), pure. **What the person set in Inventory wins:** the item takes its name, quantity, unit and icon, and its
 * category as it is on this list (`category`, which the caller works out, `categoryOnList`: the list's own row of a starter category, or a copy of one of the person's own, made
 * here, in the same mutation and first). What Inventory has no value for (a field it leaves empty, a category it had only the guess for) is what the list's product remembers, if
 * the list has one, else the guess. One more of what is open on the list is still one more, with nothing of Inventory's applied to it. A product of this list's catalog is **left as
 * it is**: only a new one is made, from the item's own fields. The Inventory note is not carried: it is the person's, and a list may be shared. No `also`: the item is in Inventory
 * already.
 */
export function planAddFromInventory(
  env: Env,
  context: Adding,
  entry: Pick<InventoryEntry, 'name' | 'quantity' | 'unit' | 'icon'>,
  category: {
    readonly id: string | null;
    readonly copy: Change | null;
    readonly guessed?: boolean;
  },
): Planned | Refused | null {
  const { list, products, items, me } = context;
  const name = entry.name.trim();
  if (name === '' || normaliseName(name) === '') return null;
  const product = productNamed(
    products.filter((each) => each.listId === list.id || each.listId === null),
    name,
  );
  const withCopy = (mutation: Mutation): Mutation =>
    category.copy ? { ...mutation, changes: [category.copy, ...mutation.changes] } : mutation;
  if (product) {
    if (openItemOf(items, product.id)) return addOfProduct(env, context, product);
    // The category Inventory has on this list, if it has one: a guess is not Inventory's, and the product's stands.
    const categoryId = category.guessed ? product.categoryId : category.id;
    return {
      mutation: withCopy(
        addItem(env, {
          list,
          product,
          name: product.name,
          ...(entry.quantity ? { quantity: entry.quantity } : {}),
          ...(entry.unit ? { unit: entry.unit } : {}),
          ...(entry.icon ? { icon: entry.icon } : {}),
          categoryId,
          last: lastPositionIn(items, categoryId),
          by: me,
        }),
      ),
      message: `Added ${product.name}`,
    };
  }
  return {
    // The copy first: what names it is checked against the list's copies as the mutation is applied, in order.
    mutation: withCopy(
      addItem(env, {
        list,
        name,
        ...(entry.quantity ? { quantity: entry.quantity } : {}),
        unit: entry.unit,
        icon: entry.icon,
        categoryId: category.id,
        last: lastPositionIn(items, category.id),
        by: me,
      }),
    ),
    message: `Added ${name}`,
  };
}

/** What to do for a suggestion, or why nothing can be. */
export function planAdd(
  env: Env,
  context: Adding,
  suggestion: Suggestion,
): Planned | Refused | null {
  const { list, products, items, categories, me } = context;
  const name = suggestion.name.trim();
  if (name === '' || normaliseName(name) === '') return null;

  // A product of this list's catalog, whichever way it was chosen (a typed name that is an existing product is that product). Another list's product is
  // never used (RFC 0004, 21.3): it lends its name and what it comes with to a new product of this list.
  const ownCatalog = products.filter((each) => each.listId === list.id || each.listId === null);
  const chosen =
    suggestion.kind === 'product' && suggestion.productId
      ? products.find((each) => each.id === suggestion.productId && each.deletedAt === null)
      : undefined;
  const product =
    chosen && (chosen.listId === list.id || chosen.listId === null)
      ? chosen
      : productNamed(ownCatalog, chosen?.name ?? name);
  const template = product ? undefined : (chosen ?? productNamed(products, name));
  if (template) {
    // Another list's product lends what it comes with, but **a category only if it is one of this list's** (§8.3): a copy of a person's category is the list it is on's, and the
    // server refuses an item that names another's. A starter category is every list's of the group.
    const lent =
      template.categoryId !== null && categories.some((each) => each.id === template.categoryId)
        ? template.categoryId
        : categoryOfNew(template.name, products, categories);
    return {
      mutation: addItem(env, {
        list,
        name: template.name,
        ...(template.defaultQuantity ? { quantity: template.defaultQuantity } : {}),
        unit: template.defaultUnit,
        icon: template.icon,
        categoryId: lent,
        last: lastPositionIn(items, lent),
        by: me,
      }),
      message: `Added ${template.name}`,
      ...fills(env, context, template.name, {
        icon: template.icon,
        unit: template.defaultUnit,
        quantity: template.defaultQuantity,
      }),
    };
  }
  if (product) return addOfProduct(env, context, product);

  // Something new: a starter entry brings its icon, unit and quantity, and text typed brings only itself.
  const entry =
    suggestion.kind === 'starter' && suggestion.starterKey
      ? starterEntryFor(suggestion.name)
      : starterEntryFor(name);
  const categoryId = categoryOfNew(name, products, categories);
  return {
    mutation: addItem(env, {
      list,
      name: suggestion.kind === 'new' ? name : (entry?.name ?? name),
      ...(entry?.quantity ? { quantity: entry.quantity } : {}),
      ...(entry && entry.unit !== null && isUnit(entry.unit) ? { unit: entry.unit } : {}),
      ...(entry ? { icon: entry.icon } : {}),
      categoryId,
      last: lastPositionIn(items, categoryId),
      by: me,
    }),
    message: `Added ${suggestion.kind === 'new' ? name : (entry?.name ?? name)}`,
    // A starter entry is in the person's Inventory already (the starter is a layer under it), so it is a name they have; text nobody has typed is not.
    ...fills(env, context, suggestion.kind === 'new' ? name : (entry?.name ?? name), {}),
  };
}

/**
 * The Inventory item a new name makes (§8.8): **marked once**, of the reader's own group, for a name their Inventory does not have, with what the product it came from
 * remembers when it came from one. Nothing when the device has no group of the reader's own, or the name is there already.
 */
function fills(
  env: Env,
  context: Adding,
  name: string,
  from: {
    icon?: string | null | undefined;
    unit?: ProductRow['defaultUnit'];
    quantity?: string | null | undefined;
  },
): { also?: Mutation } {
  const { inventory } = context;
  if (!inventory || inventoryHas(inventory.rows, name)) return {};
  return {
    also: makeInventoryItem(env, {
      householdId: inventory.household,
      name,
      recurring: false,
      ...(from.icon ? { icon: from.icon } : {}),
      ...(from.unit ? { unit: from.unit } : {}),
      ...(from.quantity ? { quantity: from.quantity } : {}),
    }),
  };
}

/** What is said beside a suggestion: its quantity and unit, and "On the list · 2" where it is already open. */
export function suggestionMeta(suggestion: Suggestion): string | undefined {
  if (suggestion.onList) return `On the list · ${suggestion.onList.quantity}`;
  const unit = suggestion.unit !== null && isUnit(suggestion.unit) ? suggestion.unit : null;
  return quantityLabel({ quantity: suggestion.quantity ?? '1', unit }) ?? undefined;
}

/**
 * **Straight into the basket** (DESIGN.md §11.1): the same add, with the item ticked by the person in the same mutation, for what is seen in the shop and
 * already in the trolley. It is the add's own item change that carries the tick, so that it is one mutation, one Undo and one row written.
 */
export function inBasket(mutation: Mutation, by: string, at: number): Mutation {
  let done = false;
  return {
    ...mutation,
    changes: mutation.changes.map((change) => {
      if (done || change.table !== 'item') return change;
      done = true;
      return { ...change, fields: { ...change.fields, boughtAt: at, boughtBy: by } };
    }),
  };
}
