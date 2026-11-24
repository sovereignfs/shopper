import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, joinList, somebody, type Someone } from '../access/test-support';
import type { Database } from '../db/client';
import { dbGet, dbRun } from '../db/exec';
import { sealRow } from '../crypto/sealed';
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

  it('holds a person’s own categories, and the names they gave starter ones, for them alone: someone on a list of the group is given the starter rows with no content (§8.3)', async () => {
    // Grace owns a group the server seals, and Ada is on one of its lists. Grace has a category of her own and has named the starter _Produce_.
    const own = crypto.randomUUID();
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'category')} (id, household_id, starter_key, sealed, icon, position, hidden, seq)
          VALUES (${own}, ${grace.household}, ${null}, ${sealRow('category', own, { name: 'GRACEOWNCAT' }, TEST_RING)}, ${null}, ${'zz'}, ${false}, ${1})`,
    );
    const produce = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'category')} WHERE household_id = ${grace.household} AND starter_key = ${'produce'}`,
    );
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'category')} SET sealed = ${sealRow('category', produce?.id ?? '', { name: 'GRACEVEG' }, TEST_RING)} WHERE id = ${produce?.id ?? ''}`,
    );
    const theirs = await personRecords(database, TEST_RING, ada.accountId);
    const seen = JSON.stringify(theirs.filter((part) => part.kind.startsWith('category')));
    expect(seen).not.toContain('GRACEOWNCAT');
    expect(seen).not.toContain('GRACEVEG');
    const categories = theirs.find((part) => part.kind === 'category')?.records ?? [];
    // Her group's starter rows are there for the list's context, with nothing of hers in them; none of her own.
    expect(categories.filter((row) => row.household_id === grace.household)).not.toHaveLength(0);
    expect(categories.some((row) => row.id === own)).toBe(false);
    expect(
      categories
        .filter((row) => row.household_id === grace.household)
        .every((row) => Object.keys(row.content as object).length === 0),
    ).toBe(true);
    // Grace's own export has both.
    const hers = await personRecords(database, TEST_RING, grace.accountId);
    const hersText = JSON.stringify(hers.find((part) => part.kind === 'category')?.records);
    expect(hersText).toContain('"id":"' + own + '"');
    expect(hersText).toContain('GRACEOWNCAT');
    expect(hersText).toContain('GRACEVEG');
  });

  it('holds a list’s copies of categories for the people on that list, and for no one on another list of the group (§8.3)', async () => {
    const owner = await somebody(database, 'Copies-owner');
    const onGroceries = await somebody(database, 'Copies-groceries');
    const onHardware = await somebody(database, 'Copies-hardware');
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${owner.household}`,
    );
    const hardware = crypto.randomUUID();
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'list')} (id, household_id, sealed, encrypted, position, seq, created_at)
          VALUES (${hardware}, ${owner.household}, ${''}, ${JSON.stringify({ name: 'e2.1.x.y.AAAA' })}, ${'a5'}, ${1}, ${1})`,
    );
    const { joinList } = await import('../access/test-support');
    await joinList(database, owner.household, hardware, owner, 'admin');
    await joinList(database, owner.household, owner.list, onGroceries);
    await joinList(database, owner.household, hardware, onHardware);
    const copy = async (list: string, name: string) => {
      const id = crypto.randomUUID();
      await dbRun(
        database,
        sql`INSERT INTO ${appTable(database, 'list_category')} (id, household_id, list_id, source_key, sealed, encrypted, position, seq)
            VALUES (${id}, ${owner.household}, ${list}, ${`n3.${id.replaceAll('-', '').padEnd(43, 'A').slice(0, 43)}`}, ${''}, ${JSON.stringify({ name })}, ${'a5'}, ${1})`,
      );
      return id;
    };
    const here = await copy(owner.list, 'e2.1.groceries.copy.AAAA');
    const there = await copy(hardware, 'e2.1.hardware.copy.BBBB');
    const exported = async (who: Someone) =>
      JSON.stringify(
        (await personRecords(database, TEST_RING, who.accountId))
          .filter((part) => part.kind.startsWith('list_category'))
          .map((part) => ({ kind: part.kind, endToEnd: part.endToEnd, records: part.records })),
      );
    // The ciphertext, end to end, to those on the list: the owner is on both, the others on one.
    const forOwner = await exported(owner);
    expect(forOwner).toContain(here);
    expect(forOwner).toContain(there);
    expect(forOwner).toContain('"endToEnd":true');
    const forGroceries = await exported(onGroceries);
    expect(forGroceries).toContain(here);
    expect(forGroceries).not.toContain(there);
    const forHardware = await exported(onHardware);
    expect(forHardware).toContain(there);
    expect(forHardware).not.toContain(here);
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
          householdCategories: 100,
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
