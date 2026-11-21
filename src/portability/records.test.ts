import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Database } from '../db/client';
import { dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
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
    sql`UPDATE ${appTable(database, 'list')} SET sealed = '', encrypted = ${JSON.stringify({ name: 'e1.1.x.AAAA' })} WHERE household_id = ${ada.household}`,
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
    expect(JSON.stringify(byKind.list_encrypted?.records)).toContain('e1.1.x.AAAA');
    expect(byKind.household_key?.records).toEqual([
      { household: ada.household, epoch: 1, record: 'hk1.a.b' },
    ]);
    // Grace's household is sealed: its list comes as the server reads it, named.
    expect(byKind.list?.endToEnd).toBe(false);
    expect(JSON.stringify(byKind.list?.records)).toContain('Groceries');
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
});
