import { sql } from 'drizzle-orm';
import type { KeyRing } from '../crypto/keys';
import { sealRow, unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet, transaction } from '../db/exec';
import { appTable } from '../db/tables';

/**
 * **A list's people** (RFC 0004): who may see and change a list, its items and its products. The one who makes a list is its Admin; others join by
 * accepting an invitation to it, and leave or are removed list by list. Every statement that reads or changes a list names one of these.
 */
export async function addListMember(
  database: Database,
  input: {
    household: string;
    list: string;
    person: string;
    role: 'admin' | 'member';
    seq: number;
    now: number;
  },
): Promise<boolean> {
  const added = await dbAll<{ id: string }>(
    database,
    sql`INSERT INTO ${appTable(database, 'list_member')} (id, household_id, list_id, person_id, role, joined_at, left_at, seq)
        VALUES (${crypto.randomUUID()}, ${input.household}, ${input.list}, ${input.person}, ${input.role}, ${input.now}, NULL, ${input.seq})
        ON CONFLICT (list_id, person_id) DO UPDATE SET left_at = NULL, role = excluded.role, joined_at = excluded.joined_at, seq = excluded.seq
        RETURNING id`,
  );
  return added.length > 0;
}

/**
 * **A list's rows stamped at a join** (RFC 0004, "Sync"): the list, its items, the products they use, its people, and its tombstones and aliases take the
 * join's `seq`, so that a device whose cursor for the group is already past them pulls them.
 */
export async function stampList(
  database: Database,
  household: string,
  list: string,
  seq: number,
): Promise<void> {
  // The list, its items and **its copies of people's categories** (§8.3): someone who joins a list from a group they are already on has pulled past all of them.
  for (const table of ['list', 'item', 'list_category', 'list_card'] as const)
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, table)} SET seq = ${seq} WHERE household_id = ${household} AND ${table === 'list' ? sql`id` : sql`list_id`} = ${list} RETURNING id`,
    );
  await dbAll(
    database,
    sql`UPDATE ${appTable(database, 'product')} SET seq = ${seq} WHERE household_id = ${household}
        AND (list_id = ${list} OR id IN (SELECT product_id FROM ${appTable(database, 'item')} WHERE list_id = ${list})) RETURNING id`,
  );
  for (const table of ['list_member', 'tombstone', 'alias'] as const)
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, table)} SET seq = ${seq} WHERE household_id = ${household} AND list_id = ${list} RETURNING household_id`,
    );
}

/** The person of a group's own account: who makes its lists, and is their Admin. */
export async function ownerPerson(
  database: Database,
  household: string,
): Promise<string | undefined> {
  const row = await dbGet<{ id: string }>(
    database,
    sql`SELECT p.id FROM ${appTable(database, 'household')} h JOIN ${appTable(database, 'person')} p ON p.account_id = h.own_of
        WHERE h.id = ${household}`,
  );
  return row?.id;
}

/**
 * **From households to lists** (RFC 0004, "Existing data"), at every start, safe to run again: each list with nobody on it gets every active member of
 * its household, the household's Admins as its Admins, so that nobody loses a list they had; then every household member but the group's own account is
 * ended, so that nobody sees a list made after; and waiting invitations to a household as a whole are revoked, since a link cannot say which list it
 * meant. One transaction a group.
 */
export async function adoptListMembers(
  database: Database,
  now: number = Date.now(),
): Promise<number> {
  const groups = await dbAll<{ household_id: string }>(
    database,
    sql`SELECT DISTINCT l.household_id FROM ${appTable(database, 'list')} l
        WHERE NOT EXISTS (SELECT 1 FROM ${appTable(database, 'list_member')} lm WHERE lm.list_id = l.id)
        UNION
        SELECT DISTINCT m.household_id FROM ${appTable(database, 'member')} m JOIN ${appTable(database, 'household')} h ON h.id = m.household_id
        JOIN ${appTable(database, 'person')} p ON p.id = m.person_id
        WHERE m.left_at IS NULL AND (h.own_of IS NULL OR p.account_id IS NULL OR p.account_id <> h.own_of)`,
  );
  for (const { household_id: household } of groups) {
    await transaction(database, async (tx) => {
      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1 WHERE id = ${household} RETURNING seq`,
      );
      if (!stepped) return;
      const seq = Number(stepped.seq);
      const lists = await dbAll<{ id: string }>(
        tx,
        sql`SELECT l.id FROM ${appTable(tx, 'list')} l WHERE l.household_id = ${household}
            AND NOT EXISTS (SELECT 1 FROM ${appTable(tx, 'list_member')} lm WHERE lm.list_id = l.id)`,
      );
      const members = await dbAll<{ person_id: string; role: string }>(
        tx,
        sql`SELECT person_id, role FROM ${appTable(tx, 'member')} WHERE household_id = ${household} AND left_at IS NULL`,
      );
      for (const list of lists)
        for (const member of members)
          await addListMember(tx, {
            household,
            list: list.id,
            person: member.person_id,
            role: member.role === 'admin' ? 'admin' : 'member',
            seq,
            now,
          });
      const owner = await ownerPerson(tx, household);
      await dbAll(
        tx,
        sql`UPDATE ${appTable(tx, 'member')} SET left_at = ${now}, seq = ${seq}
            WHERE household_id = ${household} AND left_at IS NULL AND person_id <> ${owner ?? ''} RETURNING id`,
      );
      await dbAll(
        tx,
        sql`UPDATE ${appTable(tx, 'invitation')} SET revoked_at = ${now}, wrapped_key = NULL
            WHERE household_id = ${household} AND list_id IS NULL AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
      );
    });
  }
  return groups.length;
}

/**
 * **Products from before lists had catalogs** (RFC 0004, task 21.3), at every start, safe to run again: each product with no list is given the list of
 * the first item that used it, else the group's first list, at a new `seq` of its group so that devices learn it. A product items of several lists use
 * stays one, on the first of them; it was already seen by everyone on those lists, who were one household. One transaction a group.
 */
export async function adoptProductLists(database: Database): Promise<number> {
  const groups = await dbAll<{ household_id: string }>(
    database,
    sql`SELECT DISTINCT household_id FROM ${appTable(database, 'product')} WHERE list_id IS NULL`,
  );
  for (const { household_id: household } of groups) {
    await transaction(database, async (tx) => {
      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1 WHERE id = ${household} RETURNING seq`,
      );
      if (!stepped) return;
      const products = await dbAll<{ id: string; used: string | null }>(
        tx,
        sql`SELECT p.id, (SELECT i.list_id FROM ${appTable(tx, 'item')} i WHERE i.product_id = p.id ORDER BY i.added_at, i.id LIMIT 1) AS used
            FROM ${appTable(tx, 'product')} p WHERE p.household_id = ${household} AND p.list_id IS NULL`,
      );
      const first = await dbGet<{ id: string }>(
        tx,
        sql`SELECT id FROM ${appTable(tx, 'list')} WHERE household_id = ${household} ORDER BY created_at, id LIMIT 1`,
      );
      for (const product of products) {
        const list = product.used ?? first?.id;
        if (!list) continue;
        await dbAll(
          tx,
          sql`UPDATE ${appTable(tx, 'product')} SET list_id = ${list}, seq = ${Number(stepped.seq)}
              WHERE id = ${product.id} AND list_id IS NULL RETURNING id`,
        );
      }
    });
  }
  return groups.length;
}

/**
 * **A list's catalog goes with it** (RFC 0004, 21.3), in the transaction that deletes the list, after its items: each of its products goes, except one
 * an item of another list still uses (one from before lists had catalogs), which passes to that list at `seq` so that the devices on it learn so.
 */
export async function deleteListProducts(
  database: Database,
  household: string,
  list: string,
  seq: number,
): Promise<void> {
  const kept = await dbAll<{ id: string; other: string }>(
    database,
    sql`SELECT p.id, (SELECT i.list_id FROM ${appTable(database, 'item')} i WHERE i.product_id = p.id AND i.household_id = ${household}
                       AND i.list_id <> ${list} ORDER BY i.added_at, i.id LIMIT 1) AS other
        FROM ${appTable(database, 'product')} p
        WHERE p.household_id = ${household} AND p.list_id = ${list}
          AND EXISTS (SELECT 1 FROM ${appTable(database, 'item')} i WHERE i.product_id = p.id AND i.household_id = ${household} AND i.list_id <> ${list})`,
  );
  for (const product of kept)
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, 'product')} SET list_id = ${product.other}, seq = ${seq}
          WHERE id = ${product.id} AND household_id = ${household} RETURNING id`,
    );
  await dbAll(
    database,
    sql`DELETE FROM ${appTable(database, 'product')} WHERE household_id = ${household} AND list_id = ${list} RETURNING id`,
  );
}

/**
 * **An item's product is on the item's list** (RFC 0004, tasks 21.3 and 21.4), at every start, safe to run again: a product from before lists had
 * catalogs that items of another list use is copied to that list (a new id, sealed again for it, the same name key), and those items point at the
 * copy, or at the product of that name the list has already, at a new `seq` of the group so that devices learn it. A group whose devices encrypt its content cannot be copied by the server: it is left as it
 * is (no released version encrypted anything; a development database is made again).
 */
export async function splitSharedProducts(database: Database, ring: KeyRing): Promise<number> {
  const pairs = await dbAll<{ household_id: string; product_id: string; list_id: string }>(
    database,
    sql`SELECT DISTINCT i.household_id, i.product_id, i.list_id FROM ${appTable(database, 'item')} i
        JOIN ${appTable(database, 'product')} p ON p.id = i.product_id AND p.household_id = i.household_id
        JOIN ${appTable(database, 'household')} h ON h.id = i.household_id AND h.encryption = 'sealed'
        WHERE p.list_id IS NOT NULL AND p.list_id <> i.list_id
        ORDER BY i.household_id, i.product_id, i.list_id`,
  );
  const groups = new Map<string, { product: string; list: string }[]>();
  for (const pair of pairs)
    groups.set(pair.household_id, [
      ...(groups.get(pair.household_id) ?? []),
      { product: pair.product_id, list: pair.list_id },
    ]);
  for (const [household, split] of groups)
    await transaction(database, async (tx) => {
      const stepped = await dbGet<{ seq: number | string }>(
        tx,
        sql`UPDATE ${appTable(tx, 'household')} SET seq = seq + 1 WHERE id = ${household} AND encryption = 'sealed' RETURNING seq`,
      );
      if (!stepped) return;
      const seq = Number(stepped.seq);
      for (const { product, list } of split) {
        const row = await dbGet<Record<string, unknown>>(
          tx,
          sql`SELECT * FROM ${appTable(tx, 'product')} WHERE id = ${product} AND household_id = ${household}`,
        );
        if (!row) continue;
        // The list has a product of that name already: its items take that one.
        const same = await dbGet<{ id: string }>(
          tx,
          sql`SELECT id FROM ${appTable(tx, 'product')} WHERE household_id = ${household} AND list_id = ${list} AND name_key = ${String(row.name_key)}`,
        );
        if (same) {
          await dbAll(
            tx,
            sql`UPDATE ${appTable(tx, 'item')} SET product_id = ${same.id}, seq = ${seq}
                WHERE household_id = ${household} AND product_id = ${product} AND list_id = ${list} RETURNING id`,
          );
          continue;
        }
        const id = crypto.randomUUID();
        const opened =
          typeof row.sealed === 'string' && row.sealed !== ''
            ? unsealRow('product', product, row.sealed, ring)
            : {};
        const copy: Record<string, unknown> = {
          ...row,
          id,
          list_id: list,
          sealed: sealRow('product', id, opened, ring),
          seq,
        };
        const columns = Object.keys(copy);
        await dbAll(
          tx,
          sql`INSERT INTO ${appTable(tx, 'product')} (${sql.join(
            columns.map((column) => sql.raw(`"${column.replace(/[^a-z_]/g, '')}"`)),
            sql`, `,
          )}) VALUES (${sql.join(
            columns.map((column) => sql`${copy[column] ?? null}`),
            sql`, `,
          )}) RETURNING id`,
        );
        await dbAll(
          tx,
          sql`UPDATE ${appTable(tx, 'item')} SET product_id = ${id}, seq = ${seq}
              WHERE household_id = ${household} AND product_id = ${product} AND list_id = ${list} RETURNING id`,
        );
      }
    });
  return groups.size;
}
