import { sql } from 'drizzle-orm';
import type { KeyRing } from '../crypto/keys';
import { unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import { appTable } from '../db/tables';
import { adminOf, memberOf } from '../access/membership';
import { STARTER_CATEGORIES } from '../catalog/categories';
import { readHousehold } from '../households/households';
import { canSeeEmail } from '../people/visibility';
import type { HouseholdPull } from './protocol';

/**
 * **Pull** (DESIGN.md §12.3): what changed in a household since a device's cursor, **for a reader who is an active member of it, in the statement** (an
 * outsider gets nothing, and a household they left is named as gone by the caller). Rows come back unsealed for the reader, in their camelCase shape;
 * tombstones and aliases come with them so that the device deletes and re-points. A page is cut **at a `seq` boundary**, so that every row of a change
 * arrives together or not at all: a device is never shown half a tick. A household new to the device starts at 0, which is its snapshot.
 */
export const PAGE_ROWS = 500;

type Raw = Record<string, unknown> & { seq: number | string };

const seqOf = (row: Raw) => Number(row.seq);

export async function pullHousehold(
  database: Database,
  ring: KeyRing,
  accountId: string,
  household: string,
  cursor: number,
  pageRows: number = PAGE_ROWS,
): Promise<HouseholdPull | undefined> {
  const view = await readHousehold(database, ring, household, accountId);
  if (!view) return undefined;

  const take = (name: string, extra: ReturnType<typeof sql> = sql``) =>
    dbAll<Raw>(
      database,
      sql`SELECT * FROM ${appTable(database, name)}
          WHERE household_id = ${household} AND seq > ${cursor} AND ${memberOf(database, household, accountId)} ${extra}
          ORDER BY seq, id LIMIT ${pageRows + 1}`,
    );
  const [lists, items, products, categories, members, tombstones, aliases] = await Promise.all([
    take('list'),
    take('item'),
    take('product'),
    take('category'),
    dbAll<Raw>(
      database,
      sql`SELECT m.*, p.account_id, p.sealed AS person_sealed, ${adminOf(database, household, accountId)} AS viewer_is_admin
          FROM ${appTable(database, 'member')} m JOIN ${appTable(database, 'person')} p ON p.id = m.person_id
          WHERE m.household_id = ${household} AND m.seq > ${cursor} AND ${memberOf(database, household, accountId)}
          ORDER BY m.seq, m.id LIMIT ${pageRows + 1}`,
    ),
    dbAll<Raw>(
      database,
      sql`SELECT * FROM ${appTable(database, 'tombstone')} WHERE household_id = ${household} AND seq > ${cursor} AND ${memberOf(database, household, accountId)} ORDER BY seq LIMIT ${pageRows + 1}`,
    ),
    dbAll<Raw>(
      database,
      sql`SELECT * FROM ${appTable(database, 'alias')} WHERE household_id = ${household} AND seq > ${cursor} AND ${memberOf(database, household, accountId)} ORDER BY seq LIMIT ${pageRows + 1}`,
    ),
  ]);

  // The page ends at a seq that is whole: where a table overflowed, just before the seq of its first row past the page, and never before the cursor.
  let upTo = Number(view.seq);
  let more = false;
  for (const rows of [lists, items, products, categories, members, tombstones, aliases]) {
    if (rows.length > pageRows) {
      more = true;
      const first = seqOf(rows[pageRows] as Raw);
      const before = first - 1;
      upTo = Math.min(upTo, before > cursor ? before : seqOf(rows[pageRows - 1] as Raw));
    }
  }
  const within = (rows: Raw[]) => rows.filter((row) => seqOf(row) <= upTo);

  return {
    household,
    cursor: upTo,
    more: more && upTo < Number(view.seq),
    view: { label: view.label, own: view.own, role: view.role, seq: Number(view.seq) },
    lists: within(lists).map((row) => listOf(row, ring)),
    items: within(items).map((row) => itemOf(row, ring)),
    products: within(products).map((row) => productOf(row, ring)),
    categories: within(categories).map((row) => categoryOf(row, ring)),
    members: within(members).map((row) => memberRow(row, ring, accountId)),
    tombstones: within(tombstones).map((row) => ({
      table: String(row.table_name),
      id: String(row.id),
      seq: seqOf(row),
    })),
    aliases: within(aliases).map((row) => ({
      table: String(row.table_name),
      from: String(row.from_id),
      to: String(row.to_id),
      seq: seqOf(row),
    })),
  };
}

const nullable = <T>(value: T | null | undefined): T | null => value ?? null;
const opened = (table: string, row: Raw, ring: KeyRing) =>
  typeof row.sealed === 'string' ? unsealRow(table, String(row.id), row.sealed, ring) : {};
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function listOf(row: Raw, ring: KeyRing) {
  return {
    id: row.id,
    householdId: row.household_id,
    name: text(opened('list', row, ring).name) ?? '',
    position: row.position,
    clearing: row.clearing,
    archivedAt: num(row.archived_at),
    deletedAt: num(row.deleted_at),
    createdAt: Number(row.created_at),
    seq: seqOf(row),
  };
}

function itemOf(row: Raw, ring: KeyRing) {
  const sealed = opened('item', row, ring);
  return {
    id: row.id,
    householdId: row.household_id,
    listId: row.list_id,
    productId: row.product_id,
    name: text(sealed.name) ?? '',
    note: text(sealed.note),
    quantity: row.quantity,
    unit: nullable(row.unit),
    categoryId: nullable(row.category_id),
    icon: nullable(row.icon),
    position: row.position,
    addedBy: row.added_by,
    addedAt: Number(row.added_at),
    boughtAt: num(row.bought_at),
    boughtBy: nullable(row.bought_by),
    clearedAt: num(row.cleared_at),
    deletedAt: num(row.deleted_at),
    seq: seqOf(row),
  };
}

function productOf(row: Raw, ring: KeyRing) {
  const sealed = opened('product', row, ring);
  return {
    id: row.id,
    householdId: row.household_id,
    name: text(sealed.name) ?? '',
    note: text(sealed.note),
    categoryId: nullable(row.category_id),
    icon: nullable(row.icon),
    defaultQuantity: nullable(row.default_quantity),
    defaultUnit: nullable(row.default_unit),
    timesBought: Number(row.times_bought),
    lastBoughtAt: num(row.last_bought_at),
    lastAddedAt: num(row.last_added_at),
    deletedAt: num(row.deleted_at),
    createdAt: Number(row.created_at),
    seq: seqOf(row),
  };
}

function categoryOf(row: Raw, ring: KeyRing) {
  // A starter category's name is the code's, until a person names it (task 4.7); then it is sealed.
  const named =
    typeof row.sealed === 'string'
      ? text(unsealRow('category', String(row.id), row.sealed, ring).name)
      : null;
  const starter = STARTER_CATEGORIES.find((each) => each.key === row.starter_key);
  return {
    id: row.id,
    householdId: row.household_id,
    starterKey: nullable(row.starter_key),
    name: named ?? starter?.name ?? '',
    icon: nullable(row.icon),
    position: row.position,
    hidden: Boolean(row.hidden),
    deletedAt: num(row.deleted_at),
    seq: seqOf(row),
  };
}

function memberRow(row: Raw, ring: KeyRing, accountId: string) {
  const person = unsealRow('person', String(row.person_id), String(row.person_sealed), ring);
  const visible = canSeeEmail({
    viewerAccountId: accountId,
    targetAccountId: text(row.account_id),
    adminOfSharedHousehold: Boolean(row.viewer_is_admin),
  });
  return {
    personId: row.person_id,
    name: text(person.name) ?? '',
    email: visible ? text(person.email) : null,
    role: row.role === 'admin' ? 'admin' : 'member',
    joinedAt: Number(row.joined_at),
    leftAt: num(row.left_at),
    self: row.account_id === accountId,
    seq: seqOf(row),
  };
}
