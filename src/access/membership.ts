import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client';
import { appTable } from '../db/tables';

/**
 * **The permission is in the statement** (DESIGN.md §5.2), at the list (RFC 0004). Every read and write names its group or its list together with the
 * account, as one condition of the same query: never checked first and then touched, and a refusal reads as not found. As SQL to put in a `WHERE`:
 *
 * - `memberOf`: the account is **on the group**: its own account (an active `member`), or an active person of any of its lists. What a device syncs, and
 *   whose order a change takes; it reads nothing of a list by itself.
 * - `ownerOf`: the group's own account (an active `member`): it alone makes lists in it.
 * - `adminOf`: the same, as an Admin: the group's own account.
 * - `onList`: the account is an active person of the list (`list_member`): what lets it see and change the list, its items and its products.
 * - `listAdminOf`: the same, as the list's Admin.
 *
 * `household` and `list` are a column of the statement's own table (`h.id`, `i.list_id`), or a bound value: either is an SQL fragment.
 */
export function memberOf(database: Database, household: SQL | string, accountId: string): SQL {
  const target = typeof household === 'string' ? sql`${household}` : household;
  return sql`(${exists(database, household, accountId, sql``)} OR EXISTS (SELECT 1 FROM ${appTable(database, 'list_member')} gm
    JOIN ${appTable(database, 'person')} gp ON gp.id = gm.person_id
    WHERE gm.household_id = ${target} AND gp.account_id = ${accountId} AND gm.left_at IS NULL))`;
}

export function ownerOf(database: Database, household: SQL | string, accountId: string): SQL {
  return exists(database, household, accountId, sql``);
}

export function onList(database: Database, list: SQL | string, accountId: string): SQL {
  return onListWhere(database, list, accountId, sql``);
}

export function listAdminOf(database: Database, list: SQL | string, accountId: string): SQL {
  return onListWhere(database, list, accountId, sql` AND lm.role = 'admin'`);
}

function onListWhere(database: Database, list: SQL | string, accountId: string, extra: SQL): SQL {
  const target = typeof list === 'string' ? sql`${list}` : list;
  // Aliases of its own (`lm`, `lp`), as `exists` has, so that an outer column passed in is never read as the subquery's.
  return sql`EXISTS (SELECT 1 FROM ${appTable(database, 'list_member')} lm JOIN ${appTable(database, 'person')} lp ON lp.id = lm.person_id
    WHERE lm.list_id = ${target} AND lp.account_id = ${accountId} AND lm.left_at IS NULL${extra})`;
}

export function adminOf(database: Database, household: SQL | string, accountId: string): SQL {
  return exists(database, household, accountId, sql` AND pm.role = 'admin'`);
}

function exists(database: Database, household: SQL | string, accountId: string, extra: SQL): SQL {
  const target = typeof household === 'string' ? sql`${household}` : household;
  // The subquery's own aliases are `pm` and `pp`, which no statement that uses this names: an outer `m.household_id` passed in as `household` must not
  // be read as the subquery's, which would make the condition true for anyone who is a member of anything.
  return sql`EXISTS (SELECT 1 FROM ${appTable(database, 'member')} pm JOIN ${appTable(database, 'person')} pp ON pp.id = pm.person_id
    WHERE pm.household_id = ${target} AND pp.account_id = ${accountId} AND pm.left_at IS NULL${extra})`;
}

/** A column of a table named in the statement, as a fragment: `column('h', 'id')` is `h.id`. Only identifiers of our own are passed. */
export function column(alias: string, name: string): SQL {
  if (!/^[a-z][a-z0-9_]*$/.test(alias) || !/^[a-z][a-z0-9_]*$/.test(name))
    throw new Error('not a column');
  return sql.raw(`${alias}.${name}`);
}
