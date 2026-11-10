import { index, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bool, counter, decimal, epochMs, fseq, id, position, ref, sealed } from './columns';

/**
 * What the server holds in the app store (`shopper`, DESIGN.md §20). An account is better-auth's, in the other store, so an `account_id` is a
 * reference by value and not a foreign key; there are none, and every deletion names what it deletes (`People.deletePerson`, task 2.5).
 * Each later task adds its tables here by its own migration: persons and households (epic 3), the catalog and what syncs (epics 4 to 6).
 */

/**
 * Counts for rate limits, in the database so that a limit holds across every process (`src/limits/rate.ts`): a key, when its window began, and
 * how many have been counted in it. Swept when a window is long over.
 */
export const rateBucket = sqliteTable(
  'rate_bucket',
  {
    key: id('key'),
    windowStart: epochMs('window_start').notNull(),
    count: counter('count').notNull(),
  },
  (table) => [index('rate_bucket_window_idx').on(table.windowStart)],
);

/**
 * Shopper's record of someone who appears on shared rows (DESIGN.md §6.1): every account has exactly one, made with it, and it keeps the name when the
 * account is deleted. The name and the email are sealed (`src/crypto/sealed.ts`). `account_id` is better-auth's user id, a reference by value because it
 * lives in the other store, and it is unique and may be null (a person whose account is gone, or an imported one); `core_sub` is the identity a core
 * knows the person by, set when they sign in through one (task 2.3), and is unique too. `kind` is `account` or, with import (task 11.2), `imported`.
 */
export const person = sqliteTable(
  'person',
  {
    id: id('id'),
    accountId: ref('account_id'),
    coreSub: ref('core_sub'),
    kind: text('kind').notNull().default('account'),
    sealed: sealed('sealed').notNull(),
    deletedAt: epochMs('deleted_at'),
    createdAt: epochMs('created_at').notNull(),
    updatedAt: epochMs('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('person_account_id_idx').on(table.accountId),
    uniqueIndex('person_core_sub_idx').on(table.coreSub),
  ],
);

/**
 * A household (DESIGN.md §7.1): the unit of sharing, and of sync (`seq` is its change counter, incremented by every transaction that writes a row of it,
 * §12.3). Everything a household shops with carries its `household_id`. `own_of` is the account whose first household this is, made with the account
 * (§7.4): unique, so making it twice is harmless, and null for any other. `sealed` holds the name and is **null while a household has none**, which in
 * 0.1.0 is always (it is shown by the rule of §7.4; naming one is task 3.8). The colour and the currency are phase 2's columns.
 */
export const household = sqliteTable(
  'household',
  {
    id: id('id'),
    ownOf: ref('own_of'),
    sealed: sealed('sealed'),
    seq: counter('seq').notNull().default(0),
    createdBy: ref('created_by').notNull(),
    createdAt: epochMs('created_at').notNull(),
    updatedAt: epochMs('updated_at').notNull(),
  },
  (table) => [uniqueIndex('household_own_of_idx').on(table.ownOf)],
);

/**
 * A person's place in a household, with a role: `admin` or `member` (DESIGN.md §7.2). A person who leaves keeps the row with `left_at` set, so that what
 * they added keeps their name and joining again is the same row; **active** means `left_at` is null, and every statement says so (§5.2).
 */
export const member = sqliteTable(
  'member',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    personId: ref('person_id').notNull(),
    role: text('role').notNull().default('member'),
    joinedAt: epochMs('joined_at').notNull(),
    leftAt: epochMs('left_at'),
    seq: counter('seq').notNull().default(0),
  },
  (table) => [
    uniqueIndex('member_household_person_idx').on(table.householdId, table.personId),
    index('member_person_idx').on(table.personId),
  ],
);

/**
 * What a household remembers about something it buys (DESIGN.md §8.2), so that adding is one tap and the item arrives right. **One product per name in a
 * household**: `name_key` is the HMAC of its normalised name (`src/crypto/name-key.ts`), unique with `household_id`, so the server finds "the same
 * product" without reading a name, and a second made for the same name is folded into the first (task 5.3). The name and the note are sealed. Its
 * category and icon are what the next add comes with; `default_quantity` and `default_unit` likewise; `times_bought`, `last_bought_at` and
 * `last_added_at` are what suggestions rank by (§8.5), kept by apply. The last unit price and the barcode are phase 2's and 4's columns. `fseq` is
 * the `seq` of each field's last change (§12.4), which merging reads without unsealing; `seq` is the household's counter at the row's last change.
 */
export const product = sqliteTable(
  'product',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    nameKey: ref('name_key').notNull(),
    sealed: sealed('sealed').notNull(),
    categoryId: ref('category_id'),
    icon: text('icon'),
    defaultQuantity: decimal('default_quantity'),
    defaultUnit: text('default_unit'),
    timesBought: counter('times_bought').notNull().default(0),
    lastBoughtAt: epochMs('last_bought_at'),
    lastAddedAt: epochMs('last_added_at'),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('product_household_name_key_idx').on(table.householdId, table.nameKey),
    index('product_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * A section of the shop, of one household (DESIGN.md §8.3): the starter categories are rows of its own, keyed by `starter_key` until renamed, and their
 * `position` is the household's **aisle order**, which lists and shopping mode group items by. **In 0.1.0 they are fixed**: made with the household
 * (`src/catalog/categories.ts`), never changed, and renaming, hiding, adding and reordering them are task 4.7's, so that the rows, the sync and the
 * sealing are the ones phase 2 edits. `sealed` holds the name once a person gives one, and is null for a starter name, which is the code's.
 */
export const category = sqliteTable(
  'category',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    starterKey: text('starter_key'),
    sealed: sealed('sealed'),
    icon: text('icon'),
    position: position('position').notNull(),
    hidden: bool('hidden').notNull().default(false),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
  },
  (table) => [
    uniqueIndex('category_household_starter_key_idx').on(table.householdId, table.starterKey),
    index('category_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * **Every mutation the server has applied** (DESIGN.md §12.3), by the account that sent it and the id the device made, with the household's `seq` it
 * was applied at. A mutation sent again, because an answer was lost, finds its row and **writes nothing**: it is answered as it was. Pruned after ninety
 * days with the history (task 6.6, phase 2). Not a row of a household's: it is the account's, and goes with it (`deletePerson`).
 */
export const appliedMutation = sqliteTable(
  'applied_mutation',
  {
    accountId: ref('account_id').notNull(),
    id: ref('id').notNull(),
    householdId: ref('household_id').notNull(),
    seq: counter('seq').notNull(),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

/**
 * **A row made twice that became one** (DESIGN.md §12.4): the product a second device made for a name the household already had, folded into the
 * first by the server, in the mutation's transaction. `from_id` is the id the device made, `to_id` the row it became; the server re-points later changes
 * that name `from_id` before applying them, and pull hands the alias to devices, which re-point what they hold (task 6.1). The one change the server makes
 * that a device did not send. Pruned after ninety days with the history (phase 2).
 */
export const alias = sqliteTable(
  'alias',
  {
    householdId: ref('household_id').notNull(),
    tableName: text('table_name').notNull(),
    fromId: ref('from_id').notNull(),
    toId: ref('to_id').notNull(),
    seq: counter('seq').notNull(),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.tableName, table.fromId] }),
    index('alias_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * **What was removed, so that devices learn of it** (DESIGN.md §12.9): the id of a row that is gone, with the `seq` it went at, so that a device that pulls
 * past it deletes its copy. A folded id has one too. A household's row, deleted with it.
 */
export const tombstone = sqliteTable(
  'tombstone',
  {
    householdId: ref('household_id').notNull(),
    tableName: text('table_name').notNull(),
    id: ref('id').notNull(),
    seq: counter('seq').notNull(),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.tableName, table.id] }),
    index('tombstone_household_seq_idx').on(table.householdId, table.seq),
  ],
);
