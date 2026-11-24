import { z } from 'zod';
import type { KeyRing } from '../crypto/keys';
import type { Database } from '../db/client';
import { adminOf, cardAdminOf, listAdminOf, memberOf, onCard, onList } from '../access/membership';
import { isId } from '../actions/format';
import { appTable } from '../db/tables';
import { sql } from 'drizzle-orm';
import { dbGet } from '../db/exec';
import { personOfAccount } from '../people/people';
import { createInvite, listInvites, revokeInvite } from './invite-ops';
import { leaveHousehold, removeMember } from './member-ops';
import { deleteCard } from './card-ops';
import { deleteList } from './list-ops';
import { keepListKeys } from '../keys/server/key-ops';

/**
 * **The online operations** (DESIGN.md §12.8): households, membership, roles, invitations and moving a list are decided by the server at once, never queued
 * offline, through the one door `/api/ops`. Each operation says **who may do it** (`member`, or `admin`), and the dispatcher answers anyone else exactly as
 * it answers an operation that does not exist: not found (§5.2). The operation's own statements carry the same condition, since a check made first and
 * then touched is not a permission; the dispatcher's is only the early, uniform refusal.
 */
export type Who = 'member' | 'admin';

export interface OperationContext {
  readonly database: Database;
  readonly ring: KeyRing;
  readonly accountId: string;
  readonly personId: string;
  readonly household: string;
  readonly now: number;
}

/** What an operation answers: its result, or a refusal that is a sentence a person can read, and is never a permission (those are not found). */
export type OperationResult =
  | { readonly ok: true; readonly result?: unknown }
  | { readonly ok: false; readonly refused: string };

export interface Operation {
  readonly name: string;
  readonly who: Who;
  /**
   * `list`: the operation is about one list (RFC 0004), named by `list` in its input, and `who` is the account's place on that list (its Admin, or anyone
   * on it). `card`: the same for one card (RFC 0007), named by `card` in its input: its Admin, or anyone on it. Otherwise it is about the group, and `who` is the account's place on the group.
   */
  readonly scope?: 'list' | 'card';
  /** The rest of the operation's input, beside `op` and `household`; checked before anything is read. */
  readonly input: z.ZodType<Record<string, unknown>>;
  run(context: OperationContext, input: Record<string, unknown>): Promise<OperationResult>;
}

/** Every operation there is. Each task that adds one lists it here, and in `src/access/routes.ts`. */
export const OPERATIONS: readonly Operation[] = [
  deleteList,
  deleteCard,
  createInvite,
  revokeInvite,
  listInvites,
  leaveHousehold,
  removeMember,
  keepListKeys,
];

export interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const NOT_FOUND: Reply = { status: 404, body: { ok: false, error: 'not_found' } };
const envelope = z
  .object({ op: z.string().min(1).max(64), household: z.string().min(1).max(64) })
  .passthrough();

/**
 * Runs one operation for an account. **Unknown operation, unknown household, a household the account is not in, and an Admin's operation by a Member are
 * one answer**, so that the answer says nothing about which. A malformed request is `invalid`, a refusal a person can act on is `refused` with its sentence.
 */
export async function dispatch(
  deps: { database: Database; ring: KeyRing; operations?: readonly Operation[] },
  accountId: string,
  body: unknown,
  now: number = Date.now(),
): Promise<Reply> {
  const parsed = envelope.safeParse(body);
  if (!parsed.success) return { status: 400, body: { ok: false, error: 'invalid' } };
  const { op, household, ...rest } = parsed.data;
  const operation = (deps.operations ?? OPERATIONS).find((each) => each.name === op);
  if (!operation) return NOT_FOUND;

  const list = operation.scope === 'list' ? rest.list : undefined;
  if (operation.scope === 'list' && (typeof list !== 'string' || !isId(list))) return NOT_FOUND;
  const card = operation.scope === 'card' ? rest.card : undefined;
  if (operation.scope === 'card' && (typeof card !== 'string' || !isId(card))) return NOT_FOUND;
  const allowed = await dbGet<{ yes: number | boolean }>(
    deps.database,
    typeof card === 'string'
      ? // The card must be the group's, and the account on it: its Admin for an Admin's operation (RFC 0007).
        sql`SELECT 1 AS yes FROM ${appTable(deps.database, 'card')} c WHERE c.id = ${card} AND c.household_id = ${household}
            AND ${(operation.who === 'admin' ? cardAdminOf : onCard)(deps.database, card, accountId)}`
      : typeof list === 'string'
        ? // The list must be the group's, and the account on it: its Admin for an Admin's operation (RFC 0004).
          sql`SELECT 1 AS yes FROM ${appTable(deps.database, 'list')} l WHERE l.id = ${list} AND l.household_id = ${household}
            AND ${(operation.who === 'admin' ? listAdminOf : onList)(deps.database, list, accountId)}`
        : sql`SELECT ${(operation.who === 'admin' ? adminOf : memberOf)(deps.database, household, accountId)} AS yes`,
  );
  if (!allowed || !allowed.yes) return NOT_FOUND;
  const person = await personOfAccount(deps.database, deps.ring, accountId);
  if (!person) return NOT_FOUND;

  const input = operation.input.safeParse(rest);
  if (!input.success) return { status: 400, body: { ok: false, error: 'invalid' } };
  const result = await operation.run(
    { ...deps, accountId, personId: person.id, household, now },
    input.data,
  );
  return result.ok
    ? {
        status: 200,
        body: { ok: true, ...(result.result === undefined ? {} : { result: result.result }) },
      }
    : { status: 409, body: { ok: false, error: 'refused', message: result.refused } };
}
