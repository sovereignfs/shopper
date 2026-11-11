import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { adminOf, memberOf } from '../access/membership';
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
  target: string,
  by: 'self' | 'admin',
): Promise<OperationResult> {
  const { database, accountId, household, now } = context;
  try {
    return await transaction(database, async (tx) => {
      const member = appTable(tx, 'member');
      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1, updated_at = ${now}
            WHERE id = ${household}
              AND ${by === 'admin' ? adminOf(tx, household, accountId) : memberOf(tx, household, accountId)}
            RETURNING seq`,
      );
      if (!stepped) throw new Declined(NOT_THERE);
      const seq = Number(stepped.seq);
      // The condition on the row: still in; and never the last Admin (nor, by an Admin, another Admin).
      // Leaving, an Admin may go only if another is staying; removing, an Admin is never the target.
      const otherAdmin =
        by === 'self'
          ? sql` OR EXISTS (SELECT 1 FROM ${member} other
                            WHERE other.household_id = ${household} AND other.role = 'admin' AND other.left_at IS NULL AND other.person_id <> ${target})`
          : sql``;
      const ended = await dbAll<{ id: string }>(
        tx,
        sql`UPDATE ${member} SET left_at = ${now}, seq = ${seq}
            WHERE household_id = ${household} AND person_id = ${target} AND left_at IS NULL
              AND (role <> 'admin'${otherAdmin})
            RETURNING id`,
      );
      if (ended.length === 0) {
        const row = await dbGet<{ role: string }>(
          tx,
          sql`SELECT role FROM ${member} WHERE household_id = ${household} AND person_id = ${target} AND left_at IS NULL`,
        );
        throw new Declined(
          row?.role === 'admin'
            ? by === 'self'
              ? 'You are the only Admin, so you cannot leave. Nobody could look after this household.'
              : 'An Admin cannot be removed.'
            : NOT_THERE,
        );
      }
      await dbAll(
        tx,
        sql`UPDATE ${appTable(tx, 'invitation')} SET revoked_at = ${now}
            WHERE household_id = ${household} AND created_by = ${target}
              AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
      );
      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof Declined) return { ok: false as const, refused: error.message };
    throw error;
  }
}

export const leaveHousehold: Operation = {
  name: 'member.leave',
  who: 'member',
  input: z.object({}),
  run: (context) => end(context, context.personId, 'self'),
};

export const removeMember: Operation = {
  name: 'member.remove',
  who: 'admin',
  input: z.object({ person: z.string().refine(isId, 'not an id') }),
  run: (context, input) => end(context, String(input.person), 'admin'),
};
