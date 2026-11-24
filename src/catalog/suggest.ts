import type { ItemRow, ProductRow } from '../actions/rows';
import { canonicalName } from './canonical';
import { type InventoryEntry, layerInventory } from './inventory';
import { normaliseName } from './name';
import { STARTER_CATALOG, type StarterEntry, starterEntryByKey } from './starter';

/**
 * **Suggestions** (DESIGN.md §8.5, RFC 0006): what the add field offers as a person types, from one pure function over the rows the device already holds, **on the device,
 * offline**. Nothing about ranking is stored.
 *
 * **Where a suggestion comes from, in this order:** the person's **Inventory** (`inventory`: their own items and their changes to the starter's, which `layerInventory` lays over
 * the catalog), **this list's products**, and **the group's other lists' products**. One name is one suggestion (by canonical name): an Inventory item the list has a product of is
 * that product (with its remembered quantity, unit, category and icon, and "On the list" if it is open); an Inventory item it has none of is offered as the Inventory item, and
 * adding it makes the list's product from it (`planAdd`). **A hidden entry is offered nowhere,** and neither is a product of its name; **a starter entry the person renamed is
 * offered by its new name, not its old** (a product that still has the old name is the list's own and is offered as it is).
 *
 *  1. **Matches**, in tiers: the names that start with what was typed, then those with a **word** that does, then those **within one edit** of the whole name or of a word of it
 *     (for text of three letters or more, so that a typo still finds it). The first tier is **the person's own items and the products**; the starter catalog's entries they
 *     have not touched and have no product for follow them, in the same three tiers (a starter entry nobody has used is not a reason to bury what they have).
 *  2. **Ranked within a tier** by how many times the product was bought (a name with no product has none), then when it was last bought, then when it was last added, then an
 *     Inventory item before a product of this list before another list's, then by name. In 0.1.0, which has no trip lines, "how often" is the product's own count (§8.2); the
 *     decayed count over trip lines arrives with trips (task 7.1).
 *  3. **Already on this list:** a match that is open on the list says so, with the open item, and choosing it offers _+1_ and not a second row (§9.3).
 *  4. **Always last,** the text as it was typed, to add as a new item, so nobody is stuck when nothing matches.
 *
 * At most eight matches are shown. With **nothing typed**, it offers the person's **recurring Inventory items that are not on the list first**, then "Often bought": the products
 * bought most that are not on the list.
 */
export interface Suggestion {
  readonly kind: 'product' | 'inventory' | 'starter' | 'new';
  /** What to call the item: the product's name, the entry's, or the text as typed. */
  readonly name: string;
  readonly icon: string | null;
  readonly quantity: string | null;
  readonly unit: string | null;
  readonly productId?: string;
  readonly starterKey?: string;
  /** An Inventory item the list has no product of (`InventoryEntry.key`): `planAdd` finds it again by this when the add's turn comes. */
  readonly entryKey?: string;
  readonly categoryId?: string | null;
  /** The open item for this product on the list, if there is one: choosing the suggestion adds one to it. */
  readonly onList?: { readonly itemId: string; readonly quantity: string };
}

export const MAX_SUGGESTIONS = 8;

export interface SuggestInput {
  readonly text: string;
  /** The household's products. Deleted ones are not offered. */
  readonly products: readonly ProductRow[];
  /** The items of the list being added to; only the open ones matter. */
  readonly items: readonly ItemRow[];
  /** The list being added to: its products come before the group's others. Without it every product is taken to be this list's. */
  readonly listId?: string;
  /**
   * The person's Inventory (`layerInventory`): the entries to offer, first. Without it, the starter catalog as it is (the real one unless a test gives its own with `starter`), as
   * before Inventory was read: a screen that has not read it yet offers what it always did.
   */
  readonly inventory?: readonly InventoryEntry[];
  /** The starter catalog to lay Inventory over when none is given; the real catalog unless a test gives its own. */
  readonly starter?: readonly StarterEntry[];
}

const words = (normalised: string): string[] =>
  normalised.split(/[^\p{L}\p{N}]+/u).filter((word) => word !== '');

/** Whether `a` and `b` are within one edit (an insertion, a deletion, a substitution or a swap of two neighbours). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  return shorter.slice(i) === longer.slice(i + 1);
}

/** 1 for a name that starts with the text, 2 for a word that does, 3 for one within an edit, and `0` for no match. */
function tierOf(typed: string, name: string): 0 | 1 | 2 | 3 {
  if (name.startsWith(typed)) return 1;
  const parts = words(name);
  if (parts.some((word) => word.startsWith(typed))) return 2;
  if (typed.length >= 3) {
    if (withinOneEdit(typed, name) || parts.some((word) => withinOneEdit(typed, word))) return 3;
    // A typo in the middle of a longer name's start: compare with its first letters as long as the text.
    if (
      withinOneEdit(typed, name.slice(0, typed.length)) ||
      withinOneEdit(typed, name.slice(0, typed.length + 1))
    )
      return 3;
  }
  return 0;
}

const normalisedNames = new WeakMap<ProductRow, string>();
const normalisedOf = (product: ProductRow): string => {
  let name = normalisedNames.get(product);
  if (name === undefined) {
    name = normaliseName(product.name);
    normalisedNames.set(product, name);
  }
  return name;
};

/** More bought first, then bought more recently, then added more recently, then by name. */
function byUse(a: ProductRow, b: ProductRow): number {
  return (
    b.timesBought - a.timesBought ||
    (b.lastBoughtAt ?? 0) - (a.lastBoughtAt ?? 0) ||
    (b.lastAddedAt ?? 0) - (a.lastAddedAt ?? 0) ||
    normalisedOf(a).localeCompare(normalisedOf(b), 'en')
  );
}

function openByProduct(items: readonly ItemRow[]): Map<string, ItemRow> {
  const open = new Map<string, ItemRow>();
  for (const item of items) {
    if (
      item.boughtAt === null &&
      item.clearedAt === null &&
      item.deletedAt === null &&
      !open.has(item.productId)
    )
      open.set(item.productId, item);
  }
  return open;
}

const ofProduct = (product: ProductRow, open: Map<string, ItemRow>): Suggestion => {
  const item = open.get(product.id);
  return {
    kind: 'product',
    name: product.name,
    icon: product.icon,
    quantity: product.defaultQuantity,
    unit: product.defaultUnit,
    productId: product.id,
    categoryId: product.categoryId,
    ...(item ? { onList: { itemId: item.id, quantity: item.quantity } } : {}),
  };
};

const inventoryOf = (entry: InventoryEntry): Suggestion => ({
  kind: 'inventory',
  name: entry.name,
  icon: entry.icon,
  quantity: entry.quantity,
  unit: entry.unit,
  entryKey: entry.key,
});

/** The starter catalog as Inventory with nothing of the person's laid over it, one layering for each catalog and not one for each key pressed. */
const layers = new WeakMap<readonly StarterEntry[], readonly InventoryEntry[]>();
function starterLayer(catalog: readonly StarterEntry[]): readonly InventoryEntry[] {
  let layer = layers.get(catalog);
  if (!layer) {
    layer = layerInventory([], catalog);
    layers.set(catalog, layer);
  }
  return layer;
}

const canonicalProducts = new WeakMap<ProductRow, string>();
const canonicalOfProduct = (product: ProductRow): string => {
  let name = canonicalProducts.get(product);
  if (name === undefined) {
    name = canonicalName(product.name);
    canonicalProducts.set(product, name);
  }
  return name;
};

interface EntryNames {
  readonly canonical: string;
  /** What it is matched by: its name now and, for a starter entry, its aliases (never the name it had before it was renamed). */
  readonly normalised: readonly string[];
}
const entryNames = new WeakMap<InventoryEntry, EntryNames>();
const namesOf = (entry: InventoryEntry): EntryNames => {
  let names = entryNames.get(entry);
  if (!names) {
    names = {
      canonical: canonicalName(entry.name),
      normalised: [entry.name, ...entry.aliases].map(normaliseName),
    };
    entryNames.set(entry, names);
  }
  return names;
};

/** The best tier any of the names has: 1 to 3, or `0` for none. */
function bestTier(typed: string, names: readonly string[]): 0 | 1 | 2 | 3 {
  let best: 0 | 1 | 2 | 3 = 0;
  for (const name of names) {
    const tier = tierOf(typed, name);
    if (tier !== 0 && (best === 0 || tier < best)) best = tier;
    if (best === 1) break;
  }
  return best;
}

/**
 * **What the suggestions are made of** (one call's worth): the entries the person has a row for and has not hidden (`own`, one for a name), the starter entries they have not
 * touched (`untouched`), and the products, **one for each name** (`products`: this list's rather than another's, else the one bought most), without any that goes by a name
 * Inventory has hidden, or by the name a starter entry had before it was renamed.
 */
interface World {
  readonly here: (product: ProductRow) => boolean;
  readonly own: ReadonlyMap<string, InventoryEntry>;
  readonly untouched: readonly InventoryEntry[];
  readonly products: ReadonlyMap<string, ProductRow>;
}

function worldOf(input: SuggestInput, entries: readonly InventoryEntry[]): World {
  const listId = input.listId;
  const here = (product: ProductRow) =>
    listId === undefined || product.listId === null || product.listId === listId;
  const own = new Map<string, InventoryEntry>();
  const untouched: InventoryEntry[] = [];
  const shownNames = new Set<string>();
  const away = new Set<string>();
  for (const entry of entries) {
    if (entry.hidden) {
      // Offered nowhere: not by the name it has, nor the one the starter gave it, nor an alias; and neither is a product of that name.
      away.add(namesOf(entry).canonical);
      const starter = entry.starterKey === null ? undefined : starterEntryByKey(entry.starterKey);
      if (starter) away.add(canonicalName(starter.name));
      for (const alias of entry.aliases) away.add(canonicalName(alias));
      continue;
    }
    const { canonical } = namesOf(entry);
    shownNames.add(canonical);
    if (entry.id === null) {
      untouched.push(entry);
      continue;
    }
    // A starter entry the person renamed is matched by its new name and its aliases, never by the name it had: that name is not in its names. A product that still has the old
    // name is the list's own, with its history and its open items, and is offered as it is.
    if (!own.has(canonical)) own.set(canonical, entry);
  }
  for (const name of shownNames) away.delete(name);
  const products = new Map<string, ProductRow>();
  for (const product of input.products) {
    if (product.deletedAt !== null) continue;
    const name = canonicalOfProduct(product);
    if (away.has(name)) continue;
    const had = products.get(name);
    // This list's rather than another's, then the one used more; two that tie are told apart by their ids, so that the answer does not depend on the order the rows came in.
    if (
      !had ||
      (here(product) && !here(had)) ||
      (here(product) === here(had) && (byUse(product, had) || (product.id < had.id ? -1 : 1)) < 0)
    )
      products.set(name, product);
  }
  return { here, own, untouched, products };
}

/** One suggestion before it is drawn, with what ranks it. */
interface Candidate {
  readonly tier: 1 | 2 | 3;
  /** The product whose use ranks it: none for an Inventory item the list has no product of. */
  readonly product: ProductRow | undefined;
  /** 0: an Inventory item of the person's; 1: a product of this list; 2: another list's. */
  readonly source: 0 | 1 | 2;
  readonly name: string;
  readonly make: () => Suggestion;
}

const timesOf = (candidate: Candidate): [number, number, number] => [
  candidate.product?.timesBought ?? 0,
  candidate.product?.lastBoughtAt ?? 0,
  candidate.product?.lastAddedAt ?? 0,
];

function byRank(a: Candidate, b: Candidate): number {
  const [boughtA, lastA, addedA] = timesOf(a);
  const [boughtB, lastB, addedB] = timesOf(b);
  return (
    a.tier - b.tier ||
    boughtB - boughtA ||
    lastB - lastA ||
    addedB - addedA ||
    a.source - b.source ||
    a.name.localeCompare(b.name, 'en')
  );
}

export function suggest(input: SuggestInput): Suggestion[] {
  const open = openByProduct(input.items);
  const entries = input.inventory ?? starterLayer(input.starter ?? STARTER_CATALOG);
  const world = worldOf(input, entries);
  const typed = normaliseName(input.text);

  if (typed === '') {
    // Recurring Inventory items that are not on the list first (what staples were to be, §22.2), then the products bought most that are not on it.
    const offered = new Set<string>();
    const recurring: Candidate[] = [];
    for (const [name, entry] of world.own) {
      if (!entry.recurring) continue;
      const product = world.products.get(name);
      offered.add(name);
      if (product && open.has(product.id)) continue;
      recurring.push({
        tier: 1,
        product,
        source: 0,
        name: normaliseName(entry.name),
        make: () =>
          product && world.here(product) ? ofProduct(product, open) : inventoryOf(entry),
      });
    }
    recurring.sort(byRank);
    const often = [...world.products.entries()]
      .filter(
        ([name, product]) => product.timesBought > 0 && !open.has(product.id) && !offered.has(name),
      )
      .map(([, product]) => product)
      .sort(byUse);
    return [...recurring.map((each) => each.make()), ...often.map((p) => ofProduct(p, open))].slice(
      0,
      MAX_SUGGESTIONS,
    );
  }

  const main: Candidate[] = [];
  for (const [name, entry] of world.own) {
    const product = world.products.get(name);
    const tier = bestTier(typed, [
      ...namesOf(entry).normalised,
      ...(product ? [normalisedOf(product)] : []),
    ]);
    if (tier === 0) continue;
    main.push({
      tier,
      product,
      source: 0,
      name: normaliseName(entry.name),
      make: () => (product && world.here(product) ? ofProduct(product, open) : inventoryOf(entry)),
    });
  }
  for (const [name, product] of world.products) {
    if (world.own.has(name)) continue;
    const tier = tierOf(typed, normalisedOf(product));
    if (tier === 0) continue;
    main.push({
      tier,
      product,
      source: world.here(product) ? 1 : 2,
      name: normalisedOf(product),
      make: () => ofProduct(product, open),
    });
  }
  main.sort(byRank);

  // The starter catalog's entries the person has not touched and has no product for: after what is theirs, in the same tiers, by name.
  const tail: Candidate[] = [];
  for (const entry of world.untouched) {
    const { canonical, normalised } = namesOf(entry);
    if (world.products.has(canonical) || world.own.has(canonical)) continue;
    const tier = bestTier(typed, normalised);
    if (tier === 0) continue;
    tail.push({
      tier,
      product: undefined,
      source: 0,
      name: normaliseName(entry.name),
      make: () => ({
        kind: 'starter',
        name: entry.name,
        icon: entry.icon,
        quantity: entry.quantity,
        unit: entry.unit,
        ...(entry.starterKey === null ? {} : { starterKey: entry.starterKey }),
      }),
    });
  }
  tail.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'en'));

  return [
    ...[...main, ...tail].slice(0, MAX_SUGGESTIONS).map((each) => each.make()),
    { kind: 'new', name: input.text.trim(), icon: null, quantity: null, unit: null },
  ];
}
