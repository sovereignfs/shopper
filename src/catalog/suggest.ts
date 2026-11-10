import type { ItemRow, ProductRow } from '../actions/rows';
import { canonicalName } from './canonical';
import { normaliseName } from './name';
import { STARTER_CATALOG, type StarterEntry } from './starter';

/**
 * **Suggestions** (DESIGN.md §8.5): what the add field offers as a person types, from one pure function over the household's own rows, **on the device,
 * offline**. Nothing about ranking is stored: it is computed from the products the device already holds.
 *
 *  1. **Matches**, in tiers: the products whose name starts with what was typed, then those with a **word** that does, then those **within one edit** of
 *     the whole name or of a word of it (for text of three letters or more, so that a typo still finds it); then the starter catalog's entries the household
 *     has no product for, in the same three tiers.
 *  2. **Ranked within a tier** by how many times the household bought the product, then when it last did, then when it was last added, then by name. In
 *     0.1.0, which has no trip lines, "how often" is the product's own count (§8.2); the decayed count over trip lines arrives with trips (task 7.1).
 *  3. **Already on this list:** a match that is open on the list says so, with the open item, and choosing it offers _+1_ and not a second row (§9.3).
 *  4. **Always last,** the text as it was typed, to add as a new item, so nobody is stuck when nothing matches.
 *
 * At most eight matches are shown. With **nothing typed**, it offers "Often bought": the products the household has bought most that are not on the list.
 */
export interface Suggestion {
  readonly kind: 'product' | 'starter' | 'new';
  /** What to call the item: the product's name, the entry's, or the text as typed. */
  readonly name: string;
  readonly icon: string | null;
  readonly quantity: string | null;
  readonly unit: string | null;
  readonly productId?: string;
  readonly starterKey?: string;
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
  /** The entries to offer where the household has no product; the real catalog unless a test gives its own. */
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

export function suggest(input: SuggestInput): Suggestion[] {
  const open = openByProduct(input.items);
  const live = input.products.filter((product) => product.deletedAt === null);
  const typed = normaliseName(input.text);

  if (typed === '') {
    // Often bought: the most bought products that are not already on the list.
    return live
      .filter((product) => product.timesBought > 0 && !open.has(product.id))
      .sort(byUse)
      .slice(0, MAX_SUGGESTIONS)
      .map((product) => ofProduct(product, open));
  }

  const matched: Suggestion[] = [];
  const mine = new Set<string>();
  for (const tier of [1, 2, 3] as const) {
    const these = live.filter(
      (product) =>
        tierOf(typed, normalisedOf(product)) === tier &&
        !matched.some((m) => m.productId === product.id),
    );
    these.sort(byUse);
    for (const product of these) {
      matched.push(ofProduct(product, open));
      mine.add(canonicalName(product.name));
    }
  }
  for (const product of live) mine.add(canonicalName(product.name));

  const catalog = (input.starter ?? STARTER_CATALOG).filter(
    (entry) => !mine.has(canonicalName(entry.name)),
  );
  const offered: Suggestion[] = [];
  for (const tier of [1, 2, 3] as const) {
    const these = catalog
      .filter((entry) => {
        const names = [entry.name, ...entry.aliases].map(normaliseName);
        const best = Math.min(...names.map((n) => tierOf(typed, n) || 4));
        return best === tier;
      })
      .sort((a, b) => normaliseName(a.name).localeCompare(normaliseName(b.name), 'en'));
    for (const entry of these)
      offered.push({
        kind: 'starter',
        name: entry.name,
        icon: entry.icon,
        quantity: entry.quantity,
        unit: entry.unit,
        starterKey: entry.key,
      });
  }

  return [
    ...[...matched, ...offered].slice(0, MAX_SUGGESTIONS),
    { kind: 'new', name: input.text.trim(), icon: null, quantity: null, unit: null },
  ];
}
