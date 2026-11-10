import type { Problem } from '../config';

/**
 * The operator's limits (DESIGN.md §7.6), each a setting with a default. Task 3.7 checks them where a change would pass one; here they are only
 * read, so that a wrong one stops the server at start-up. The limit on categories comes with editing them, in phase 2.
 */
export interface Limits {
  /** Members of a household. */
  readonly householdMembers: number;
  /** Households an account is in, its own included. */
  readonly accountHouseholds: number;
  /** Lists of a household, archived included. */
  readonly householdLists: number;
  /** Open items on a list. */
  readonly listOpenItems: number;
  /** Products in a household's catalog. */
  readonly householdProducts: number;
}

const LARGEST = 1_000_000;

const LIMITS: readonly { key: keyof Limits; name: string; fallback: number }[] = [
  { key: 'householdMembers', name: 'SHOPPER_LIMIT_HOUSEHOLD_MEMBERS', fallback: 20 },
  { key: 'accountHouseholds', name: 'SHOPPER_LIMIT_ACCOUNT_HOUSEHOLDS', fallback: 20 },
  { key: 'householdLists', name: 'SHOPPER_LIMIT_HOUSEHOLD_LISTS', fallback: 100 },
  { key: 'listOpenItems', name: 'SHOPPER_LIMIT_LIST_OPEN_ITEMS', fallback: 500 },
  { key: 'householdProducts', name: 'SHOPPER_LIMIT_HOUSEHOLD_PRODUCTS', fallback: 5000 },
];

/** The limits, with the defaults where a setting is not given; a wrong one is a problem and keeps its default here. */
export function resolveLimits(
  read: (name: string) => string | undefined,
  problems: Problem[],
): Limits {
  const out = {} as { -readonly [K in keyof Limits]: number };
  for (const { key, name, fallback } of LIMITS) {
    const raw = read(name);
    out[key] = fallback;
    if (raw === undefined) continue;
    const parsed = Number(raw);
    if (!/^\d+$/.test(raw) || parsed < 1 || parsed > LARGEST)
      problems.push(`${name} is a whole number from 1 to ${LARGEST}.`);
    else out[key] = parsed;
  }
  return out;
}
