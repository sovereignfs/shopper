import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { cardAdminOf, onCard } from '../access/membership';
import { isId } from '../actions/format';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';
import type { Operation, OperationContext, OperationResult } from './ops';

/**
 * **Leaving a card and removing someone from it** (DESIGN.md §7.7, RFC 0007), as a list's (`member-ops.ts`): online operations decided by the server at once, **one transaction that steps the group's
 * counter and stamps the row with it**, so every other person's device learns of it at its next sync. The row stays with `left_at` set (so that what the person did keeps their name, and joining again
 * is the same row). Their copy of the card's keys goes with the membership, and the links they made that are still waiting stop. **What they hold on a device is not taken back:** a card's keys are not
 * changed when someone goes (DESIGN.md §13.2, settled with the owner: a new key comes with 16.8, for lists and cards together). Their device forgets the card at its next sync (a card they are no longer
 * on is not in the answer), and, if it was all they reached in the group, the whole group.
 *
 *  - **`card.member.leave`** (anyone on the card): leaves it. **The card's Admin cannot**, since there is no way to pass the role: it is deleted instead.
 *  - **`card.member.remove`** (its Admin): removes another person. An Admin is never the target.
 */
const NOT_THERE = 'That is not there any more, or is not yours to change.';

class Declined extends Error {}

async function end(
  context: OperationContext,
  card: string,
  target: string,
  by: 'self' | 'admin',
): Promise<OperationResult> {
  const { database, accountId, household, now } = context;
  try {
    return await transaction(database, async (tx) => {
      const people = appTable(tx, 'card_member');
      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1, updated_at = ${now}
            WHERE id = ${household}
              AND EXISTS (SELECT 1 FROM ${appTable(tx, 'card')} c WHERE c.id = ${card} AND c.household_id = ${household})
              AND ${by === 'admin' ? cardAdminOf(tx, card, accountId) : onCard(tx, card, accountId)}
            RETURNING seq`,
      );
      if (!stepped) throw new Declined(NOT_THERE);
      const seq = Number(stepped.seq);
      // Only someone who is not its Admin goes: an Admin neither leaves nor is removed.
      const ended = await dbAll<{ id: string }>(
        tx,
        sql`UPDATE ${people} SET left_at = ${now}, seq = ${seq}
            WHERE card_id = ${card} AND household_id = ${household} AND person_id = ${target} AND left_at IS NULL
              AND role <> 'admin'
            RETURNING id`,
      );
      if (ended.length === 0) {
        const row = await dbGet<{ role: string }>(
          tx,
          sql`SELECT role FROM ${people} WHERE card_id = ${card} AND person_id = ${target} AND left_at IS NULL`,
        );
        throw new Declined(
          row?.role === 'admin'
            ? by === 'self'
              ? 'You are the Admin of this card, so you cannot leave it. Delete it instead.'
              : 'An Admin cannot be removed.'
            : NOT_THERE,
        );
      }
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'card_key')} WHERE card_id = ${card} AND person_id = ${target} RETURNING card_id`,
      );
      await dbAll(
        tx,
        sql`UPDATE ${appTable(tx, 'invitation')} SET revoked_at = ${now}, wrapped_key = NULL
            WHERE card_id = ${card} AND created_by = ${target}
              AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
      );
      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof Declined) return { ok: false as const, refused: error.message };
    throw error;
  }
}

/** **`card.member.leave`**: the account leaves one card; the card goes from its devices at their next sync. */
export const leaveCard: Operation = {
  name: 'card.member.leave',
  who: 'member',
  scope: 'card',
  input: z.object({ card: z.string().refine(isId, 'not an id') }),
  run: (context, input) => end(context, String(input.card), context.personId, 'self'),
};

/** **`card.member.remove`**: a card's Admin takes someone off it. */
export const removeCardMember: Operation = {
  name: 'card.member.remove',
  who: 'admin',
  scope: 'card',
  input: z.object({
    card: z.string().refine(isId, 'not an id'),
    person: z.string().refine(isId, 'not an id'),
  }),
  run: (context, input) => end(context, String(input.card), String(input.person), 'admin'),
};
