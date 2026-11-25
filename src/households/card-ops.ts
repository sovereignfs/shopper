import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { cardAdminOf } from '../access/membership';
import { isId } from '../actions/format';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';
import {
  createCardInvitation,
  liveCardInvitations,
  revokeCardInvitation,
} from './card-invitations';
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
      // And the links to it: a link holds the card's keys under a secret, which must not outlive the card.
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'invitation')} WHERE card_id = ${cardId} AND household_id = ${household} RETURNING id`,
      );
      return { ok: true as const };
    });
  },
};

/**
 * **`card.invite.create`: make a link to a card** (DESIGN.md §7.7, §12.8), its **Admin's** alone. The link is in the answer **once**: only its hash is stored, so the sharing dialog shows it with a copy
 * button and a person who loses it makes another. It carries the card's keys, wrapped by the Admin's browser under the secret that goes after `#` (`ck2.`), and no other card's and no list's. The path
 * is the page `/invite/<token>`, which the caller joins to the app's own address.
 */
export const createCardInvite: Operation = {
  name: 'card.invite.create',
  who: 'admin',
  scope: 'card',
  input: z.object({
    card: z.string().refine(isId, 'not an id'),
    wrappedKey: z
      .string()
      .regex(/^ck2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      .max(8192),
  }),
  async run({ database, accountId, personId, household, now }, input) {
    const made = await createCardInvitation(database, {
      household,
      card: String(input.card),
      accountId,
      personId,
      now,
      wrappedKey: String(input.wrappedKey),
    });
    if (!made.ok) return { ok: false as const, refused: made.refused };
    return {
      ok: true as const,
      result: { id: made.id, path: `/invite/${made.token}`, expiresAt: made.expiresAt },
    };
  },
};

/** **`card.invite.revoke`**: a link to a card stops working, by its Admin; for anyone else it reads as not found, as a link that is gone. */
export const revokeCardInvite: Operation = {
  name: 'card.invite.revoke',
  who: 'admin',
  scope: 'card',
  input: z.object({
    card: z.string().refine(isId, 'not an id'),
    invitation: z.string().refine(isId, 'not an id'),
  }),
  async run({ database, accountId, household, now }, input) {
    const done = await revokeCardInvitation(database, {
      household,
      card: String(input.card),
      accountId,
      invitation: String(input.invitation),
      now,
    });
    return done
      ? { ok: true as const }
      : {
          ok: false as const,
          refused: 'That link is not there any more, or is not yours to revoke.',
        };
  },
};

/** **`card.invite.list`**: a card's live links for the sharing dialog (§16.14): who made each and when it expires. A link itself is never in the answer. Its Admin's. */
export const listCardInvites: Operation = {
  name: 'card.invite.list',
  who: 'admin',
  scope: 'card',
  input: z.object({ card: z.string().refine(isId, 'not an id') }),
  async run({ database, ring, accountId, household, now }, input) {
    return {
      ok: true as const,
      result: await liveCardInvitations(database, ring, {
        household,
        card: String(input.card),
        accountId,
        now,
      }),
    };
  },
};
