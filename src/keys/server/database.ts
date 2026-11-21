import { type SQL, sql } from 'drizzle-orm';
import type { VaultDatabase, VaultExecutor } from '@sovereignfs/sdk/vault';
import type { Database } from '../../db/client';
import { dbExec, transaction } from '../../db/exec';

/**
 * Shopper's database in the shape the SDK's vault reads (`VaultDatabase`, sdk §9.5): a statement with `?` placeholders and its arguments, its rows and
 * how many it changed, and a transaction. The statement is turned into Drizzle's, its arguments bound as values and never put in its text, so the
 * vault's statements run through the same driver, and on a file the same one-writer-at-a-time queue, as Shopper's own (`src/db/exec.ts`).
 */
export function vaultDatabase(database: Database): VaultDatabase {
  return {
    family: database.dialect,
    run: executor(database).run,
    transaction: (work) => transaction(database, (tx) => work(executor(tx))),
  };
}

function executor(database: Database): VaultExecutor {
  return { run: (text, args = []) => dbExec(database, bound(text, args)) };
}

/** `text` with each `?` replaced by its argument, bound. A `?` inside a quoted string is not a placeholder: the vault's statements have none. */
export function bound(text: string, args: readonly unknown[]): SQL {
  const parts = text.split('?');
  if (parts.length - 1 !== args.length)
    throw new TypeError(
      `a statement has ${parts.length - 1} placeholders and ${args.length} arguments`,
    );
  const chunks: SQL[] = [sql.raw(parts[0] ?? '')];
  for (let i = 0; i < args.length; i += 1)
    chunks.push(sql`${args[i]}`, sql.raw(parts[i + 1] ?? ''));
  return sql.join(chunks, sql.raw(''));
}
