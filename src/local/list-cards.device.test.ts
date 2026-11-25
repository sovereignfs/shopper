import 'fake-indexeddb/auto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, joinList, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import type { Mutation } from '../actions/format';
import { canLink, linkCard, unlinkCard } from '../actions/list-cards';
import { listCardId } from '../cards/links';
import { addCardMember, stampCard } from '../cards/members';
import type { Database } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { type Keyring, deriveCardKeyring, newKeyring, sealField } from '../keys/household';
import { applyMutation } from '../sync/apply';
import type { EndpointDeps } from '../sync/endpoint';
import { LOCAL_VERSION, openLocal } from './db';
import { cardsOfList, linkableCardsOf } from './list-cards-view';
import { cardsOf } from './store';
import { closeDevices, device, type Device } from './test-support';

/**
 * **A card linked to a list on a device** (task 24.6, DESIGN.md §7.7), the store and the merge: the version 7 store a version 6 database is given, a pull that carries links and takes them for the people
 * who are on both the list and the card and for no one else, a link a device makes and takes off, and **a link leaving the device with the list, the card or the group it was of**, in each of the three
 * ways a device forgets. The server's cards here are made by its own `applyMutation`, and their fields stay ciphertext, which is all a link needs of them.
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
let clock = 1_900_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });

describe('the store of linked cards, version 7', () => {
  it('is given to a database of version 6, which keeps everything it has, with the indexes a list’s screens, a card’s forgetting and a household’s use', async () => {
    const { openDB, deleteDB } = await import('idb');
    const name = `shopper-v6-${crypto.randomUUID()}`;
    const old = await openDB(name, 6, {
      upgrade(db) {
        db.createObjectStore('household', { keyPath: 'id' });
        db.createObjectStore('card', { keyPath: 'id' }).createIndex('byHousehold', 'householdId');
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
    await old.put('card', { id: 'k1', householdId: 'h1' });
    old.close();
    const upgraded = await openLocal('', name);
    expect(upgraded.version).toBe(LOCAL_VERSION);
    expect(LOCAL_VERSION).toBeGreaterThanOrEqual(7);
    expect((await upgraded.get('household', 'h1'))?.cursor).toBe(9);
    expect(await upgraded.count('card')).toBe(1);
    await upgraded.put('list_card', {
      id: 'x1',
      householdId: 'h1',
      listId: 'l1',
      cardId: 'k1',
      deletedAt: null,
      createdAt: 1,
      seq: 1,
    });
    expect(await upgraded.getAllFromIndex('list_card', 'byHousehold', 'h1')).toHaveLength(1);
    expect(await upgraded.getAllFromIndex('list_card', 'byList', 'l1')).toHaveLength(1);
    expect(await upgraded.getAllFromIndex('list_card', 'byCard', 'k1')).toHaveLength(1);
    upgraded.close();
    await deleteDB(name);
  });
});

describe('the actions on linked cards', () => {
  const list = crypto.randomUUID();
  const card = crypto.randomUUID();
  const row = (over: Partial<Parameters<typeof unlinkCard>[1]> = {}) => ({
    id: listCardId(list, card),
    householdId: 'h',
    listId: list,
    cardId: card,
    deletedAt: null,
    createdAt: 1,
    seq: 1,
    ...over,
  });

  it('link a card with the id of the pair, and the same card again is the same link', () => {
    const made = linkCard(env(), { householdId: 'h', listId: list, cardId: card });
    expect(made?.changes).toEqual([
      {
        table: 'list_card',
        id: listCardId(list, card),
        create: true,
        fields: { listId: list, cardId: card, deletedAt: null, createdAt: expect.any(Number) },
      },
    ]);
    // Linked already: nothing to do. Unlinked before: the same row, restored.
    expect(
      linkCard(env(), { householdId: 'h', listId: list, cardId: card, existing: row() }),
    ).toBeNull();
    expect(
      linkCard(env(), {
        householdId: 'h',
        listId: list,
        cardId: card,
        existing: row({ deletedAt: 5 }),
      })?.changes,
    ).toEqual([{ table: 'list_card', id: listCardId(list, card), fields: { deletedAt: null } }]);
  });

  it('take a card off a list by dating the link, and have nothing to do for one that is off', () => {
    const made = unlinkCard(env(), row());
    expect(made?.changes).toEqual([
      { table: 'list_card', id: listCardId(list, card), fields: { deletedAt: expect.any(Number) } },
    ]);
    expect(unlinkCard(env(), row({ deletedAt: 3 }))).toBeNull();
  });

  it('are offered to a list’s Admin only', () => {
    expect([canLink('admin'), canLink('member'), canLink(undefined)]).toEqual([true, false, false]);
  });
});

describe(`linked cards on devices (${leg})`, () => {
  let ada: Someone;
  let mia: Someone;
  let heidi: Someone;
  let grace: Someone;
  let group: Keyring;
  let shared = '';
  let other = '';
  let hardware = '';
  const send = (who: Someone, changes: Mutation['changes'][number][]) =>
    applyMutation(deps(), who.accountId, {
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes,
    });
  const make = async (card: string, position: string) => {
    const ring = await deriveCardKeyring(group, card);
    const field = (name: string, text: string) =>
      sealField(ring, { list: card, table: 'card', row: card, field: name }, text);
    return {
      table: 'card' as const,
      id: card,
      create: true as const,
      fields: {
        shop: await field('shop', 'Tesco'),
        number: await field('number', '1'),
        kind: await field('kind', 'qr'),
        code: await field('code', 'x'),
        position,
        createdAt: 1,
      },
    };
  };
  const synced = async (who: Someone): Promise<Device> => {
    const made = await device(deps, who);
    await made.client.sync();
    return made;
  };
  const shown = (d: Device, list: string) =>
    d.client.read((db) => cardsOfList(db, list)).then((cards) => cards.map((card) => card.id));
  /** The group's counter stepped, as a join or a leaving does, and the seq it is now: past whatever any device has pulled. */
  const step = async () =>
    Number(
      (
        await dbAll<{ seq: number | string }>(
          database,
          sql`UPDATE ${appTable(database, 'household')} SET seq = seq + 1 WHERE id = ${ada.household} RETURNING seq`,
        )
      )[0]?.seq,
    );

  beforeAll(async () => {
    ada = await somebody(database, 'Ada');
    mia = await somebody(database, 'Mia');
    heidi = await somebody(database, 'Heidi');
    grace = await somebody(database, 'Grace');
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
    );
    group = newKeyring();
    shared = crypto.randomUUID();
    other = crypto.randomUUID();
    hardware = crypto.randomUUID();
    expect((await send(ada, [await make(shared, 'a1'), await make(other, 'a2')])).status).toBe(
      'applied',
    );
    // A second list of Ada's: made as a list is (a ciphertext name bound to it).
    const name = await sealField(
      await deriveCardKeyring(group, hardware),
      { list: hardware, table: 'list', row: hardware, field: 'name' },
      'Hardware',
    );
    expect(
      (
        await send(ada, [
          {
            table: 'list',
            id: hardware,
            create: true,
            fields: { name, position: 'a2', createdAt: 1 },
          },
        ])
      ).status,
    ).toBe('applied');
    // Mia is on Groceries and on the shared card; Heidi on Groceries only; Grace on the shared card only.
    for (const who of [mia, grace])
      await addCardMember(database, {
        household: ada.household,
        card: shared,
        person: who.personId,
        role: 'member',
        seq: 1,
        now: Date.now(),
      });
    await joinList(database, ada.household, ada.list, mia);
    await joinList(database, ada.household, ada.list, heidi);
  });

  it('is made on a device and sent through the real write path, and is read by the people on both the list and the card and no one else', async () => {
    const a = await synced(ada);
    const made = linkCard(env(), { householdId: ada.household, listId: ada.list, cardId: shared });
    expect(made).not.toBeNull();
    if (made) await a.client.commit(made);
    // On Ada's device at once, before the server has answered.
    expect(await shown(a, ada.list)).toEqual([shared]);
    await a.client.sync();
    expect((await a.client.read((db) => db.getAll('list_card'))).map((row) => row.id)).toEqual([
      listCardId(ada.list, shared),
    ]);
    expect(await a.client.read((db) => db.getAll('shadow'))).toEqual([]);
    const m = await synced(mia);
    const h = await synced(heidi);
    const g = await synced(grace);
    expect(await shown(m, ada.list)).toEqual([shared]);
    expect(await h.client.read((db) => db.getAll('list_card'))).toEqual([]);
    expect(await g.client.read((db) => db.getAll('list_card'))).toEqual([]);
    expect(await shown(h, ada.list)).toEqual([]);
    expect(await shown(g, ada.list)).toEqual([]);
    // Mia is not the list's Admin: her change is refused as not found, and the link stands for Ada.
    const hers = await m.client.read((db) => db.getAll('list_card'));
    const off = hers[0] ? unlinkCard(env(), hers[0]) : null;
    expect(off).not.toBeNull();
    if (off) await m.client.commit(off);
    await m.client.sync();
    await a.client.sync();
    expect(await shown(a, ada.list)).toEqual([shared]);
  });

  it('is taken off and put on again as the same link, and the people on both see each', async () => {
    const a = await synced(ada);
    const m = await synced(mia);
    const row = (await a.client.read((db) => db.getAll('list_card')))[0];
    if (!row) throw new Error('no link');
    const off = unlinkCard(env(), row);
    if (off) await a.client.commit(off);
    await a.client.sync();
    await m.client.sync();
    expect(await shown(a, ada.list)).toEqual([]);
    expect(await shown(m, ada.list)).toEqual([]);
    const again = linkCard(env(), {
      householdId: ada.household,
      listId: ada.list,
      cardId: shared,
      existing: (await a.client.read((db) => db.getAll('list_card')))[0],
    });
    if (again) await a.client.commit(again);
    await a.client.sync();
    await m.client.sync();
    expect(await shown(m, ada.list)).toEqual([shared]);
    expect(await m.client.read((db) => db.getAll('list_card'))).toHaveLength(1);
  });

  it('offers a list’s Admin the cards of its group that they are on, and says which are linked', async () => {
    const a = await synced(ada);
    const list = await a.client.read((db) => db.get('list', ada.list));
    if (!list) throw new Error('no list');
    const linkable = await a.client.read((db) => linkableCardsOf(db, list));
    expect(linkable.map((each) => [each.card.id, each.linked])).toEqual([
      [shared, true],
      [other, false],
    ]);
    // A card of another group is not here to offer: Grace has her own group's cards, none of them Ada's list's.
    const g = await synced(grace);
    const hers = (await g.client.read((db) => db.getAll('household'))).find((each) => each.own);
    expect(hers).toBeDefined();
    expect(await g.client.read((db) => cardsOf(db))).toHaveLength(1);
    const there = await g.client.read((db) =>
      linkableCardsOf(db, { id: ada.list, householdId: grace.household }),
    );
    expect(there).toEqual([]);
  });

  it('leaves a device with the card when the person leaves the card, and with the list when they leave the list', async () => {
    // A link of the second list and the shared card, which Mia is on one of; and of Groceries and the other card, which she is on neither of.
    await joinList(database, ada.household, hardware, mia);
    const a = await synced(ada);
    const made = linkCard(env(), { householdId: ada.household, listId: hardware, cardId: shared });
    if (made) await a.client.commit(made);
    await a.client.sync();
    const m = await synced(mia);
    expect(await shown(m, hardware)).toEqual([shared]);
    expect(await shown(m, ada.list)).toEqual([shared]);
    // She leaves the list Hardware: the list goes from her device, and its link with it, while the other link and the card stay.
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'list_member')} SET left_at = 9, seq = ${await step()} WHERE list_id = ${hardware} AND person_id = ${mia.personId}`,
    );
    await m.client.sync();
    expect(await shown(m, hardware)).toEqual([]);
    expect((await m.client.read((db) => db.getAll('list_card'))).map((row) => row.listId)).toEqual([
      ada.list,
    ]);
    // She leaves the card: the card goes, and the link of the list she still is on with it.
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'card_member')} SET left_at = 9, seq = ${await step()} WHERE card_id = ${shared} AND person_id = ${mia.personId}`,
    );
    await m.client.sync();
    expect(await m.client.read((db) => cardsOf(db))).toEqual([]);
    expect(await m.client.read((db) => db.getAll('list_card'))).toEqual([]);
    expect(await shown(m, ada.list)).toEqual([]);
  });

  it('is gone with the group when the person is on nothing of it any more, and a link made after they joined a card is handed to them (a cursor already past it)', async () => {
    const nina = await somebody(database, 'Nina');
    await joinList(database, ada.household, ada.list, nina);
    const n = await synced(nina);
    // The Admin links the other card to Groceries while Nina is on the list and not the card; her device pulled before, and has nothing.
    const a = await synced(ada);
    const made = linkCard(env(), { householdId: ada.household, listId: ada.list, cardId: other });
    if (made) await a.client.commit(made);
    await a.client.sync();
    await n.client.sync();
    expect(await shown(n, ada.list)).toEqual([]);
    // She is put on the card: the card, its people and its links take the join's seq (`stampCard`), and her device, whose cursor is past all of them, is handed the link.
    const seq = await step();
    await addCardMember(database, {
      household: ada.household,
      card: other,
      person: nina.personId,
      role: 'member',
      seq,
      now: Date.now(),
    });
    await stampCard(database, ada.household, other, seq);
    await n.client.sync();
    expect(await shown(n, ada.list)).toEqual([other]);
    // Off the list and the card both: the group's record goes from her device whole, and the link with it.
    const later = await step();
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'list_member')} SET left_at = 9, seq = ${later} WHERE person_id = ${nina.personId}`,
    );
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'card_member')} SET left_at = 9, seq = ${later} WHERE person_id = ${nina.personId}`,
    );
    await n.client.sync();
    expect(
      (await n.client.read((db) => db.getAll('household'))).map((row) => row.id),
    ).not.toContain(ada.household);
    expect(await n.client.read((db) => db.getAll('list_card'))).toEqual([]);
  });

  it('leaves a device with the list that is deleted for good, and with the card that is deleted, for the people who had them', async () => {
    const doomedList = crypto.randomUUID();
    const doomedCard = crypto.randomUUID();
    const name = await sealField(
      await deriveCardKeyring(group, doomedList),
      { list: doomedList, table: 'list', row: doomedList, field: 'name' },
      'Doomed',
    );
    expect(
      (
        await send(ada, [
          await make(doomedCard, 'a8'),
          {
            table: 'list',
            id: doomedList,
            create: true,
            fields: { name, position: 'a8', createdAt: 1 },
          },
        ])
      ).status,
    ).toBe('applied');
    const reader = await somebody(database, 'Reader');
    await joinList(database, ada.household, doomedList, reader);
    await addCardMember(database, {
      household: ada.household,
      card: doomedCard,
      person: reader.personId,
      role: 'member',
      seq: await step(),
      now: Date.now(),
    });
    const a = await synced(ada);
    for (const mutation of [
      linkCard(env(), { householdId: ada.household, listId: doomedList, cardId: doomedCard }),
      linkCard(env(), { householdId: ada.household, listId: doomedList, cardId: shared }),
      linkCard(env(), { householdId: ada.household, listId: ada.list, cardId: doomedCard }),
    ])
      if (mutation) await a.client.commit(mutation);
    await a.client.sync();
    const r = await synced(reader);
    // The reader is on the doomed list and the doomed card: they hold the link between them, and no other (they are on the shared card or on Groceries for neither of the rest).
    expect((await r.client.read((db) => db.getAll('list_card'))).map((row) => row.id)).toEqual([
      listCardId(doomedList, doomedCard),
    ]);
    // The card is deleted by its Admin: the card and its link leave the reader's device.
    const { OPERATIONS } = await import('../households/ops');
    const { callAs } = await import('../access/test-support');
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'card.delete',
          household: ada.household,
          card: doomedCard,
        })
      ).status,
    ).toBe(200);
    await r.client.sync();
    expect(await r.client.read((db) => db.getAll('list_card'))).toEqual([]);
    expect((await r.client.read((db) => cardsOf(db))).map((row) => row.id)).toEqual([]);
    // The list is archived and deleted for good by its Admin: it goes from the reader's device (a tombstone, since nothing but the list's id is left to name it), and a link it had with it.
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'list')} SET archived_at = 1 WHERE id = ${doomedList}`,
    );
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'list.delete',
          household: ada.household,
          list: doomedList,
        })
      ).status,
    ).toBe(200);
    await a.client.sync();
    await r.client.sync();
    expect(await r.client.read((db) => db.getAll('list_card'))).toEqual([]);
    expect(await shown(a, doomedList)).toEqual([]);
    expect(await a.client.read((db) => db.getAll('list_card'))).toSatisfy(
      (rows: { listId: string }[]) => rows.every((row) => row.listId !== doomedList),
    );
  });

  it('shows only the live links of cards the device holds and that are not deleted, in the order the person keeps their cards', async () => {
    const d = await device(deps, ada);
    const card = (id: string, position: string, deletedAt: number | null = null) => ({
      id,
      householdId: 'h',
      shop: id,
      number: '1',
      kind: 'qr' as const,
      code: 'x',
      icon: null,
      color: null,
      holder: null,
      note: null,
      position,
      deletedAt,
      createdAt: 1,
      seq: 1,
    });
    const link = (cardId: string, deletedAt: number | null = null) => ({
      id: `link-${cardId}`,
      householdId: 'h',
      listId: 'l1',
      cardId,
      deletedAt,
      createdAt: 1,
      seq: 1,
    });
    await d.db.put('card', card('b-second', 'a2'));
    await d.db.put('card', card('a-first', 'a1'));
    await d.db.put('card', card('c-deleted', 'a3', 5));
    await d.db.put('card', card('d-unlinked', 'a4'));
    for (const row of [
      link('b-second'),
      link('a-first'),
      link('c-deleted'),
      link('d-unlinked', 7),
      // A link whose card this device does not hold (the account is not on it): no button, and no error.
      link('e-not-here'),
    ])
      await d.db.put('list_card', row);
    expect((await cardsOfList(d.db, 'l1')).map((row) => row.id)).toEqual(['a-first', 'b-second']);
    expect(await cardsOfList(d.db, 'another-list')).toEqual([]);
  });

  it('takes the links of a card named by a tombstone, as the card and its people are', async () => {
    const gone = crypto.randomUUID();
    const reader = await somebody(database, 'Tombreader');
    await joinList(database, ada.household, ada.list, reader);
    await send(ada, [await make(gone, 'a7')]);
    await addCardMember(database, {
      household: ada.household,
      card: gone,
      person: reader.personId,
      role: 'member',
      seq: await step(),
      now: Date.now(),
    });
    const a = await synced(ada);
    const made = linkCard(env(), { householdId: ada.household, listId: ada.list, cardId: gone });
    if (made) await a.client.commit(made);
    await a.client.sync();
    const r = await synced(reader);
    expect((await r.client.read((db) => db.getAll('list_card'))).map((row) => row.cardId)).toEqual([
      gone,
    ]);
    // The card is deleted and a tombstone names it, which is all that tells a device whose list is still hers: the card, its people and its links go from it.
    const seq = await step();
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'tombstone')} (household_id, table_name, id, seq, created_at, list_id, card_id)
          VALUES (${ada.household}, 'card', ${gone}, ${seq}, 1, NULL, ${gone})`,
    );
    await dbRun(database, sql`DELETE FROM ${appTable(database, 'card')} WHERE id = ${gone}`);
    await dbRun(
      database,
      sql`DELETE FROM ${appTable(database, 'list_card')} WHERE card_id = ${gone}`,
    );
    await r.client.sync();
    expect(await r.client.read((db) => db.getAll('list_card'))).toEqual([]);
  });
});
