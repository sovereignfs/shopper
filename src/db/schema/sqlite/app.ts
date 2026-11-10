import { index, sqliteTable } from 'drizzle-orm/sqlite-core';
import { counter, epochMs, id } from './columns';

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
