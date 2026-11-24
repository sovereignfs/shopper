import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { listAdminOf } from '../access/membership';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';
import { isId } from '../actions/format';
import { recordFold } from '../sync/fold';
import type { Operation } from './ops';
import { deleteListProducts } from '../lists/members';

/**
 * **`list.delete`: delete a list for good** (DESIGN.md §9.1, §12.8), an Admin's online operation, and only for a list that is **archived**: a person
 * archives first, which is the step that can be undone. It removes the list and its items by `list_id`, steps the
 * household's counter and leaves a tombstone, so that every device learns of it at its next sync. Items' trip lines keep the list's name (phase 2).
 *
 * The statement carries the Admin condition itself: the dispatcher's check is only the early, uniform refusal.
 */
export const deleteList: Operation = {
  name: 'list.delete',
  who: 'admin',
  scope: 'list',
  input: z.object({ list: z.string().refine(isId, 'not an id') }),
  async run({ database, accountId, household, now }, input) {
    const listId = String(input.list);
    return transaction(database, async (tx) => {
      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1, updated_at = ${now}
            WHERE id = ${household} AND ${listAdminOf(tx, listId, accountId)} RETURNING seq`,
      );
      if (!stepped)
        return {
          ok: false as const,
          refused: 'That is not there any more, or is not yours to change.',
        };
      const gone = await dbAll<{ id: string }>(
        tx,
        sql`DELETE FROM ${appTable(tx, 'list')}
            WHERE id = ${listId} AND household_id = ${household} AND archived_at IS NOT NULL RETURNING id`,
      );
      if (gone.length === 0) {
        // Not archived, or not there: nothing is changed, and the counter step is undone with the transaction.
        throw new RefusedDelete();
      }
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'item')} WHERE list_id = ${listId} AND household_id = ${household} RETURNING id`,
      );
      // Its copies of people's categories go with it (§8.3).
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'list_category')} WHERE list_id = ${listId} AND household_id = ${household} RETURNING id`,
      );
      // Its catalog goes with it (21.3).
      await deleteListProducts(tx, household, listId, Number(stepped.seq));
      // Its links go with it, so that nobody joins a list that is gone (RFC 0004).
      await dbAll(
        tx,
        sql`UPDATE ${appTable(tx, 'invitation')} SET revoked_at = ${now}, wrapped_key = NULL
            WHERE list_id = ${listId} AND household_id = ${household} AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
      );
      // Its people and their copies of its keys go with it (RFC 0004).
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'list_key')} WHERE list_id = ${listId} AND household_id = ${household} RETURNING list_id`,
      );
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'list_member')} WHERE list_id = ${listId} AND household_id = ${household} RETURNING id`,
      );
      await recordTombstone(tx, household, 'list', listId, Number(stepped.seq), now);
      return { ok: true as const };
    }).catch((error: unknown) => {
      if (error instanceof RefusedDelete)
        return {
          ok: false as const,
          refused: 'Only an archived list can be deleted for good: archive it first.',
        };
      throw error;
    });
  },
};

class RefusedDelete extends Error {}

async function recordTombstone(
  database: Parameters<typeof recordFold>[0],
  household: string,
  table: string,
  id: string,
  seq: number,
  now: number,
): Promise<void> {
  await dbAll(
    database,
    // No list of its own (RFC 0004): the list's people are deleted with it, so a tombstone kept to them would reach nobody. It names only an id, which
    // tells someone on another list of the group nothing.
    sql`INSERT INTO ${appTable(database, 'tombstone')} (household_id, table_name, id, seq, created_at)
        VALUES (${household}, ${table}, ${id}, ${seq}, ${now})
        ON CONFLICT (household_id, table_name, id) DO NOTHING RETURNING id`,
  );
}
