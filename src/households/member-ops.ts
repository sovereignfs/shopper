import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { listAdminOf, onList } from '../access/membership';
import { isId } from '../actions/format';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';
import type { Operation, OperationContext, OperationResult } from './ops';

/**
 * **Leaving and removing** (DESIGN.md §7.2, §7.5), online operations decided by the server at once. Either ends a membership by setting `left_at` on the
 * member row, which stays so that what the person added keeps their name ("added by Sam (left)") and joining again is the same row. Each is **one
 * transaction that steps the household's counter and stamps the row with it**, so every other member's device learns of it at its next sync; the person's
 * own devices find the household missing from the answer and **drop their copy**. The links the person made and that are still waiting are revoked with
 * it: a link does not outlive the membership of whoever sent it.
 *
 *  - **`member.leave`** (any member): leaves the household. **The last Admin cannot**: with no way to pass the role in 0.1.0 (3.9 adds one), nobody
 *    could take over.
 *  - **`member.remove`** (an Admin): removes another member. An Admin cannot be removed, and a Member's attempt is not found (the dispatcher's answer and
 *    the statement's condition agree).
 *
 * The notice that someone was removed arrives with notices (9.2).
 */
const NOT_THERE = 'That is not there any more, or is not yours to change.';

class Declined extends Error {}

async function end(
  context: OperationContext,
  list: string,
  target: string,
  by: 'self' | 'admin',
): Promise<OperationResult> {
  const { database, accountId, household, now } = context;
  try {
    return await transaction(database, async (tx) => {
      const people = appTable(tx, 'list_member');
      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1, updated_at = ${now}
            WHERE id = ${household}
              AND ${by === 'admin' ? listAdminOf(tx, list, accountId) : onList(tx, list, accountId)}
            RETURNING seq`,
      );
      if (!stepped) throw new Declined(NOT_THERE);
      const seq = Number(stepped.seq);
      // The condition on the row: still on the list; and never its last Admin (nor, by an Admin, another Admin). Leaving, an Admin may go only if another
      // is staying; removing, an Admin is never the target.
      const otherAdmin =
        by === 'self'
          ? sql` OR EXISTS (SELECT 1 FROM ${people} other
                            WHERE other.list_id = ${list} AND other.role = 'admin' AND other.left_at IS NULL AND other.person_id <> ${target})`
          : sql``;
      const ended = await dbAll<{ id: string }>(
        tx,
        sql`UPDATE ${people} SET left_at = ${now}, seq = ${seq}
            WHERE list_id = ${list} AND household_id = ${household} AND person_id = ${target} AND left_at IS NULL
              AND (role <> 'admin'${otherAdmin})
            RETURNING id`,
      );
      if (ended.length === 0) {
        const row = await dbGet<{ role: string }>(
          tx,
          sql`SELECT role FROM ${people} WHERE list_id = ${list} AND person_id = ${target} AND left_at IS NULL`,
        );
        throw new Declined(
          row?.role === 'admin'
            ? by === 'self'
              ? 'You are the only Admin of this list, so you cannot leave it while others are on it.'
              : 'An Admin cannot be removed.'
            : NOT_THERE,
        );
      }
      // Their copy of the list's keys goes (RFC 0004). What they hold on a device is not taken back: a list's keys are not changed yet when someone goes.
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'list_key')} WHERE list_id = ${list} AND person_id = ${target} RETURNING list_id`,
      );
      await dbAll(
        tx,
        sql`UPDATE ${appTable(tx, 'invitation')} SET revoked_at = ${now}, wrapped_key = NULL
            WHERE list_id = ${list} AND created_by = ${target}
              AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
      );
      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof Declined) return { ok: false as const, refused: error.message };
    throw error;
  }
}

/** **`member.leave`**: the account leaves one list (RFC 0004); the list goes from its devices at their next sync. */
export const leaveHousehold: Operation = {
  name: 'member.leave',
  who: 'member',
  scope: 'list',
  input: z.object({ list: z.string().refine(isId, 'not an id') }),
  run: (context, input) => end(context, String(input.list), context.personId, 'self'),
};

/** **`member.remove`**: a list's Admin takes someone off it (RFC 0004). */
export const removeMember: Operation = {
  name: 'member.remove',
  who: 'admin',
  scope: 'list',
  input: z.object({
    list: z.string().refine(isId, 'not an id'),
    person: z.string().refine(isId, 'not an id'),
  }),
  run: (context, input) => end(context, String(input.list), String(input.person), 'admin'),
};
