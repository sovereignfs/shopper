import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { counter, epochMs, id, ref, sealed } from './columns';

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
