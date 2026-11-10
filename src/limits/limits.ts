import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { dbGet } from '../db/exec';
import { appTable } from '../db/tables';
import type { Limits } from './config';

/**
 * **The operator's limits, checked where a change would pass one** (DESIGN.md §7.6). The numbers are `Config.limits` (`./config.ts`); this says whether a
 * change would pass one, in what words a refusal is said, and counts what the first two limits count. **The check is made by the task that makes the
 * thing**, in the statement or the transaction that makes it, and not first and then made: members and households at acceptance (task 3.4), lists, open
 * items and products when a mutation is applied (5.2, 5.3, 5.4, 5.5). A refusal from apply goes to Couldn't sync with this sentence (6.3).
 */
export type LimitKind = keyof Limits;

/** Whether adding `adding` to `current` would pass `limit`. */
export function exceeds(limit: number, current: number, adding: number = 1): boolean {
  return current + adding > limit;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What a refusal says, naming the limit and never anything else: "Groceries has 500 items, the most it can hold" when the list is named (a name is
 * sealed, so only the one who has unsealed it can say it), and in general words when it is not. The sentence is the person's to read, so it is plain.
 */
export function limitSentence(kind: LimitKind, limit: number, name?: string): string {
  switch (kind) {
    case 'householdMembers':
      return `A household can have at most ${plural(limit, 'person', 'people')}, and this one has them all.`;
    case 'accountHouseholds':
      return `You can be in at most ${plural(limit, 'household', 'households')}, and you are in that many.`;
    case 'householdLists':
      return `A household can have at most ${plural(limit, 'list', 'lists')}, archived ones included, and this one has them all.`;
    case 'listOpenItems':
      return name
        ? `${name} has ${plural(limit, 'item', 'items')}, the most it can hold.`
        : `A list can hold at most ${plural(limit, 'open item', 'open items')}, and this one holds them all.`;
    case 'householdProducts':
      return `A household's catalog can hold at most ${plural(limit, 'product', 'products')}, and this one holds them all.`;
  }
}

/** How many people are active members of a household: what `householdMembers` is checked against, in the statement that adds one. */
export async function countActiveMembers(database: Database, household: string): Promise<number> {
  const row = await dbGet<{ n: number | string }>(
    database,
    sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'member')} WHERE household_id = ${household} AND left_at IS NULL`,
  );
  return Number(row?.n ?? 0);
}

/** How many households an account is an active member of, its own included: what `accountHouseholds` is checked against. */
export async function countHouseholdsOf(database: Database, accountId: string): Promise<number> {
  const row = await dbGet<{ n: number | string }>(
    database,
    sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'member')} m
        JOIN ${appTable(database, 'person')} p ON p.id = m.person_id
        WHERE p.account_id = ${accountId} AND m.left_at IS NULL`,
  );
  return Number(row?.n ?? 0);
}
