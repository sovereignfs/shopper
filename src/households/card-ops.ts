import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { cardAdminOf } from '../access/membership';
import { isId } from '../actions/format';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';
import type { Operation } from './ops';

/**
 * **`card.delete`: delete a card** (DESIGN.md §7.7, §12.8), its Admin's online operation, as a list's deletion is: decided by the server at once, never queued offline. It removes the card, its
 * people and their copies of its keys, and steps the group's counter, so that every device learns of it at its next sync (a pull names the cards its reader may see, and a device forgets the
 * rest: the card's people are gone with it, so a tombstone kept for them would reach nobody, and one for the group would say a card was there). A card is deleted outright, with no archive step: it
 * holds a number the person can type again, and its Admin has just said so.
 *
 * The statement carries the Admin condition itself: the dispatcher's check is only the early, uniform refusal.
 */
export const deleteCard: Operation = {
  name: 'card.delete',
  who: 'admin',
  scope: 'card',
  input: z.object({ card: z.string().refine(isId, 'not an id') }),
  async run({ database, accountId, household, now }, input) {
    const cardId = String(input.card);
    return transaction(database, async (tx) => {
      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1, updated_at = ${now}
            WHERE id = ${household} AND ${cardAdminOf(tx, cardId, accountId)} RETURNING seq`,
      );
      if (!stepped)
        return {
          ok: false as const,
          refused: 'That is not there any more, or is not yours to change.',
        };
      const gone = await dbAll<{ id: string }>(
        tx,
        sql`DELETE FROM ${appTable(tx, 'card')} WHERE id = ${cardId} AND household_id = ${household} RETURNING id`,
      );
      if (gone.length === 0)
        return {
          ok: false as const,
          refused: 'That is not there any more, or is not yours to change.',
        };
      // Its keys and its people go with it, each deletion naming what it deletes.
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'card_key')} WHERE card_id = ${cardId} AND household_id = ${household} RETURNING card_id`,
      );
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'card_member')} WHERE card_id = ${cardId} AND household_id = ${household} RETURNING id`,
      );
      return { ok: true as const };
    });
  },
};
