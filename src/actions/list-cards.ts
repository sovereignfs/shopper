import { listCardId } from '../cards/links';
import type { Env } from './env';
import type { Mutation } from './format';
import type { ListCardRow } from './rows';

/**
 * **The actions on the cards linked to a list** (DESIGN.md §7.7, RFC 0007, task 24.6): link a card to a list, and take it off, each a pure function to a mutation, or `null` when it would change
 * nothing. A link is **the pair and nothing else**, and its id is the pair's (`listCardId`), so that the same link made on two devices is one row, and a link made again after an unlink is
 * that row with its unlink cleared. **Who may do either is the server's to say**: the list's Admin who is also on the card. `canLink` is only what the screen offers.
 */

/** Links a card to a list of the same group. `existing` is the row the device holds for the pair, deleted or not: a link that is there already is nothing to do. */
export function linkCard(
  env: Env,
  input: {
    householdId: string;
    listId: string;
    cardId: string;
    existing?: ListCardRow | undefined;
  },
): Mutation | null {
  const { householdId, listId, cardId, existing } = input;
  if (existing && existing.deletedAt === null) return null;
  return {
    mutationId: env.newId(),
    householdId,
    changes: [
      existing
        ? { table: 'list_card', id: existing.id, fields: { deletedAt: null } }
        : {
            table: 'list_card',
            id: listCardId(listId, cardId),
            create: true,
            // `deletedAt: null` so that a link made where the server has the pair already, unlinked by another device, is restored and not left as it was.
            fields: { listId, cardId, deletedAt: null, createdAt: env.now },
          },
    ],
  };
}

/** Takes a card off a list: the link is kept, with the time it was taken off, so that linking it again is the same row. */
export function unlinkCard(env: Env, link: ListCardRow): Mutation | null {
  if (link.deletedAt !== null) return null;
  return {
    mutationId: env.newId(),
    householdId: link.householdId,
    changes: [{ table: 'list_card', id: link.id, fields: { deletedAt: env.now } }],
  };
}

/** Whether the screen offers to link cards: the list's Admin does (the server holds it to that, and to being on the card). */
export const canLink = (role: 'admin' | 'member' | undefined): boolean => role === 'admin';
