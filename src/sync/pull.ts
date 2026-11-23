import { sql } from 'drizzle-orm';
import type { KeyRing } from '../crypto/keys';
import { unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { appTable } from '../db/tables';
import { listAdminOf, memberOf, onList, ownerOf } from '../access/membership';
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
  // How its content travels, and the reader's own copy of the group's keys (RFC 0001), which only the group's own account has (RFC 0004): only theirs,
  // found by their person in the same statement.
  const state = await dbGet<{
    encryption: string;
    epoch: number | string;
    record: string | null;
    person: string | null;
  }>(
    database,
    sql`SELECT h.encryption, h.epoch, k.record, me.id AS person FROM ${appTable(database, 'household')} h
        LEFT JOIN ${appTable(database, 'person')} me ON me.account_id = ${accountId}
        LEFT JOIN ${appTable(database, 'household_key')} k ON k.household_id = h.id AND k.person_id = me.id AND h.own_of = ${accountId}
        WHERE h.id = ${household} AND ${memberOf(database, household, accountId)}`,
  );
  // The reader's own copies of the keys of lists they are on and did not make (RFC 0004): only theirs, only of lists they are on now.
  const listKeys = await dbAll<{ list_id: string; record: string }>(
    database,
    sql`SELECT k.list_id, k.record FROM ${appTable(database, 'list_key')} k
        JOIN ${appTable(database, 'person')} me ON me.id = k.person_id AND me.account_id = ${accountId}
        WHERE k.household_id = ${household} AND ${onList(database, sql`k.list_id`, accountId)}
        ORDER BY k.list_id`,
  );

  // **Only the reader's lists** (RFC 0004): a list, its items and their tombstones and aliases only if the reader is on that list; a product only if an
  // item on such a list uses it (21.3 gives products a list of their own), or the reader is the group's own account; a category is the group's.
  const t = (name: string) => appTable(database, name);
  const own = ownerOf(database, household, accountId);
  const take = (name: string, visible: ReturnType<typeof sql>) =>
    dbAll<Raw>(
      database,
      sql`SELECT * FROM ${t(name)} r
          WHERE r.household_id = ${household} AND r.seq > ${cursor} AND ${memberOf(database, household, accountId)} AND ${visible}
          ORDER BY r.seq, r.id LIMIT ${pageRows + 1}`,
    );
  const [lists, items, products, categories, members, tombstones, aliases, visibleLists] =
    await Promise.all([
      take('list', onList(database, sql`r.id`, accountId)),
      take('item', onList(database, sql`r.list_id`, accountId)),
      take(
        'product',
        // A list's catalog (21.3): an item's product is always on the item's list, so this is every product the reader's items use.
        sql`(${onList(database, sql`r.list_id`, accountId)} OR (r.list_id IS NULL AND ${own}))`,
      ),
      take('category', sql`1 = 1`),
      dbAll<Raw>(
        database,
        sql`SELECT m.*, p.account_id, p.sealed AS person_sealed, ${listAdminOf(database, sql`m.list_id`, accountId)} AS viewer_is_admin
          FROM ${t('list_member')} m JOIN ${t('person')} p ON p.id = m.person_id
          WHERE m.household_id = ${household} AND m.seq > ${cursor} AND ${onList(database, sql`m.list_id`, accountId)}
          ORDER BY m.seq, m.id LIMIT ${pageRows + 1}`,
      ),
      dbAll<Raw>(
        database,
        sql`SELECT * FROM ${t('tombstone')} r WHERE r.household_id = ${household} AND r.seq > ${cursor} AND ${memberOf(database, household, accountId)}
          AND (r.list_id IS NULL OR ${onList(database, sql`r.list_id`, accountId)})
          -- An item moved away from a list (RFC 0004) is gone only for a reader who cannot see it where it is now.
          AND NOT (r.table_name = 'item' AND EXISTS (SELECT 1 FROM ${t('item')} ti WHERE ti.id = r.id AND ti.household_id = r.household_id
                   AND ${onList(database, sql`ti.list_id`, accountId)}))
          ORDER BY r.seq LIMIT ${pageRows + 1}`,
      ),
      dbAll<Raw>(
        database,
        sql`SELECT * FROM ${t('alias')} r WHERE r.household_id = ${household} AND r.seq > ${cursor} AND ${memberOf(database, household, accountId)}
          AND (r.list_id IS NULL OR ${onList(database, sql`r.list_id`, accountId)}) ORDER BY r.seq LIMIT ${pageRows + 1}`,
      ),
      // Every list the reader may see in this group, whatever its seq: the device forgets any other it holds.
      dbAll<{ id: string }>(
        database,
        sql`SELECT l.id FROM ${t('list')} l WHERE l.household_id = ${household} AND ${onList(database, sql`l.id`, accountId)} ORDER BY l.id`,
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
    encryption: {
      state: state?.encryption === 'encrypted' ? 'encrypted' : 'plain',
      epoch: Number(state?.epoch ?? 0),
      keyring: state?.record ?? null,
      lists: Object.fromEntries(listKeys.map((row) => [row.list_id, row.record])),
      person: state?.person ?? null,
    },
    lists: within(lists).map((row) => listOf(row, ring)),
    items: within(items).map((row) => itemOf(row, ring)),
    products: within(products).map((row) => productOf(row, ring)),
    categories: within(categories).map((row) => categoryOf(row, ring)),
    members: within(members).map((row) => memberRow(row, ring, accountId)),
    visibleLists: visibleLists.map((row) => row.id),
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
      ...(typeof row.carried === 'string' ? { carried: row.carried } : {}),
    })),
  };
}

const nullable = <T>(value: T | null | undefined): T | null => value ?? null;
const opened = (table: string, row: Raw, ring: KeyRing) =>
  typeof row.sealed === 'string' && row.sealed !== ''
    ? unsealRow(table, String(row.id), row.sealed, ring)
    : {};

/** A moved household's row (RFC 0001): its content as the device sent it, field by field, which the device opens; the server cannot. */
function encryptedOf(row: Raw): { encrypted?: Record<string, string> } {
  if (typeof row.encrypted !== 'string') return {};
  try {
    const parsed = JSON.parse(row.encrypted) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [field, value] of Object.entries(parsed))
      if (typeof value === 'string') out[field] = value;
    return { encrypted: out };
  } catch {
    return {};
  }
}
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function listOf(row: Raw, ring: KeyRing) {
  const sealed = opened('list', row, ring);
  return {
    id: row.id,
    householdId: row.household_id,
    name: text(sealed.name) ?? '',
    icon: text(sealed.icon),
    color: text(sealed.color),
    position: row.position,
    clearing: row.clearing,
    archivedAt: num(row.archived_at),
    deletedAt: num(row.deleted_at),
    createdAt: Number(row.created_at),
    seq: seqOf(row),
    ...encryptedOf(row),
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
    ...encryptedOf(row),
  };
}

function productOf(row: Raw, ring: KeyRing) {
  const sealed = opened('product', row, ring);
  return {
    id: row.id,
    householdId: row.household_id,
    listId: nullable(row.list_id),
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
    ...encryptedOf(row),
  };
}

function categoryOf(row: Raw, ring: KeyRing) {
  // A starter category's name is the code's, until a person names it (task 4.7); then it is sealed.
  const named =
    typeof row.sealed === 'string' && row.sealed !== ''
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
    listId: row.list_id,
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
