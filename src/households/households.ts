import { sql } from 'drizzle-orm';
import type { KeyRing } from '../crypto/keys';
import { sealRow, unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';
import { adminOf, memberOf } from '../access/membership';
import { canSeeEmail } from '../people/visibility';
import { householdLabel } from './label';

/**
 * Households and their members (DESIGN.md §7), read and made with the permission in every statement (`src/access/membership.ts`). A household is made
 * with the account (task 3.3) and joined by accepting an invitation (3.4); nothing here adds a person to a household that did not agree.
 */
export type Role = 'admin' | 'member';

export interface HouseholdView {
  readonly id: string;
  /** What to call it on screen, by the rule of `label.ts`. */
  readonly label: string;
  /** Whether it is the reader's own first household (§7.4). */
  readonly own: boolean;
  /** The reader's role in it. */
  readonly role: Role;
  /** Its change counter: what a device syncs by. */
  readonly seq: number;
}

interface HouseholdRow {
  id: string;
  own_of: string | null;
  sealed: string | null;
  seq: number;
  role: string;
  owner_name: string | null;
}

/**
 * Makes a household, with its creator as its first Admin, in one transaction that stamps both rows with the household's first `seq`. `ownOf` is the
 * account it is the first household of; making that one twice is refused by the unique index and returns the one that exists.
 */
export async function createHousehold(
  database: Database,
  ring: KeyRing,
  input: { creatorPersonId: string; ownOf?: string; name?: string; now?: number },
): Promise<string> {
  const now = input.now ?? Date.now();
  const id = crypto.randomUUID();
  const sealed =
    input.name === undefined ? null : sealRow('household', id, { name: input.name }, ring);
  const household = appTable(database, 'household');
  const member = appTable(database, 'member');
  return transaction(database, async (tx) => {
    const made = await dbAll<{ id: string }>(
      tx,
      sql`INSERT INTO ${household} (id, own_of, sealed, seq, created_by, created_at, updated_at)
          VALUES (${id}, ${input.ownOf ?? null}, ${sealed}, 1, ${input.creatorPersonId}, ${now}, ${now})
          ON CONFLICT (own_of) DO NOTHING RETURNING id`,
    );
    if (made.length === 0) {
      // The account's first household already exists: made by the other of two sign-ups at once, or by an earlier try.
      const existing = await dbGet<{ id: string }>(
        tx,
        sql`SELECT id FROM ${household} WHERE own_of = ${input.ownOf ?? ''}`,
      );
      if (!existing) throw new Error('a household could not be made');
      return existing.id;
    }
    await dbAll(
      tx,
      sql`INSERT INTO ${member} (id, household_id, person_id, role, joined_at, seq)
          VALUES (${crypto.randomUUID()}, ${id}, ${input.creatorPersonId}, 'admin', ${now}, 1)
          ON CONFLICT (household_id, person_id) DO NOTHING RETURNING id`,
    );
    return id;
  });
}

function toView(row: HouseholdRow, accountId: string, ring: KeyRing): HouseholdView {
  const name =
    row.sealed === null
      ? null
      : String(unsealRow('household', row.id, row.sealed, ring).name ?? '');
  const own = row.own_of === accountId;
  return {
    id: row.id,
    label: householdLabel({ name, viewerIsOwner: own, ownerName: row.owner_name }),
    own,
    role: row.role === 'admin' ? 'admin' : 'member',
    seq: Number(row.seq),
  };
}

const SELECT_HOUSEHOLD = (database: Database) => sql`
  SELECT h.id, h.own_of, h.sealed, h.seq, m.role, p.sealed AS owner_sealed, p.id AS owner_person
  FROM ${appTable(database, 'household')} h
  JOIN ${appTable(database, 'member')} m ON m.household_id = h.id
  JOIN ${appTable(database, 'person')} me ON me.id = m.person_id
  LEFT JOIN ${appTable(database, 'person')} p ON p.account_id = h.own_of AND p.deleted_at IS NULL`;

/** The households an account is an active member of, its own first, then by when it joined. **Only these**: membership is the statement's condition. */
export async function householdsOf(
  database: Database,
  ring: KeyRing,
  accountId: string,
): Promise<HouseholdView[]> {
  const rows = await dbAll<
    HouseholdRow & { owner_sealed: string | null; owner_person: string | null }
  >(
    database,
    sql`${SELECT_HOUSEHOLD(database)}
        WHERE me.account_id = ${accountId} AND m.left_at IS NULL
        ORDER BY CASE WHEN h.own_of = ${accountId} THEN 0 ELSE 1 END, m.joined_at, h.id`,
  );
  return rows.map((row) => toView(withOwner(row, ring), accountId, ring));
}

/** A household, for a member of it; `undefined` for anyone else, who gets the same answer as for one that does not exist. */
export async function readHousehold(
  database: Database,
  ring: KeyRing,
  householdId: string,
  accountId: string,
): Promise<HouseholdView | undefined> {
  const row = await dbGet<
    HouseholdRow & { owner_sealed: string | null; owner_person: string | null }
  >(
    database,
    sql`${SELECT_HOUSEHOLD(database)}
        WHERE h.id = ${householdId} AND me.account_id = ${accountId} AND m.left_at IS NULL`,
  );
  return row ? toView(withOwner(row, ring), accountId, ring) : undefined;
}

function withOwner(
  row: HouseholdRow & { owner_sealed: string | null; owner_person: string | null },
  ring: KeyRing,
): HouseholdRow {
  const ownerName =
    row.owner_sealed !== null && row.owner_person !== null
      ? String(unsealRow('person', row.owner_person, row.owner_sealed, ring).name ?? '')
      : null;
  return { ...row, owner_name: ownerName };
}

export interface MemberView {
  readonly personId: string;
  readonly name: string;
  /** Only where the reader may see it (`src/people/visibility.ts`): their own, or an Admin's reading a member's. */
  readonly email: string | null;
  readonly role: Role;
  readonly self: boolean;
  readonly joinedAt: number;
}

/**
 * The people in a household, for a member of it; `undefined` for anyone else. Each person's email is given only where `canSeeEmail` says: the reader's
 * own, or any member's to an Admin. The reader's role is read in the same statement, since the permission is in it.
 */
export async function membersOf(
  database: Database,
  ring: KeyRing,
  householdId: string,
  accountId: string,
): Promise<MemberView[] | undefined> {
  const rows = await dbAll<{
    person_id: string;
    account_id: string | null;
    sealed: string;
    role: string;
    joined_at: number;
    viewer_is_admin: number | boolean;
  }>(
    database,
    sql`SELECT m.person_id, p.account_id, p.sealed, m.role, m.joined_at,
               ${adminOf(database, sql`m.household_id`, accountId)} AS viewer_is_admin
        FROM ${appTable(database, 'member')} m
        JOIN ${appTable(database, 'person')} p ON p.id = m.person_id
        WHERE m.household_id = ${householdId} AND m.left_at IS NULL
          AND ${memberOf(database, sql`m.household_id`, accountId)}
        ORDER BY m.joined_at, m.person_id`,
  );
  if (rows.length === 0) return undefined;
  return rows.map((row) => {
    const fields = unsealRow('person', row.person_id, row.sealed, ring);
    const email = typeof fields.email === 'string' ? fields.email : null;
    const visible = canSeeEmail({
      viewerAccountId: accountId,
      targetAccountId: row.account_id,
      adminOfSharedHousehold: Boolean(row.viewer_is_admin),
    });
    return {
      personId: row.person_id,
      name: typeof fields.name === 'string' ? fields.name : '',
      email: visible ? email : null,
      role: row.role === 'admin' ? 'admin' : 'member',
      self: row.account_id === accountId,
      joinedAt: Number(row.joined_at),
    };
  });
}
