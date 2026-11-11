import { sql } from 'drizzle-orm';
import type { KeyRing } from '../crypto/keys';
import { sealRow, unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet, transaction } from '../db/exec';
import * as postgresAuth from '../db/schema/postgres/auth';
import * as sqliteAuth from '../db/schema/sqlite/auth';
import { appTable } from '../db/tables';
import { HOUSEHOLD_TABLES } from '../households/tables';

/**
 * **Everything personal of an account is removed by this, and only this** (DESIGN.md §19). One routine, in a fixed order, **safe to run again**: the two
 * stores (the app's and the sign-in store) cannot share a transaction, so a run that stopped part way is finished by running it again, and **the row that
 * makes the account findable goes last** (the person's link to its account, and to a core identity), so that a run that stopped can still find it.
 *
 *  1. The households the person is in. **Where they were the only Admin and others remain, the Admin role passes to the member who has been in longest**
 *     (who is told, in phase 2); where nobody else remains, the household is deleted with everything of it, by `household_id`; elsewhere they simply
 *     leave. A household that changes has its counter stepped, so that its other members' devices learn of it. What they added stays, by their name.
 *  2. What was kept for them: the record of the mutations they sent, and the rate counters that carry their account.
 *  3. The sign-in store: sessions, sign-ins, pending verifications, and then the account.
 *  4. Their person is kept **as a name only**: the link to the account and to a core identity cleared, the email gone from the sealed row, `deleted_at` set.
 *     Everywhere they appear in a shared household they are shown as "Kasun (left Shopper)".
 *
 * `people.test.ts` seeds a row in every table for the person and for a second person who shares a household with them, finds nothing of the first after
 * (the name aside), and the second's household intact, and **fails for a table that is in neither list in it**: a new table that holds something of a person
 * is decided here, with its deletion, export and import.
 */
export interface PeopleDeps {
  /** The app's store. */
  readonly database: Database;
  /** The sign-in store (the same database as the app's, or another). */
  readonly authDatabase: Database;
  readonly ring: KeyRing;
  readonly now: () => number;
}

export interface Deleted {
  /** Households whose Admin role passed to another member. */
  readonly passed: number;
  /** Households deleted because nobody else was in them. */
  readonly deleted: number;
  /** Households they left, with nothing to hand over. */
  readonly left: number;
}

const authTables = (database: Database) =>
  database.dialect === 'postgres'
    ? {
        user: postgresAuth.user,
        session: postgresAuth.session,
        account: postgresAuth.account,
        verification: postgresAuth.verification,
      }
    : {
        user: sqliteAuth.user,
        session: sqliteAuth.session,
        account: sqliteAuth.account,
        verification: sqliteAuth.verification,
      };

export async function deletePerson(deps: PeopleDeps, accountId: string): Promise<Deleted> {
  const { database, authDatabase } = deps;
  const now = deps.now();
  const result = { passed: 0, deleted: 0, left: 0 };

  const person = await dbGet<{ id: string; sealed: string }>(
    database,
    sql`SELECT id, sealed FROM ${appTable(database, 'person')} WHERE account_id = ${accountId}`,
  );

  // 1. Households. Each is its own transaction, so that a household that cannot be finished does not hold the others, and each is safe to run again.
  if (person) {
    const households = await dbAll<{ household_id: string }>(
      database,
      sql`SELECT household_id FROM ${appTable(database, 'member')} WHERE person_id = ${person.id} AND left_at IS NULL`,
    );
    for (const { household_id: household } of households) {
      const outcome = await leaveHousehold(database, household, person.id, now);
      result[outcome === 'passed' ? 'passed' : outcome === 'deleted' ? 'deleted' : 'left'] += 1;
    }
  }

  // 2. Their links: the ones they made and that are still waiting stop working, so that a link does not outlive the person who sent it. Who accepted one
  // is an id on the record and nothing more.
  if (person)
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, 'invitation')} SET revoked_at = ${now}
          WHERE created_by = ${person.id} AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
    );

  // 3. What was kept for them: the record of the mutations they sent, and the rate counters that carry their account.
  await dbAll(
    database,
    sql`DELETE FROM ${appTable(database, 'applied_mutation')} WHERE account_id = ${accountId} RETURNING id`,
  );
  await dbAll(
    database,
    sql`DELETE FROM ${appTable(database, 'rate_bucket')} WHERE "key" LIKE ${`%:${accountId}`} RETURNING "key"`,
  );

  // 4. The sign-in store: the pending verifications are found by the address, so it is read before the account goes.
  const auth = authTables(authDatabase);
  const user = await dbGet<{ email: string }>(
    authDatabase,
    sql`SELECT email FROM ${auth.user} WHERE id = ${accountId}`,
  );
  await dbAll(
    authDatabase,
    sql`DELETE FROM ${auth.session} WHERE user_id = ${accountId} RETURNING id`,
  );
  await dbAll(
    authDatabase,
    sql`DELETE FROM ${auth.account} WHERE user_id = ${accountId} RETURNING id`,
  );
  if (user) {
    await dbAll(
      authDatabase,
      sql`DELETE FROM ${auth.verification} WHERE identifier = ${user.email} RETURNING id`,
    );
  }
  await dbAll(authDatabase, sql`DELETE FROM ${auth.user} WHERE id = ${accountId} RETURNING id`);

  // 5. The person, last: a name and nothing else.
  if (person) {
    const fields = unsealRow('person', person.id, person.sealed, deps.ring);
    const nameOnly = sealRow('person', person.id, { name: String(fields.name ?? '') }, deps.ring);
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, 'person')}
          SET sealed = ${nameOnly}, account_id = NULL, core_sub = NULL, deleted_at = ${now}, updated_at = ${now}
          WHERE id = ${person.id} RETURNING id`,
    );
  }
  return result;
}

/**
 * One household, for a person who is deleting their account: the Admin role passes if they were its only Admin and others remain, the household is
 * deleted if nobody else remains, and otherwise they just leave. In one transaction, with the household's counter stepped for what changed.
 */
async function leaveHousehold(
  database: Database,
  household: string,
  personId: string,
  now: number,
): Promise<'passed' | 'deleted' | 'left'> {
  const member = appTable(database, 'member');
  const h = appTable(database, 'household');
  return transaction(database, async (tx) => {
    const others = await dbAll<{ person_id: string; role: string }>(
      tx,
      sql`SELECT person_id, role FROM ${member}
          WHERE household_id = ${household} AND left_at IS NULL AND person_id <> ${personId}
          ORDER BY joined_at, person_id`,
    );
    if (others.length === 0) {
      // Nobody else is in it: it goes, with everything of it, by `household_id`, and then the household.
      for (const table of HOUSEHOLD_TABLES)
        await dbAll(
          tx,
          sql`DELETE FROM ${appTable(tx, table)} WHERE household_id = ${household} RETURNING 1 AS gone`,
        );
      await dbAll(tx, sql`DELETE FROM ${h} WHERE id = ${household} RETURNING id`);
      return 'deleted';
    }
    const seq = await dbGet<{ seq: number | string }>(
      tx,
      sql`UPDATE ${h} SET seq = seq + 1, updated_at = ${now} WHERE id = ${household} RETURNING seq`,
    );
    const mine = await dbGet<{ role: string }>(
      tx,
      sql`SELECT role FROM ${member} WHERE household_id = ${household} AND person_id = ${personId}`,
    );
    const onlyAdmin = mine?.role === 'admin' && !others.some((other) => other.role === 'admin');
    let outcome: 'passed' | 'left' = 'left';
    if (onlyAdmin) {
      const heir = others[0];
      if (heir) {
        await dbAll(
          tx,
          sql`UPDATE ${member} SET role = 'admin', seq = ${Number(seq?.seq)}
              WHERE household_id = ${household} AND person_id = ${heir.person_id} RETURNING id`,
        );
        outcome = 'passed';
      }
    }
    await dbAll(
      tx,
      sql`UPDATE ${member} SET left_at = ${now}, seq = ${Number(seq?.seq)}
          WHERE household_id = ${household} AND person_id = ${personId} AND left_at IS NULL RETURNING id`,
    );
    return outcome;
  });
}

/** What deleting an account would do to each household the person is in, for the confirmation that says it before it is done. Reads only. */
export async function previewLeaving(
  database: Database,
  ring: KeyRing,
  accountId: string,
): Promise<
  { household: string; own: boolean; outcome: 'passes' | 'deleted' | 'left'; to: string | null }[]
> {
  const rows = await dbAll<{
    household_id: string;
    role: string;
    own_of: string | null;
    other_person: string | null;
    other_sealed: string | null;
    other_role: string | null;
    others: number | string;
  }>(
    database,
    sql`SELECT m.household_id, m.role, h.own_of,
          (SELECT COUNT(*) FROM ${appTable(database, 'member')} o WHERE o.household_id = m.household_id AND o.left_at IS NULL AND o.person_id <> m.person_id) AS others,
          (SELECT o.person_id FROM ${appTable(database, 'member')} o WHERE o.household_id = m.household_id AND o.left_at IS NULL AND o.person_id <> m.person_id ORDER BY o.joined_at, o.person_id LIMIT 1) AS other_person,
          (SELECT p2.sealed FROM ${appTable(database, 'member')} o JOIN ${appTable(database, 'person')} p2 ON p2.id = o.person_id WHERE o.household_id = m.household_id AND o.left_at IS NULL AND o.person_id <> m.person_id ORDER BY o.joined_at, o.person_id LIMIT 1) AS other_sealed,
          (SELECT o.role FROM ${appTable(database, 'member')} o WHERE o.household_id = m.household_id AND o.left_at IS NULL AND o.person_id <> m.person_id ORDER BY o.joined_at, o.person_id LIMIT 1) AS other_role
        FROM ${appTable(database, 'member')} m
        JOIN ${appTable(database, 'person')} p ON p.id = m.person_id
        JOIN ${appTable(database, 'household')} h ON h.id = m.household_id
        WHERE p.account_id = ${accountId} AND m.left_at IS NULL
        ORDER BY CASE WHEN h.own_of = ${accountId} THEN 0 ELSE 1 END, m.joined_at, m.household_id`,
  );
  return rows.map((row) => {
    const others = Number(row.others);
    const name =
      row.other_sealed !== null && row.other_person !== null
        ? String(unsealRow('person', row.other_person, row.other_sealed, ring).name ?? '')
        : null;
    return {
      household: row.household_id,
      own: row.own_of === accountId,
      outcome:
        others === 0
          ? ('deleted' as const)
          : row.role === 'admin'
            ? ('passes' as const)
            : ('left' as const),
      to: others > 0 && row.role === 'admin' ? name : null,
    };
  });
}
