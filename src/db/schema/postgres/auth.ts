import { boolean, index, integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';
import { AUTH_STORE } from '../../config';
import { epochMs } from './columns';

/** The auth store's schema; the app's is `shopper`. */
export const auth = pgSchema(AUTH_STORE);

/**
 * **Frozen: the auth store as 0.1.0 and 0.2.x left it** (better-auth's tables under its singular names, in `shopper_auth`), which
 * `migrations/auth` still makes before `@sovereignfs/auth` moves the store onto its own tables at every start (ADR 0001,
 * `src/auth/migrate.ts`). Nothing reads or writes through these any more and no migration is generated from them: they say what the
 * move starts from, for the tests of it.
 */
const date = (name: string) => timestamp(name, { withTimezone: true });

export const user = auth.table('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
});

export const session = auth.table(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: date('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    // The session's key secret (RFC 0001, sdk §9.5): what the browser's kept keys are wrapped by, served only to this session's pages, and gone
    // with the session. Shopper's own column, beside better-auth's.
    keySecret: text('key_secret'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = auth.table(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: date('access_token_expires_at'),
    refreshTokenExpiresAt: date('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    // Whether `password` is a hash of the sign-in value the browser derives (RFC 0001), as every password made since is, or of a 0.1.0 password,
    // which is moved once at its next sign-in. Shopper's own column.
    passwordDerived: boolean('password_derived').notNull().default(false),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = auth.table(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: date('expires_at').notNull(),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/** Request counts per key, so a limit holds across every process (DESIGN.md §15). */
export const rateLimit = auth.table('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: epochMs('last_request').notNull(),
});
