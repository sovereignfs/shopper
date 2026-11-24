import type { Change, FieldValue, SyncedTable } from '../actions/format';
import type { CategoryRow, InventoryRow, ItemRow, ListRow, ProductRow } from '../actions/rows';
import { starterCategory } from '../catalog/categories';
import { mergeChange } from '../sync/merge';
import { withoutSecondTick } from '../sync/items';

/**
 * **The rows as a device holds them** (DESIGN.md §12.1): the shapes the server pulls (`src/sync/pull.ts`) and the actions take (`src/actions/rows.ts`), so that
 * a screen reads a row, hands it to an action and gets a mutation back. Two pure functions say how a row changes on the device, and neither touches
 * IndexedDB, so they are tested with none.
 */
export type { CategoryRow, InventoryRow, ItemRow, ListRow, ProductRow };

/** A person's place in a household, as the reader may see it (an address only where `canSeeEmail` allows). */
export interface MemberRow {
  readonly householdId: string;
  /** The list this person is on (RFC 0004): people are a list's, one row per list they are on. */
  readonly listId: string;
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

export type RowOf = {
  list: ListRow;
  item: ItemRow;
  product: ProductRow;
  inventory_item: InventoryRow;
  category: CategoryRow;
};
export type SyncedRow = RowOf[SyncedTable];

/** What a field is before anyone says anything about it, for a row a device makes. The server's defaults are these. */
const DEFAULTS: { [T in SyncedTable]: Record<string, FieldValue> } = {
  list: { icon: null, color: null, clearing: 'manual', archivedAt: null, deletedAt: null },
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
  inventory_item: {
    starterKey: null,
    name: null,
    note: null,
    categoryId: null,
    icon: null,
    unit: null,
    quantity: null,
    recurring: 0,
    hidden: 0,
    deletedAt: null,
  },
  // A category a device makes is the person's own (a starter one comes from the server with the group).
  category: { starterKey: null, name: '', icon: null, hidden: 0, deletedAt: null },
};

/** The fields of a table that are flags: `0` or `1` in a mutation, and a boolean in a row as a device keeps it (the same as the pull hands it). */
const FLAGS: { [T in SyncedTable]: readonly string[] } = {
  list: [],
  item: [],
  product: [],
  inventory_item: ['recurring', 'hidden'],
  category: ['hidden'],
};
const asFlags = (row: Record<string, FieldValue | boolean>) => {
  const out: Record<string, FieldValue> = {};
  for (const [field, value] of Object.entries(row))
    out[field] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  return out;
};
const asBooleans = (table: SyncedTable, row: Record<string, FieldValue>) => {
  const out: Record<string, FieldValue | boolean> = { ...row };
  for (const field of FLAGS[table]) if (field in out) out[field] = out[field] === 1;
  return out;
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
  // A flag is a number while a change is merged into the row, and a boolean again after: the row is what a pull would hand over.
  const base = asFlags(
    (row ?? {
      id: change.id,
      householdId,
      seq: 0,
      ...(table === 'item' || table === 'category' ? {} : { createdAt: now }),
      ...DEFAULTS[table],
    }) as unknown as Record<string, FieldValue | boolean>,
  );
  const fields =
    table === 'item'
      ? withoutSecondTick(typeof base.boughtAt === 'number' ? base.boughtAt : null, change.fields)
      : change.fields;
  const merged = asBooleans(table, mergeChange(base, {}, fields, 0).values);
  // A starter category given back the code's name (`name: null`) shows it at once, as a pull will.
  if (table === 'category' && merged.name === null)
    merged.name =
      starterCategory(typeof merged.starterKey === 'string' ? merged.starterKey : '')?.name ?? '';
  return merged as unknown as RowOf[T];
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
  // A flag as a mutation says it, whatever the row keeps it as.
  const said = (value: FieldValue | boolean): FieldValue =>
    typeof value === 'boolean' ? (value ? 1 : 0) : value;
  for (const name of Object.keys(change.fields)) {
    const was = before[name] as FieldValue | boolean | undefined;
    if (was !== after[name] && was !== undefined) fields[name] = said(was);
  }
  if (before.deletedAt !== after.deletedAt && before.deletedAt !== undefined)
    fields.deletedAt = before.deletedAt;
  // A starter category that had the code's name has it again as `null`, not as the text: a row of the group's with no name of the person's holds no content (§8.3).
  if (table === 'category' && typeof fields.name === 'string') {
    const starter =
      typeof before.starterKey === 'string' ? starterCategory(before.starterKey) : undefined;
    if (starter && fields.name === starter.name) fields.name = null;
  }
  return Object.keys(fields).length === 0 ? null : { table, id: change.id, fields };
}
