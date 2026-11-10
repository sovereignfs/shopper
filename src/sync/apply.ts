import { sql, type SQL } from 'drizzle-orm';
import type { Change, FieldValue, Mutation, SyncedTable } from '../actions/format';
import { validateMutation } from '../actions/validate';
import type { KeyRing } from '../crypto/keys';
import { sealRow, unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';
import { memberOf } from '../access/membership';
import type { Limits } from '../limits/config';
import { mergeChange } from './merge';
import { Refusal, duplicate, invalid, limited, notFound, unsupported } from './refusal';
import { TABLES, type TableSpec } from './tables';

/**
 * **The server's one write path** (DESIGN.md §12.3, §12.4, §12.5). `applyMutation` takes what a device sent and, **in one short transaction**: finds the
 * household and steps its counter, **in the same statement that checks the account is an active member of it** (a refusal reads as not found); checks
 * every row a change points at is **the household's own**; merges each change into its row **field by field** (`merge.ts`), unsealing a row's envelope,
 * changing the fields it was sent and sealing it again; stamps each changed field and the row with the new `seq`; and records the mutation's id, so that
 * **sending it again writes nothing** and is answered as it was. Anything refused rolls the whole mutation back, counter included, and says why
 * (`refusal.ts`): nothing is half applied.
 *
 * It is the only thing that writes lists, items, products or categories. Folding the same thing made twice into one (§12.4) is task 5.3's, in this
 * transaction.
 */
export interface ApplyDeps {
  readonly database: Database;
  readonly ring: KeyRing;
  readonly limits: Limits;
  /** The tables the server applies; the real ones unless a test gives its own. */
  readonly tables?: Partial<Record<SyncedTable, TableSpec>>;
}

export interface Changed {
  readonly table: SyncedTable;
  readonly id: string;
}

export type ApplyResult =
  | {
      readonly status: 'applied' | 'replayed';
      readonly seq: number;
      readonly changed: readonly Changed[];
    }
  | { readonly status: 'refused'; readonly reason: Refusal['reason']; readonly sentence: string };

export async function applyMutation(
  deps: ApplyDeps,
  accountId: string,
  input: unknown,
  now: number = Date.now(),
): Promise<ApplyResult> {
  const verdict = validateMutation(input);
  if (!verdict.ok) return refused(invalid(verdict.problem));
  const mutation = verdict.mutation;
  const { database } = deps;

  // A mutation already applied is answered as it was, and writes nothing (DESIGN.md §12.2). Its authority was checked when it was applied.
  const done = await dbGet<{ seq: number | string }>(
    database,
    sql`SELECT seq FROM ${appTable(database, 'applied_mutation')} WHERE account_id = ${accountId} AND id = ${mutation.mutationId}`,
  );
  if (done) return { status: 'replayed', seq: Number(done.seq), changed: [] };

  try {
    return await transaction(database, async (tx) =>
      run({ ...deps, database: tx }, accountId, mutation, now),
    );
  } catch (error) {
    if (error instanceof Refusal) return refused(error);
    // Two of the same mutation at once: the other one recorded it first, and the unique key refused this one, which is a replay.
    const again = await dbGet<{ seq: number | string }>(
      database,
      sql`SELECT seq FROM ${appTable(database, 'applied_mutation')} WHERE account_id = ${accountId} AND id = ${mutation.mutationId}`,
    );
    if (again) return { status: 'replayed', seq: Number(again.seq), changed: [] };
    throw error;
  }
}

const refused = (refusal: Refusal): ApplyResult => ({
  status: 'refused',
  reason: refusal.reason,
  sentence: refusal.sentence,
});

async function run(
  deps: ApplyDeps,
  accountId: string,
  mutation: Mutation,
  now: number,
): Promise<ApplyResult> {
  const { database } = deps;
  // The counter is stepped by the statement that says the account is in the household: the permission is in the statement (§5.2).
  const stepped = await dbGet<{ seq: number | string }>(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET seq = seq + 1, updated_at = ${now}
        WHERE id = ${mutation.householdId} AND ${memberOf(database, mutation.householdId, accountId)} RETURNING seq`,
  );
  if (!stepped) throw notFound();
  const seq = Number(stepped.seq);

  const changed: Changed[] = [];
  for (const change of mutation.changes) {
    const spec = (deps.tables ?? TABLES)[change.table];
    if (!spec) throw unsupported(change.table);
    if (await applyChange(deps, spec, mutation.householdId, change, seq, now)) {
      changed.push({ table: change.table, id: change.id });
    }
  }

  await dbAll(
    database,
    sql`INSERT INTO ${appTable(database, 'applied_mutation')} (account_id, id, household_id, seq, created_at)
        VALUES (${accountId}, ${mutation.mutationId}, ${mutation.householdId}, ${seq}, ${now}) RETURNING id`,
  );
  return { status: 'applied', seq, changed };
}

type Row = Record<string, unknown>;

/** One change, merged into its row. Returns whether the row was written (a change that changes nothing writes nothing). */
async function applyChange(
  deps: ApplyDeps,
  spec: TableSpec,
  household: string,
  change: Change,
  seq: number,
  now: number,
): Promise<boolean> {
  const { database, ring } = deps;
  const t = appTable(database, spec.sql);
  const existing = await dbGet<Row>(
    database,
    sql`SELECT * FROM ${t} WHERE id = ${change.id} AND household_id = ${household}`,
  );
  if (!existing) {
    if (!change.create) throw notFound();
    // An id that is another household's row is not ours to make or to say anything about; it reads as not found.
    const elsewhere = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${t} WHERE id = ${change.id}`,
    );
    if (elsewhere) throw notFound();
  }

  await checkReferences(deps, spec, household, change);

  // The row as it is: plain columns by field name, and the sealed envelope opened.
  const values: Record<string, FieldValue> = {};
  const stamps: Record<string, number> = existing ? parseStamps(existing.fseq) : {};
  let sealedNow: Record<string, FieldValue> = {};
  if (existing) {
    for (const { field, column } of spec.plain)
      values[field] = (existing[column] as FieldValue | undefined) ?? null;
    if (typeof existing.sealed === 'string')
      sealedNow = { ...unsealRow(spec.sql, change.id, existing.sealed, ring) };
    for (const field of spec.sealed) values[field] = sealedNow[field] ?? null;
  }

  const merged = mergeChange(values, stamps, change.fields, seq);
  if (existing && merged.changed.length === 0) return false;

  const sealedChanged = spec.sealed.some((field) => merged.changed.includes(field)) || !existing;
  const sealedFields: Record<string, FieldValue> = {};
  for (const field of spec.sealed) {
    const value = (existing ? merged.values[field] : change.fields[field]) ?? null;
    if (value !== null) sealedFields[field] = value;
  }
  const sealedText = sealedChanged ? sealRow(spec.sql, change.id, sealedFields, ring) : undefined;
  const derived =
    sealedChanged && spec.derive ? spec.derive({ household, ring, sealed: sealedFields }) : {};

  // A name already in the household is another product's: task 5.3 folds the two; until then the second is refused.
  if (derived.name_key !== undefined) {
    const same = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${t} WHERE household_id = ${household} AND name_key = ${derived.name_key} AND id <> ${change.id}`,
    );
    if (same) throw duplicate();
  }

  if (!existing) {
    if (spec.limit) {
      const count = await dbGet<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${t} WHERE household_id = ${household} AND deleted_at IS NULL`,
      );
      const most = spec.limit.of(deps.limits);
      if (Number(count?.n ?? 0) + 1 > most) throw limited(spec.limit.kind, most);
    }
    const columns: [string, unknown][] = [
      ['id', change.id],
      ['household_id', household],
    ];
    for (const { field, column } of spec.plain)
      columns.push([column, merged.values[field] ?? change.fields[field] ?? null]);
    columns.push(['sealed', sealedText ?? null]);
    for (const [column, value] of Object.entries(derived)) columns.push([column, value]);
    columns.push(['seq', seq], ['fseq', JSON.stringify(stampsOf(change, seq))]);
    await dbAll(
      database,
      sql`INSERT INTO ${t} (${sql.join(
        columns.map(([c]) => sql.raw(`"${c}"`)),
        sql`, `,
      )})
          VALUES (${sql.join(
            columns.map(([, v]) => sql`${v}`),
            sql`, `,
          )}) RETURNING id`,
    );
    return true;
  }

  const sets: SQL[] = [];
  for (const { field, column } of spec.plain) {
    if (merged.changed.includes(field))
      sets.push(sql`${sql.raw(`"${column}"`)} = ${merged.values[field] ?? null}`);
  }
  if (sealedText !== undefined) sets.push(sql`"sealed" = ${sealedText}`);
  for (const [column, value] of Object.entries(derived))
    sets.push(sql`${sql.raw(`"${column}"`)} = ${value}`);
  sets.push(sql`"seq" = ${seq}`, sql`"fseq" = ${JSON.stringify(merged.fseq)}`);
  const done = await dbAll<{ id: string }>(
    database,
    sql`UPDATE ${t} SET ${sql.join(sets, sql`, `)} WHERE id = ${change.id} AND household_id = ${household} RETURNING id`,
  );
  if (done.length === 0) throw notFound();
  void now;
  return true;
}

/** Every field a new row says is stamped with the counter it was made at. */
function stampsOf(change: Change, seq: number): Record<string, number> {
  return Object.fromEntries(Object.keys(change.fields).map((field) => [field, seq]));
}

function parseStamps(raw: unknown): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(typeof raw === 'string' ? raw : '{}');
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number',
      ),
    );
  } catch {
    return {};
  }
}

/**
 * **Everything a change points at must be the household's own** (DESIGN.md §5.2, §12.5): a list, a product or a category of this household, or a person
 * who has been in it. Each is looked for with the household in the statement, so another household's row, a deleted one and one that is not there are
 * the same answer: not found.
 */
async function checkReferences(
  deps: ApplyDeps,
  spec: TableSpec,
  household: string,
  change: Change,
): Promise<void> {
  const { database } = deps;
  for (const [field, target] of Object.entries(spec.refs)) {
    const value = change.fields[field];
    if (value === undefined || value === null) continue;
    const found =
      target === 'person'
        ? await dbGet<{ yes: number }>(
            database,
            sql`SELECT 1 AS yes FROM ${appTable(database, 'member')} WHERE household_id = ${household} AND person_id = ${String(value)}`,
          )
        : await dbGet<{ yes: number }>(
            database,
            sql`SELECT 1 AS yes FROM ${appTable(database, target)} WHERE id = ${String(value)} AND household_id = ${household} AND ${target === 'category' || target === 'list' ? sql`deleted_at IS NULL` : sql`1 = 1`}`,
          );
    if (!found) throw notFound();
  }
}
