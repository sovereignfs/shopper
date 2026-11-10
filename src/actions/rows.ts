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

/** An item is open until it is ticked, then bought, then cleared; a deleted one is none of them (DESIGN.md §4). */
export type ItemState = 'open' | 'bought' | 'cleared' | 'deleted';

export function itemState(item: Pick<ItemRow, 'boughtAt' | 'clearedAt' | 'deletedAt'>): ItemState {
  if (item.deletedAt !== null) return 'deleted';
  if (item.clearedAt !== null) return 'cleared';
  return item.boughtAt !== null ? 'bought' : 'open';
}
