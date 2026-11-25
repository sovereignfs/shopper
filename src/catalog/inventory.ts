import type { InventoryRow } from '../actions/rows';
import type { Unit } from '../quantity/units';
import { canonicalName } from './canonical';
import { STARTER_CATALOG, type StarterEntry, starterEntryByKey } from './starter';

/**
 * **Inventory as the person sees it** (DESIGN.md §8.6, §8.8): the starter catalog **layered** under their own rows and never copied into an account, so that
 * a release can add to the starter and a person's change is theirs. An entry is a starter entry as it is, or as an override of it changes it (the row's
 * fields over the entry's; the entry's key stays), or an item of the person's own. A deleted row is not there: a deleted override shows the starter entry as it
 * is, a deleted item of their own is gone. A hidden entry is shown to the person (to restore it) and **offered nowhere** (`offered`). Pure.
 */
export interface InventoryEntry {
  /** A stable identity: `starter:<key>` for a starter entry, overridden or not, and `own:<id>` for an item of the person's own. */
  readonly key: string;
  /** The row that overrides or is this entry; none for a starter entry as it is. */
  readonly id: string | null;
  readonly starterKey: string | null;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly note: string | null;
  /** The starter's category key, when the entry has no category of the person's choosing. */
  readonly categoryKey: string | null;
  /** The person's category choice (a starter category's row or their own), over the starter's. */
  readonly categoryId: string | null;
  readonly icon: string | null;
  readonly unit: Unit | null;
  readonly quantity: string | null;
  readonly recurring: boolean;
  readonly hidden: boolean;
  /** An item of the person's own, not a starter entry. */
  readonly mine: boolean;
  /** A starter entry the person has changed. */
  readonly overridden: boolean;
}

function ofStarter(entry: StarterEntry, row: InventoryRow | undefined): InventoryEntry {
  return {
    key: `starter:${entry.key}`,
    id: row?.id ?? null,
    starterKey: entry.key,
    name: row?.name ?? entry.name,
    aliases: entry.aliases,
    note: row?.note ?? null,
    categoryKey: entry.category,
    categoryId: row?.categoryId ?? null,
    icon: row?.icon ?? entry.icon,
    unit: row?.unit ?? entry.unit,
    quantity: row?.quantity ?? entry.quantity,
    recurring: row?.recurring ?? false,
    hidden: row?.hidden ?? false,
    mine: false,
    overridden: row !== undefined,
  };
}

function ofOwn(row: InventoryRow): InventoryEntry {
  return {
    key: `own:${row.id}`,
    id: row.id,
    starterKey: null,
    name: row.name ?? '',
    aliases: [],
    note: row.note,
    categoryKey: null,
    categoryId: row.categoryId,
    icon: row.icon,
    unit: row.unit,
    quantity: row.quantity,
    recurring: row.recurring,
    hidden: row.hidden,
    mine: true,
    overridden: false,
  };
}

/** The starter's entries with the person's rows laid over them, then the person's own items, each group in name order. */
export function layerInventory(
  rows: readonly InventoryRow[],
  catalog: readonly StarterEntry[] = STARTER_CATALOG,
): InventoryEntry[] {
  const live = rows.filter((row) => row.deletedAt === null);
  const overrides = new Map<string, InventoryRow>();
  for (const row of live) if (row.starterKey !== null) overrides.set(row.starterKey, row);
  const starter = catalog.map((entry) => ofStarter(entry, overrides.get(entry.key)));
  const own = live
    .filter((row) => row.starterKey === null && row.name !== null)
    .map(ofOwn)
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id ?? '').localeCompare(b.id ?? ''));
  return [...starter, ...own];
}

/** What is offered to the person as they add (§8.5): every entry that is not hidden. A hidden starter entry is offered nowhere until it is shown again. */
export const offered = (entries: readonly InventoryEntry[]): InventoryEntry[] =>
  entries.filter((entry) => !entry.hidden);

/**
 * **Whether the person's Inventory has a name already** (§8.8): an item of their own, or a starter entry (renamed or not, hidden or not: a hidden one is one they chose to
 * be rid of, and typing its name is not a new name), by **canonical name**, so that capitals, spaces and a starter's plural do not make a second. A deleted row is not
 * there. This is what a new name typed on a list asks before it makes an Inventory item: it makes one only for a name the person does not have.
 */
export function inventoryHas(
  rows: readonly InventoryRow[],
  name: string,
  catalog: readonly StarterEntry[] = STARTER_CATALOG,
): boolean {
  return entryNamed(layerInventory(rows, catalog), name) !== undefined;
}

/** The entry that has a name, by canonical name (what `inventoryHas` asks), so that a screen can open the one a typed name is, rather than make a second. */
export function entryNamed(
  entries: readonly InventoryEntry[],
  name: string,
): InventoryEntry | undefined {
  const wanted = canonicalName(name);
  return entries.find(
    (entry) =>
      canonicalName(entry.name) === wanted ||
      // A starter entry a person renamed is still that entry: its own name and its aliases are the name too (typing "bread" after renaming it _Sourdough_ is not a new name).
      (entry.starterKey !== null &&
        canonicalName(starterEntryByKey(entry.starterKey)?.name ?? '') === wanted) ||
      entry.aliases.some((alias) => canonicalName(alias) === wanted),
  );
}
