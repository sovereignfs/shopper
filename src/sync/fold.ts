import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { appTable } from '../db/tables';

/**
 * **Folding** (DESIGN.md §12.4): the same thing made twice becomes one. The server does it in the mutation's transaction, and records it so that devices
 * can follow: an `alias` from the id the device made to the row it became, and a `tombstone` for the folded id, both stamped with the mutation's `seq`.
 * It is the only change the server makes that a device did not send.
 *
 *  - **A product made for a name the household already has** is folded into the existing one, which keeps what it has and takes what the new one says
 *    where it has nothing (`foldProductFields`). A product that is only *renamed* to a name that is taken is not folded but refused, with the merge
 *    offered (task 5.6): renaming is a person's decision, and making is not.
 *  - Folding an item made for a product already open on the list, and a second tick, join with items (task 5.5).
 */
export interface Fold {
  readonly table: string;
  readonly from: string;
  readonly to: string;
}

/** Records that `from` became `to`. Idempotent: a second record of the same fold, from a replay, is the same row. */
export async function recordFold(
  database: Database,
  household: string,
  fold: Fold,
  seq: number,
  now: number,
): Promise<void> {
  await dbAll(
    database,
    sql`INSERT INTO ${appTable(database, 'alias')} (household_id, table_name, from_id, to_id, seq, created_at)
        VALUES (${household}, ${fold.table}, ${fold.from}, ${fold.to}, ${seq}, ${now})
        ON CONFLICT (household_id, table_name, from_id) DO NOTHING RETURNING from_id`,
  );
  await dbAll(
    database,
    sql`INSERT INTO ${appTable(database, 'tombstone')} (household_id, table_name, id, seq, created_at)
        VALUES (${household}, ${fold.table}, ${fold.from}, ${seq}, ${now})
        ON CONFLICT (household_id, table_name, id) DO NOTHING RETURNING id`,
  );
}

/** The longest chain of folds followed: a row folded into one that was then folded. Far more than there will be, and it ends a cycle that should not be. */
const MAX_HOPS = 8;

/**
 * Where an id has gone: the id itself if it was never folded, and otherwise the row it became, following a chain. **A later change that names a folded id
 * is applied to what it became** (DESIGN.md §12.4), so a device that has not yet pulled the alias loses nothing.
 */
export async function resolveAlias(
  database: Database,
  household: string,
  table: string,
  id: string,
): Promise<string> {
  let current = id;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const next = await dbGet<{ to_id: string }>(
      database,
      sql`SELECT to_id FROM ${appTable(database, 'alias')} WHERE household_id = ${household} AND table_name = ${table} AND from_id = ${current}`,
    );
    if (!next) return current;
    current = next.to_id;
  }
  return current;
}

/**
 * What a folded product's sent fields add to the one it became: **a field the existing one has nothing in is taken from the new one**, and what the
 * existing one has is kept (it was there first). `lastAddedAt` is the later of the two. Pure.
 */
export function foldProductFields(
  existing: Readonly<Record<string, string | number | null>>,
  sent: Readonly<Record<string, string | number | null>>,
): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const field of ['note', 'categoryId', 'icon', 'defaultQuantity', 'defaultUnit'] as const) {
    const have = existing[field] ?? null;
    const given = sent[field] ?? null;
    if (have === null && given !== null) out[field] = given;
  }
  const last = sent.lastAddedAt;
  if (typeof last === 'number' && last > Number(existing.lastAddedAt ?? 0)) out.lastAddedAt = last;
  return out;
}
