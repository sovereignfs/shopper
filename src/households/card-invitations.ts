import { sql } from 'drizzle-orm';
import type { KeyRing } from '../crypto/keys';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { appTable } from '../db/tables';
import { cardAdminOf } from '../access/membership';
import { personById } from '../people/people';
import { INVITATION_TTL_MS, MAX_LIVE_INVITATIONS, hashToken, newToken } from './invitations';

/**
 * **Links to a card** (DESIGN.md §7.7, §13.5, RFC 0007), as a list's (`invitations.ts`): a random token of 32 bytes stored only as its hash, valid 14 days, single-use, revocable, at most 20 live for a
 * card. **Only the card's Admin makes, lists and revokes them** (a Member of a card sees and shows it, and leaves), and every statement carries that condition, never a check made first. A link to a
 * card is made in a group that has moved, since a card exists in no other, and **carries that card's keys and no other** (`wrappedKey`, wrapped by the Admin's browser under the link's secret).
 * Accepting is `acceptInvitation`'s, in one transaction with the list's links, since one page and one door take both.
 */
export type MadeCardLink =
  | { readonly ok: true; readonly id: string; readonly token: string; readonly expiresAt: number }
  | { readonly ok: false; readonly refused: string };

export async function createCardInvitation(
  database: Database,
  input: {
    household: string;
    card: string;
    accountId: string;
    personId: string;
    now: number;
    /** The card's keyring, wrapped by the inviter's browser under the link's secret (`ck2.`). */
    wrappedKey: string;
  },
): Promise<MadeCardLink> {
  const { household, card, accountId, personId, now, wrappedKey } = input;
  const table = appTable(database, 'invitation');
  // What expired links held of the card's keys goes, so that nothing waits on the server for a link nobody can use.
  await dbAll(
    database,
    sql`UPDATE ${table} SET wrapped_key = NULL
        WHERE household_id = ${household} AND card_id = ${card} AND wrapped_key IS NOT NULL AND expires_at <= ${now} RETURNING id`,
  );
  const state = await dbGet<{ encryption: string }>(
    database,
    sql`SELECT h.encryption FROM ${appTable(database, 'household')} h
        WHERE h.id = ${household} AND ${cardAdminOf(database, card, accountId)}`,
  );
  if (state && state.encryption !== 'encrypted')
    return {
      ok: false,
      refused: 'This card cannot be shared yet: reload the page and try again.',
    };
  const id = crypto.randomUUID();
  const token = newToken();
  const expiresAt = now + INVITATION_TTL_MS;
  const made = await dbAll<{ id: string }>(
    database,
    sql`INSERT INTO ${table} (id, household_id, card_id, token_hash, created_by, created_at, expires_at, wrapped_key)
        SELECT ${id}, ${household}, ${card}, ${hashToken(token)}, ${personId}, CAST(${now} AS BIGINT), CAST(${expiresAt} AS BIGINT), ${wrappedKey}
        WHERE ${cardAdminOf(database, card, accountId)}
          AND EXISTS (SELECT 1 FROM ${appTable(database, 'card')} WHERE id = ${card} AND household_id = ${household} AND deleted_at IS NULL)
          AND (SELECT COUNT(*) FROM ${table} WHERE card_id = ${card} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ${now}) < ${MAX_LIVE_INVITATIONS}
        RETURNING id`,
  );
  if (made.length === 0)
    return {
      ok: false,
      refused: `A card can have ${MAX_LIVE_INVITATIONS} links waiting at once, and this one has them. Revoke one that is not needed, or wait for one to be used.`,
    };
  return { ok: true, id, token, expiresAt };
}

/** Revokes a live link to a card, as one statement: by the card's Admin. `false` for anything else, which reads as not found. */
export async function revokeCardInvitation(
  database: Database,
  input: { household: string; card: string; accountId: string; invitation: string; now: number },
): Promise<boolean> {
  const { household, card, accountId, invitation, now } = input;
  const done = await dbAll<{ id: string }>(
    database,
    sql`UPDATE ${appTable(database, 'invitation')} SET revoked_at = ${now}, wrapped_key = NULL
        WHERE id = ${invitation} AND household_id = ${household} AND card_id = ${card}
          AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ${now}
          AND ${cardAdminOf(database, card, accountId)}
        RETURNING id`,
  );
  return done.length > 0;
}

export interface LiveCardLink {
  readonly id: string;
  /** The person who made it, by name. */
  readonly by: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  /** Always true for the one who may list them: the card's Admin revokes any of them. */
  readonly canRevoke: boolean;
}

/** A card's live links, for its Admin; empty for anyone else. A link is never in the answer: only its hash is stored. */
export async function liveCardInvitations(
  database: Database,
  ring: KeyRing,
  input: { household: string; card: string; accountId: string; now: number },
): Promise<LiveCardLink[]> {
  const { household, card, accountId, now } = input;
  const rows = await dbAll<{
    id: string;
    created_by: string;
    created_at: number | string;
    expires_at: number | string;
  }>(
    database,
    sql`SELECT i.id, i.created_by, i.created_at, i.expires_at
        FROM ${appTable(database, 'invitation')} i
        WHERE i.household_id = ${household} AND i.card_id = ${card} AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ${now}
          AND ${cardAdminOf(database, card, accountId)}
        ORDER BY i.created_at, i.id`,
  );
  const out: LiveCardLink[] = [];
  for (const row of rows) {
    const by = await personById(database, ring, row.created_by);
    out.push({
      id: row.id,
      by: by?.name ?? '',
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
      canRevoke: true,
    });
  }
  return out;
}
