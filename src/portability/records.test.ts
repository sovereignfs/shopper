import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, joinList, somebody, type Someone } from '../access/test-support';
import type { Database } from '../db/client';
import { dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { applyMutation } from '../sync/apply';
import { personRecords } from './records';

let database: Database;
let ada: Someone;
let grace: Someone;

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  await join(database, grace.household, ada);
  // Ada's own household has moved; Grace's, shared, is still sealed by the server.
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
  );
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'list')} SET sealed = '', encrypted = ${JSON.stringify({ name: 'e2.1.x.AAAA' })} WHERE household_id = ${ada.household}`,
  );
  await dbRun(
    database,
    sql`INSERT INTO ${appTable(database, 'household_key')} (household_id, person_id, epoch, record, created_at) VALUES (${ada.household}, ${ada.personId}, 1, 'hk1.a.b', 1)`,
  );
});
afterAll(async () => database.close());

describe(`a person's export (${testTarget().leg})`, () => {
  it('holds every household they are in, a moved one as its ciphertext with their own keys, a sealed one as the server reads it', async () => {
    const parts = await personRecords(database, TEST_RING, ada.accountId);
    const byKind = Object.fromEntries(parts.map((part) => [part.kind, part]));
    expect(byKind.household?.records).toHaveLength(2);
    expect(byKind.list_encrypted?.endToEnd).toBe(true);
    expect(JSON.stringify(byKind.list_encrypted?.records)).toContain('e2.1.x.AAAA');
    expect(byKind.household_key?.records).toEqual([
      { household: ada.household, epoch: 1, record: 'hk1.a.b' },
    ]);
    // Grace's household is sealed: its list comes as the server reads it, named.
    expect(byKind.list?.endToEnd).toBe(false);
    expect(JSON.stringify(byKind.list?.records)).toContain('Groceries');
  });

  it('holds a moved group’s Inventory as its ciphertext, end to end, with the name key its device made and nothing the server could read', async () => {
    const id = crypto.randomUUID();
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'inventory_item')} (id, household_id, starter_key, name_key, sealed, encrypted, created_at)
          VALUES (${id}, ${ada.household}, ${null}, ${'n3.' + 'A'.repeat(43)}, ${''}, ${JSON.stringify({ name: 'e2.1.h.r.AAAA', note: 'e2.1.h.r.BBBB' })}, ${1})`,
    );
    const parts = await personRecords(database, TEST_RING, ada.accountId);
    const part = parts.find((each) => each.kind === 'inventory_item_encrypted');
    expect(part?.endToEnd).toBe(true);
    expect(part?.records).toHaveLength(1);
    expect(part?.records[0]).toMatchObject({
      id,
      content: { name: 'e2.1.h.r.AAAA', note: 'e2.1.h.r.BBBB' },
    });
    // Nor does anyone else's export hold it.
    const others = await personRecords(database, TEST_RING, grace.accountId);
    expect(others.some((each) => each.kind.startsWith('inventory_item'))).toBe(false);
  });

  it('names the other members and gives none of their addresses, nor anything the contract forbids', async () => {
    const parts = await personRecords(database, TEST_RING, ada.accountId);
    const text = JSON.stringify(parts);
    const members = parts.find((part) => part.kind === 'member')?.records ?? [];
    expect(members.some((member) => member.name === 'Grace')).toBe(true);
    expect(members.every((member) => !('email' in member))).toBe(true);
    expect(text).not.toContain('grace');
    expect(text).not.toMatch(/password|token|secret/i);
  });

  it('is nothing for an account Shopper does not know', async () => {
    expect(await personRecords(database, TEST_RING, 'nobody')).toEqual([]);
  });

  it('holds their own copies of the keys of lists shared with them, and no one else’s (RFC 0004)', async () => {
    const lin = await somebody(database, 'Lin');
    await joinList(database, lin.household, lin.list, ada);
    await joinList(database, lin.household, lin.list, grace);
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${lin.household}`,
    );
    for (const [who, record] of [
      [ada, 'lr1.ada.copy'],
      [grace, 'lr1.grace.copy'],
    ] as const)
      await dbRun(
        database,
        sql`INSERT INTO ${appTable(database, 'list_key')} (list_id, person_id, household_id, epoch, record, created_at)
            VALUES (${lin.list}, ${who.personId}, ${lin.household}, 1, ${record}, 1)`,
      );
    const parts = await personRecords(database, TEST_RING, ada.accountId);
    const keys = parts.find((part) => part.kind === 'list_key');
    expect(keys?.endToEnd).toBe(true);
    expect(keys?.records).toEqual([
      { household: lin.household, list: lin.list, epoch: 1, record: 'lr1.ada.copy' },
    ]);
    expect(JSON.stringify(parts)).not.toContain('lr1.grace.copy');
  });

  it('holds a person’s own Inventory, and nothing of it in the export of someone on one of their group’s lists (23.3)', async () => {
    const host = await somebody(database, 'Hostess');
    const guest = await somebody(database, 'Guest');
    await join(database, host.household, guest);
    const id = crypto.randomUUID();
    const result = await applyMutation(
      {
        database,
        ring: TEST_RING,
        limits: {
          householdMembers: 20,
          accountHouseholds: 20,
          householdLists: 100,
          listOpenItems: 500,
          householdProducts: 5000,
          inventoryItems: 5000,
        },
      },
      host.accountId,
      {
        mutationId: crypto.randomUUID(),
        householdId: host.household,
        changes: [
          {
            table: 'inventory_item',
            id,
            create: true,
            fields: { name: 'Hostess’s good tea', createdAt: 1, recurring: 1, hidden: 0 },
          },
        ],
      },
    );
    expect(result.status).toBe('applied');

    const theirs = await personRecords(database, TEST_RING, host.accountId);
    const inventory = theirs.find((part) => part.kind === 'inventory_item');
    expect(inventory?.endToEnd).toBe(false);
    expect(inventory?.records).toHaveLength(1);
    expect(inventory?.records[0]).toMatchObject({
      id,
      household_id: host.household,
      content: { name: 'Hostess’s good tea' },
    });
    // The guest's export holds the group's list and its people, and none of its Inventory.
    const others = await personRecords(database, TEST_RING, guest.accountId);
    expect(others.some((part) => part.kind === 'list')).toBe(true);
    expect(others.some((part) => part.kind === 'inventory_item')).toBe(false);
    expect(JSON.stringify(others)).not.toContain('good tea');
  });
});
