import type { CodeKind } from '../cards/kinds';
import type { Unit } from '../quantity/units';

/**
 * **The rows as a device holds them** (DESIGN.md §12.1): plain text, camelCase, with the sealed fields in the clear (the device holds plain text; the
 * server seals what it stores). An action takes the rows it needs and returns a mutation (`format.ts`); it never reads a store. A row's `seq` is the
 * household's counter at its last change, which a device gets from the server and never makes.
 *
 * What the server keeps of a product by itself (its name key, which needs the instance key, and how often it was bought and when) is not a field a device
 * sends: apply keeps it (task 5.2), and the device's copy is what the last pull said.
 */
export interface ListRow {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  /** The list's icon and colour (RFC 0005), sealed as its name is; `null` for a list that has none, which is shown with the defaults (`src/lists/appearance.ts`). */
  readonly icon: string | null;
  readonly color: string | null;
  /** A fractional key (DESIGN.md §9.6) among the household's lists, compared as text. */
  readonly position: string;
  /** How bought items leave the list; `manual` in 0.1.0 (§9.5). */
  readonly clearing: 'manual' | 'on_finish' | 'after_day';
  readonly archivedAt: number | null;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly seq: number;
}

export interface ProductRow {
  readonly id: string;
  readonly householdId: string;
  /** The list whose catalog it is (RFC 0004); `null` only for one from before lists had catalogs of their own. */
  readonly listId: string | null;
  readonly name: string;
  readonly note: string | null;
  readonly categoryId: string | null;
  readonly icon: string | null;
  readonly defaultQuantity: string | null;
  readonly defaultUnit: Unit | null;
  readonly timesBought: number;
  readonly lastBoughtAt: number | null;
  readonly lastAddedAt: number | null;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly seq: number;
}

export interface ItemRow {
  readonly id: string;
  readonly householdId: string;
  readonly listId: string;
  readonly productId: string;
  readonly name: string;
  readonly note: string | null;
  /** A canonical quantity (`src/quantity/decimal.ts`). */
  readonly quantity: string;
  readonly unit: Unit | null;
  readonly categoryId: string | null;
  readonly icon: string | null;
  /** A fractional key among the items of a category on a list, ties broken by `id` (§9.6). */
  readonly position: string;
  /** The person who added it. */
  readonly addedBy: string;
  readonly addedAt: number;
  readonly boughtAt: number | null;
  readonly boughtBy: string | null;
  readonly clearedAt: number | null;
  readonly deletedAt: number | null;
  readonly seq: number;
}

/**
 * **An item of the person's Inventory** (DESIGN.md §8.8), in plain text as a device holds it. `name` is null for an override of a starter entry that keeps the
 * starter's name (`starterKey` names the entry); `recurring` and `hidden` are booleans here and `0`/`1` in a mutation. It is the account's own and only a device
 * of that account has it.
 */
export interface InventoryRow {
  readonly id: string;
  readonly householdId: string;
  /** The starter entry this overrides, or null for one of the person's own. */
  readonly starterKey: string | null;
  readonly name: string | null;
  readonly note: string | null;
  readonly categoryId: string | null;
  readonly icon: string | null;
  readonly unit: Unit | null;
  readonly quantity: string | null;
  readonly recurring: boolean;
  readonly hidden: boolean;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly seq: number;
}

/** An item is open until it is ticked, then bought, then cleared; a deleted one is none of them (DESIGN.md §4). */
export type ItemState = 'open' | 'bought' | 'cleared' | 'deleted';

export function itemState(item: Pick<ItemRow, 'boughtAt' | 'clearedAt' | 'deletedAt'>): ItemState {
  if (item.deletedAt !== null) return 'deleted';
  if (item.clearedAt !== null) return 'cleared';
  return item.boughtAt !== null ? 'bought' : 'open';
}

/** A category of a group as a device holds it (§8.3): a starter category (its key set; the code's name until it is renamed) or one of the person's own. */
export interface CategoryRow {
  readonly id: string;
  readonly householdId: string;
  readonly starterKey: string | null;
  readonly name: string;
  readonly icon: string | null;
  readonly position: string;
  readonly hidden: boolean;
  readonly deletedAt: number | null;
  readonly seq: number;
}

/** A list's copy of a person's own category as a device holds it (§8.3): the list's, its name opened under the list's keys, and the source key a device made (never an id). */
export interface ListCategoryRow {
  readonly id: string;
  readonly householdId: string;
  readonly listId: string;
  readonly sourceKey: string;
  readonly name: string;
  readonly icon: string | null;
  readonly position: string;
  readonly deletedAt: number | null;
  readonly seq: number;
}

/** **A card linked to a list** (§7.7, task 24.6): the pair and nothing else. `deletedAt` is an unlink, which linking again clears. */
export interface ListCardRow {
  readonly id: string;
  readonly householdId: string;
  readonly listId: string;
  readonly cardId: string;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly seq: number;
}

/**
 * **A loyalty card as a device holds it** (§7.7): the person's words opened under the card's keys (the device holds every row plain; the transport encrypts and opens each field),
 * what kind of code it is and the value that code carries.
 */
export interface CardRow {
  readonly id: string;
  readonly householdId: string;
  readonly shop: string;
  readonly number: string;
  readonly kind: CodeKind;
  readonly code: string;
  readonly icon: string | null;
  readonly color: string | null;
  readonly holder: string | null;
  readonly note: string | null;
  readonly position: string;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly seq: number;
}
