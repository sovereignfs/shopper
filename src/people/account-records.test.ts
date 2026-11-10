import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody } from '../access/test-support';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { householdsOf, membersOf, readHousehold } from '../households/households';
import { makeAccountRecords } from './account-records';

const { leg } = testTarget();

let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());

const count = async (table: string, where: ReturnType<typeof sql>) =>
  Number(
    (
      await dbAll<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, table)} WHERE ${where}`,
      )
    )[0]?.n,
  );

describe(`an account's first household (${leg})`, () => {
  it('is made with the account, and the account is its Admin and only member', async () => {
    const account = { id: `acct-${crypto.randomUUID()}`, name: 'Ada', email: 'ada@example.com' };
    const { personId, householdId } = await makeAccountRecords(database, TEST_RING, account);
    const view = await readHousehold(database, TEST_RING, householdId, account.id);
    expect(view).toMatchObject({ own: true, role: 'admin', label: 'My lists' });
    const members = await membersOf(database, TEST_RING, householdId, account.id);
    expect(members?.map((m) => [m.personId, m.role])).toEqual([[personId, 'admin']]);
  });

  it('is made once however often and from however many places at once, one for each account', async () => {
    const accounts = Array.from({ length: 4 }, (_, i) => ({
      id: `acct-race-${i}-${crypto.randomUUID()}`,
      name: `Person ${i}`,
      email: `p${i}@example.com`,
    }));
    // Every account is made from three places at once: the sign-up hook, two session checks.
    const made = await Promise.all(
      accounts.flatMap((a) => [1, 2, 3].map(() => makeAccountRecords(database, TEST_RING, a))),
    );
    for (const account of accounts) {
      const mine = made.filter((_, i) => accounts[Math.floor(i / 3)] === account);
      expect(new Set(mine.map((m) => m.householdId)).size).toBe(1);
      expect(await count('household', sql`own_of = ${account.id}`)).toBe(1);
      expect(await count('person', sql`account_id = ${account.id}`)).toBe(1);
      expect((await householdsOf(database, TEST_RING, account.id)).length).toBe(1);
    }
  });

  it('can take members, who see it under the owner’s name, and is still the owner’s', async () => {
    const ada = await somebody(database, 'Ada');
    const grace = await somebody(database, 'Grace');
    await join(database, ada.household, grace);
    const seen = await householdsOf(database, TEST_RING, grace.accountId);
    expect(seen.map((h) => [h.label, h.own, h.role])).toEqual([
      ['My lists', true, 'admin'],
      ['Ada’s lists', false, 'member'],
    ]);
  });
});
