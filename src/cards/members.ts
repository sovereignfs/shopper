import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { appTable } from '../db/tables';

/**
 * **A card's people** (DESIGN.md §7.7, RFC 0007), as a list's are (`src/lists/members.ts`): who may see and show a card. The one who makes a card is its Admin; others join by
 * accepting an invitation to it, and leave or are removed card by card. Every statement that reads or changes a card names one of these.
 */
export async function addCardMember(
  database: Database,
  input: {
    household: string;
    card: string;
    person: string;
    role: 'admin' | 'member';
    seq: number;
    now: number;
  },
): Promise<boolean> {
  const added = await dbAll<{ id: string }>(
    database,
    sql`INSERT INTO ${appTable(database, 'card_member')} (id, household_id, card_id, person_id, role, joined_at, left_at, seq)
        VALUES (${crypto.randomUUID()}, ${input.household}, ${input.card}, ${input.person}, ${input.role}, ${input.now}, NULL, ${input.seq})
        ON CONFLICT (card_id, person_id) DO UPDATE SET left_at = NULL, role = excluded.role, joined_at = excluded.joined_at, seq = excluded.seq
        RETURNING id`,
  );
  return added.length > 0;
}

/**
 * **A card's rows stamped at a join** (RFC 0007), as `stampList` does for a list: the card, its people and its tombstones take the join's `seq`, so that a device whose cursor for the
 * group is already past them pulls them.
 */
export async function stampCard(
  database: Database,
  household: string,
  card: string,
  seq: number,
): Promise<void> {
  await dbAll(
    database,
    sql`UPDATE ${appTable(database, 'card')} SET seq = ${seq} WHERE household_id = ${household} AND id = ${card} RETURNING id`,
  );
  for (const table of ['card_member', 'tombstone'] as const)
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, table)} SET seq = ${seq} WHERE household_id = ${household} AND card_id = ${card} RETURNING household_id`,
    );
}

/** The cards a person is on in a group, live or not (a card whose people are all gone has no one to keep it). */
export async function cardsOfPerson(
  database: Database,
  household: string,
  person: string,
): Promise<string[]> {
  const rows = await dbAll<{ card_id: string }>(
    database,
    sql`SELECT card_id FROM ${appTable(database, 'card_member')} WHERE household_id = ${household} AND person_id = ${person} AND left_at IS NULL`,
  );
  return rows.map((row) => row.card_id);
}

/** Whether a card is in a group (the row, deleted or not). */
export async function cardExists(
  database: Database,
  household: string,
  card: string,
): Promise<boolean> {
  return (
    (await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'card')} WHERE id = ${card} AND household_id = ${household}`,
    )) !== undefined
  );
}
