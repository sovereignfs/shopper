import { sql } from 'drizzle-orm';
import type { KeyRing } from '../crypto/keys';
import { sealRow, unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable, authTable } from '../db/tables';
import { HOUSEHOLD_TABLES } from '../households/tables';
import { deleteListProducts } from '../lists/members';
import { vaultOf } from '../keys/server/vault';
import { pushStore } from '../push/store';

/**
 * **Everything personal of an account is removed by this, and only this** (DESIGN.md §19). One routine, in a fixed order, **safe to run again**: the two
 * stores (the app's and the sign-in store) cannot share a transaction, so a run that stopped part way is finished by running it again, and **the row that
 * makes the account findable goes last** (the person's link to its account, and to a core identity), so that a run that stopped can still find it.
 *
 *  1. The lists the person is on (RFC 0004). **Where they were a shared list's only Admin, the Admin role passes to the person on it longest** (who is
 *     told, in phase 2); a list nobody else is on is deleted with everything of it; elsewhere they simply leave. A group nobody is left on is deleted
 *     whole, by `household_id`. A group that changes has its counter stepped, so that its other people's devices learn of it. What they added stays,
 *     by their name.
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
  /** Shared lists whose Admin role passed to the person on them longest. */
  readonly passed: number;
  /** Lists deleted because nobody else was on them. */
  readonly deleted: number;
  /** Lists they left, with nothing to hand over. */
  readonly left: number;
  /** The same for their cards (RFC 0007), which are counted apart: a card is not a list. */
  readonly cards: { readonly passed: number; readonly deleted: number; readonly left: number };
}

export async function deletePerson(deps: PeopleDeps, accountId: string): Promise<Deleted> {
  const { database, authDatabase } = deps;
  const now = deps.now();
  const result = { passed: 0, deleted: 0, left: 0, cards: { passed: 0, deleted: 0, left: 0 } };

  const person = await dbGet<{ id: string; sealed: string }>(
    database,
    sql`SELECT id, sealed FROM ${appTable(database, 'person')} WHERE account_id = ${accountId}`,
  );

  // 1. Their lists, group by group (RFC 0004). Each group is its own transaction, so that one that cannot be finished does not hold the others, and
  // each is safe to run again.
  if (person) {
    const groups = await dbAll<{ household_id: string }>(
      database,
      sql`SELECT household_id FROM ${appTable(database, 'list_member')} WHERE person_id = ${person.id} AND left_at IS NULL
          UNION
          SELECT household_id FROM ${appTable(database, 'member')} WHERE person_id = ${person.id} AND left_at IS NULL
          UNION
          SELECT household_id FROM ${appTable(database, 'card_member')} WHERE person_id = ${person.id} AND left_at IS NULL`,
    );
    for (const { household_id: household } of groups) {
      const outcome = await leaveGroup(database, household, person.id, now);
      result.passed += outcome.passed;
      result.deleted += outcome.deleted;
      result.left += outcome.left;
      result.cards.passed += outcome.cards.passed;
      result.cards.deleted += outcome.cards.deleted;
      result.cards.left += outcome.cards.left;
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

  // 3. What was kept for them: their keys in Shopper's vault (RFC 0001; with them gone, nothing encrypted for them opens for them, backups
  // included), their settings, the record of the mutations they sent, and the rate counters that carry their account.
  await vaultOf(database).deleteAccount(accountId);
  // Their devices for Web Push (RFC 0002), with what was waiting for them.
  await pushStore(database, deps.ring).removeAccount(accountId);
  // Their copies of households' keys (RFC 0001): in a household that carries on, the others keep theirs.
  if (person)
    await dbAll(
      database,
      sql`DELETE FROM ${appTable(database, 'household_key')} WHERE person_id = ${person.id} RETURNING person_id`,
    );
  // Their copies of lists' keys (RFC 0004).
  if (person)
    await dbAll(
      database,
      sql`DELETE FROM ${appTable(database, 'list_key')} WHERE person_id = ${person.id} RETURNING person_id`,
    );
  // Their copies of cards' keys (RFC 0007): every one, including the copy of a card they had left, which nothing else deletes.
  if (person)
    await dbAll(
      database,
      sql`DELETE FROM ${appTable(database, 'card_key')} WHERE person_id = ${person.id} RETURNING person_id`,
    );
  await dbAll(
    database,
    sql`DELETE FROM ${appTable(database, 'account_settings')} WHERE account_id = ${accountId} RETURNING account_id`,
  );
  await dbAll(
    database,
    sql`DELETE FROM ${appTable(database, 'applied_mutation')} WHERE account_id = ${accountId} RETURNING id`,
  );
  await dbAll(
    database,
    sql`DELETE FROM ${appTable(database, 'rate_bucket')} WHERE "key" LIKE ${`%:${accountId}`} RETURNING "key"`,
  );

  // 4. The sign-in store: the pending verifications are found by the address, so it is read before the account goes.
  // The tables are `@sovereignfs/auth`'s (ADR 0001). Each is deleted by name rather than left to a cascade, which sqld does not
  // promise to enforce.
  const auth = (name: string) => authTable(authDatabase, name);
  const user = await dbGet<{ email: string }>(
    authDatabase,
    sql`SELECT email FROM ${auth('users')} WHERE id = ${accountId}`,
  );
  const sessions = sql`SELECT id FROM ${auth('sessions')} WHERE user_id = ${accountId}`;
  for (const table of ['sv_key_secrets', 'sv_core_sign_ins'])
    await dbAll(
      authDatabase,
      sql`DELETE FROM ${auth(table)} WHERE session_id IN (${sessions}) RETURNING session_id`,
    );
  await dbAll(
    authDatabase,
    sql`DELETE FROM ${auth('sessions')} WHERE user_id = ${accountId} RETURNING id`,
  );
  // Core's refresh token for the person, kept by the SDK under their `sub` (sdk §5.1).
  await dbAll(
    authDatabase,
    sql`DELETE FROM ${auth('sv_tokens')} WHERE sub IN (
          SELECT account_id FROM ${auth('accounts')} WHERE user_id = ${accountId} AND provider_id = 'sovereign') RETURNING sub`,
  );
  for (const table of ['accounts', 'two_factors', 'passkeys'])
    await dbAll(
      authDatabase,
      sql`DELETE FROM ${auth(table)} WHERE user_id = ${accountId} RETURNING id`,
    );
  await dbAll(
    authDatabase,
    sql`DELETE FROM ${auth('sv_legacy_passwords')} WHERE user_id = ${accountId} RETURNING user_id`,
  );
  if (user) {
    await dbAll(
      authDatabase,
      sql`DELETE FROM ${auth('verifications')} WHERE identifier = ${user.email} RETURNING id`,
    );
  }
  await dbAll(authDatabase, sql`DELETE FROM ${auth('users')} WHERE id = ${accountId} RETURNING id`);

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
 * One group, for a person who is deleting their account (RFC 0004). On each of its lists they are on: **a list nobody else is on is deleted**, with
 * its items, people, links and records; **a shared list whose only Admin they were passes to the person on it longest**, who becomes its Admin, and
 * stays where it is; otherwise they just leave it. Their own group is theirs no more (`own_of` cleared). A group nobody is left on is deleted whole.
 * In one transaction, with the group's counter stepped for what changed.
 */
async function leaveGroup(
  database: Database,
  household: string,
  personId: string,
  now: number,
): Promise<{
  passed: number;
  deleted: number;
  left: number;
  cards: { passed: number; deleted: number; left: number };
}> {
  const listMember = appTable(database, 'list_member');
  const h = appTable(database, 'household');
  const outcome = { passed: 0, deleted: 0, left: 0, cards: { passed: 0, deleted: 0, left: 0 } };
  return transaction(database, async (tx) => {
    const stepped = await dbGet<{ seq: number | string }>(
      tx,
      sql`UPDATE ${h} SET seq = seq + 1, updated_at = ${now} WHERE id = ${household} RETURNING seq`,
    );
    if (!stepped) return outcome;
    const seq = Number(stepped.seq);
    const lists = await dbAll<{ list_id: string; role: string }>(
      tx,
      sql`SELECT list_id, role FROM ${listMember}
          WHERE household_id = ${household} AND person_id = ${personId} AND left_at IS NULL`,
    );
    for (const { list_id: list, role } of lists) {
      const others = await dbAll<{ person_id: string; role: string }>(
        tx,
        sql`SELECT person_id, role FROM ${listMember}
            WHERE list_id = ${list} AND left_at IS NULL AND person_id <> ${personId}
            ORDER BY joined_at, person_id`,
      );
      if (others.length === 0) {
        await deleteList(tx, household, list, seq);
        outcome.deleted += 1;
        continue;
      }
      const heir = others[0];
      if (role === 'admin' && heir && !others.some((other) => other.role === 'admin')) {
        await dbAll(
          tx,
          sql`UPDATE ${listMember} SET role = 'admin', seq = ${seq}
              WHERE list_id = ${list} AND person_id = ${heir.person_id} RETURNING id`,
        );
        outcome.passed += 1;
      } else outcome.left += 1;
      await dbAll(
        tx,
        sql`UPDATE ${listMember} SET left_at = ${now}, seq = ${seq}
            WHERE list_id = ${list} AND person_id = ${personId} AND left_at IS NULL RETURNING id`,
      );
    }
    // **Their cards, as their lists are** (RFC 0007): a card nobody else is on is deleted, with its people, keys and records; a shared card whose only Admin they were passes to the person on it
    // longest, who becomes its Admin; otherwise they just leave it.
    const cardMember = appTable(tx, 'card_member');
    const cards = await dbAll<{ card_id: string; role: string }>(
      tx,
      sql`SELECT card_id, role FROM ${cardMember}
          WHERE household_id = ${household} AND person_id = ${personId} AND left_at IS NULL`,
    );
    for (const { card_id: card, role } of cards) {
      const others = await dbAll<{ person_id: string; role: string }>(
        tx,
        sql`SELECT person_id, role FROM ${cardMember}
            WHERE card_id = ${card} AND left_at IS NULL AND person_id <> ${personId}
            ORDER BY joined_at, person_id`,
      );
      if (others.length === 0) {
        await deleteCard(tx, household, card);
        outcome.cards.deleted += 1;
        continue;
      }
      const heir = others[0];
      if (role === 'admin' && heir && !others.some((other) => other.role === 'admin')) {
        await dbAll(
          tx,
          sql`UPDATE ${cardMember} SET role = 'admin', seq = ${seq}
              WHERE card_id = ${card} AND person_id = ${heir.person_id} RETURNING id`,
        );
        outcome.cards.passed += 1;
      } else outcome.cards.left += 1;
      await dbAll(
        tx,
        sql`UPDATE ${cardMember} SET left_at = ${now}, seq = ${seq}
            WHERE card_id = ${card} AND person_id = ${personId} AND left_at IS NULL RETURNING id`,
      );
      // Their copy of the card's keys goes with them (§13.2).
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'card_key')} WHERE card_id = ${card} AND person_id = ${personId} RETURNING 1 AS gone`,
      );
    }
    // **Their Inventory goes whether or not their group stays** for a list that passed to someone else (§8.8, §19): it was theirs alone, and nobody else ever
    // had it. With it, what a fold or a delete of one of its items left, which is of no list; and their own categories, and the names they gave the starter ones (§8.3):
    // those rows stay with the group, as the code's.
    const theirs = await dbGet<{ yes: number }>(
      tx,
      sql`SELECT 1 AS yes FROM ${h} WHERE id = ${household} AND own_of IN
            (SELECT account_id FROM ${appTable(tx, 'person')} WHERE id = ${personId})`,
    );
    if (theirs) {
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'inventory_item')} WHERE household_id = ${household} RETURNING 1 AS gone`,
      );
      await dbAll(
        tx,
        sql`DELETE FROM ${appTable(tx, 'category')} WHERE household_id = ${household} AND starter_key IS NULL RETURNING 1 AS gone`,
      );
      await dbAll(
        tx,
        sql`UPDATE ${appTable(tx, 'category')} SET sealed = NULL, encrypted = NULL, seq = ${seq}
            WHERE household_id = ${household} AND starter_key IS NOT NULL AND (sealed IS NOT NULL OR encrypted IS NOT NULL) RETURNING 1 AS gone`,
      );
      for (const table of ['alias', 'tombstone'] as const)
        await dbAll(
          tx,
          sql`DELETE FROM ${appTable(tx, table)} WHERE household_id = ${household} AND table_name IN ('inventory_item', 'category') RETURNING 1 AS gone`,
        );
    }
    // Their own group is theirs no more: its lists that carry on are their people's, in a group nobody owns.
    await dbAll(
      tx,
      sql`UPDATE ${appTable(tx, 'member')} SET left_at = ${now}, seq = ${seq}
          WHERE household_id = ${household} AND person_id = ${personId} AND left_at IS NULL RETURNING id`,
    );
    await dbAll(
      tx,
      sql`UPDATE ${h} SET own_of = NULL WHERE id = ${household} AND own_of IN
            (SELECT account_id FROM ${appTable(tx, 'person')} WHERE id = ${personId}) RETURNING id`,
    );
    // Nobody left on any of its lists, nor in it: it goes, with everything of it, by `household_id`, and then the group.
    const anyone = await dbGet<{ n: number | string }>(
      tx,
      sql`SELECT (SELECT COUNT(*) FROM ${listMember} WHERE household_id = ${household} AND left_at IS NULL)
               + (SELECT COUNT(*) FROM ${appTable(tx, 'card_member')} WHERE household_id = ${household} AND left_at IS NULL)
               + (SELECT COUNT(*) FROM ${appTable(tx, 'member')} WHERE household_id = ${household} AND left_at IS NULL) AS n`,
    );
    if (Number(anyone?.n ?? 0) === 0) {
      for (const table of HOUSEHOLD_TABLES)
        await dbAll(
          tx,
          sql`DELETE FROM ${appTable(tx, table)} WHERE household_id = ${household} RETURNING 1 AS gone`,
        );
      await dbAll(tx, sql`DELETE FROM ${h} WHERE id = ${household} RETURNING id`);
    }
    return outcome;
  });
}

/** A card nobody else is on, with what is of it alone: its people, their copies of its keys and the records about it (§7.7). */
async function deleteCard(tx: Database, household: string, card: string): Promise<void> {
  for (const table of ['card_member', 'card_key', 'tombstone'] as const)
    await dbAll(
      tx,
      sql`DELETE FROM ${appTable(tx, table)} WHERE household_id = ${household} AND card_id = ${card} RETURNING 1 AS gone`,
    );
  await dbAll(
    tx,
    sql`DELETE FROM ${appTable(tx, 'card')} WHERE household_id = ${household} AND id = ${card} RETURNING id`,
  );
}

/** A list nobody else is on, with what is of it alone: its items, its catalog, people, links, and the records about them. */
async function deleteList(
  tx: Database,
  household: string,
  list: string,
  seq: number,
): Promise<void> {
  for (const table of [
    'item',
    'list_category',
    'list_member',
    'list_key',
    'invitation',
    'alias',
    'tombstone',
  ] as const)
    await dbAll(
      tx,
      sql`DELETE FROM ${appTable(tx, table)} WHERE household_id = ${household} AND list_id = ${list} RETURNING 1 AS gone`,
    );
  await deleteListProducts(tx, household, list, seq);
  await dbAll(
    tx,
    sql`DELETE FROM ${appTable(tx, 'list')} WHERE household_id = ${household} AND id = ${list} RETURNING id`,
  );
}

/**
 * What deleting an account would do to each list the person is on, for the confirmation that says it before it is done. Reads only. The list's name
 * is not here (the server may not be able to read it): the device names it from what it holds.
 */
export async function previewLeaving(
  database: Database,
  ring: KeyRing,
  accountId: string,
): Promise<
  { list: string; own: boolean; outcome: 'passes' | 'deleted' | 'left'; to: string | null }[]
> {
  const lm = appTable(database, 'list_member');
  const rows = await dbAll<{
    list_id: string;
    role: string;
    own_of: string | null;
    other_person: string | null;
    other_sealed: string | null;
    others: number | string;
    other_admins: number | string;
  }>(
    database,
    sql`SELECT m.list_id, m.role, h.own_of,
          (SELECT COUNT(*) FROM ${lm} o WHERE o.list_id = m.list_id AND o.left_at IS NULL AND o.person_id <> m.person_id) AS others,
          (SELECT COUNT(*) FROM ${lm} o WHERE o.list_id = m.list_id AND o.left_at IS NULL AND o.person_id <> m.person_id AND o.role = 'admin') AS other_admins,
          (SELECT o.person_id FROM ${lm} o WHERE o.list_id = m.list_id AND o.left_at IS NULL AND o.person_id <> m.person_id ORDER BY o.joined_at, o.person_id LIMIT 1) AS other_person,
          (SELECT p2.sealed FROM ${lm} o JOIN ${appTable(database, 'person')} p2 ON p2.id = o.person_id WHERE o.list_id = m.list_id AND o.left_at IS NULL AND o.person_id <> m.person_id ORDER BY o.joined_at, o.person_id LIMIT 1) AS other_sealed
        FROM ${lm} m
        JOIN ${appTable(database, 'person')} p ON p.id = m.person_id
        JOIN ${appTable(database, 'household')} h ON h.id = m.household_id
        WHERE p.account_id = ${accountId} AND m.left_at IS NULL
        ORDER BY CASE WHEN h.own_of = ${accountId} THEN 0 ELSE 1 END, m.joined_at, m.list_id`,
  );
  return rows.map((row) => {
    const others = Number(row.others);
    const passes = others > 0 && row.role === 'admin' && Number(row.other_admins) === 0;
    const name =
      row.other_sealed !== null && row.other_person !== null
        ? String(unsealRow('person', row.other_person, row.other_sealed, ring).name ?? '')
        : null;
    return {
      list: row.list_id,
      own: row.own_of === accountId,
      outcome:
        others === 0 ? ('deleted' as const) : passes ? ('passes' as const) : ('left' as const),
      to: passes ? name : null,
    };
  });
}
