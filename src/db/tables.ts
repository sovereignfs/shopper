import { sql, type SQL } from 'drizzle-orm';
import type { Database } from './client';
import { APP_STORE } from './config';

/**
 * The name of an app-store table as raw SQL needs it: qualified by the schema on PostgreSQL, where the app's tables are in `shopper`, and bare on
 * SQLite, where the store is a database of its own. Raw statements name tables through this and never by writing the schema, so no caller branches on
 * the dialect (`src/db/exec.ts`).
 */
export function appTable(database: Database, name: string): SQL {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('not a table name');
  return database.dialect === 'postgres'
    ? sql.raw(`"${APP_STORE}"."${name}"`)
    : sql.raw(`"${name}"`);
}
