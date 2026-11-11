import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { KeyRing } from '../crypto/keys';
import { unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';
import { adminOf, memberOf } from '../access/membership';
import { type Limits } from '../limits/config';
import { limitSentence } from '../limits/limits';
import { personById, personOfAccount } from '../people/people';
import { householdLabel } from './label';

/**
 * **Invitations by link** (DESIGN.md §7.3). People join a household only by accepting, never by being added. In 0.1.0 an invitation is a link and nothing
 * else: a random token of 32 bytes, **stored only as its hash**, compared in constant time, valid for 14 days, single-use, revocable by whoever made it
 * or by an Admin, at most 20 live in a household. Whoever holds the link can accept it.
 *
 * The permission is in each statement (§5.2): making one is `memberOf` in the same `INSERT`, revoking is the creator-or-Admin condition in the same
 * `UPDATE`, and accepting claims the invitation, checks the limits and adds the member **in one transaction**, so a link cannot be used twice, a limit
 * cannot be passed by two at once, and a refusal leaves the link unused. Nothing here is logged with a token or a name.
 */
export const INVITATION_DAYS = 14;
export const INVITATION_TTL_MS = INVITATION_DAYS * 24 * 60 * 60 * 1000;
/** Live invitations a household may have at once. */
export const MAX_LIVE_INVITATIONS = 20;

/** A token is 32 bytes as base64url: 43 characters. Anything else is not one, and is the same page as one that is not there. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const newToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Whether two hex hashes are equal, in constant time. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type Made =
  | { readonly ok: true; readonly id: string; readonly token: string; readonly expiresAt: number }
  | { readonly ok: false; readonly refused: string };

/**
 * Makes an invitation for a household the account is in, and returns its token **once**: only the hash is kept, so the link cannot be shown again. The
 * membership and the count of live invitations are conditions of the one statement that inserts it.
 */
export async function createInvitation(
  database: Database,
  input: { household: string; accountId: string; personId: string; now: number },
): Promise<Made> {
  const { household, accountId, personId, now } = input;
  const id = crypto.randomUUID();
  const token = newToken();
  const expiresAt = now + INVITATION_TTL_MS;
  const table = appTable(database, 'invitation');
  const made = await dbAll<{ id: string }>(
    database,
    sql`INSERT INTO ${table} (id, household_id, token_hash, created_by, created_at, expires_at)
        SELECT ${id}, ${household}, ${hashToken(token)}, ${personId}, CAST(${now} AS BIGINT), CAST(${expiresAt} AS BIGINT)
        WHERE ${memberOf(database, household, accountId)}
          AND (SELECT COUNT(*) FROM ${table} WHERE household_id = ${household} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ${now}) < ${MAX_LIVE_INVITATIONS}
        RETURNING id`,
  );
  if (made.length === 0)
    return {
      ok: false,
      refused: `A household can have ${MAX_LIVE_INVITATIONS} links waiting at once, and this one has them. Revoke one that is not needed, or wait for one to be used.`,
    };
  return { ok: true, id, token, expiresAt };
}

/** Revokes a live invitation: by whoever made it, or by an Admin of the household, as one statement. `false` for anything else, which reads as not found. */
export async function revokeInvitation(
  database: Database,
  input: {
    household: string;
    accountId: string;
    personId: string;
    invitation: string;
    now: number;
  },
): Promise<boolean> {
  const { household, accountId, personId, invitation, now } = input;
  const table = appTable(database, 'invitation');
  const done = await dbAll<{ id: string }>(
    database,
    sql`UPDATE ${table} SET revoked_at = ${now}
        WHERE id = ${invitation} AND household_id = ${household}
          AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ${now}
          AND ${memberOf(database, household, accountId)}
          AND (created_by = ${personId} OR ${adminOf(database, household, accountId)})
        RETURNING id`,
  );
  return done.length > 0;
}

export interface LiveInvitation {
  readonly id: string;
  /** The person who made it, by name. */
  readonly by: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  /** Whether the reader may revoke it: they made it, or they are an Admin. */
  readonly canRevoke: boolean;
}

/** The household's live invitations, for a member of it; empty for anyone else. A link is never in the answer: only its hash is stored. */
export async function liveInvitations(
  database: Database,
  ring: KeyRing,
  input: { household: string; accountId: string; now: number },
): Promise<LiveInvitation[]> {
  const { household, accountId, now } = input;
  const table = appTable(database, 'invitation');
  const rows = await dbAll<{
    id: string;
    created_by: string;
    created_at: number | string;
    expires_at: number | string;
    mine: number | boolean;
    admin: number | boolean;
  }>(
    database,
    sql`SELECT i.id, i.created_by, i.created_at, i.expires_at,
               (i.created_by = (SELECT id FROM ${appTable(database, 'person')} WHERE account_id = ${accountId})) AS mine,
               ${adminOf(database, household, accountId)} AS admin
        FROM ${table} i
        WHERE i.household_id = ${household} AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ${now}
          AND ${memberOf(database, sql`i.household_id`, accountId)}
        ORDER BY i.created_at, i.id`,
  );
  const out: LiveInvitation[] = [];
  for (const row of rows) {
    const by = await personById(database, ring, row.created_by);
    out.push({
      id: row.id,
      by: by?.name ?? '',
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
      canRevoke: Boolean(row.mine) || Boolean(row.admin),
    });
  }
  return out;
}

export interface Preview {
  /** The household as it is called to someone outside it: "Kasun's lists" (DESIGN.md §7.4). */
  readonly household: string;
  readonly invitedBy: string;
}

/**
 * What the invitation page may say of a link: the household's name by the rule of §7.4 and who invited, **and nothing else**. `null` for a link that is
 * not live, whatever the reason (unknown, expired, used or revoked), so that the page says one thing for all of them.
 */
export async function previewInvitation(
  database: Database,
  ring: KeyRing,
  token: string,
  now: number,
): Promise<Preview | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const hash = hashToken(token);
  const table = appTable(database, 'invitation');
  const row = await dbGet<{
    token_hash: string;
    created_by: string;
    household_id: string;
    own_of: string | null;
    sealed: string | null;
  }>(
    database,
    sql`SELECT i.token_hash, i.created_by, i.household_id, h.own_of, h.sealed
        FROM ${table} i JOIN ${appTable(database, 'household')} h ON h.id = i.household_id
        WHERE i.token_hash = ${hash} AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ${now}`,
  );
  if (!row || !sameHash(row.token_hash, hash)) return null;
  const inviter = await personById(database, ring, row.created_by);
  const owner = row.own_of ? await personOfAccount(database, ring, row.own_of) : undefined;
  const name =
    row.sealed === null
      ? null
      : String(unsealRow('household', row.household_id, row.sealed, ring).name ?? '');
  return {
    household: householdLabel({ name, viewerIsOwner: false, ownerName: owner?.name ?? null }),
    invitedBy: inviter?.name ?? '',
  };
}

export type Accepted =
  | { readonly status: 'joined'; readonly household: string }
  /** The person is already in the household: nothing changed, and the link is still unused. */
  | { readonly status: 'already'; readonly household: string }
  /** Unknown, expired, used or revoked: one answer. */
  | { readonly status: 'invalid' }
  | { readonly status: 'refused'; readonly message: string };

class Invalid extends Error {}
class Already extends Error {
  constructor(readonly household: string) {
    super('already a member');
  }
}
class Refused extends Error {}

/**
 * Accepts an invitation as the person of an account: **one transaction** that claims the link (so a second acceptance finds none), refuses a person who is
 * already in, and adds the member in a statement that carries both limits. Any refusal rolls the claim back, so the link is still good. A person who left
 * the household and joins again has the same row back, as a Member.
 */
export async function acceptInvitation(
  database: Database,
  ring: KeyRing,
  input: { token: string; accountId: string; limits: Limits; now: number },
): Promise<Accepted> {
  const { token, accountId, limits, now } = input;
  if (!TOKEN_PATTERN.test(token)) return { status: 'invalid' };
  const hash = hashToken(token);
  try {
    return await transaction(database, async (tx) => {
      const person = await personOfAccount(tx, ring, accountId);
      if (!person) throw new Invalid();
      const invitation = appTable(tx, 'invitation');
      const member = appTable(tx, 'member');
      const claimed = await dbGet<{ household_id: string; token_hash: string }>(
        tx,
        sql`UPDATE ${invitation} SET accepted_by = ${person.id}, accepted_at = ${now}
            WHERE token_hash = ${hash} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ${now}
            RETURNING household_id, token_hash`,
      );
      if (!claimed || !sameHash(claimed.token_hash, hash)) throw new Invalid();
      const household = claimed.household_id;

      const already = await dbGet<{ id: string }>(
        tx,
        sql`SELECT id FROM ${member} WHERE household_id = ${household} AND person_id = ${person.id} AND left_at IS NULL`,
      );
      if (already) throw new Already(household);

      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1, updated_at = ${now} WHERE id = ${household} RETURNING seq`,
      );
      if (!stepped) throw new Invalid();
      const seq = Number(stepped.seq);
      const added = await dbAll<{ id: string }>(
        tx,
        sql`INSERT INTO ${member} (id, household_id, person_id, role, joined_at, left_at, seq)
            SELECT ${crypto.randomUUID()}, ${household}, ${person.id}, 'member', CAST(${now} AS BIGINT), NULL, ${seq}
            WHERE (SELECT COUNT(*) FROM ${member} WHERE household_id = ${household} AND left_at IS NULL) < ${limits.householdMembers}
              AND (SELECT COUNT(*) FROM ${member} m JOIN ${appTable(tx, 'person')} p ON p.id = m.person_id
                   WHERE p.account_id = ${accountId} AND m.left_at IS NULL) < ${limits.accountHouseholds}
            ON CONFLICT (household_id, person_id) DO UPDATE
              SET left_at = NULL, role = 'member', joined_at = excluded.joined_at, seq = excluded.seq
            RETURNING id`,
      );
      if (added.length === 0) {
        const members = await dbGet<{ n: number | string }>(
          tx,
          sql`SELECT COUNT(*) AS n FROM ${member} WHERE household_id = ${household} AND left_at IS NULL`,
        );
        throw new Refused(
          Number(members?.n ?? 0) >= limits.householdMembers
            ? limitSentence('householdMembers', limits.householdMembers)
            : limitSentence('accountHouseholds', limits.accountHouseholds),
        );
      }
      return { status: 'joined' as const, household };
    });
  } catch (error) {
    if (error instanceof Invalid) return { status: 'invalid' };
    if (error instanceof Already) return { status: 'already', household: error.household };
    if (error instanceof Refused) return { status: 'refused', message: error.message };
    throw error;
  }
}
