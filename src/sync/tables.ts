import type { SyncedTable } from '../actions/format';
import type { KeyRing } from '../crypto/keys';
import type { Limits } from '../limits/config';
import type { LimitKind } from '../limits/limits';
import { productNameKey } from '../catalog/product-key';

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
}

export interface TableSpec {
  readonly table: SyncedTable;
  /** The table's name in the database. */
  readonly sql: string;
  /** The fields kept in the sealed envelope. */
  readonly sealed: readonly string[];
  /** The fields that are columns, each with its column. */
  readonly plain: readonly ColumnOf[];
  /** Fields that name another row, and which table it is in: the household's own, or the change is refused. */
  readonly refs: Readonly<Record<string, 'list' | 'product' | 'category' | 'person'>>;
  /** Columns the server sets from what the row says, not the device: a product's name key. */
  derive?(input: {
    household: string;
    ring: KeyRing;
    sealed: Readonly<Record<string, string | number | null>>;
  }): Record<string, string | number | null>;
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
      categoryId: 'category',
      addedBy: 'person',
      boughtBy: 'person',
    },
  },
  list: {
    table: 'list',
    sql: 'list',
    sealed: ['name'],
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
      { field: 'categoryId', column: 'category_id' },
      { field: 'icon', column: 'icon' },
      { field: 'defaultQuantity', column: 'default_quantity' },
      { field: 'defaultUnit', column: 'default_unit' },
      { field: 'lastAddedAt', column: 'last_added_at' },
      { field: 'deletedAt', column: 'deleted_at' },
      { field: 'createdAt', column: 'created_at' },
    ],
    refs: { categoryId: 'category' },
    derive: ({ household, ring, sealed }) => ({
      name_key: productNameKey(ring, household, String(sealed.name ?? '')),
    }),
    limit: { kind: 'householdProducts', of: (limits) => limits.householdProducts },
  },
};
