import { index, pgSchema, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { APP_STORE } from '../../config';
import { counter, epochMs, id, ref, sealed } from './columns';

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
