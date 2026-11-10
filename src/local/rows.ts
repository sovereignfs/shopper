import type { Change, FieldValue, SyncedTable } from '../actions/format';
import type { ItemRow, ListRow, ProductRow } from '../actions/rows';
import { mergeChange } from '../sync/merge';
import { withoutSecondTick } from '../sync/items';

/**
 * **The rows as a device holds them** (DESIGN.md §12.1): the shapes the server pulls (`src/sync/pull.ts`) and the actions take (`src/actions/rows.ts`), so that
 * a screen reads a row, hands it to an action and gets a mutation back. Two pure functions say how a row changes on the device, and neither touches
 * IndexedDB, so they are tested with none.
 */
export type { ItemRow, ListRow, ProductRow };

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

/** A person's place in a household, as the reader may see it (an address only where `canSeeEmail` allows). */
export interface MemberRow {
  readonly householdId: string;
  readonly personId: string;
  readonly name: string;
  readonly email: string | null;
  readonly role: 'admin' | 'member';
  readonly joinedAt: number;
  readonly leftAt: number | null;
  readonly self: boolean;
  readonly seq: number;
}

/** A household the account is in: how it is shown, and **how far this device has pulled it** (`cursor`). */
export interface HouseholdRecord {
  readonly id: string;
  readonly label: string;
  readonly own: boolean;
  readonly role: 'admin' | 'member';
  readonly seq: number;
  readonly cursor: number;
}

export type RowOf = { list: ListRow; item: ItemRow; product: ProductRow };
export type SyncedRow = RowOf[SyncedTable];

/** What a field is before anyone says anything about it, for a row a device makes. The server's defaults are these. */
const DEFAULTS: { [T in SyncedTable]: Record<string, FieldValue> } = {
  list: { clearing: 'manual', archivedAt: null, deletedAt: null },
  item: {
    note: null,
    unit: null,
    categoryId: null,
    icon: null,
    boughtAt: null,
    boughtBy: null,
    clearedAt: null,
    deletedAt: null,
  },
  product: {
    note: null,
    categoryId: null,
    icon: null,
    defaultQuantity: null,
    defaultUnit: null,
    timesBought: 0,
    lastBoughtAt: null,
    lastAddedAt: null,
    deletedAt: null,
  },
};

/**
 * What a change does to a row, **as the device shows it before the server has answered**: the rule the server applies (`mergeChange`, which is shared),
 * so that what a person sees is what they will be sent back. A new row is made if there is none; each field the change says is set and the rest are left;
 * an edit of a deleted row restores it; **a tick of an item that is already bought changes nothing about who bought it and when**. The server's order is
 * not known yet: a new row has `seq` 0, and a pull replaces the row as the server has it.
 */
export function applyChange<T extends SyncedTable>(
  table: T,
  row: RowOf[T] | undefined,
  change: Change,
  householdId: string,
  now: number,
): RowOf[T] {
  const base = (row ?? {
    id: change.id,
    householdId,
    seq: 0,
    ...(table === 'item' ? {} : { createdAt: now }),
    ...DEFAULTS[table],
  }) as unknown as Record<string, FieldValue>;
  const fields =
    table === 'item'
      ? withoutSecondTick(typeof base.boughtAt === 'number' ? base.boughtAt : null, change.fields)
      : change.fields;
  return mergeChange(base, {}, fields, 0).values as unknown as RowOf[T];
}

/**
 * The change that puts `before` back after `change` was applied to it (**undo is a new mutation that reverses the old**, DESIGN.md §12.7), or `null` if
 * nothing changed. A row the change made is deleted, except a product, which is the catalog learning and is left. A row that the change restored from
 * deleted is deleted again.
 */
export function reversal(
  table: SyncedTable,
  before: Record<string, FieldValue> | undefined,
  after: Record<string, FieldValue>,
  change: Change,
  now: number,
): Change | null {
  if (before === undefined) {
    return change.create && table !== 'product'
      ? { table, id: change.id, fields: { deletedAt: now } }
      : null;
  }
  const fields: Record<string, FieldValue> = {};
  for (const name of Object.keys(change.fields)) {
    if (before[name] !== after[name] && before[name] !== undefined) fields[name] = before[name];
  }
  if (before.deletedAt !== after.deletedAt && before.deletedAt !== undefined)
    fields.deletedAt = before.deletedAt;
  return Object.keys(fields).length === 0 ? null : { table, id: change.id, fields };
}
