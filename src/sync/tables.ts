import type { SyncedTable } from '../actions/format';
import type { KeyRing } from '../crypto/keys';
import type { Limits } from '../limits/config';
import type { LimitKind } from '../limits/limits';
import { inventoryNameKey } from '../catalog/inventory-key';
import { productNameKey } from '../catalog/product-key';
import { starterEntryByKey } from '../catalog/starter';
import { invalid } from './refusal';

/**
 * **What the server knows of each synced table** (DESIGN.md §20.3), so that applying a mutation is one piece of code over a description and not a piece
 * for each table. A field is **sealed** (kept in the row's one `sealed` envelope, `src/crypto/sealed.ts`) or **plain** (a column of its own, named here, which
 * is the only way a field's name reaches SQL). `refs` are the fields that name another row, which must be **the household's own**. Everything else a table has
 * (its `seq`, its `fseq`, its name key) is the server's.
 *
 * A table is added here by the task that makes it: products with their table (4.1), lists (5.4) and items (5.5, here: the limit on open items is checked by `apply`, since it counts a list's open items and not a table's rows).
 */
export interface ColumnOf {
  readonly field: string;
  readonly column: string;
  /**
   * `bool`: the column is the dialect's boolean, and the field is a flag, `0` or `1`, in a mutation (`FieldValue`). The server converts at the database's edge,
   * so that PostgreSQL gets a boolean and SQLite its integer, and a merge compares flags with flags.
   */
  readonly kind?: 'bool';
}

export interface TableSpec {
  readonly table: SyncedTable;
  /** The table's name in the database. */
  readonly sql: string;
  /** The fields kept in the sealed envelope. */
  readonly sealed: readonly string[];
  /** The fields that are columns, each with its column. */
  readonly plain: readonly ColumnOf[];
  /**
   * Fields that name another row, and which table it is in: the household's own, or the change is refused. `starter_category` is a category the group was
   * made with (its `starter_key` is set): **what an item or a product names**, since a person's own categories are theirs alone (§8.3) and a list says one by
   * its own copy of it (`list_category`, which names no row of another group); `category` is any of the group's, for the person's own Inventory.
   */
  readonly refs: Readonly<
    Record<string, 'list' | 'product' | 'category' | 'starter_category' | 'person'>
  >;
  /** Columns the server sets from what the row says, not the device: a product's name key. */
  derive?(input: {
    household: string;
    ring: KeyRing;
    sealed: Readonly<Record<string, string | number | null>>;
    /** The row's other fields as they will be (the merged row, or the new row's), for a key that depends on one: an Inventory override's starter entry. */
    row: Readonly<Record<string, string | number | null>>;
  }): Record<string, string | number | null>;
  /**
   * Where a name key is unique: **in a list's catalog** (the default: a product, 21.3) or **in the whole group** (a table that is the group's alone, as an
   * Inventory item is, §8.8). A row made under a name already in its scope is folded into that one; a rename into one is refused.
   */
  readonly nameScope?: 'list' | 'group';
  /** The limit a new row of this table counts against, and how to count what is already there. */
  readonly limit?: { kind: LimitKind; of(limits: Limits): number };
}

export const TABLES: Partial<Record<SyncedTable, TableSpec>> = {
  item: {
    table: 'item',
    sql: 'item',
    sealed: ['name', 'note'],
    plain: [
      { field: 'listId', column: 'list_id' },
      { field: 'productId', column: 'product_id' },
      { field: 'quantity', column: 'quantity' },
      { field: 'unit', column: 'unit' },
      { field: 'categoryId', column: 'category_id' },
      { field: 'icon', column: 'icon' },
      { field: 'position', column: 'position' },
      { field: 'addedBy', column: 'added_by' },
      { field: 'addedAt', column: 'added_at' },
      { field: 'boughtAt', column: 'bought_at' },
      { field: 'boughtBy', column: 'bought_by' },
      { field: 'clearedAt', column: 'cleared_at' },
      { field: 'deletedAt', column: 'deleted_at' },
    ],
    refs: {
      listId: 'list',
      productId: 'product',
      categoryId: 'starter_category',
      addedBy: 'person',
      boughtBy: 'person',
    },
  },
  list: {
    table: 'list',
    sql: 'list',
    sealed: ['name', 'icon', 'color'],
    plain: [
      { field: 'position', column: 'position' },
      { field: 'clearing', column: 'clearing' },
      { field: 'archivedAt', column: 'archived_at' },
      { field: 'deletedAt', column: 'deleted_at' },
      { field: 'createdAt', column: 'created_at' },
    ],
    refs: {},
    limit: { kind: 'householdLists', of: (limits) => limits.householdLists },
  },
  product: {
    table: 'product',
    sql: 'product',
    sealed: ['name', 'note'],
    plain: [
      { field: 'listId', column: 'list_id' },
      { field: 'categoryId', column: 'category_id' },
      { field: 'icon', column: 'icon' },
      { field: 'defaultQuantity', column: 'default_quantity' },
      { field: 'defaultUnit', column: 'default_unit' },
      { field: 'lastAddedAt', column: 'last_added_at' },
      { field: 'deletedAt', column: 'deleted_at' },
      { field: 'createdAt', column: 'created_at' },
    ],
    refs: { listId: 'list', categoryId: 'starter_category' },
    derive: ({ household, ring, sealed }) => ({
      name_key: productNameKey(ring, household, String(sealed.name ?? '')),
    }),
    limit: { kind: 'householdProducts', of: (limits) => limits.householdProducts },
  },
  // An item of a person's Inventory (§8.8): the group's own account's alone, one name once in the group (a starter entry's override is by its key, and has the
  // starter's name unless it is given one).
  inventory_item: {
    table: 'inventory_item',
    sql: 'inventory_item',
    sealed: ['name', 'note'],
    plain: [
      { field: 'starterKey', column: 'starter_key' },
      { field: 'categoryId', column: 'category_id' },
      { field: 'icon', column: 'icon' },
      { field: 'unit', column: 'unit' },
      { field: 'quantity', column: 'quantity' },
      { field: 'recurring', column: 'recurring', kind: 'bool' },
      { field: 'hidden', column: 'hidden', kind: 'bool' },
      { field: 'deletedAt', column: 'deleted_at' },
      { field: 'createdAt', column: 'created_at' },
    ],
    refs: { categoryId: 'category' },
    nameScope: 'group',
    derive: ({ household, ring, sealed, row }) => {
      const name =
        typeof sealed.name === 'string'
          ? sealed.name
          : starterEntryByKey(String(row.starterKey ?? ''))?.name;
      // An override that keeps the starter's name, of an entry this build does not have, has no name to make a key from.
      if (name === undefined) throw invalid('that starter entry is not known here');
      return { name_key: inventoryNameKey(ring, household, name) };
    },
    limit: { kind: 'inventoryItems', of: (limits) => limits.inventoryItems },
  },
};
