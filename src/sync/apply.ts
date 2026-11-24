import { sql, type SQL } from 'drizzle-orm';
import type { Change, FieldValue, Mutation, SyncedTable } from '../actions/format';
import { type ContentMode, validateMutation } from '../actions/validate';
import type { KeyRing } from '../crypto/keys';
import { sealRow, unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';
import { memberOf, onList, ownerOf } from '../access/membership';
import { addListMember } from '../lists/members';
import type { Limits } from '../limits/config';
import {
  type Fold,
  foldInventoryFields,
  foldProductFields,
  recordFold,
  resolveAlias,
} from './fold';
import { foldItemFields, withoutSecondTick } from './items';
import { mergeChange } from './merge';
import { Refusal, duplicate, invalid, limited, notFound, otherList, unsupported } from './refusal';
import { boundTo } from '../keys/household';
import { OPEN_ITEM } from './open';
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
  /**
   * How the household's content travels (RFC 0001), set by `run` from the household it applies to: `plain`, sealed here; `encrypted`, kept as the
   * device sent it, in the row's `encrypted` column, which the server never opens.
   */
  readonly mode?: ContentMode;
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
      /** What the server folded: a row the device made that became another (`fold.ts`), so that the device re-points what it holds. */
      readonly folds: readonly Fold[];
    }
  | { readonly status: 'refused'; readonly reason: Refusal['reason']; readonly sentence: string }
  /**
   * Neither applied nor refused: sent in the form the household is no longer in (plain text for one that moved, RFC 0001). The device keeps it and
   * sends it again, encrypted, after the next pull.
   */
  | { readonly status: 'held' };

/** The household moved between the device's last pull and this mutation: held (`ApplyResult`). */
class Held extends Error {}

export async function applyMutation(
  deps: ApplyDeps,
  accountId: string,
  input: unknown,
  now: number = Date.now(),
): Promise<ApplyResult> {
  const { database } = deps;
  const householdId = (input as { householdId?: unknown } | null)?.householdId;
  const state =
    typeof householdId === 'string'
      ? await dbGet<{ encryption: string }>(
          database,
          // Only a member learns how a household's content travels: for anyone else it is plain, and the mutation reads as not found (§5.2).
          sql`SELECT encryption FROM ${appTable(database, 'household')} WHERE id = ${householdId} AND ${memberOf(database, householdId, accountId)}`,
        )
      : undefined;
  const mode: ContentMode = state?.encryption === 'encrypted' ? 'encrypted' : 'plain';
  let verdict = validateMutation(input, mode);
  // Good in the other form: the household moved under the device. What it says is still checked as the sender's (`run`), and then it is held.
  let sent = mode;
  if (!verdict.ok) {
    const other: ContentMode = mode === 'plain' ? 'encrypted' : 'plain';
    const again = validateMutation(input, other);
    if (!again.ok) return refused(invalid(verdict.problem));
    verdict = again;
    sent = other;
  }
  const mutation = verdict.mutation;

  // A mutation already applied is answered as it was, and writes nothing (DESIGN.md §12.2). Its authority was checked when it was applied.
  const done = await dbGet<{ seq: number | string }>(
    database,
    sql`SELECT seq FROM ${appTable(database, 'applied_mutation')} WHERE account_id = ${accountId} AND id = ${mutation.mutationId}`,
  );
  if (done) return { status: 'replayed', seq: Number(done.seq), changed: [], folds: [] };

  try {
    return await transaction(database, async (tx) =>
      run({ ...deps, database: tx, mode: sent }, accountId, mutation, now),
    );
  } catch (error) {
    if (error instanceof Held) return { status: 'held' };
    if (error instanceof Refusal) return refused(error);
    // Two of the same mutation at once: the other one recorded it first, and the unique key refused this one, which is a replay.
    const again = await dbGet<{ seq: number | string }>(
      database,
      sql`SELECT seq FROM ${appTable(database, 'applied_mutation')} WHERE account_id = ${accountId} AND id = ${mutation.mutationId}`,
    );
    if (again) return { status: 'replayed', seq: Number(again.seq), changed: [], folds: [] };
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
  const stepped = await dbGet<{ seq: number | string; encryption: string }>(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET seq = seq + 1, updated_at = ${now}
        WHERE id = ${mutation.householdId} AND ${memberOf(database, mutation.householdId, accountId)} RETURNING seq, encryption`,
  );
  if (!stepped) throw notFound();
  // It moved between the check and this statement, or was sent in the other form: the whole mutation waits for the device to send it again (and this
  // transaction rolls back), once what it says is the sender's to say.
  const moved =
    (stepped.encryption === 'encrypted' ? 'encrypted' : 'plain') !== (deps.mode ?? 'plain');
  const seq = Number(stepped.seq);

  const changed: Changed[] = [];
  const folds: Fold[] = [];
  for (const raw of mutation.changes) {
    const spec = (deps.tables ?? TABLES)[raw.table];
    if (!spec) throw unsupported(raw.table);
    // A change that names a row that was folded into another is a change to the other (`fold.ts`).
    const target = await resolveAlias(database, mutation.householdId, raw.table, raw.id);
    const change: Change =
      target === raw.id
        ? withProductList(raw, mutation)
        : { table: raw.table, id: target, fields: raw.fields };
    // Who did it is the sender: checked on what the device sent, and not on what the server itself writes when it folds two rows into one.
    await checkAuthorship(deps, spec, mutation.householdId, accountId, change);
    const from = await checkListAccess(deps, spec, mutation.householdId, accountId, change);
    if (moved) throw new Held();
    const outcome = await applyChange(deps, spec, mutation.householdId, change, seq, now);
    // An item moved to another list leaves the devices of those on the first and not on the second (RFC 0004): a tombstone of no list, which the pull
    // hands only to a reader who cannot see the item where it is now (it names an id and nothing else). Of no list, so that a second move cannot keep it
    // from those on the first.
    if (
      spec.table === 'item' &&
      from !== undefined &&
      typeof change.fields.listId === 'string' &&
      change.fields.listId !== from &&
      outcome.written.includes(change.id)
    )
      await dbAll(
        database,
        sql`INSERT INTO ${appTable(database, 'tombstone')} (household_id, table_name, id, seq, created_at, list_id)
            VALUES (${mutation.householdId}, 'item', ${change.id}, ${seq}, ${now}, NULL)
            ON CONFLICT (household_id, table_name, id) DO UPDATE SET seq = excluded.seq, list_id = NULL RETURNING id`,
      );
    // A list made now has its maker as its Admin (RFC 0004).
    if (spec.table === 'list' && raw.create && outcome.written.includes(change.id)) {
      const me = await dbGet<{ id: string }>(
        database,
        sql`SELECT id FROM ${appTable(database, 'person')} WHERE account_id = ${accountId}`,
      );
      if (me)
        await addListMember(database, {
          household: mutation.householdId,
          list: change.id,
          person: me.id,
          role: 'admin',
          seq,
          now,
        });
    }
    if (outcome.fold) folds.push(outcome.fold);
    for (const id of outcome.written) changed.push({ table: change.table, id });
  }

  await dbAll(
    database,
    sql`INSERT INTO ${appTable(database, 'applied_mutation')} (account_id, id, household_id, seq, created_at)
        VALUES (${accountId}, ${mutation.mutationId}, ${mutation.householdId}, ${seq}, ${now}) RETURNING id`,
  );
  return { status: 'applied', seq, changed, folds };
}

type Row = Record<string, unknown>;

interface Outcome {
  /** The rows written: none for a change that changes nothing, the row it was folded into for a fold. */
  readonly written: readonly string[];
  readonly fold?: Fold;
}

const NOTHING: Outcome = { written: [] };

/** A column as a field says it: a flag column is `0` or `1` whatever the dialect read it as (a boolean, or an integer). */
const fieldOf = (kind: 'bool' | undefined, value: unknown): FieldValue =>
  kind === 'bool' ? (value ? 1 : 0) : ((value as FieldValue | undefined) ?? null);

/** A field as its column takes it: a flag as PostgreSQL's boolean or SQLite's integer, anything else as it is. */
const columnOf = (database: Database, kind: 'bool' | undefined, value: FieldValue): unknown =>
  kind === 'bool' && value !== null
    ? database.dialect === 'postgres'
      ? value === 1
      : value === 1
        ? 1
        : 0
    : value;

/** One change, merged into its row. A change that changes nothing writes nothing; a row made for a name the household has is folded into it. */
async function applyChange(
  deps: ApplyDeps,
  spec: TableSpec,
  household: string,
  incoming: Change,
  seq: number,
  now: number,
): Promise<Outcome> {
  const { database, ring } = deps;
  const t = appTable(database, spec.sql);
  // A change that names a product that was folded into another names the other (`fold.ts`).
  let change = await repointRefs(database, household, spec, incoming);
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

  // The first tick stands: a tick of an item that is already bought says nothing about who bought it, and when.
  if (spec.table === 'item' && existing) {
    change = {
      ...change,
      fields: withoutSecondTick(
        existing.bought_at === null || existing.bought_at === undefined
          ? null
          : Number(existing.bought_at),
        change.fields,
      ),
    };
  }

  await checkReferences(deps, spec, household, change);
  if (deps.mode === 'encrypted') {
    checkBoundToList(spec, change, existing, household);
    if (spec.table === 'inventory_item') checkNamed(change, existing);
  }

  // An item made for a product that is already open on the list, in the same unit, is folded into it, unless it was made with "add another anyway".
  if (spec.table === 'item' && !existing && !change.separate) {
    const twin = await openTwin(deps, household, change);
    if (twin) return foldItem(deps, spec, household, change, twin, seq, now);
  }

  // A product's name key, made by its device in an encrypted household, goes beside the content and is not one of the row's fields.
  const sentNameKey = typeof change.fields.nameKey === 'string' ? change.fields.nameKey : undefined;
  if (sentNameKey !== undefined) {
    const { nameKey: _nameKey, ...fields } = change.fields;
    change = { ...change, fields };
  }

  // The row as it is: plain columns by field name, and its content: the sealed envelope opened, or the device's ciphertext as it is.
  const values: Record<string, FieldValue> = {};
  const stamps: Record<string, number> = existing ? parseStamps(existing.fseq) : {};
  if (existing) {
    for (const { field, column, kind } of spec.plain)
      values[field] = fieldOf(kind, existing[column]);
    const content = contentOf(deps, spec, change.id, existing);
    for (const field of spec.sealed) values[field] = content[field] ?? null;
  }

  const merged = mergeChange(values, stamps, change.fields, seq);
  if (existing && merged.changed.length === 0) return NOTHING;

  const sealedChanged = spec.sealed.some((field) => merged.changed.includes(field)) || !existing;
  const sealedFields: Record<string, FieldValue> = {};
  for (const field of spec.sealed) {
    const value = (existing ? merged.values[field] : change.fields[field]) ?? null;
    if (value !== null) sealedFields[field] = value;
  }
  const encrypted = deps.mode === 'encrypted';
  const sealedText = !sealedChanged
    ? undefined
    : encrypted
      ? JSON.stringify(sealedFields)
      : sealRow(spec.sql, change.id, sealedFields, ring);
  // Plain: the server makes the name key from the name; encrypted: the device sent it with the name (§13.3).
  const derived = !sealedChanged
    ? {}
    : encrypted
      ? sentNameKey !== undefined
        ? { name_key: sentNameKey }
        : {}
      : spec.derive
        ? spec.derive({
            household,
            ring,
            sealed: sealedFields,
            row: existing ? merged.values : change.fields,
          })
        : {};

  // **One override of a starter entry in a group** (§8.8): two devices that each overrode the same entry offline made two rows for it, and the later folds into the
  // earlier whatever either was renamed to, or the unique key on the entry would refuse it for good.
  if (
    spec.table === 'inventory_item' &&
    !existing &&
    typeof change.fields.starterKey === 'string'
  ) {
    const overridden = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${t} WHERE household_id = ${household} AND starter_key = ${change.fields.starterKey} AND id <> ${change.id}`,
    );
    if (overridden) return foldInto(deps, spec, household, change, overridden.id, seq, now);
  }

  // A name already in the table's scope is another row's: a new one is folded into it, and a rename is refused. The scope is a list's catalog for a product
  // (21.3: another list's never) and the whole group for what is the group's alone (an Inventory item, §8.8).
  if (derived.name_key !== undefined) {
    const list = existing ? existing.list_id : change.fields.listId;
    const scope =
      spec.nameScope === 'group'
        ? sql`1 = 1`
        : typeof list === 'string'
          ? sql`list_id = ${list}`
          : sql`list_id IS NULL`;
    const same = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${t} WHERE household_id = ${household} AND name_key = ${derived.name_key} AND id <> ${change.id}
          AND ${scope}`,
    );
    if (same) {
      // Renaming to a name that is taken is a person's decision, and is refused with the merge offered (task 5.6); making one is folded.
      if (existing) throw duplicate();
      return foldInto(deps, spec, household, change, same.id, seq, now);
    }
  }

  if (spec.table === 'item')
    await checkOpenItemLimit(deps, household, existing, merged.values, change, !existing);

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
    for (const { field, column, kind } of spec.plain)
      // Only the fields the row was made with: the others take the table's defaults (a list's clearing rule), not a null.
      if (field in change.fields)
        columns.push([column, columnOf(database, kind, change.fields[field] ?? null)]);
    if (encrypted) columns.push(['sealed', ''], ['encrypted', sealedText ?? null]);
    else columns.push(['sealed', sealedText ?? null]);
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
    if (spec.table === 'item')
      await afterItemWritten(deps, household, change.id, null, change.fields, seq, now);
    return { written: [change.id] };
  }

  const sets: SQL[] = [];
  for (const { field, column, kind } of spec.plain) {
    if (merged.changed.includes(field))
      sets.push(
        sql`${sql.raw(`"${column}"`)} = ${columnOf(database, kind, merged.values[field] ?? null)}`,
      );
  }
  if (sealedText !== undefined)
    sets.push(encrypted ? sql`"encrypted" = ${sealedText}` : sql`"sealed" = ${sealedText}`);
  for (const [column, value] of Object.entries(derived))
    sets.push(sql`${sql.raw(`"${column}"`)} = ${value}`);
  sets.push(sql`"seq" = ${seq}`, sql`"fseq" = ${JSON.stringify(merged.fseq)}`);
  const done = await dbAll<{ id: string }>(
    database,
    sql`UPDATE ${t} SET ${sql.join(sets, sql`, `)} WHERE id = ${change.id} AND household_id = ${household} RETURNING id`,
  );
  if (done.length === 0) throw notFound();
  if (spec.table === 'item')
    await afterItemWritten(
      deps,
      household,
      change.id,
      existing,
      Object.fromEntries(merged.changed.map((f) => [f, merged.values[f] ?? null])),
      seq,
      now,
    );
  return { written: [change.id] };
}

/**
 * A row the household already has under this name: the new one is not made. It is folded into the existing one, which takes the fields it has nothing in
 * from what was sent, and the fold is recorded with an alias and a tombstone (`fold.ts`).
 */
async function foldInto(
  deps: ApplyDeps,
  spec: TableSpec,
  household: string,
  change: Change,
  into: string,
  seq: number,
  now: number,
): Promise<Outcome> {
  const { database } = deps;
  const row = await dbGet<Row>(
    database,
    sql`SELECT * FROM ${appTable(database, spec.sql)} WHERE id = ${into} AND household_id = ${household}`,
  );
  if (!row) throw notFound();
  const have: Record<string, FieldValue> = {};
  for (const { field, column, kind } of spec.plain) have[field] = fieldOf(kind, row[column]);
  Object.assign(have, contentOf(deps, spec, into, row));
  const additions =
    spec.table === 'inventory_item'
      ? foldInventoryFields(have, change.fields)
      : foldProductFields(have, change.fields);
  const fold: Fold = { table: change.table, from: change.id, to: into };
  await recordFold(database, household, fold, seq, now);
  if (Object.keys(additions).length === 0) return { written: [into], fold };
  const merged = await applyChange(
    deps,
    spec,
    household,
    { table: change.table, id: into, fields: additions },
    seq,
    now,
  );
  return { written: merged.written.length > 0 ? merged.written : [into], fold };
}

/**
 * A row's content as this server holds it (RFC 0001): its sealed envelope opened, in a household that is still sealed; the device's ciphertext, field by
 * field, in one that has moved, which is never opened here.
 */
function contentOf(
  deps: ApplyDeps,
  spec: TableSpec,
  id: string,
  row: Row,
): Record<string, FieldValue> {
  if (deps.mode === 'encrypted') return parseContent(row.encrypted);
  return typeof row.sealed === 'string' && row.sealed !== ''
    ? { ...unsealRow(spec.sql, id, row.sealed, deps.ring) }
    : {};
}

function parseContent(raw: unknown): Record<string, FieldValue> {
  try {
    const parsed: unknown = JSON.parse(typeof raw === 'string' ? raw : '{}');
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
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
            // Someone who has been on one of the group's lists, or its own account (RFC 0004).
            sql`SELECT 1 AS yes FROM ${appTable(database, 'member')} WHERE household_id = ${household} AND person_id = ${String(value)}
                UNION SELECT 1 FROM ${appTable(database, 'list_member')} WHERE household_id = ${household} AND person_id = ${String(value)}`,
          )
        : await dbGet<{ yes: number }>(
            database,
            sql`SELECT 1 AS yes FROM ${appTable(database, target)} WHERE id = ${String(value)} AND household_id = ${household} AND ${target === 'category' || target === 'list' ? sql`deleted_at IS NULL` : sql`1 = 1`}`,
          );
    if (!found) throw notFound();
  }
}

/**
 * **Who added an item and who ticked it is the person who sent the change** (DESIGN.md §5.2, §12.4): a field that names a person (`addedBy`, `boughtBy`) must name
 * the sender's own person in this household, or the change is refused as not found. Everyone in a household may edit everything in it, but not put another's
 * name on it: the screens show these as fact, "added by Ada", "ticked by Grace". The statement carries the account, so it cannot be answered for someone else.
 * `checkReferences` (which runs after) still asks that the person be one of the household's.
 */
async function checkAuthorship(
  deps: ApplyDeps,
  spec: TableSpec,
  household: string,
  accountId: string,
  change: Change,
): Promise<void> {
  const { database } = deps;
  for (const [field, target] of Object.entries(spec.refs)) {
    if (target !== 'person') continue;
    const value = change.fields[field];
    if (value === undefined || value === null) continue;
    const own = await dbGet<{ yes: number }>(
      database,
      sql`SELECT 1 AS yes FROM ${appTable(database, 'person')} p WHERE p.id = ${String(value)} AND p.account_id = ${accountId}`,
    );
    if (!own) throw notFound();
  }
}

/**
 * **A change touches only lists its sender is on** (RFC 0004): a list itself, or an item on it (where it is, and where it is moved to). A new list is made
 * only by the group's own account, in its own group. A product is the group's until 21.3 gives it a list, and anyone on the group may write one. Every
 * refusal reads as not found, as for a row of another group. **A table with no rule here is refused,** not let through: a new synced table says who may write
 * it in this function, or nothing may.
 */
/** Exported for its test, which asks it about a table it has no rule for; nothing else calls it. */
export async function checkListAccess(
  deps: ApplyDeps,
  spec: TableSpec,
  household: string,
  accountId: string,
  change: Change,
): Promise<string | undefined> {
  const { database } = deps;
  const allowed = async (condition: ReturnType<typeof sql>) =>
    (await dbGet<{ yes: number }>(database, sql`SELECT 1 AS yes WHERE ${condition}`)) !== undefined;
  if (spec.table === 'list') {
    const existing = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'list')} WHERE id = ${change.id} AND household_id = ${household}`,
    );
    const ok = existing
      ? await allowed(onList(database, change.id, accountId))
      : await allowed(ownerOf(database, household, accountId));
    if (!ok) throw notFound();
    return;
  }
  if (spec.table === 'item') {
    const existing = await dbGet<{ list_id: string; product_id: string }>(
      database,
      sql`SELECT list_id, product_id FROM ${appTable(database, 'item')} WHERE id = ${change.id} AND household_id = ${household}`,
    );
    const lists = new Set<string>();
    if (existing) lists.add(existing.list_id);
    if (typeof change.fields.listId === 'string') lists.add(change.fields.listId);
    for (const list of lists)
      if (!(await allowed(onList(database, list, accountId)))) throw notFound();
    // **An item's product is on the item's list** (21.3): one that sets either is held to it, so that nobody on a list is handed a product of another,
    // whose keys they would not hold (21.4). A product folded into another is that other.
    if (typeof change.fields.productId === 'string' || typeof change.fields.listId === 'string') {
      const list =
        typeof change.fields.listId === 'string' ? change.fields.listId : existing?.list_id;
      const named =
        typeof change.fields.productId === 'string'
          ? change.fields.productId
          : existing?.product_id;
      const product = named ? await resolveAlias(database, household, 'product', named) : undefined;
      const same =
        await allowed(sql`EXISTS (SELECT 1 FROM ${appTable(database, 'product')} vp WHERE vp.id = ${product ?? ''}
        AND vp.household_id = ${household} AND vp.list_id = ${list ?? ''})`);
      if (!same) throw notFound();
    }
    // The list it was on, for the move's tombstone.
    return existing?.list_id;
  }
  if (spec.table === 'product') {
    // A list's catalog (task 21.3): written by those on the list; one from before lists had catalogs, by the group's own account. Its list is set when it
    // is made and never changed.
    const existing = await dbGet<{ list_id: string | null }>(
      database,
      sql`SELECT list_id FROM ${appTable(database, 'product')} WHERE id = ${change.id} AND household_id = ${household}`,
    );
    const sent = change.fields.listId;
    if (existing) {
      if (sent !== undefined && sent !== existing.list_id) throw notFound();
      const ok = existing.list_id
        ? await allowed(onList(database, existing.list_id, accountId))
        : await allowed(ownerOf(database, household, accountId));
      if (!ok) throw notFound();
    } else if (typeof sent === 'string') {
      if (!(await allowed(onList(database, sent, accountId)))) throw notFound();
    } else if (!(await allowed(ownerOf(database, household, accountId)))) throw notFound();
    return undefined;
  }
  if (spec.table === 'inventory_item') {
    // **A person's Inventory is their own account's alone** (§8.8): the group whose `own_of` is the sender, whoever else is on any of its lists, and for a row that
    // is there and a row that is made alike. Nobody on a list of the group may touch it.
    if (!(await allowed(ownerOf(database, household, accountId)))) throw notFound();
    // The starter entry a row overrides is set when it is made and never changed (as a product's list is): a row cannot be turned into another entry's override.
    if (change.fields.starterKey !== undefined) {
      const existing = await dbGet<{ starter_key: string | null }>(
        database,
        sql`SELECT starter_key FROM ${appTable(database, 'inventory_item')} WHERE id = ${change.id} AND household_id = ${household}`,
      );
      if (existing && (existing.starter_key ?? null) !== change.fields.starterKey) throw notFound();
    }
    return undefined;
  }
  // No rule for this table: nobody may write it (it reads as not found, as every refusal does).
  throw notFound();
}

/**
 * **A new product is its item's list's** (task 21.3): a device that made a product with an item in the same mutation and did not say its list gives it
 * the item's. What the device said is kept.
 */
function withProductList(change: Change, mutation: Mutation): Change {
  if (change.table !== 'product' || !change.create || 'listId' in change.fields) return change;
  const item = mutation.changes.find(
    (other) =>
      other.table === 'item' &&
      other.fields.productId === change.id &&
      typeof other.fields.listId === 'string',
  );
  return item
    ? { ...change, fields: { ...change.fields, listId: item.fields.listId ?? null } }
    : change;
}

/** Replaces, in a change, an id that names a product that was folded into another with the other (`fold.ts`). */
async function repointRefs(
  database: Database,
  household: string,
  spec: TableSpec,
  change: Change,
): Promise<Change> {
  let fields = change.fields;
  for (const [field, target] of Object.entries(spec.refs)) {
    const value = fields[field];
    if (target !== 'product' || typeof value !== 'string') continue;
    const to = await resolveAlias(database, household, 'product', value);
    if (to !== value) fields = { ...fields, [field]: to };
  }
  return fields === change.fields ? change : { ...change, fields };
}

/** The open item for the same product, in the same unit, on the list a new item is being made for, if there is one. */
async function openTwin(
  deps: ApplyDeps,
  household: string,
  change: Change,
): Promise<Row | undefined> {
  const { database } = deps;
  const { listId, productId, unit } = change.fields;
  if (typeof listId !== 'string' || typeof productId !== 'string') return undefined;
  const sameUnit = typeof unit === 'string' ? sql`unit = ${unit}` : sql`unit IS NULL`;
  return dbGet<Row>(
    database,
    sql`SELECT * FROM ${appTable(database, 'item')}
        WHERE household_id = ${household} AND list_id = ${listId} AND product_id = ${productId} AND ${OPEN_ITEM} AND ${sameUnit}
        ORDER BY added_at, id LIMIT 1`,
  );
}

/** A new item folded into the open one: one item, the larger quantity, both notes, the earlier adder; recorded as an alias and a tombstone. */
async function foldItem(
  deps: ApplyDeps,
  spec: TableSpec,
  household: string,
  change: Change,
  twin: Row,
  seq: number,
  now: number,
): Promise<Outcome> {
  const into = String(twin.id);
  const opened = contentOf(deps, spec, into, twin);
  const note = typeof opened.note === 'string' ? opened.note : null;
  const additions = foldItemFields(
    {
      quantity: String(twin.quantity),
      note,
      addedBy: String(twin.added_by),
      addedAt: Number(twin.added_at),
    },
    change.fields,
  );
  // Two notes are joined by whoever can read them (§12.4): encrypted, the server keeps the first, and carries the second on the alias for the first
  // device that pulls it to join and write back.
  let carried: string | undefined;
  if (deps.mode === 'encrypted' && 'note' in additions && note !== null && note !== '') {
    carried = typeof change.fields.note === 'string' ? change.fields.note : undefined;
    delete additions.note;
  }
  const fold: Fold = { table: 'item', from: change.id, to: into };
  await recordFold(deps.database, household, fold, seq, now, carried, String(twin.list_id));
  if (Object.keys(additions).length === 0) return { written: [into], fold };
  const merged = await applyChange(
    deps,
    spec,
    household,
    { table: 'item', id: into, fields: additions },
    seq,
    now,
  );
  return { written: merged.written.length > 0 ? merged.written : [into], fold };
}

/**
 * **A list holds at most so many open items** (`SHOPPER_LIMIT_LIST_OPEN_ITEMS`): checked when an item is made, moved to another list, or restored, against
 * the list it will be on, in this transaction. Bought and cleared items do not count.
 */
async function checkOpenItemLimit(
  deps: ApplyDeps,
  household: string,
  existing: Row | undefined,
  values: Readonly<Record<string, FieldValue>>,
  change: Change,
  creating: boolean,
): Promise<void> {
  const becomesOpen =
    values.boughtAt === undefined || values.boughtAt === null
      ? (values.clearedAt ?? null) === null && (values.deletedAt ?? null) === null
      : false;
  const was = existing
    ? existing.bought_at === null && existing.cleared_at === null && existing.deleted_at === null
    : false;
  const moved = existing && 'listId' in change.fields && change.fields.listId !== existing.list_id;
  const listId = String(
    creating ? change.fields.listId : moved ? change.fields.listId : existing?.list_id,
  );
  if (!(creating ? becomesOpen : becomesOpen && (!was || moved))) return;
  const count = await dbGet<{ n: number | string }>(
    deps.database,
    sql`SELECT COUNT(*) AS n FROM ${appTable(deps.database, 'item')} WHERE household_id = ${household} AND list_id = ${listId} AND ${OPEN_ITEM}`,
  );
  if (Number(count?.n ?? 0) + 1 > deps.limits.listOpenItems)
    throw limited('listOpenItems', deps.limits.listOpenItems);
}

/**
 * What an item's being written does to others, in the same transaction: **a list that was archived is restored** by an item added to it or moved onto it
 * (DESIGN.md §12.4), and a product's **`times_bought` and `last_bought_at`** follow the ticks, which suggestions rank by (§8.5): a tick adds one, an untick
 * takes it back.
 */
async function afterItemWritten(
  deps: ApplyDeps,
  household: string,
  id: string,
  before: Row | null | undefined,
  changed: Readonly<Record<string, FieldValue>>,
  seq: number,
  now: number,
): Promise<void> {
  const { database } = deps;
  const row = await dbGet<Row>(
    database,
    sql`SELECT list_id, product_id, bought_at FROM ${appTable(database, 'item')} WHERE id = ${id} AND household_id = ${household}`,
  );
  if (!row) return;
  if (!before || 'listId' in changed) {
    const list = TABLES.list;
    const archived = await dbGet<{ yes: number }>(
      database,
      sql`SELECT 1 AS yes FROM ${appTable(database, 'list')} WHERE id = ${String(row.list_id)} AND household_id = ${household} AND archived_at IS NOT NULL`,
    );
    if (archived && list)
      await applyChange(
        deps,
        list,
        household,
        { table: 'list', id: String(row.list_id), fields: { archivedAt: null } },
        seq,
        now,
      );
  }
  const was = before ? before.bought_at : null;
  const is = row.bought_at;
  if ((was === null || was === undefined) !== (is === null || is === undefined)) {
    const bought = is !== null && is !== undefined;
    await dbAll(
      database,
      bought
        ? sql`UPDATE ${appTable(database, 'product')} SET times_bought = times_bought + 1, last_bought_at = ${Number(is)}, seq = ${seq}
              WHERE id = ${String(row.product_id)} AND household_id = ${household} RETURNING id`
        : sql`UPDATE ${appTable(database, 'product')} SET times_bought = CASE WHEN times_bought > 0 THEN times_bought - 1 ELSE 0 END, seq = ${seq}
              WHERE id = ${String(row.product_id)} AND household_id = ${household} RETURNING id`,
    );
  }
}

/**
 * **An Inventory item has a name, or the starter entry that has one** (§8.8), in a group that has moved too, where the server cannot read the name and `derive`
 * does not run: a change that says `name: null` on a row with no starter entry would leave a row nothing can show, and it is refused. A make is held to the same
 * by the validator (a name or a starter entry), and a name always comes with the name key its device made (`validate.ts`).
 */
function checkNamed(change: Change, existing: Row | undefined): void {
  if (change.fields.name !== null) return;
  const starter = existing ? existing.starter_key : change.fields.starterKey;
  if (typeof starter !== 'string' || starter === '')
    throw invalid('an Inventory item of the person’s own has a name');
}

/**
 * **In a group that has moved, a value is for its row's list** (RFC 0004, task 21.4): each list has its own keys, so a value encrypted for another list
 * could be opened by nobody on the row's. The row's list is a list's own id, else the list it is on after this change. An item that changes list comes
 * with its name and note encrypted again for the new one, or the old list's values would stay on it.
 */
function checkBoundToList(
  spec: TableSpec,
  change: Change,
  existing: Row | undefined,
  household: string,
): void {
  // **An Inventory item's values are for its group** (§13.1, §13.2): bound to the group in the place of a list, since the keys are the group's Inventory keys and
  // nobody else's. An explicit rule, not a case of the one below, which would find no list and refuse every value; and a value bound to a list is refused, so
  // that a list's ciphertext cannot be put into a person's Inventory, nor an Inventory's into a list. The row is not checked here (the server cannot open the
  // value, and a fold moves a row's later values to the row that stands, §12.4): the device opens a value for its row or one folded into it.
  if (spec.table === 'inventory_item') {
    for (const field of spec.sealed) {
      const value = change.fields[field];
      if (typeof value === 'string' && boundTo(value)?.list !== household) throw otherList();
    }
    return;
  }
  const was = existing ? (existing.list_id as string | null | undefined) : undefined;
  const sent = change.fields.listId;
  const list =
    spec.table === 'list'
      ? change.id
      : typeof sent === 'string' && spec.table === 'item'
        ? sent
        : (was ?? (typeof sent === 'string' ? sent : undefined));
  if (spec.table === 'item' && existing && typeof sent === 'string' && sent !== was)
    for (const field of spec.sealed) if (!(field in change.fields)) throw otherList();
  for (const field of spec.sealed) {
    const value = change.fields[field];
    if (typeof value !== 'string') continue;
    if (boundTo(value)?.list !== list) throw otherList();
  }
}
