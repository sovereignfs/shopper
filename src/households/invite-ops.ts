import { z } from 'zod';
import { isId } from '../actions/format';
import { createInvitation, liveInvitations, revokeInvitation } from './invitations';
import type { Operation } from './ops';

/**
 * **`invite.create`: make a link** (DESIGN.md §7.3, §12.8), any member's. The link is in the answer **once**: only its hash is stored, so the sharing dialog
 * shows it with a copy button and a person who loses it makes another. The path is the page `/invite/<token>`, which the caller joins to the app's own
 * address. No mail is sent and none is needed.
 */
export const createInvite: Operation = {
  name: 'invite.create',
  who: 'member',
  input: z.object({}),
  async run({ database, accountId, personId, household, now }) {
    const made = await createInvitation(database, { household, accountId, personId, now });
    if (!made.ok) return { ok: false as const, refused: made.refused };
    return {
      ok: true as const,
      result: { id: made.id, path: `/invite/${made.token}`, expiresAt: made.expiresAt },
    };
  },
};

/** **`invite.revoke`**: a link stops working. By whoever made it, or an Admin; for anyone else it reads as not found, as an invitation that is gone. */
export const revokeInvite: Operation = {
  name: 'invite.revoke',
  who: 'member',
  input: z.object({ invitation: z.string().refine(isId, 'not an id') }),
  async run({ database, accountId, personId, household, now }, input) {
    const done = await revokeInvitation(database, {
      household,
      accountId,
      personId,
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

/**
 * **`invite.list`**: the household's live links for the sharing dialog (DESIGN.md §16.9): who made each, when it expires, and whether the reader may revoke
 * it. A link itself is never in the answer, since only its hash is stored: making a new one is how to share again. Any member's.
 */
export const listInvites: Operation = {
  name: 'invite.list',
  who: 'member',
  input: z.object({}),
  async run({ database, ring, accountId, household, now }) {
    return {
      ok: true as const,
      result: await liveInvitations(database, ring, { household, accountId, now }),
    };
  },
};
