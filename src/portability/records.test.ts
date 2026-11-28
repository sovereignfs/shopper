import { is, sql } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, joinList, somebody, type Someone } from '../access/test-support';
import type { Database } from '../db/client';
import { dbGet, dbRun } from '../db/exec';
import { sealRow } from '../crypto/sealed';
import { runMigrations } from '../db/migrate';
import * as sqliteApp from '../db/schema/sqlite/app';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { listCardId } from '../cards/links';
import { addCardMember } from '../cards/members';
import type { Limits } from '../limits/config';
import { applyMutation } from '../sync/apply';
import { personRecords } from './records';

const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
  inventoryItems: 5000,
  householdCategories: 100,
  accountCards: 100,
};
/**
 * What a person's export holds of each table, **decided for every table there is** (`AGENTS.md`: a new table is exported in the same change): the tests below
 * fail for a table that is in neither list, and for one in the first whose row is not in the export. The value is the kind it is under, with `_encrypted`
 * after it for the content of a moved group.
 */
const EXPORTED: Record<string, string> = {
  person: 'person',
  household: 'household',
  list_member: 'member',
  card_member: 'card_member',
  list_card: 'list_card',
  list: 'list',
  item: 'item',
  product: 'product',
  category: 'category',
  inventory_item: 'inventory_item',
  list_category: 'list_category',
  card: 'card',
  household_key: 'household_key',
  list_key: 'list_key',
  card_key: 'card_key',
  account_settings: 'account_settings',
};
const NOT_EXPORTED: Record<string, string> = {
  member:
    'who is in a group, which is never shown (RFC 0004): the export says whether a group is the person’s own, and a list’s people are `member`',
  invitation: 'a link’s token hash and wrapped key, which open a list or a card',
  alias: 'what a fold left, ids only, for devices to follow',
  tombstone: 'what was deleted, ids only, for devices to follow',
  applied_mutation: 'the record of what was sent, so that nothing is applied twice',
  rate_bucket: 'counters of how often something was tried',
  push_device: 'a push service’s address for a device and the keys that send to it',
  push_outbox: 'pushes waiting to be sent',
};

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

  it('decides for every table there is whether the export holds it', () => {
    const tables = Object.values<unknown>(sqliteApp)
      .filter((value): value is SQLiteTable => is(value, SQLiteTable))
      .map((table) => getTableConfig(table).name);
    expect([...Object.keys(EXPORTED), ...Object.keys(NOT_EXPORTED)].sort()).toEqual(tables.sort());
  });

  it('holds a row of every table it says it holds', async () => {
    const who = await somebody(database, 'Everything');
    const [product, card] = [crypto.randomUUID(), crypto.randomUUID()];
    // A moved group, so that the keys are in the export too.
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${who.household}`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'product')} (id, household_id, list_id, name_key, sealed, created_at)
          VALUES (${product}, ${who.household}, ${who.list}, ${'milk'}, ${''}, 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'item')} (id, household_id, list_id, product_id, sealed, quantity, position, added_by, added_at)
          VALUES (${crypto.randomUUID()}, ${who.household}, ${who.list}, ${product}, ${''}, ${'1'}, ${'a1'}, ${who.personId}, 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'inventory_item')} (id, household_id, name_key, created_at)
          VALUES (${crypto.randomUUID()}, ${who.household}, ${'tea'}, 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'list_category')} (id, household_id, list_id, source_key, position)
          VALUES (${crypto.randomUUID()}, ${who.household}, ${who.list}, ${'produce'}, ${'a1'})`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'card')} (id, household_id, position, created_at)
          VALUES (${card}, ${who.household}, ${'a1'}, 1)`,
    );
    await addCardMember(database, {
      household: who.household,
      card,
      person: who.personId,
      role: 'admin',
      seq: 1,
      now: 1,
    });
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'list_card')} (id, household_id, list_id, card_id, created_at)
          VALUES (${listCardId(who.list, card)}, ${who.household}, ${who.list}, ${card}, 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'household_key')} (household_id, person_id, epoch, record, created_at)
          VALUES (${who.household}, ${who.personId}, 1, 'hk1.every.thing', 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'list_key')} (list_id, person_id, household_id, epoch, record, created_at)
          VALUES (${who.list}, ${who.personId}, ${who.household}, 1, 'lr1.every.thing', 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'card_key')} (card_id, person_id, household_id, epoch, record, created_at)
          VALUES (${card}, ${who.personId}, ${who.household}, 1, 'cr1.every.thing', 1)`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'account_settings')} (account_id, created_at, updated_at)
          VALUES (${who.accountId}, 1, 1)`,
    );
    const kinds = (await personRecords(database, TEST_RING, who.accountId)).map((part) =>
      part.kind.replace(/_encrypted$/, ''),
    );
    for (const [table, kind] of Object.entries(EXPORTED)) expect(kinds, table).toContain(kind);
  });

  it('holds what a person’s account keeps for itself on the server, and no other account’s (§20.3)', async () => {
    const mine = await somebody(database, 'Settings-mine');
    const theirs = await somebody(database, 'Settings-theirs');
    await join(database, mine.household, theirs);
    for (const [who, list, seen] of [
      [mine, mine.list, 5],
      [theirs, theirs.list, null],
    ] as const)
      await dbRun(
        database,
        sql`INSERT INTO ${appTable(database, 'account_settings')} (account_id, last_list_id, inbox_seen_at, created_at, updated_at)
            VALUES (${who.accountId}, ${list}, ${seen}, 3, 4)`,
      );
    const part = (await personRecords(database, TEST_RING, mine.accountId)).find(
      (each) => each.kind === 'account_settings',
    );
    expect(part).toEqual({
      kind: 'account_settings',
      endToEnd: false,
      records: [{ lastList: mine.list, inboxSeenAt: 5, createdAt: 3, updatedAt: 4 }],
    });
    const other = (await personRecords(database, TEST_RING, theirs.accountId)).find(
      (each) => each.kind === 'account_settings',
    );
    expect(other?.records).toEqual([
      { lastList: theirs.list, inboxSeenAt: null, createdAt: 3, updatedAt: 4 },
    ]);
  });

  it('hands someone who is on a card only none of the group’s categories: not its starter rows, their order or which are hidden (§7.7)', async () => {
    const owner = await somebody(database, 'Aisleowner');
    const guest = await somebody(database, 'Aisleguest');
    const card = crypto.randomUUID();
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${owner.household}`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'card')} (id, household_id, position, created_at)
          VALUES (${card}, ${owner.household}, ${'a1'}, 1)`,
    );
    await addCardMember(database, {
      household: owner.household,
      card,
      person: guest.personId,
      role: 'member',
      seq: 1,
      now: 1,
    });
    const of = async (who: Someone) =>
      (await personRecords(database, TEST_RING, who.accountId))
        .filter((part) => part.kind.startsWith('category'))
        .flatMap((part) => part.records)
        .filter((row) => row.household_id === owner.household);
    // They reach the group by the card, and are given it.
    const theirs = await personRecords(database, TEST_RING, guest.accountId);
    expect(theirs.find((part) => part.kind === 'card_encrypted')?.records).toHaveLength(1);
    expect(await of(guest)).toEqual([]);
    expect(await of(owner)).not.toHaveLength(0);
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
          accountCards: 100,
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

  it('holds the cards a person is on, with their people by name only and their own copies of the cards’ keys, for them alone, in a group they are on no list of (24.2)', async () => {
    const owner = await somebody(database, 'Cardholder');
    const guest = await somebody(database, 'Cardguest');
    const stranger = await somebody(database, 'Cardstranger');
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${owner.household}`,
    );
    const shared = crypto.randomUUID();
    const alone = crypto.randomUUID();
    const value = (card: string) => `e2.1.${card}.${card}.${'A'.repeat(24)}`;
    const result = await applyMutation(
      { database, ring: TEST_RING, limits: LIMITS },
      owner.accountId,
      {
        mutationId: crypto.randomUUID(),
        householdId: owner.household,
        changes: [shared, alone].map((id) => ({
          table: 'card',
          id,
          create: true,
          fields: {
            shop: value(id),
            number: value(id),
            kind: value(id),
            code: value(id),
            position: 'a1',
            createdAt: 1,
          },
        })),
      },
    );
    expect(result.status).toBe('applied');
    await addCardMember(database, {
      household: owner.household,
      card: shared,
      person: guest.personId,
      role: 'member',
      seq: 9,
      now: 1,
    });
    for (const [card, who, record] of [
      [shared, owner, 'cr1.owner.shared'],
      [shared, guest, 'cr1.guest.shared'],
      [alone, owner, 'cr1.owner.alone'],
    ] as const)
      await dbRun(
        database,
        sql`INSERT INTO ${appTable(database, 'card_key')} (card_id, person_id, household_id, epoch, record, created_at)
            VALUES (${card}, ${who.personId}, ${owner.household}, 1, ${record}, 1)`,
      );

    const theirs = await personRecords(database, TEST_RING, guest.accountId);
    const cards = theirs.find((part) => part.kind === 'card_encrypted');
    expect(cards?.endToEnd).toBe(true);
    expect(cards?.records.map((row) => row.id)).toEqual([shared]);
    expect(cards?.records[0]).toMatchObject({ content: { shop: value(shared) } });
    // The people of the card, by name only, and the guest's own copy of its keys, and no one else's.
    const people = theirs.find((part) => part.kind === 'card_member');
    expect(people?.records.map((row) => [row.card, row.role]).sort()).toEqual([
      [shared, 'admin'],
      [shared, 'member'],
    ]);
    expect(JSON.stringify(people)).not.toContain('@');
    expect(theirs.find((part) => part.kind === 'card_key')?.records).toEqual([
      { household: owner.household, card: shared, epoch: 1, record: 'cr1.guest.shared' },
    ]);
    // Nothing else of the group: none of its lists (the guest has their own group's), and not the other card, nor its key, nor the owner's.
    const ofOwner = theirs
      .filter((part) => part.kind === 'list' || part.kind === 'list_encrypted')
      .flatMap((part) => part.records)
      .filter((row) => row.household_id === owner.household);
    expect(ofOwner).toEqual([]);
    expect(JSON.stringify(theirs)).not.toContain(alone);
    expect(JSON.stringify(theirs)).not.toContain('cr1.owner');
    // The owner has both cards; a stranger has none.
    const mine = await personRecords(database, TEST_RING, owner.accountId);
    expect(
      mine
        .find((part) => part.kind === 'card_encrypted')
        ?.records.map((row) => row.id)
        .sort(),
    ).toEqual([shared, alone].sort());
    const none = await personRecords(database, TEST_RING, stranger.accountId);
    expect(none.some((part) => part.kind.startsWith('card'))).toBe(false);
  });
  it('holds the cards linked to lists for the people who are on both the list and the card, and for no one else (24.6)', async () => {
    const owner = await somebody(database, 'Linker');
    const both = await somebody(database, 'Linkboth');
    const listOnly = await somebody(database, 'Linklist');
    const cardOnly = await somebody(database, 'Linkcard');
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${owner.household}`,
    );
    const card = crypto.randomUUID();
    const value = `e2.1.${card}.${card}.${'A'.repeat(24)}`;
    const made = await applyMutation(
      { database, ring: TEST_RING, limits: LIMITS },
      owner.accountId,
      {
        mutationId: crypto.randomUUID(),
        householdId: owner.household,
        changes: [
          {
            table: 'card',
            id: card,
            create: true,
            fields: {
              shop: value,
              number: value,
              kind: value,
              code: value,
              position: 'a1',
              createdAt: 1,
            },
          },
          {
            table: 'list_card',
            id: listCardId(owner.list, card),
            create: true,
            fields: { listId: owner.list, cardId: card, createdAt: 7 },
          },
        ],
      },
    );
    expect(made.status).toBe('applied');
    for (const who of [both, cardOnly])
      await addCardMember(database, {
        household: owner.household,
        card,
        person: who.personId,
        role: 'member',
        seq: 9,
        now: 1,
      });
    for (const who of [both, listOnly]) await joinList(database, owner.household, owner.list, who);
    const link = (parts: Awaited<ReturnType<typeof personRecords>>) =>
      parts.find((part) => part.kind === 'list_card');
    const expected = [
      {
        id: listCardId(owner.list, card),
        household: owner.household,
        list: owner.list,
        card,
        deletedAt: null,
        createdAt: 7,
      },
    ];
    expect(link(await personRecords(database, TEST_RING, owner.accountId))?.records).toEqual(
      expected,
    );
    expect(link(await personRecords(database, TEST_RING, both.accountId))?.records).toEqual(
      expected,
    );
    expect(link(await personRecords(database, TEST_RING, listOnly.accountId))).toBeUndefined();
    expect(link(await personRecords(database, TEST_RING, cardOnly.accountId))).toBeUndefined();
    // A link holds nothing of what a person wrote, and is not end-to-end: ids and times.
    expect(link(await personRecords(database, TEST_RING, owner.accountId))?.endToEnd).toBe(false);
  });
});
