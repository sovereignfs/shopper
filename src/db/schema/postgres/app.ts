import { index, pgSchema, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { APP_STORE } from '../../config';
import { counter, decimal, epochMs, fseq, id, ref, sealed } from './columns';

/** The app's schema; better-auth's is `shopper_auth` (DESIGN.md §20.1). */
export const app = pgSchema(APP_STORE);

/** See `schema/sqlite/app.ts`. */
export const rateBucket = app.table(
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
export const person = app.table(
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
export const household = app.table(
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
export const member = app.table(
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
export const product = app.table(
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
