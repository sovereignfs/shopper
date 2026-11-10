import { getConfig } from '../config/current';
import type { KeyRing } from '../crypto/keys';
import { getDatabase } from '../db/boot';
import type { Database } from '../db/client';
import {
  createHousehold,
  ensureFirstList,
  ensureStarterCategories,
} from '../households/households';
import { ensurePerson } from './people';

/** An account as the records are made from it. */
export interface AccountToRecord {
  id: string;
  name: string;
  email: string;
}

/**
 * What the app keeps of an account besides better-auth's row (DESIGN.md §6.1, §7.4): **its person and its first household**, in that order, since the
 * household's first member is the person. Idempotent and safe to run at once from several places: each is claimed by a unique index (`account_id`, and
 * the household's `own_of`), and the second finds the first's. Returns the first household's id. Task 4.2 adds the starter categories to the first
 * household's making, and task 5.4 its _Groceries_ list, in the same transaction.
 */
export async function makeAccountRecords(
  database: Database,
  ring: KeyRing,
  account: AccountToRecord,
  now: number = Date.now(),
): Promise<{ personId: string; householdId: string }> {
  const person = await ensurePerson(database, ring, account, now);
  const householdId = await createHousehold(database, ring, {
    creatorPersonId: person.id,
    ownOf: account.id,
    now,
  });
  // A household made before the starter categories existed, or whose making was cut short, has them by the account's next request.
  await ensureStarterCategories(database, householdId);
  await ensureFirstList(database, ring, householdId, now);
  return { personId: person.id, householdId };
}

/**
 * The same, for the server: called when the account is made (`createAuth`'s `onAccountCreated`) and again by every session check (`requireSession`),
 * since the two stores are separate databases and no transaction spans them, so an account whose records could not be made then has them by its next
 * request. This is also how an account that existed before a task added a record gets it.
 */
export async function ensureAccountRecords(account: AccountToRecord): Promise<void> {
  await makeAccountRecords(await getDatabase(), getConfig().encryption, account);
}
