import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join, leave, somebody } from '../access/test-support';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import {
  type LimitKind,
  countActiveMembers,
  countHouseholdsOf,
  exceeds,
  limitSentence,
} from './limits';

const { leg } = testTarget();
const KEY = Buffer.alloc(32, 3).toString('base64');

describe('whether a change would pass a limit', () => {
  it('is yes only when the thing after it would be more than the limit', () => {
    expect(exceeds(3, 2)).toBe(false);
    expect(exceeds(3, 3)).toBe(true);
    expect(exceeds(3, 1, 2)).toBe(false);
    expect(exceeds(3, 2, 2)).toBe(true);
    expect(exceeds(1, 0)).toBe(false);
  });

  it('has a sentence for every limit that names the number and says what it counts, and a name only where it is given', () => {
    const kinds: LimitKind[] = [
      'householdMembers',
      'accountHouseholds',
      'householdLists',
      'listOpenItems',
      'householdProducts',
    ];
    for (const kind of kinds) {
      const sentence = limitSentence(kind, 20);
      expect(sentence).toContain('20');
      expect(sentence.endsWith('.')).toBe(true);
    }
    expect(limitSentence('listOpenItems', 500, 'Groceries')).toBe(
      'Groceries has 500 items, the most it can hold.',
    );
    expect(limitSentence('listOpenItems', 500)).not.toContain('Groceries');
    expect(limitSentence('householdMembers', 1)).toContain('1 person,');
  });

  it('has defaults an operator can change, and refuses a limit that is not a count', () => {
    const base = { SHOPPER_ENCRYPTION_KEY: KEY };
    const ok = loadConfig({ ...base, SHOPPER_LIMIT_LIST_OPEN_ITEMS: '3' });
    expect(ok.ok && ok.config.limits.listOpenItems).toBe(3);
    expect(ok.ok && ok.config.limits.householdLists).toBe(100);
    for (const bad of ['0', '-1', '1.5', 'many', '1000001']) {
      const result = loadConfig({ ...base, SHOPPER_LIMIT_HOUSEHOLD_PRODUCTS: bad });
      expect(result.ok, bad).toBe(false);
    }
  });
});

describe(`what the limits count (${leg})`, () => {
  let database: Database;
  beforeAll(async () => {
    ({ database } = await freshDatabase('app'));
    await runMigrations(database);
  });
  afterAll(async () => database.close());

  it('counts the active members of a household, and not those who left', async () => {
    const ada = await somebody(database, 'Ada');
    const grace = await somebody(database, 'Grace');
    const lin = await somebody(database, 'Lin');
    expect(await countActiveMembers(database, ada.household)).toBe(1);
    await join(database, ada.household, grace);
    await join(database, ada.household, lin);
    expect(await countActiveMembers(database, ada.household)).toBe(3);
    await leave(database, ada.household, lin);
    expect(await countActiveMembers(database, ada.household)).toBe(2);
    expect(await countActiveMembers(database, 'no-such-household')).toBe(0);
  });

  it('counts the households an account is in, its own included, and not those it left', async () => {
    const ada = await somebody(database, 'Ada');
    const grace = await somebody(database, 'Grace');
    expect(await countHouseholdsOf(database, grace.accountId)).toBe(1);
    await join(database, ada.household, grace);
    expect(await countHouseholdsOf(database, grace.accountId)).toBe(2);
    await leave(database, ada.household, grace);
    expect(await countHouseholdsOf(database, grace.accountId)).toBe(1);
    expect(await countHouseholdsOf(database, 'nobody')).toBe(0);
  });
});
