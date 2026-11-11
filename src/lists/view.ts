import { between } from '../actions/position';
import type { ItemRow } from '../actions/rows';
import { itemState } from '../actions/rows';
import type { CategoryRow } from '../local/rows';

/**
 * **What a list shows, and in what order** (DESIGN.md §9.5, §9.6, §16.5), pure, so that it is the same on every screen and is tested with no browser.
 *
 *  - **Open items** are grouped by category in the household's **aisle order** (the order of its categories), and within a category by their position, a
 *    fractional key compared as text, ties broken by id so that every device shows one order. An item whose category is gone or hidden is shown under
 *    _Other_, which cannot be either; an item with none is under _Other_ too.
 *  - **The order added** is the other view: one run, oldest first.
 *  - **Bought** items are the ones ticked and not yet cleared, most recently ticked first, so that what was just ticked is at the top of the section.
 *  - **Reordering** is a drag within a category that writes **one row**: the key between the neighbours it was dropped between.
 */
export interface Group {
  /** The category's id, or `other` for what has none. */
  readonly key: string;
  readonly category: CategoryRow | null;
  readonly items: readonly ItemRow[];
}

const byPositionThenId = (a: ItemRow, b: ItemRow): number =>
  a.position !== b.position
    ? a.position < b.position
      ? -1
      : 1
    : a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : 0;

export const openItems = (items: readonly ItemRow[]): ItemRow[] =>
  items.filter((item) => itemState(item) === 'open');

export const boughtItems = (items: readonly ItemRow[]): ItemRow[] =>
  items
    .filter((item) => itemState(item) === 'bought')
    .sort((a, b) => (b.boughtAt ?? 0) - (a.boughtAt ?? 0) || (a.id < b.id ? -1 : 1));

export function groupByAisle(
  items: readonly ItemRow[],
  categories: readonly CategoryRow[],
): Group[] {
  const shown = categories.filter((category) => category.deletedAt === null && !category.hidden);
  const other = categories.find((category) => category.starterKey === 'other') ?? null;
  const known = new Map(shown.map((category) => [category.id, category]));
  const buckets = new Map<string, ItemRow[]>();
  for (const item of items) {
    const key =
      item.categoryId !== null && known.has(item.categoryId)
        ? item.categoryId
        : (other?.id ?? 'other');
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  const order = [...shown, ...(other && !known.has(other.id) ? [other] : [])].sort((a, b) =>
    a.position !== b.position ? (a.position < b.position ? -1 : 1) : a.id < b.id ? -1 : 1,
  );
  const groups: Group[] = [];
  for (const category of order) {
    const found = buckets.get(category.id);
    if (found) groups.push({ key: category.id, category, items: found.sort(byPositionThenId) });
    buckets.delete(category.id);
  }
  // Items under a category this device has not heard of yet are shown, in one group, and are never dropped.
  const strays = [...buckets.values()].flat();
  if (strays.length > 0)
    groups.push({ key: 'other', category: null, items: strays.sort(byPositionThenId) });
  return groups;
}

/** The order the items were added in, oldest first. */
export const inOrderAdded = (items: readonly ItemRow[]): ItemRow[] =>
  [...items].sort((a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * The position an item takes when it is dropped over another in its category: the key between the two it ends up between. `null` if nothing moved or either
 * is not in the group. Where the neighbours' keys are equal (two devices put items at one place, which is allowed and broken by id) no key lies between
 * them, so it goes after them both: nothing throws, and the drop is not lost.
 */
export function reorderedPosition(
  group: readonly ItemRow[],
  activeId: string,
  overId: string,
): string | null {
  const from = group.findIndex((item) => item.id === activeId);
  const to = group.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0 || from === to) return null;
  const moved = [...group];
  const [taken] = moved.splice(from, 1);
  if (!taken) return null;
  moved.splice(to, 0, taken);
  const before = moved[to - 1]?.position ?? null;
  const after = moved[to + 1]?.position ?? null;
  return before !== null && after !== null && before >= after
    ? between(before, null)
    : between(before, after);
}

/** "2 L", "12", or nothing for one of something counted with no unit: what is said beside the name. */
export function quantityLabel(item: Pick<ItemRow, 'quantity' | 'unit'>): string | null {
  if (item.unit === null) return item.quantity === '1' ? null : item.quantity;
  return `${item.quantity} ${item.unit}`;
}

/** A note's first line, which is what a row shows of it. */
export function firstLine(note: string | null): string | null {
  const line = (note ?? '').split(/\r?\n/).find((text) => text.trim() !== '');
  return line ? line.trim() : null;
}

/** The position of the last item of a category on a list, so that a new item goes after it (DESIGN.md §9.6); `null` if the category has none there. */
export function lastPositionIn(
  items: readonly ItemRow[],
  categoryId: string | null,
): string | null {
  const keys = items
    .filter((item) => item.categoryId === categoryId && itemState(item) === 'open')
    .map((item) => item.position)
    .sort();
  return keys.at(-1) ?? null;
}
