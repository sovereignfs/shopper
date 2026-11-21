import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { CONTENT, type SyncedTable } from '../../actions/format';
import { ownerOf } from '../../access/membership';
import type { KeyRing } from '../../crypto/keys';
import { unsealRow } from '../../crypto/sealed';
import type { Database } from '../../db/client';
import { dbAll, dbGet, dbRun, transaction } from '../../db/exec';
import { appTable } from '../../db/tables';
import { FIELD_VALUE, NAME_KEY, boundTo } from '../household';

/**
 * **Moving a household** (RFC 0001, amendment 2; DESIGN.md §13.7): from content the server seals to content its device encrypts. One household-level
 * operation in two calls, for the household's **only** member:
 *
 * 1. `moveManifest` opens the household's rows one last time, for that member: every list, item and product, deleted or not, with its content.
 * 2. `moveHousehold` takes them back encrypted, with the keyring wrapped for that member and each product's name key made by the device, and in one
 *    transaction writes every row's ciphertext, empties its sealed content, rewrites the name keys, keeps the keyring and marks the household encrypted,
 *    **only if the household's `seq` is still the manifest's** and every row is answered for, each value for its own row. Otherwise nothing changes, and
 *    the device asks again.
 *
 * A household with anyone else in it is not moved (the others could not be given its keys yet, amendment 2), nor one already moved.
 */
const MOVED: readonly SyncedTable[] = ['list', 'item', 'product'];

export interface MoveDeps {
  readonly database: Database;
  readonly ring: KeyRing;
}

export interface Manifest {
  readonly seq: number;
  readonly person: string;
  /** Each row with its list (a list's own id, an item's or a product's list), whose keys its values are encrypted under (RFC 0004). */
  readonly rows: Readonly<
    Record<
      SyncedTable,
      readonly { id: string; list: string; fields: Record<string, string | null> }[]
    >
  >;
}

/** The list a row's values are bound to: a list's own id, else its `list_id` (empty for a product from before lists had catalogs, which cannot move). */
const listOfRow = (table: SyncedTable, row: { id: string; list_id?: string | null }): string =>
  table === 'list' ? row.id : (row.list_id ?? '');

/**
 * The group, if it is this account's own, nobody else is on any of its lists (RFC 0004), and it is still sealed: its `seq` and the account's person.
 * A group with a shared list stays sealed by the server until each list has keys of its own (task 21.4).
 */
async function movable(
  database: Database,
  household: string,
  accountId: string,
): Promise<{ seq: number; person: string } | undefined> {
  const h = appTable(database, 'household');
  const m = appTable(database, 'member');
  const p = appTable(database, 'person');
  const found = await dbGet<{ seq: number | string; person: string; others: number | string }>(
    database,
    sql`SELECT h.seq, me.id AS person,
          (SELECT COUNT(*) FROM ${m} o WHERE o.household_id = h.id AND o.left_at IS NULL AND o.person_id <> me.id)
            + (SELECT COUNT(*) FROM ${appTable(database, 'list_member')} o
               WHERE o.household_id = h.id AND o.left_at IS NULL AND o.person_id <> me.id) AS others
        FROM ${h} h, ${p} me
        WHERE h.id = ${household} AND h.encryption = 'sealed' AND me.account_id = ${accountId}
          AND ${ownerOf(database, household, accountId)}`,
  );
  if (!found || Number(found.others) > 0) return undefined;
  return { seq: Number(found.seq), person: found.person };
}

export async function moveManifest(
  deps: MoveDeps,
  household: string,
  accountId: string,
): Promise<Manifest | undefined> {
  const { database, ring } = deps;
  const here = await movable(database, household, accountId);
  if (!here) return undefined;
  const rows = {} as Record<
    SyncedTable,
    { id: string; list: string; fields: Record<string, string | null> }[]
  >;
  for (const table of MOVED) {
    const found = await dbAll<{ id: string; sealed: string | null; list_id?: string | null }>(
      database,
      table === 'list'
        ? sql`SELECT id, sealed FROM ${appTable(database, table)} WHERE household_id = ${household} ORDER BY id`
        : sql`SELECT id, sealed, list_id FROM ${appTable(database, table)} WHERE household_id = ${household} ORDER BY id`,
    );
    rows[table] = found.map((row) => {
      const opened = row.sealed ? unsealRow(table, row.id, row.sealed, ring) : {};
      const fields: Record<string, string | null> = {};
      for (const field of CONTENT[table]) {
        const value = opened[field];
        fields[field] = typeof value === 'string' ? value : null;
      }
      return { id: row.id, list: listOfRow(table, row), fields };
    });
  }
  return { seq: here.seq, person: here.person, rows };
}

const movedRow = z.object({
  id: z.string().uuid(),
  fields: z.record(z.string(), z.union([z.string().regex(FIELD_VALUE), z.null()])),
  nameKey: z.string().regex(NAME_KEY).optional(),
});

export const moveInput = z.object({
  seq: z.number().int().min(0),
  keyring: z
    .string()
    .regex(/^hk1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    .max(8192),
  rows: z.object({ list: z.array(movedRow), item: z.array(movedRow), product: z.array(movedRow) }),
});

export type MoveInput = z.infer<typeof moveInput>;

export type MoveResult =
  { ok: true; seq: number } | { ok: false; why: 'not-movable' | 'stale' | 'incomplete' };

export async function moveHousehold(
  deps: MoveDeps,
  household: string,
  accountId: string,
  input: MoveInput,
  now: number = Date.now(),
): Promise<MoveResult> {
  return transaction(deps.database, async (tx): Promise<MoveResult> => {
    const here = await movable(tx, household, accountId);
    if (!here) return { ok: false, why: 'not-movable' };
    // The household as the manifest saw it, and no later: a change in between would be sealed content this does not answer for.
    const stepped = await dbGet<{ seq: number | string }>(
      tx,
      sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1, encryption = 'encrypted', epoch = 1, updated_at = ${now}
          WHERE id = ${household} AND seq = ${input.seq} AND encryption = 'sealed' RETURNING seq`,
    );
    if (!stepped) return { ok: false, why: 'stale' };
    const seq = Number(stepped.seq);

    for (const table of MOVED) {
      const found = await dbAll<{ id: string; list_id?: string | null }>(
        tx,
        table === 'list'
          ? sql`SELECT id FROM ${appTable(tx, table)} WHERE household_id = ${household}`
          : sql`SELECT id, list_id FROM ${appTable(tx, table)} WHERE household_id = ${household}`,
      );
      const ids = found.map((row) => row.id);
      const listOf = new Map(found.map((row) => [row.id, listOfRow(table, row)]));
      const sent = input.rows[table];
      // Every row once, each value made for its own row, and nothing of another table's content.
      if (sent.length !== ids.length || new Set(sent.map((row) => row.id)).size !== sent.length)
        throw new Incomplete();
      const known = new Set(ids);
      for (const row of sent) {
        if (!known.has(row.id)) throw new Incomplete();
        for (const [field, value] of Object.entries(row.fields)) {
          if (!CONTENT[table].includes(field)) throw new Incomplete();
          // Each value for its own row and its own list's keys (RFC 0004).
          const bound = value === null ? undefined : boundTo(value);
          if (value !== null && (bound?.row !== row.id || bound.list !== listOf.get(row.id)))
            throw new Incomplete();
        }
        if (table === 'product' && !row.nameKey) throw new Incomplete();
        const content = Object.fromEntries(
          Object.entries(row.fields).filter(([, value]) => value !== null),
        );
        await dbRun(
          tx,
          table === 'product'
            ? sql`UPDATE ${appTable(tx, table)} SET encrypted = ${JSON.stringify(content)}, sealed = '', name_key = ${row.nameKey ?? null}, seq = ${seq}
                  WHERE id = ${row.id} AND household_id = ${household}`
            : sql`UPDATE ${appTable(tx, table)} SET encrypted = ${JSON.stringify(content)}, sealed = '', seq = ${seq}
                  WHERE id = ${row.id} AND household_id = ${household}`,
        );
      }
    }
    await dbRun(
      tx,
      sql`INSERT INTO ${appTable(tx, 'household_key')} (household_id, person_id, epoch, record, created_at)
          VALUES (${household}, ${here.person}, 1, ${input.keyring}, ${now})`,
    );
    return { ok: true, seq };
  }).catch((error: unknown) => {
    if (error instanceof Incomplete) return { ok: false as const, why: 'incomplete' as const };
    throw error;
  });
}

/** Thrown inside the move's transaction so that it rolls back whole. */
class Incomplete extends Error {}
