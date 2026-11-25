import 'fake-indexeddb/auto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, joinList, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import { addCardMember, stampCard } from '../cards/members';
import type { Database } from '../db/client';
import { dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { type Keyring, deriveCardKeyring, newKeyring, sealField } from '../keys/household';
import { applyMutation } from '../sync/apply';
import type { EndpointDeps } from '../sync/endpoint';
import { LOCAL_VERSION, openLocal } from './db';
import { placesOf } from './places';
import { cardMembersOf, cardsOf } from './store';
import { closeDevices, device, type Device } from './test-support';

/**
 * A loyalty card on a device (task 24.2, DESIGN.md §7.7), **the store and the merge**: the version 6 store a version 5 database is given, a pull that carries cards and their people
 * and takes them, a card its people lose gone from the device, and what a person on a card only holds of the group (that card and its people, no list). What the device makes of a card
 * (encrypts and opens it) is the device's logic, tested with it: the server's cards here are made by its own `applyMutation`, and their fields stay ciphertext, which is what is looked at.
 */
const { leg } = testTarget();
let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());
afterEach(closeDevices);

const deps = (): EndpointDeps => ({
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
  intervalSeconds: 20,
});

describe('the store of cards, version 6', () => {
  it('is given to a database of version 5, which keeps everything it has, with the indexes a card’s screens and a household’s forgetting use', async () => {
    const { openDB, deleteDB } = await import('idb');
    const name = `shopper-v5-${crypto.randomUUID()}`;
    const old = await openDB(name, 5, {
      upgrade(db) {
        db.createObjectStore('household', { keyPath: 'id' });
        db.createObjectStore('list', { keyPath: 'id' }).createIndex('byHousehold', 'householdId');
        const item = db.createObjectStore('item', { keyPath: 'id' });
        item.createIndex('byList', 'listId');
        item.createIndex('byProduct', 'productId');
        db.createObjectStore('product', { keyPath: 'id' }).createIndex(
          'byHousehold',
          'householdId',
        );
        db.createObjectStore('category', { keyPath: 'id' }).createIndex(
          'byHousehold',
          'householdId',
        );
        db.createObjectStore('shadow', { keyPath: ['table', 'id'] });
        db.createObjectStore('outbox', { keyPath: 'n', autoIncrement: true });
        db.createObjectStore('meta');
        db.createObjectStore('failed', { keyPath: 'n', autoIncrement: true });
        const member = db.createObjectStore('member', { keyPath: ['listId', 'personId'] });
        member.createIndex('byHousehold', 'householdId');
        member.createIndex('byList', 'listId');
        db.createObjectStore('inventory_item', { keyPath: 'id' }).createIndex(
          'byHousehold',
          'householdId',
        );
        const copies = db.createObjectStore('list_category', { keyPath: 'id' });
        copies.createIndex('byHousehold', 'householdId');
        copies.createIndex('byList', 'listId');
      },
    });
    await old.put('household', {
      id: 'h1',
      label: 'x',
      own: true,
      role: 'admin',
      seq: 1,
      cursor: 9,
    });
    await old.put('list_category', { id: 'c1', householdId: 'h1', listId: 'l1' });
    old.close();
    const upgraded = await openLocal('', name);
    expect(upgraded.version).toBe(LOCAL_VERSION);
    expect(LOCAL_VERSION).toBeGreaterThanOrEqual(6);
    expect((await upgraded.get('household', 'h1'))?.cursor).toBe(9);
    expect(await upgraded.count('list_category')).toBe(1);
    await upgraded.put('card', {
      id: 'k1',
      householdId: 'h1',
      shop: '',
      number: '',
      kind: 'qr',
      code: '',
      icon: null,
      color: null,
      holder: null,
      note: null,
      position: 'a1',
      deletedAt: null,
      createdAt: 1,
      seq: 1,
    });
    await upgraded.put('card_member', {
      cardId: 'k1',
      personId: 'p1',
      householdId: 'h1',
      name: 'Ada',
      email: null,
      role: 'admin',
      joinedAt: 1,
      leftAt: null,
      self: true,
      seq: 1,
    });
    expect(await upgraded.getAllFromIndex('card', 'byHousehold', 'h1')).toHaveLength(1);
    expect(await upgraded.getAllFromIndex('card_member', 'byCard', 'k1')).toHaveLength(1);
    expect(await upgraded.getAllFromIndex('card_member', 'byHousehold', 'h1')).toHaveLength(1);
    upgraded.close();
    await deleteDB(name);
  });
});

describe(`a pull that carries cards (${leg})`, () => {
  let ada: Someone;
  let grace: Someone;
  let heidi: Someone;
  let group: Keyring;
  const rings = new Map<string, Keyring>();
  const ring = async (card: string) => {
    const known = rings.get(card);
    if (known) return known;
    const made = await deriveCardKeyring(group, card);
    rings.set(card, made);
    return made;
  };
  const send = (who: Someone, changes: Mutation['changes'][number][]) =>
    applyMutation(deps(), who.accountId, {
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes,
    });
  const field = async (card: string, name: string, text: string) =>
    sealField(await ring(card), { list: card, table: 'card', row: card, field: name }, text);
  const make = async (card: string, position: string) => ({
    table: 'card' as const,
    id: card,
    create: true as const,
    fields: {
      shop: await field(card, 'shop', 'Tesco'),
      number: await field(card, 'number', '1'),
      kind: await field(card, 'kind', 'qr'),
      code: await field(card, 'code', 'x'),
      position,
      createdAt: 1,
    },
  });
  const synced = async (who: Someone): Promise<Device> => {
    const made = await device(deps, who);
    await made.client.sync();
    return made;
  };
  const cards = (d: Device) => d.client.read(cardsOf);
  let first = '';
  let second = '';
  let third = '';

  beforeAll(async () => {
    ada = await somebody(database, 'Ada');
    grace = await somebody(database, 'Grace');
    heidi = await somebody(database, 'Heidi');
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
    );
    group = newKeyring();
    first = crypto.randomUUID();
    second = crypto.randomUUID();
    third = crypto.randomUUID();
    expect(
      (
        await send(ada, [
          await make(first, 'a3'),
          await make(second, 'a1'),
          await make(third, 'a2'),
        ])
      ).status,
    ).toBe('applied');
    // Grace is on the first and the second, and on no list; Heidi is on a list of the group and no card.
    for (const card of [first, second])
      await addCardMember(database, {
        household: ada.household,
        card,
        person: grace.personId,
        role: 'member',
        seq: 1,
        now: Date.now(),
      });
    await joinList(database, ada.household, ada.list, heidi);
  });

  it('takes the cards the reader is on, in the order they were put, with their people, and none of another card', async () => {
    const mine = await synced(ada);
    expect((await cards(mine)).map((row) => row.id)).toEqual([second, third, first]);
    expect(
      (await mine.client.read((db) => cardMembersOf(db, first))).map((row) => row.role).sort(),
    ).toEqual(['admin', 'member']);
    // A row as the server has it: the person's words are ciphertext under the card's keys, which this device does not open yet.
    const row = (await cards(mine))[0] as unknown as { encrypted?: Record<string, string> };
    expect(Object.keys(row.encrypted ?? {}).sort()).toEqual(['code', 'kind', 'number', 'shop']);
  });

  it('gives a person on a card only the card and its people, and the group they reach it by, and no list', async () => {
    const hers = await synced(grace);
    expect((await cards(hers)).map((row) => row.id)).toEqual([second, first]);
    // Her own group has its list; Ada's group, which she reaches by the card, has none on her device.
    expect(
      await hers.client.read((db) => db.getAllFromIndex('list', 'byHousehold', ada.household)),
    ).toEqual([]);
    expect(
      (await hers.client.read((db) => db.getAll('item'))).filter(
        (row) => row.householdId === ada.household,
      ),
    ).toEqual([]);
    expect((await hers.client.read((db) => db.getAll('household'))).map((row) => row.id)).toContain(
      ada.household,
    );
    // The group is not a place of hers in the sidebar: she is on no list of it, and a card is shown from the Cards screen.
    expect((await hers.client.read(placesOf)).map((place) => place.household.id)).not.toContain(
      ada.household,
    );
    const theirs = await synced(heidi);
    expect(await cards(theirs)).toEqual([]);
    expect(await theirs.client.read((db) => db.getAll('card_member'))).toEqual([]);
  });

  it('forgets a card the reader is no longer on, with its people, and keeps the one they are', async () => {
    const hers = await synced(grace);
    expect((await cards(hers)).map((row) => row.id)).toEqual([second, first]);
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'card_member')} SET left_at = 9, seq = 5000 WHERE card_id = ${first} AND person_id = ${grace.personId}`,
    );
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET seq = 5000 WHERE id = ${ada.household}`,
    );
    await hers.client.sync();
    expect((await cards(hers)).map((row) => row.id)).toEqual([second]);
    expect(await hers.client.read((db) => cardMembersOf(db, first))).toEqual([]);
    expect((await hers.client.read((db) => cardMembersOf(db, second))).length).toBe(2);
  });

  it('takes a tombstone of a card as the card and its people gone, and forgets the group when the reader is on nothing of it', async () => {
    const hers = await synced(grace);
    expect((await cards(hers)).map((row) => row.id)).toEqual([second]);
    // The card is deleted (its Admin's online operation, later): a tombstone that names it, and its rows gone.
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'tombstone')} (household_id, table_name, id, seq, created_at, list_id, card_id)
          VALUES (${ada.household}, 'card', ${second}, 6000, 1, NULL, ${second})`,
    );
    await dbRun(database, sql`DELETE FROM ${appTable(database, 'card')} WHERE id = ${second}`);
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET seq = 6000 WHERE id = ${ada.household}`,
    );
    await hers.client.sync();
    expect(await cards(hers)).toEqual([]);
    expect(await hers.client.read((db) => cardMembersOf(db, second))).toEqual([]);
    // Put on the third card, and synced: her device holds it. Then she is off every card at once, so the group is not hers any more, and what her device holds of it goes whole: the card and its
    // people with the household, which the pull of a group she is on nothing of does not name card by card.
    await addCardMember(database, {
      household: ada.household,
      card: third,
      person: grace.personId,
      role: 'member',
      seq: 6500,
      now: Date.now(),
    });
    // What a join does (`stampCard`, as `stampList` does for a list): the card and its people take the join's seq, so a device whose cursor is past them pulls them.
    await stampCard(database, ada.household, third, 6500);
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET seq = 6500 WHERE id = ${ada.household}`,
    );
    await hers.client.sync();
    expect((await cards(hers)).map((row) => row.id)).toEqual([third]);
    expect((await hers.client.read((db) => cardMembersOf(db, third))).length).toBe(2);
    // Left everywhere: the group's own record goes from her device.
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'card_member')} SET left_at = 9, seq = 7000 WHERE person_id = ${grace.personId}`,
    );
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET seq = 7000 WHERE id = ${ada.household}`,
    );
    await hers.client.sync();
    expect(
      (await hers.client.read((db) => db.getAll('household'))).map((row) => row.id),
    ).not.toContain(ada.household);
    expect(await hers.client.read((db) => db.getAll('card'))).toEqual([]);
    expect(await hers.client.read((db) => db.getAll('card_member'))).toEqual([]);
  });
});
