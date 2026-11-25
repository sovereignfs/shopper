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
   * Fields that name another row, and which table it is in: the household's own, or the change is refused. `category_of_list` is **what an item or a product
   * names** (§8.3): a category the group was made with (its `starter_key` is set), or a copy of a person's own category on **the list the row is on after the
   * change** (a person's own categories are theirs alone, and a copy names no row of another group); `category` is any of the group's, for the person's own Inventory.
   */
  readonly refs: Readonly<
    Record<string, 'list' | 'product' | 'category' | 'category_of_list' | 'person' | 'card'>
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
  /**
   * The limit a new row of this table counts against, and how to count what is already there: the household's live rows, or **a list's** (`per: 'list'`, a list's copies
   * of categories, §8.3).
   */
  readonly limit?: { kind: LimitKind; of(limits: Limits): number; per?: 'list' };
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
      categoryId: 'category_of_list',
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
    refs: { listId: 'list', categoryId: 'category_of_list' },
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
  // A category of the group (§8.3): its name sealed here, or encrypted by the device for the group; no name key (a name is not folded: two devices can make one twice).
  // The limit counts the group's live categories, hidden and starter ones included (§7.6).
  category: {
    table: 'category',
    sql: 'category',
    sealed: ['name'],
    plain: [
      { field: 'icon', column: 'icon' },
      { field: 'position', column: 'position' },
      { field: 'hidden', column: 'hidden', kind: 'bool' },
      { field: 'deletedAt', column: 'deleted_at' },
    ],
    refs: {},
    limit: { kind: 'householdCategories', of: (limits) => limits.householdCategories },
  },
  // A list's copy of a person's own category (§8.3): its name is the device's ciphertext under the list's keys, and its source key is the device's HMAC, never an id. Only a group
  // that has moved has any (`run` refuses one in a sealed group), so there is no `derive` and nothing sealed here. A list's copies are counted against the limit for the list.
  list_category: {
    table: 'list_category',
    sql: 'list_category',
    sealed: ['name'],
    plain: [
      { field: 'listId', column: 'list_id' },
      { field: 'sourceKey', column: 'source_key' },
      { field: 'icon', column: 'icon' },
      { field: 'position', column: 'position' },
      { field: 'deletedAt', column: 'deleted_at' },
    ],
    refs: { listId: 'list' },
    limit: {
      kind: 'householdCategories',
      of: (limits) => limits.householdCategories,
      per: 'list',
    },
  },
  // A loyalty card (§7.7): every field of what the person wrote is a ciphertext under the card's keys, so nothing here is plain but its place and its times. A person makes cards in their
  // own group only, so the group's live cards are the person's.
  card: {
    table: 'card',
    sql: 'card',
    sealed: ['shop', 'number', 'kind', 'code', 'icon', 'color', 'holder', 'note'],
    plain: [
      { field: 'position', column: 'position' },
      { field: 'deletedAt', column: 'deleted_at' },
      { field: 'createdAt', column: 'created_at' },
    ],
    refs: {},
    limit: { kind: 'accountCards', of: (limits) => limits.accountCards },
  },
  // A card linked to a list (§7.7, 24.6): the pair, and a deletion for an unlink. There is nothing sealed. Both ids name a row of the household (`checkReferences`), and who may write it is a rule
  // of its own in `checkListAccess`: the list's Admin who is also on the card.
  list_card: {
    table: 'list_card',
    sql: 'list_card',
    sealed: [],
    plain: [
      { field: 'listId', column: 'list_id' },
      { field: 'cardId', column: 'card_id' },
      { field: 'deletedAt', column: 'deleted_at' },
      { field: 'createdAt', column: 'created_at' },
    ],
    refs: { listId: 'list', cardId: 'card' },
  },
};
