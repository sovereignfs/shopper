import { sql } from 'drizzle-orm';
import { ringOf, type KeyRing } from '../crypto/keys';
import type { Database } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { appTable } from '../db/tables';
import { createHousehold } from '../households/households';
import { dispatch, type Operation, type Reply } from '../households/ops';
import { ensurePerson } from '../people/people';
import { addListMember, stampList } from '../lists/members';

/**
 * **The second-person harness** (DESIGN.md §5.2, AGENTS.md): what a test needs to call something as someone who is not in the household and expect not
 * found. `people()` makes accounts that each have a person and their own first household, so that a test has a household that is someone else's;
 * `join` puts a person in one (what accepting an invitation will do, task 3.4); `leave` ends a membership.
 */
export const TEST_RING: KeyRing = (() => {
  const ring = ringOf(Buffer.alloc(32, 11));
  if (!ring) throw new Error('no key');
  return ring;
})();

export interface Someone {
  readonly accountId: string;
  readonly personId: string;
  readonly name: string;
  readonly email: string;
  /** Their own group (`household`), never shown (RFC 0004). */
  readonly household: string;
  /** The first list of it, Groceries, made with the account: what a test shares. */
  readonly list: string;
}

let counter = 0;

export async function somebody(database: Database, name: string): Promise<Someone> {
  const n = ++counter;
  const accountId = `account-${n}-${crypto.randomUUID()}`;
  const email = `${name.toLowerCase()}${n}@example.com`;
  const person = await ensurePerson(database, TEST_RING, { id: accountId, name, email });
  const household = await createHousehold(database, TEST_RING, {
    creatorPersonId: person.id,
    ownOf: accountId,
  });
  return {
    accountId,
    personId: person.id,
    name,
    email,
    household,
    list: await firstList(database, household),
  };
}

/** The first list of a group, by when it was made: Groceries, for a group made by `somebody`. */
export async function firstList(database: Database, household: string): Promise<string> {
  const rows = await dbAll<{ id: string }>(
    database,
    sql`SELECT id FROM ${appTable(database, 'list')} WHERE household_id = ${household} ORDER BY created_at, id LIMIT 1`,
  );
  if (!rows[0]) throw new Error('the group has no list');
  return rows[0].id;
}

export async function join(
  database: Database,
  household: string,
  person: Someone,
  role: 'admin' | 'member' = 'member',
  joinedAt: number = Date.now(),
): Promise<void> {
  // On every list of the group, as a person joined each by its link (RFC 0004): the nearest to what a household's member was.
  const lists = await dbAll<{ id: string }>(
    database,
    sql`SELECT id FROM ${appTable(database, 'list')} WHERE household_id = ${household}`,
  );
  for (const list of lists)
    await addListMember(database, {
      household,
      list: list.id,
      person: person.personId,
      role,
      seq: 1,
      now: joinedAt,
    });
}

/** Puts a person on one list of a group, as accepting a link to it does: the group's order steps, and the list's rows are stamped at the join. */
export async function joinList(
  database: Database,
  household: string,
  list: string,
  person: Someone,
  role: 'admin' | 'member' = 'member',
): Promise<void> {
  const stepped = await dbAll<{ seq: number | string }>(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET seq = seq + 1 WHERE id = ${household} RETURNING seq`,
  );
  const seq = Number(stepped[0]?.seq ?? 1);
  await addListMember(database, {
    household,
    list,
    person: person.personId,
    role,
    seq,
    now: Date.now(),
  });
  await stampList(database, household, list, seq);
}

export async function leave(database: Database, household: string, person: Someone): Promise<void> {
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'list_member')} SET left_at = ${Date.now()}
        WHERE household_id = ${household} AND person_id = ${person.personId}`,
  );
}

/** Calls an operation through the dispatcher as an account. */
export function callAs(
  database: Database,
  operations: readonly Operation[],
  who: Pick<Someone, 'accountId'>,
  body: Record<string, unknown>,
  now?: number,
): Promise<Reply> {
  return dispatch({ database, ring: TEST_RING, operations }, who.accountId, body, now);
}

/** What an unknown operation answers: what everything that is not for the caller answers as well. */
export const NOT_FOUND = { status: 404, body: { ok: false, error: 'not_found' } } as const;
