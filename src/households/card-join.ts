import { sql } from 'drizzle-orm';
import { enqueuePush } from '@sovereignfs/push';
import type { KeyRing } from '../crypto/keys';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { appTable } from '../db/tables';
import { stampCard } from '../cards/members';
import type { Limits } from '../limits/config';
import { limitSentence } from '../limits/limits';
import { pushStore } from '../push/store';

/**
 * **Joining a card by a link** (DESIGN.md §7.7, RFC 0007), the card's half of `acceptInvitation`, run in **its transaction** so that a refusal rolls the claim of the link back. As a list is joined
 * (`src/households/invitations.ts`): the person is added in one statement that carries the limits, a person who left and joins again has the same row back as a Member, and the card's rows are stamped
 * at the join's `seq` so that a device whose cursor for the group is past them pulls them. **Joining a card puts the person on that card and nothing else of its group**: no list, no other card.
 *
 * Two limits, both in the statement: how many people a card can have (the setting for a list's), and how many cards an account is on, its own included (`SHOPPER_LIMIT_ACCOUNT_CARDS`), so that
 * joining is bounded as making is.
 */
export type CardJoin =
  | { readonly status: 'joined' }
  /** The person is on the card already: nothing changes, and the link stays unused (the caller rolls the claim back). */
  | { readonly status: 'already' }
  /** The card is not there any more: the link is as dead as one revoked. */
  | { readonly status: 'gone' }
  | { readonly status: 'refused'; readonly message: string };

export const cardPeopleSentence = (limit: number): string =>
  `A card can be shared with at most ${limit === 1 ? '1 person' : `${limit} people`}, and this one has them all.`;

export async function joinCard(
  tx: Database,
  ring: KeyRing,
  input: {
    household: string;
    card: string;
    person: { id: string; name: string };
    accountId: string;
    limits: Limits;
    now: number;
  },
): Promise<CardJoin> {
  const { household, card, person, accountId, limits, now } = input;
  const member = appTable(tx, 'card_member');
  const already = await dbGet<{ id: string }>(
    tx,
    sql`SELECT id FROM ${member} WHERE card_id = ${card} AND person_id = ${person.id} AND left_at IS NULL`,
  );
  if (already) return { status: 'already' };

  const stepped = await dbGet<{ seq: number | string }>(
    tx,
    sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1, updated_at = ${now} WHERE id = ${household} RETURNING seq`,
  );
  if (!stepped) return { status: 'gone' };
  const seq = Number(stepped.seq);
  const added = await dbAll<{ id: string }>(
    tx,
    sql`INSERT INTO ${member} (id, household_id, card_id, person_id, role, joined_at, left_at, seq)
        SELECT ${crypto.randomUUID()}, ${household}, ${card}, ${person.id}, 'member', CAST(${now} AS BIGINT), NULL, ${seq}
        WHERE EXISTS (SELECT 1 FROM ${appTable(tx, 'card')} WHERE id = ${card} AND household_id = ${household} AND deleted_at IS NULL)
          AND (SELECT COUNT(*) FROM ${member} WHERE card_id = ${card} AND left_at IS NULL) < ${limits.householdMembers}
          AND (SELECT COUNT(*) FROM ${member} m JOIN ${appTable(tx, 'person')} p ON p.id = m.person_id
               WHERE p.account_id = ${accountId} AND m.left_at IS NULL) < ${limits.accountCards}
        ON CONFLICT (card_id, person_id) DO UPDATE
          SET left_at = NULL, role = 'member', joined_at = excluded.joined_at, seq = excluded.seq
        RETURNING id`,
  );
  if (added.length === 0) {
    const there = await dbGet<{ id: string }>(
      tx,
      sql`SELECT id FROM ${appTable(tx, 'card')} WHERE id = ${card} AND household_id = ${household} AND deleted_at IS NULL`,
    );
    if (!there) return { status: 'gone' };
    const people = await dbGet<{ n: number | string }>(
      tx,
      sql`SELECT COUNT(*) AS n FROM ${member} WHERE card_id = ${card} AND left_at IS NULL`,
    );
    return {
      status: 'refused',
      message:
        Number(people?.n ?? 0) >= limits.householdMembers
          ? cardPeopleSentence(limits.householdMembers)
          : limitSentence('accountCards', limits.accountCards),
    };
  }
  await stampCard(tx, household, card, seq);
  // The card's other people hear of it on their devices (RFC 0002), queued in this transaction: who joined, never the card's shop.
  const others = await dbAll<{ account_id: string }>(
    tx,
    sql`SELECT p.account_id FROM ${member} m JOIN ${appTable(tx, 'person')} p ON p.id = m.person_id
        WHERE m.card_id = ${card} AND m.left_at IS NULL AND p.account_id IS NOT NULL AND p.account_id <> ${accountId}`,
  );
  const store = pushStore(tx, ring);
  for (const other of others)
    await enqueuePush(store, {
      account: other.account_id,
      message: {
        title: `${person.name || 'Someone'} joined a card you share`,
        path: '/cards',
        tag: `joined-card-${card}`,
        kind: 'member_joined',
      },
      now,
    });
  return { status: 'joined' };
}
