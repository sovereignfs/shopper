import { sql } from 'drizzle-orm';
import { ringOf, type KeyRing } from '../crypto/keys';
import type { Database } from '../db/client';
import { dbRun } from '../db/exec';
import { appTable } from '../db/tables';
import { createHousehold } from '../households/households';
import { dispatch, type Operation, type Reply } from '../households/ops';
import { ensurePerson } from '../people/people';

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
  /** Their own first household. */
  readonly household: string;
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
  return { accountId, personId: person.id, name, email, household };
}

export async function join(
  database: Database,
  household: string,
  person: Someone,
  role: 'admin' | 'member' = 'member',
  joinedAt: number = Date.now(),
): Promise<void> {
  await dbRun(
    database,
    sql`INSERT INTO ${appTable(database, 'member')} (id, household_id, person_id, role, joined_at, seq)
        VALUES (${crypto.randomUUID()}, ${household}, ${person.personId}, ${role}, ${joinedAt}, 1)
        ON CONFLICT (household_id, person_id) DO UPDATE SET left_at = NULL, role = ${role}`,
  );
}

export async function leave(database: Database, household: string, person: Someone): Promise<void> {
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'member')} SET left_at = ${Date.now()}
        WHERE household_id = ${household} AND person_id = ${person.personId}`,
  );
}

/** Calls an operation through the dispatcher as an account. */
export function callAs(
  database: Database,
  operations: readonly Operation[],
  who: Pick<Someone, 'accountId'>,
  body: Record<string, unknown>,
): Promise<Reply> {
  return dispatch({ database, ring: TEST_RING, operations }, who.accountId, body);
}

/** What an unknown operation answers: what everything that is not for the caller answers as well. */
export const NOT_FOUND = { status: 404, body: { ok: false, error: 'not_found' } } as const;
