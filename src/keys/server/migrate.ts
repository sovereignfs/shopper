import { sql } from 'drizzle-orm';
import { VAULT_MIGRATIONS_TABLE, vaultMigrations } from '@sovereignfs/sdk/vault';
import type { Database } from '../../db/client';
import { dbAll, dbRun, transaction } from '../../db/exec';

const POSTGRES_LOCK_KEY = 4_270_117_002; // the app's own migrations take ...001

/**
 * The SDK's vault tables (`sv_key_*`, sdk §9.5), in the app's store, recorded in a history of their own (`sv_key_migrations`) apart from Shopper's
 * migrations, as the SDK asks. Each migration runs whole in one transaction, with its record; on PostgreSQL the transaction holds a lock, so two
 * processes starting together apply each one once. Safe to run at every start.
 */
export async function runVaultMigrations(database: Database): Promise<void> {
  const table = sql.raw(VAULT_MIGRATIONS_TABLE);
  await dbRun(
    database,
    sql`CREATE TABLE IF NOT EXISTS ${table} (name text PRIMARY KEY NOT NULL, applied_at bigint NOT NULL)`,
  );
  for (const migration of vaultMigrations(database.dialect)) {
    await transaction(database, async (tx) => {
      if (tx.dialect === 'postgres')
        await dbRun(tx, sql`SELECT pg_advisory_xact_lock(${POSTGRES_LOCK_KEY})`);
      const done = await dbAll(tx, sql`SELECT name FROM ${table} WHERE name = ${migration.name}`);
      if (done.length > 0) return;
      for (const statement of migration.sql.split('--> statement-breakpoint')) {
        if (statement.trim() !== '') await dbRun(tx, sql.raw(statement));
      }
      await dbRun(
        tx,
        sql`INSERT INTO ${table} (name, applied_at) VALUES (${migration.name}, ${Date.now()})`,
      );
    });
  }
}
