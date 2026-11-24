import type { CategoryRow } from '../actions/rows';
import { OTHER } from '../catalog/categories';
import { canonicalName } from '../catalog/canonical';
import type { InventoryEntry } from '../catalog/inventory';
import { normaliseName } from '../catalog/name';
import { starterEntryByKey } from '../catalog/starter';

/**
 * **What the Inventory screen shows** (DESIGN.md §16.8, RFC 0006, "The screen"), pure so that the screen and the tests make the same view: every entry, the person's and the
 * starter's together, **searchable**, **filtered** by category, by recurring or once, and by mine, starter or hidden, and **grouped by category in the aisle order**. An entry whose
 * category is hidden, deleted or not one of the person's falls under _Other_, as an item of a list does. A hidden entry is shown (so that it can be shown again), marked, in
 * _All_ and in _Hidden_; it is offered nowhere else (`offered`, `src/catalog/inventory.ts`).
 */
export type KindFilter = 'all' | 'recurring' | 'once';
export type SourceFilter = 'all' | 'mine' | 'starter' | 'hidden';

export interface InventoryFilters {
  /** What was typed in the search field. */
  readonly query: string;
  /** A category row's id, or `all`. */
  readonly category: string;
  readonly kind: KindFilter;
  readonly source: SourceFilter;
}

export const NO_FILTERS: InventoryFilters = {
  query: '',
  category: 'all',
  kind: 'all',
  source: 'all',
};

export interface InventorySection {
  readonly category: CategoryRow;
  readonly entries: readonly InventoryEntry[];
}

/**
 * The category an entry is shown under: the person's own choice (`categoryId`, one of their group's categories), else the starter entry's by its key (the person's group
 * has a row for each starter category), else _Other_. A category that is hidden or deleted is not one to be under: its entries are under _Other_ until moved.
 */
export function categoryOfEntry(
  entry: InventoryEntry,
  categories: readonly CategoryRow[],
): CategoryRow | undefined {
  const live = categories.filter((each) => each.deletedAt === null && !each.hidden);
  const other = live.find((each) => each.starterKey === OTHER);
  if (entry.categoryId !== null) {
    const chosen = live.find((each) => each.id === entry.categoryId);
    if (chosen) return chosen;
  } else if (entry.categoryKey !== null) {
    const starter = live.find((each) => each.starterKey === entry.categoryKey);
    if (starter) return starter;
  }
  return other ?? categories.find((each) => each.starterKey === OTHER);
}

/** Whether a search finds an entry: by its name, a starter entry's own name (also when it was renamed) and its aliases, whatever the capitals, spaces or plural. */
export function matches(entry: InventoryEntry, query: string): boolean {
  const wanted = normaliseName(query);
  if (wanted === '') return true;
  const names = [
    entry.name,
    ...entry.aliases,
    ...(entry.starterKey === null ? [] : [starterEntryByKey(entry.starterKey)?.name ?? '']),
  ];
  const wantedCanonical = canonicalName(query);
  return names.some(
    (name) => normaliseName(name).includes(wanted) || canonicalName(name).includes(wantedCanonical),
  );
}

/** Whether the filters let an entry through (the category is checked against where it is shown, `categoryOfEntry`). */
export function passes(
  entry: InventoryEntry,
  filters: InventoryFilters,
  shownUnder: CategoryRow | undefined,
): boolean {
  if (!matches(entry, filters.query)) return false;
  if (filters.category !== 'all' && shownUnder?.id !== filters.category) return false;
  if (filters.kind === 'recurring' && !entry.recurring) return false;
  if (filters.kind === 'once' && entry.recurring) return false;
  if (filters.source === 'mine' && !entry.mine) return false;
  if (filters.source === 'starter' && entry.mine) return false;
  if (filters.source === 'hidden' && !entry.hidden) return false;
  return true;
}

const byName = (a: InventoryEntry, b: InventoryEntry): number =>
  a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
const byPosition = (a: CategoryRow, b: CategoryRow): number =>
  a.position === b.position ? a.id.localeCompare(b.id) : a.position < b.position ? -1 : 1;

/** The entries that pass the filters, grouped by the category they are shown under, in the aisle order, each in name order; a category with none is left out. */
export function sectionsOf(
  entries: readonly InventoryEntry[],
  categories: readonly CategoryRow[],
  filters: InventoryFilters = NO_FILTERS,
): InventorySection[] {
  const sections = new Map<string, { category: CategoryRow; entries: InventoryEntry[] }>();
  for (const entry of entries) {
    const under = categoryOfEntry(entry, categories);
    if (!under || !passes(entry, filters, under)) continue;
    const section = sections.get(under.id) ?? { category: under, entries: [] };
    section.entries.push(entry);
    sections.set(under.id, section);
  }
  return [...sections.values()]
    .sort((a, b) => byPosition(a.category, b.category))
    .map((section) => ({ category: section.category, entries: section.entries.sort(byName) }));
}
