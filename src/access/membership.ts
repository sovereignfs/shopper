import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client';
import { appTable } from '../db/tables';

/**
 * **The permission is in the statement** (DESIGN.md §5.2). Every read and write of a household's rows names the household together with membership, as
 * one condition of the same query: never checked first and then touched, so that a membership that ends between the two cannot be used, and a refusal
 * reads as not found because the statement found nothing. These are the two conditions, as SQL to put in a `WHERE`:
 *
 * - `memberOf`: the account is an **active** member (`left_at` is null) of the household.
 * - `adminOf`: the same, and an Admin. An Admin's operation adds this to its statement.
 *
 * `household` is a column of the statement's own table (`h.id`, `i.household_id`), or a bound value: either is an SQL fragment.
 */
export function memberOf(database: Database, household: SQL | string, accountId: string): SQL {
  return exists(database, household, accountId, sql``);
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
