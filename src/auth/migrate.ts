import { CORE_SIGN_IN_MIGRATIONS_TABLE, coreSignInMigrations } from '@sovereignfs/auth/core';
import { runMigrations, type Database } from '@sovereignfs/auth/database';
import {
  ACCOUNT_MIGRATIONS_TABLE,
  accountMigrations,
  adoptAccountTables,
  type AdoptionResult,
} from '@sovereignfs/auth/server';
import { SDK_STORE_MIGRATIONS_TABLE, sdkStoreMigrations } from './sdk-stores';

const migrateCore = (database: Database) =>
  runMigrations(database, coreSignInMigrations(database.family), {
    table: CORE_SIGN_IN_MIGRATIONS_TABLE,
  });

/**
 * The auth store onto `@sovereignfs/auth` (ADR 0001, auth.md §8.1), run at every start after Shopper's own auth migrations, which made
 * better-auth's tables under their singular names in 0.1.0 and 0.2.x and still make them in a new store, so every store takes one road.
 *
 * 1. `adoptAccountTables` renames them onto the package's, adds its columns and tables and marks every password for 90 days, once.
 * 2. **Shopper's own step:** a password Shopper already moved (`password_derived`, RFC 0001) is a hash of the sign-in value, which has
 *    nothing to move, so its mark goes. Otherwise the sign-in page would offer to move it, and send its password, for 90 days.
 * 3. The package's migrations, the core sign-in's and the SDK's stores, each under its own history, every time: a later release of the
 *    package adds its migrations here.
 *
 * Every step is safe to run again.
 */
export async function migrateAuthStore(database: Database): Promise<AdoptionResult> {
  // The core sign-in's tables are made whether or not core is a way in now: core can be turned on later, and the move fills them.
  const result = await adoptAccountTables(database, { core: { migrate: migrateCore } });
  await database.run(
    `DELETE FROM sv_legacy_passwords WHERE user_id IN (
       SELECT user_id FROM accounts WHERE provider_id = 'credential' AND password_derived = ${database.family === 'postgres' ? 'true' : '1'})`,
  );
  await runMigrations(database, accountMigrations(database.family), {
    table: ACCOUNT_MIGRATIONS_TABLE,
  });
  await migrateCore(database);
  await runMigrations(database, sdkStoreMigrations(database.family), {
    table: SDK_STORE_MIGRATIONS_TABLE,
  });
  return result;
}
