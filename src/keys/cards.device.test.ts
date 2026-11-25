import 'fake-indexeddb/auto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, callAs, somebody, type Someone } from '../access/test-support';
import { changeCard, makeCard } from '../actions/cards';
import type { Env } from '../actions/env';
import { addCardMember, stampCard } from '../cards/members';
import type { Database } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { HOUSEHOLD_TABLES } from '../households/tables';
import { OPERATIONS } from '../households/ops';
import { SyncClient } from '../local/client';
import { type LocalDatabase, deleteLocal, localName, openLocal } from '../local/db';
import { rowListOf } from '../local/row-list';
import { cardMembersOf, cardsOf, failedOf } from '../local/store';
import { type Wire, serverTransport } from '../local/test-support';
import type { EndpointDeps } from '../sync/endpoint';
import {
  deriveCardKeyring,
  deriveListKeyring,
  wrapCardKeyring,
  wrapListKeyring,
} from './household';
import { linkCard } from '../actions/list-cards';
import { cardsOfList } from '../local/list-cards-view';
import { joinList } from '../access/test-support';
import { acceptInvitation } from '../households/invitations';
import { listCardId } from '../cards/links';
import { addPendingCard } from './pending';
import { newLinkSecret, openCardFromLink, wrapCardForLink } from './link';
import { Mover } from './mover';
import { moveHousehold, moveInput, moveManifest } from './server/move';
import { EncryptionMemory, encryptingTransport } from './transport';

/**
 * **Loyalty cards on devices** (task 24.2, DESIGN.md §7.7, RFC 0007), through the device's own transport and the real `Mover` against the server: the owner of a moved group makes a card
 * (the device holds it plain, the transport encrypts every field under the card's own keys, and the server holds nothing readable of it), a person who is on the card and on no list opens
 * it with **their own copy of its keys** alone, only the card's Admin changes it, a device that does not hold the card's keys holds the group and shows nothing until it does, and the
 * Admin's deletion takes the card from every device. The marker is a word that must be in no row of any table.
 */
const { leg } = testTarget();
const MARKER = 'MARKERcard24Tesco4242';
let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());

const opened: LocalDatabase[] = [];
const names: string[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await deleteLocal('', name);
});

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
const appKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const memoryStore = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

/** A device as the page makes one (`react.tsx`): the transport that encrypts and opens, and the one row-to-list lookup. */
async function deviceOf(who: Someone, key: CryptoKey, storage = memoryStore()) {
  const name = localName(`${who.accountId}-${crypto.randomUUID()}`);
  names.push(name);
  const db = await openLocal('', name);
  opened.push(db);
  const wire: Wire = { offline: false, requests: [] };
  const memory = new EncryptionMemory(storage, `k-${crypto.randomUUID()}`);
  const client = new SyncClient({
    db,
    transport: encryptingTransport(
      serverTransport(deps, who, wire),
      { appKey: () => key },
      memory,
      rowListOf(db),
    ),
    now: () => (clock += 1000),
  });
  return { who, db, wire, client, memory, key };
}
type Dev = Awaited<ReturnType<typeof deviceOf>>;

const moveFetch =
  (who: Someone): typeof fetch =>
  async (input, init) => {
    const url = new URL(String(input), 'http://shopper.test');
    if (!init?.method || init.method === 'GET') {
      const manifest = await moveManifest(
        { database, ring: TEST_RING },
        url.searchParams.get('household') ?? '',
        who.accountId,
      );
      return manifest
        ? Response.json({ ok: true, ...manifest })
        : Response.json({ ok: false }, { status: 404 });
    }
    const body: unknown = JSON.parse(String(init.body));
    const parsed = moveInput.safeParse(body);
    const household = (body as { household?: string }).household ?? '';
    if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
    const result = await moveHousehold(
      { database, ring: TEST_RING },
      household,
      who.accountId,
      parsed.data,
    );
    return Response.json(result, {
      status: result.ok ? 200 : result.why === 'not-movable' ? 404 : 409,
    });
  };

/** A person's group moved to device encryption by the real `Mover`, and the device that moved it. */
async function movedDevice(who: Someone, storage = memoryStore()): Promise<Dev> {
  const key = await appKey();
  const dev = await deviceOf(who, key, storage);
  await dev.client.sync();
  expect(await new Mover(dev.memory, moveFetch(who)).run([who.household], key)).toBe(true);
  await dev.client.sync();
  return dev;
}

const cards = (d: Dev) => d.client.read(cardsOf);
const everyRow = async () => {
  const out: unknown[] = [];
  for (const table of [...HOUSEHOLD_TABLES, 'household', 'person'])
    out.push(await dbAll(database, sql`SELECT * FROM ${appTable(database, table)}`));
  return JSON.stringify(out);
};

/**
 * Puts a guest on a card as a join will (24.5): a place on it, the card's rows stamped, and the guest's own copy of its keys under their own app key, as the person who has the group's
 * keyring (the owner's device) derives and wraps them.
 */
async function giveCard(owner: Dev, card: string, guest: Dev, withKeys = true) {
  await addCardMember(database, {
    household: owner.who.household,
    card,
    person: guest.who.personId,
    role: 'member',
    seq: 0,
    now: Date.now(),
  });
  const stepped = await dbAll<{ seq: number | string }>(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET seq = seq + 1 WHERE id = ${owner.who.household} RETURNING seq`,
  );
  await stampCard(database, owner.who.household, card, Number(stepped[0]?.seq));
  if (!withKeys) return;
  const group = await owner.memory.keyring(owner.who.household, owner.key);
  if (!group) throw new Error('no keyring');
  const record = await wrapCardKeyring(guest.key, await deriveCardKeyring(group, card), {
    person: guest.who.personId,
    card,
  });
  await dbRun(
    database,
    sql`INSERT INTO ${appTable(database, 'card_key')} (card_id, person_id, household_id, epoch, record, created_at)
        VALUES (${card}, ${guest.who.personId}, ${owner.who.household}, 1, ${record}, 1)
        ON CONFLICT (card_id, person_id) DO NOTHING`,
  );
}

describe(`a loyalty card on devices (${leg})`, () => {
  it('is made on a device in plain text and held by the server as ciphertext only, opened by another device of the person, with the person as its Admin', async () => {
    const ada = await somebody(database, 'Ada');
    const a = await movedDevice(ada);
    const made = makeCard(env(), {
      householdId: ada.household,
      position: 'a1',
      shop: `Tesco ${MARKER}`,
      number: `${MARKER}634004`,
      kind: 'ean13',
      code: '5000000000000',
      color: '#2563eb',
      note: 'Scan before paying',
    });
    await a.client.commit(made);
    // The device shows what its person typed, at once, with no network.
    expect((await cards(a)).map((row) => row.shop)).toEqual([`Tesco ${MARKER}`]);
    await a.client.sync();
    expect(await failedOf(a.db)).toEqual([]);
    // The server holds a card whose fields are ciphertext, in no table in plain text, and the maker is its Admin.
    const row = (
      await dbAll<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${appTable(database, 'card')} WHERE household_id = ${ada.household}`,
      )
    )[0];
    expect(row?.sealed).toBe('');
    expect(Object.keys(JSON.parse(String(row?.encrypted))).sort()).toEqual([
      'code',
      'color',
      'kind',
      'note',
      'number',
      'shop',
    ]);
    expect(await everyRow()).not.toContain(MARKER);
    // Another device of the same person opens it under the keys it derives, and sees the same.
    const b = await deviceOf(ada, a.key);
    await b.client.sync();
    expect(await cards(b)).toMatchObject([
      {
        shop: `Tesco ${MARKER}`,
        number: `${MARKER}634004`,
        kind: 'ean13',
        code: '5000000000000',
        color: '#2563eb',
        note: 'Scan before paying',
        icon: null,
        holder: null,
      },
    ]);
    expect(
      (await b.client.read((db) => cardMembersOf(db, row?.id as string))).map((m) => [
        m.role,
        m.self,
      ]),
    ).toEqual([['admin', true]]);
  });

  it('is opened by a person on it and on no list, with their own copy of its keys alone; changed by its Admin and not by them; and kept off a device that does not hold its keys', async () => {
    const ada = await somebody(database, 'AdaShare');
    const grace = await somebody(database, 'GraceShare');
    const a = await movedDevice(ada);
    const g = await movedDevice(grace);
    const made = makeCard(env(), {
      householdId: ada.household,
      position: 'a1',
      shop: 'Boots',
      number: '1234',
      kind: 'qr',
      code: 'https://example.com/boots',
    });
    const card = made.changes[0]?.id ?? '';
    await a.client.commit(made);
    await a.client.sync();
    // Grace is on the card and on no list; the server hands her the group and the card, and her copy of its keys is not there yet.
    await giveCard(a, card, g, false);
    await g.client.sync();
    expect(await cards(g)).toEqual([]);
    // Held, not lost: her cursor did not pass the card, so the next pull brings it once the copy is there.
    await giveCard(a, card, g, true);
    await g.client.sync();
    expect(await cards(g)).toMatchObject([
      { id: card, shop: 'Boots', code: 'https://example.com/boots' },
    ]);
    expect(
      (await g.client.read((db) => cardMembersOf(db, card))).map((m) => [m.role, m.self]).sort(),
    ).toEqual([
      ['admin', false],
      ['member', true],
    ]);
    // Her change is refused as not found, and the card is as it was on the server and for Ada.
    const mine = (await cards(g))[0];
    if (!mine) throw new Error('no card');
    const changed = changeCard(env(), mine, { shop: 'Hers' });
    expect(changed).not.toBeNull();
    if (changed) await g.client.commit(changed);
    await g.client.sync();
    expect((await failedOf(g.db)).map((entry) => entry.reason)).toEqual(['not_found']);
    expect((await failedOf(g.db))[0]?.what).toBe('Changed the card Hers');
    await a.client.sync();
    expect((await cards(a))[0]?.shop).toBe('Boots');
    // Its Admin changes it, and clears the note, and Grace's device takes both.
    const admin = (await cards(a))[0];
    if (!admin) throw new Error('no card');
    const edit = changeCard(env(), admin, {
      shop: 'Boots Advantage',
      holder: 'A. Lovelace',
      note: null,
    });
    if (edit) await a.client.commit(edit);
    await a.client.sync();
    await g.client.sync();
    expect(await cards(g)).toMatchObject([
      { shop: 'Boots Advantage', holder: 'A. Lovelace', note: null },
    ]);
    // Nothing of it is in plain text, and nothing of Ada's group beyond the card reached Grace's device.
    expect(await everyRow()).not.toContain('Boots');
    expect(
      await g.client.read((db) => db.getAllFromIndex('list', 'byHousehold', ada.household)),
    ).toEqual([]);
  });

  it('is deleted by its Admin alone, and leaves every device of its people', async () => {
    const ada = await somebody(database, 'AdaDelete');
    const grace = await somebody(database, 'GraceDelete');
    const a = await movedDevice(ada);
    const g = await movedDevice(grace);
    const made = makeCard(env(), {
      householdId: ada.household,
      position: 'a1',
      shop: 'Aldi',
      number: '9',
      kind: 'code128',
      code: 'ABC-9',
    });
    const card = made.changes[0]?.id ?? '';
    await a.client.commit(made);
    await a.client.sync();
    await giveCard(a, card, g);
    await g.client.sync();
    await a.client.sync();
    expect(await cards(g)).toHaveLength(1);
    // A Member of the card, and someone who is not on it, read as not found.
    const stranger = await somebody(database, 'Stranger');
    for (const who of [grace, stranger])
      expect(
        await callAs(database, OPERATIONS, who, {
          op: 'card.delete',
          household: ada.household,
          card,
        }),
      ).toEqual({ status: 404, body: { ok: false, error: 'not_found' } });
    expect(await cards(a)).toHaveLength(1);
    // Its Admin deletes it, with its people and every copy of its keys.
    expect(
      await callAs(database, OPERATIONS, ada, {
        op: 'card.delete',
        household: ada.household,
        card,
      }),
    ).toEqual({ status: 200, body: { ok: true } });
    const left = async (table: string) =>
      (
        await dbAll<{ n: number | string }>(
          database,
          sql`SELECT COUNT(*) AS n FROM ${appTable(database, table)} WHERE card_id = ${card}`,
        )
      )[0]?.n;
    expect(Number(await left('card_member'))).toBe(0);
    expect(Number(await left('card_key'))).toBe(0);
    await a.client.sync();
    await g.client.sync();
    expect(await cards(a)).toEqual([]);
    expect(await cards(g)).toEqual([]);
    // And it is not there to delete again.
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'card.delete',
          household: ada.household,
          card,
        })
      ).status,
    ).toBe(404);
  });
});

/**
 * **Sharing a card, from the link to the removal** (task 24.5, RFC 0007), through the real operations and the devices' own transport: the Admin's device makes the link (the card's keys, wrapped under a
 * secret the server never sees), the guest accepts it, their browser opens the keys from the link and keeps its own copy (`card.key.mine`), their device opens the card **and nothing else of the
 * group**, and the Admin removing them (or their leaving) takes the card, and the group they reached it by, from the device.
 */
const door = (who: Someone, household: string, body: Record<string, unknown>) =>
  callAs(database, OPERATIONS, who, { household, ...body });
const NOT_FOUND = { status: 404, body: { ok: false, error: 'not_found' } };

describe(`sharing a card (${leg})`, () => {
  async function shared(label: string) {
    const ada = await somebody(database, `Ada${label}`);
    const grace = await somebody(database, `Grace${label}`);
    const a = await movedDevice(ada);
    const g = await movedDevice(grace);
    const made = makeCard(env(), {
      householdId: ada.household,
      position: 'a1',
      shop: `Tesco${label}`,
      number: '5901234123457',
      kind: 'ean13',
      code: '5901234123457',
    });
    const card = made.changes[0]?.id ?? '';
    await a.client.commit(made);
    await a.client.sync();
    return { ada, grace, a, g, card };
  }

  /** Ada's browser makes the link (`CardShareDialog`), Grace's accepts it and keeps its keys (`AcceptInvite`): what a person does, in the order they do it. */
  async function join(ada: Dev, grace: Dev, card: string, keep = true) {
    const secret = newLinkSecret();
    const group = await ada.memory.keyring(ada.who.household, ada.key);
    const ring = await ada.memory.cardKeyring(ada.who.household, card, ada.key);
    if (!group || !ring) throw new Error('no keys');
    const link = await door(ada.who, ada.who.household, {
      op: 'card.invite.create',
      card,
      wrappedKey: await wrapCardForLink(ring, secret, card),
    });
    expect(link.status).toBe(200);
    const token = String((link.body.result as { path: string }).path).replace('/invite/', '');
    const accepted = await acceptInvitation(database, TEST_RING, {
      token,
      accountId: grace.who.accountId,
      limits: deps().limits,
      now: Date.now(),
    });
    if (accepted.status !== 'joined' || !('card' in accepted)) throw new Error('not joined');
    expect(accepted.card).toBe(card);
    const given = await openCardFromLink(accepted.wrappedKey ?? '', secret, card);
    if (!given) throw new Error('the link did not open');
    const record = await wrapCardKeyring(grace.key, given, { person: accepted.person, card });
    if (keep)
      expect(
        (await door(grace.who, ada.who.household, { op: 'card.key.mine', card, record })).status,
      ).toBe(200);
    return { record, person: accepted.person };
  }

  it('gives the guest the card and nothing else of the group, opened with the keys the link carried, and takes it from them when they are removed', async () => {
    const { ada, grace, a, g, card } = await shared('Journey');
    await join(a, g, card);
    await g.client.sync();
    expect(await cards(g)).toMatchObject([
      { id: card, shop: 'TescoJourney', number: '5901234123457' },
    ]);
    // Nothing of Ada's group but the card: no list, no item, no product, no category, and the group is not a place of theirs.
    for (const table of ['list', 'product', 'category', 'inventory_item', 'list_category'] as const)
      expect(
        await g.client.read((db) => db.getAllFromIndex(table, 'byHousehold', ada.household)),
      ).toEqual([]);
    expect(await g.client.read((db) => db.getAll('item'))).toEqual([]);
    expect(
      (await g.client.read((db) => db.getAll('household'))).some(
        (each) => each.id === ada.household && each.own,
      ),
    ).toBe(false);
    // The server holds nothing readable of it, and the link's secret was never in a row.
    expect(await everyRow()).not.toContain('TescoJourney');
    // Her own group's rows are still hers.
    expect(
      (await g.client.read((db) => db.getAllFromIndex('list', 'byHousehold', grace.household)))
        .length,
    ).toBeGreaterThan(0);

    // Ada removes her: the card goes from her device, and the group she reached it by with it; her own stays.
    const gone = await door(ada, ada.household, {
      op: 'card.member.remove',
      card,
      person: grace.personId,
    });
    expect(gone.status).toBe(200);
    await g.client.sync();
    expect(await cards(g)).toEqual([]);
    expect(await g.client.read((db) => cardMembersOf(db, card))).toEqual([]);
    expect((await g.client.read((db) => db.getAll('household'))).map((each) => each.id)).toEqual([
      grace.household,
    ]);
    // Ada still has it, with her alone on it.
    await a.client.sync();
    expect(await cards(a)).toHaveLength(1);
    expect((await a.client.read((db) => cardMembersOf(db, card))).map((m) => m.self)).toEqual([
      true,
    ]);
  });

  it('takes the card from a guest who leaves it, and from the devices of the card’s other people at their next sync', async () => {
    const { ada, grace, a, g, card } = await shared('Leaves');
    await join(a, g, card);
    await g.client.sync();
    expect(await cards(g)).toHaveLength(1);
    expect((await door(grace, ada.household, { op: 'card.member.leave', card })).status).toBe(200);
    await g.client.sync();
    expect(await cards(g)).toEqual([]);
    // Ada's device hears that she left.
    await a.client.sync();
    expect((await a.client.read((db) => cardMembersOf(db, card))).map((m) => m.self)).toEqual([
      true,
    ]);
    // And leaving is not hers again: it reads as not found.
    expect(await door(grace, ada.household, { op: 'card.member.leave', card })).toEqual(NOT_FOUND);
  });

  it('is opened meanwhile from the copy that waits in the browser, when keeping it on the server has not got through', async () => {
    const ada = await somebody(database, 'AdaPending');
    const grace = await somebody(database, 'GracePending');
    const storage = memoryStore();
    const a = await movedDevice(ada);
    const g = await movedDevice(grace, storage);
    const made = makeCard(env(), {
      householdId: ada.household,
      position: 'a1',
      shop: 'Waiting',
      number: '1234',
      kind: 'code128',
      code: '1234',
    });
    const card = made.changes[0]?.id ?? '';
    await a.client.commit(made);
    await a.client.sync();
    // Joined, with the call that keeps her copy not sent: the server has none to hand back, so the group is held and the card shows nothing.
    const { record, person } = await join(a, g, card, false);
    await g.client.sync();
    expect(await cards(g)).toEqual([]);
    // The copy waits in her browser, and a device made after it (the page's next load) opens the card with it.
    addPendingCard(storage, { household: ada.household, card, person, record });
    const later = await deviceOf(grace, g.key, storage);
    await later.client.sync();
    expect(await cards(later)).toMatchObject([{ id: card, shop: 'Waiting' }]);
  });
});

/**
 * **A card linked to a list, through the devices' own transport** (task 24.6, RFC 0007), in a group that has moved: the Admin's device links a card to a list and **sends it with no key to make for it** (a
 * link holds nothing a person wrote, so the transport holds and refuses nothing), and the person who is on the list and the card, whose device opens each under its own keys, is shown the card by the list.
 */
describe(`a card linked to a list (${leg})`, () => {
  it('is sent by a moved group’s device with nothing to encrypt, and shows the card, opened, from the list on a device that is on both', async () => {
    const ada = await somebody(database, 'AdaLink');
    const mia = await somebody(database, 'MiaLink');
    const a = await movedDevice(ada);
    const m = await movedDevice(mia);
    const made = makeCard(env(), {
      householdId: ada.household,
      position: 'a1',
      shop: 'TescoLink',
      number: '5901234123457',
      kind: 'ean13',
      code: '5901234123457',
    });
    const card = made.changes[0]?.id ?? '';
    await a.client.commit(made);
    const linked = linkCard(env(), { householdId: ada.household, listId: ada.list, cardId: card });
    if (linked) await a.client.commit(linked);
    await a.client.sync();
    // Nothing held, refused or left waiting: the change went as it was, in a group that has moved.
    expect(await failedOf(a.db)).toEqual([]);
    expect(await a.db.getAll('outbox')).toEqual([]);
    const rows = await dbAll<{ id: string; sealed: string; encrypted: string }>(
      database,
      sql`SELECT id, sealed, encrypted FROM ${appTable(database, 'list_card')} WHERE household_id = ${ada.household}`,
    );
    expect(rows.map((row) => row.id)).toEqual([listCardId(ada.list, card)]);
    // Mia is on the card (with her own copy of its keys) and on the list (with her own copy of its keys, as a join by a link gives it).
    await giveCard(a, card, m);
    const group = await a.memory.keyring(ada.household, a.key);
    if (!group) throw new Error('no keyring');
    const record = await wrapListKeyring(m.key, await deriveListKeyring(group, ada.list), {
      person: mia.personId,
      list: ada.list,
    });
    await joinList(database, ada.household, ada.list, mia);
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'list_key')} (list_id, person_id, household_id, epoch, record, created_at)
          VALUES (${ada.list}, ${mia.personId}, ${ada.household}, 1, ${record}, 1)`,
    );
    await m.client.sync();
    const shown = await m.client.read((db) => cardsOfList(db, ada.list));
    expect(shown).toMatchObject([{ id: card, shop: 'TescoLink', number: '5901234123457' }]);
    // Nothing the server holds of the link or the card is readable.
    expect(await everyRow()).not.toContain('TescoLink');
  });
});
