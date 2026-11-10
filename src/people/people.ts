import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { appTable } from '../db/tables';
import type { KeyRing } from '../crypto/keys';
import { sealRow, unsealRow } from '../crypto/sealed';

/**
 * **Persons** (DESIGN.md §6.1): Shopper's own record of someone who appears on shared rows. Every account has exactly one, made with it, with the name and
 * email copied from sign-in and kept in step from Settings (task 2.6). **A name is read from here, never from the auth store**, and an email is shown
 * only to whom `visibility.ts` says. The two are sealed in the row's one `sealed` column; this module and `src/crypto/sealed.ts` are the only places that
 * read or write it. A person's `id` is what every shared row points at, and an account's is better-auth's user id (`account_id`).
 */
export interface Person {
  readonly id: string;
  /** The account, or `null` for a person whose account is gone (task 2.5) or who was imported (task 11.2). */
  readonly accountId: string | null;
  readonly kind: 'account' | 'imported';
  readonly name: string;
  /** `null` once the account is gone: only the name is kept. */
  readonly email: string | null;
  readonly deleted: boolean;
}

interface PersonRow {
  id: string;
  account_id: string | null;
  kind: string;
  sealed: string;
  deleted_at: number | null;
}

function toPerson(row: PersonRow, ring: KeyRing): Person {
  const fields = unsealRow('person', row.id, row.sealed, ring);
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind === 'imported' ? 'imported' : 'account',
    name: typeof fields.name === 'string' ? fields.name : '',
    email: typeof fields.email === 'string' ? fields.email : null,
    deleted: row.deleted_at !== null,
  };
}

/**
 * The person of an account, made if there is none. **Idempotent and safe to run at once from two places**: the account's own row is claimed by the
 * unique index on `account_id`, so the second finds the first's. Called when the account is made, and again whenever a session is checked, so that an
 * account whose person could not be made then (the two stores are separate databases, and no transaction spans them) has one by the next request.
 * Returns the person as it is, which is the one that won.
 */
export async function ensurePerson(
  database: Database,
  ring: KeyRing,
  account: { id: string; name: string; email: string },
  now: number = Date.now(),
): Promise<Person> {
  const table = appTable(database, 'person');
  const id = crypto.randomUUID();
  const sealed = sealRow('person', id, { name: account.name, email: account.email }, ring);
  await dbAll(
    database,
    sql`INSERT INTO ${table} (id, account_id, kind, sealed, created_at, updated_at)
        VALUES (${id}, ${account.id}, 'account', ${sealed}, ${now}, ${now})
        ON CONFLICT (account_id) DO NOTHING RETURNING id`,
  );
  const person = await personOfAccount(database, ring, account.id);
  if (!person) throw new Error('a person could not be made for an account');
  return person;
}

/** The person of an account, or `undefined`. */
export async function personOfAccount(
  database: Database,
  ring: KeyRing,
  accountId: string,
): Promise<Person | undefined> {
  const row = await dbGet<PersonRow>(
    database,
    sql`SELECT id, account_id, kind, sealed, deleted_at FROM ${appTable(database, 'person')} WHERE account_id = ${accountId}`,
  );
  return row ? toPerson(row, ring) : undefined;
}

/** A person by id, or `undefined`. Nothing here says whether the reader may see them: the caller's statement does (DESIGN.md §5.2). */
export async function personById(
  database: Database,
  ring: KeyRing,
  id: string,
): Promise<Person | undefined> {
  const row = await dbGet<PersonRow>(
    database,
    sql`SELECT id, account_id, kind, sealed, deleted_at FROM ${appTable(database, 'person')} WHERE id = ${id}`,
  );
  return row ? toPerson(row, ring) : undefined;
}

/**
 * Keeps the name and email in step with the account (task 2.6), for the account's own person: the sealed row is read, changed and sealed again, in
 * one conditional update that holds only while the row is as it was read, so two edits at once do not lose one.
 */
export async function updatePerson(
  database: Database,
  ring: KeyRing,
  accountId: string,
  changes: { name?: string; email?: string },
  now: number = Date.now(),
): Promise<Person | undefined> {
  const table = appTable(database, 'person');
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await dbGet<PersonRow>(
      database,
      sql`SELECT id, account_id, kind, sealed, deleted_at FROM ${table} WHERE account_id = ${accountId}`,
    );
    if (!row) return undefined;
    const fields = unsealRow('person', row.id, row.sealed, ring);
    const next = sealRow(
      'person',
      row.id,
      {
        name: changes.name ?? (typeof fields.name === 'string' ? fields.name : ''),
        email: changes.email ?? (typeof fields.email === 'string' ? fields.email : null),
      },
      ring,
    );
    const done = await dbAll<{ id: string }>(
      database,
      sql`UPDATE ${table} SET sealed = ${next}, updated_at = ${now} WHERE id = ${row.id} AND sealed = ${row.sealed} RETURNING id`,
    );
    if (done.length > 0) return toPerson({ ...row, sealed: next }, ring);
  }
  throw new Error('a person could not be updated');
}
