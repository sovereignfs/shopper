import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';

/**
 * **A list's people** (RFC 0004): who may see and change a list, its items and its products. The one who makes a list is its Admin; others join by
 * accepting an invitation to it, and leave or are removed list by list. Every statement that reads or changes a list names one of these.
 */
export async function addListMember(
  database: Database,
  input: {
    household: string;
    list: string;
    person: string;
    role: 'admin' | 'member';
    seq: number;
    now: number;
  },
): Promise<boolean> {
  const added = await dbAll<{ id: string }>(
    database,
    sql`INSERT INTO ${appTable(database, 'list_member')} (id, household_id, list_id, person_id, role, joined_at, left_at, seq)
        VALUES (${crypto.randomUUID()}, ${input.household}, ${input.list}, ${input.person}, ${input.role}, ${input.now}, NULL, ${input.seq})
        ON CONFLICT (list_id, person_id) DO UPDATE SET left_at = NULL, role = excluded.role, joined_at = excluded.joined_at, seq = excluded.seq
        RETURNING id`,
  );
  return added.length > 0;
}

/**
 * **A list's rows stamped at a join** (RFC 0004, "Sync"): the list, its items, the products they use, its people, and its tombstones and aliases take the
 * join's `seq`, so that a device whose cursor for the group is already past them pulls them.
 */
export async function stampList(
  database: Database,
  household: string,
  list: string,
  seq: number,
): Promise<void> {
  for (const table of ['list', 'item'] as const)
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, table)} SET seq = ${seq} WHERE household_id = ${household} AND ${table === 'list' ? sql`id` : sql`list_id`} = ${list} RETURNING id`,
    );
  await dbAll(
    database,
    sql`UPDATE ${appTable(database, 'product')} SET seq = ${seq} WHERE household_id = ${household}
        AND id IN (SELECT product_id FROM ${appTable(database, 'item')} WHERE list_id = ${list}) RETURNING id`,
  );
  for (const table of ['list_member', 'tombstone', 'alias'] as const)
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, table)} SET seq = ${seq} WHERE household_id = ${household} AND list_id = ${list} RETURNING household_id`,
    );
}

/** The person of a group's own account: who makes its lists, and is their Admin. */
export async function ownerPerson(
  database: Database,
  household: string,
): Promise<string | undefined> {
  const row = await dbGet<{ id: string }>(
    database,
    sql`SELECT p.id FROM ${appTable(database, 'household')} h JOIN ${appTable(database, 'person')} p ON p.account_id = h.own_of
        WHERE h.id = ${household}`,
  );
  return row?.id;
}

/**
 * **From households to lists** (RFC 0004, "Existing data"), at every start, safe to run again: each list with nobody on it gets every active member of
 * its household, the household's Admins as its Admins, so that nobody loses a list they had; then every household member but the group's own account is
 * ended, so that nobody sees a list made after; and waiting invitations to a household as a whole are revoked, since a link cannot say which list it
 * meant. One transaction a group.
 */
export async function adoptListMembers(
  database: Database,
  now: number = Date.now(),
): Promise<number> {
  const groups = await dbAll<{ household_id: string }>(
    database,
    sql`SELECT DISTINCT l.household_id FROM ${appTable(database, 'list')} l
        WHERE NOT EXISTS (SELECT 1 FROM ${appTable(database, 'list_member')} lm WHERE lm.list_id = l.id)
        UNION
        SELECT DISTINCT m.household_id FROM ${appTable(database, 'member')} m JOIN ${appTable(database, 'household')} h ON h.id = m.household_id
        JOIN ${appTable(database, 'person')} p ON p.id = m.person_id
        WHERE m.left_at IS NULL AND (h.own_of IS NULL OR p.account_id IS NULL OR p.account_id <> h.own_of)`,
  );
  for (const { household_id: household } of groups) {
    await transaction(database, async (tx) => {
      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1 WHERE id = ${household} RETURNING seq`,
      );
      if (!stepped) return;
      const seq = Number(stepped.seq);
      const lists = await dbAll<{ id: string }>(
        tx,
        sql`SELECT l.id FROM ${appTable(tx, 'list')} l WHERE l.household_id = ${household}
            AND NOT EXISTS (SELECT 1 FROM ${appTable(tx, 'list_member')} lm WHERE lm.list_id = l.id)`,
      );
      const members = await dbAll<{ person_id: string; role: string }>(
        tx,
        sql`SELECT person_id, role FROM ${appTable(tx, 'member')} WHERE household_id = ${household} AND left_at IS NULL`,
      );
      for (const list of lists)
        for (const member of members)
          await addListMember(tx, {
            household,
            list: list.id,
            person: member.person_id,
            role: member.role === 'admin' ? 'admin' : 'member',
            seq,
            now,
          });
      const owner = await ownerPerson(tx, household);
      await dbAll(
        tx,
        sql`UPDATE ${appTable(tx, 'member')} SET left_at = ${now}, seq = ${seq}
            WHERE household_id = ${household} AND left_at IS NULL AND person_id <> ${owner ?? ''} RETURNING id`,
      );
      await dbAll(
        tx,
        sql`UPDATE ${appTable(tx, 'invitation')} SET revoked_at = ${now}, wrapped_key = NULL
            WHERE household_id = ${household} AND list_id IS NULL AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
      );
    });
  }
  return groups.length;
}
