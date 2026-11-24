import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, joinList, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import { MAX_CARD_CODE_LENGTH, MAX_CARD_NUMBER_LENGTH } from '../cards/kinds';
import { addCardMember, stampCard } from '../cards/members';
import type { Database } from '../db/client';
import { dbAll, dbGet, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { householdsOf } from '../households/households';
import { HOUSEHOLD_TABLES } from '../households/tables';
import {
  FIELD_VALUE,
  type Keyring,
  deriveCardKeyring,
  deriveListKeyring,
  newKeyring,
  openField,
  sealField,
} from '../keys/household';
import type { Limits } from '../limits/config';
import { type ApplyResult, applyMutation } from './apply';
import { pullHousehold } from './pull';

/**
 * A loyalty card on the server (task 24.2, DESIGN.md §7.7, RFC 0007), in a group that has moved: **every field a ciphertext under the card's own keys**, made by the group's own account, its
 * maker its Admin, **changed and deleted by its Admin alone**, read by its people and by **no one else, whatever else they are on in the group**; refused in a group the server still seals,
 * and never held, and a plain value refused in a group that has moved. A person on a card only reaches the group by it and is handed that card, its people and the keys they hold, and nothing
 * else of the group. The marker is a word that must be in no row of any table in plain text.
 */
const { leg } = testTarget();
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
const MARKER = 'MARKERcard9Tesco4242';

let database: Database;
let ada: Someone;
let grace: Someone;
let heidi: Someone;
let lin: Someone;
let group: Keyring;
/** A card both Ada (its Admin) and Grace (a Member, on no list at all) are on, and one of Ada's alone. */
let shared = '';
let alone = '';
const rings = new Map<string, Keyring>();
const deps = (limits: Limits = LIMITS) => ({ database, ring: TEST_RING, limits });
const mutation = (household: string, changes: Mutation['changes'][number][]): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: household,
  changes,
});
const cardRing = async (card: string): Promise<Keyring> => {
  const known = rings.get(card);
  if (known) return known;
  const made = await deriveCardKeyring(group, card);
  rings.set(card, made);
  return made;
};
/** A value for a card, as the device of someone on it makes it: under the card's own keys, bound to the card in the place of a list. */
const cipher = async (card: string, row: string, field: string, text: string) =>
  sealField(await cardRing(card), { list: card, table: 'card', row, field }, text);
type Text = Record<'shop' | 'number' | 'kind' | 'code', string>;
const make = async (
  card: string,
  text: Text = {
    shop: 'Tesco',
    number: '634004024001234567',
    kind: 'ean13',
    code: '5000000000000',
  },
  extra: Record<string, string | number | null> = {},
) => ({
  table: 'card' as const,
  id: card,
  create: true as const,
  fields: {
    shop: await cipher(card, card, 'shop', text.shop),
    number: await cipher(card, card, 'number', text.number),
    kind: await cipher(card, card, 'kind', text.kind),
    code: await cipher(card, card, 'code', text.code),
    position: 'a1',
    createdAt: 1,
    ...extra,
  } as Record<string, string | number | null>,
});
const edit = (id: string, fields: Record<string, string | number | null>) => ({
  table: 'card' as const,
  id,
  fields,
});
const send = (who: Someone, changes: Mutation['changes'][number][], limits?: Limits) =>
  applyMutation(deps(limits), who.accountId, mutation(ada.household, changes));
const applied = (result: ApplyResult) => {
  if (result.status !== 'applied')
    throw new Error(`expected applied, got ${JSON.stringify(result)}`);
  return result;
};
const refusal = (result: ApplyResult) =>
  result.status === 'refused' ? result.reason : `not refused: ${result.status}`;
const pull = (who: Someone) => pullHousehold(database, TEST_RING, who.accountId, ada.household, 0);
const ids = (rows: readonly Record<string, unknown>[] | undefined) =>
  (rows ?? []).map((row) => String(row.id)).sort();
const everyRow = async () => {
  const out: unknown[] = [];
  for (const table of [...HOUSEHOLD_TABLES, 'household', 'person'])
    out.push(await dbAll(database, sql`SELECT * FROM ${appTable(database, table)}`));
  return JSON.stringify(out);
};

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  heidi = await somebody(database, 'Heidi');
  lin = await somebody(database, 'Lin');
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
  );
  group = newKeyring();
  shared = crypto.randomUUID();
  alone = crypto.randomUUID();
  applied(await send(ada, [await make(shared)]));
  applied(await send(ada, [await make(alone, undefined, { position: 'a2' })]));
  // Grace is on the shared card and on no list; Heidi is on a list of the group (Groceries) and on no card.
  await addCardMember(database, {
    household: ada.household,
    card: shared,
    person: grace.personId,
    role: 'member',
    seq: 1,
    now: Date.now(),
  });
  await joinList(database, ada.household, ada.list, heidi);
});
afterAll(async () => database.close());

describe(`a card on the server (${leg})`, () => {
  it('is made by the group’s own account with every field a ciphertext, its maker its Admin, and holds nothing readable in any table', async () => {
    const row = await dbGet<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'card')} WHERE id = ${shared}`,
    );
    expect(row?.sealed).toBe('');
    expect(Object.keys(JSON.parse(String(row?.encrypted))).sort()).toEqual([
      'code',
      'kind',
      'number',
      'shop',
    ]);
    const admin = await dbGet<{ role: string }>(
      database,
      sql`SELECT role FROM ${appTable(database, 'card_member')} WHERE card_id = ${shared} AND person_id = ${ada.personId} AND left_at IS NULL`,
    );
    expect(admin?.role).toBe('admin');
    // A plain value sent to a group that has moved is held (the device is told to send it again, encrypted, after its next pull) and **is not written**: the number a person typed reaches no
    // row, so the marker is in none.
    const plain = await send(ada, [
      {
        table: 'card',
        id: crypto.randomUUID(),
        create: true,
        fields: {
          shop: `Shop ${MARKER}`,
          number: MARKER,
          kind: 'ean13',
          code: MARKER,
          position: 'a3',
          createdAt: 1,
        },
      },
    ]);
    expect(plain.status).toBe('held');
    expect(await everyRow()).not.toContain(MARKER);
  });

  it('is refused in a group the server still seals, in either form, and not held', async () => {
    const sealed = lin.household;
    const card = crypto.randomUUID();
    const sentEncrypted = await applyMutation(
      deps(),
      lin.accountId,
      mutation(sealed, [await make(card)]),
    );
    expect(refusal(sentEncrypted)).toBe('unsupported');
    const sentPlain = await applyMutation(
      deps(),
      lin.accountId,
      mutation(sealed, [
        {
          table: 'card',
          id: crypto.randomUUID(),
          create: true,
          fields: {
            shop: 'Tesco',
            number: '1',
            kind: 'qr',
            code: 'x',
            position: 'a1',
            createdAt: 1,
          },
        },
      ]),
    );
    expect(refusal(sentPlain)).toBe('unsupported');
    expect(
      await dbGet(
        database,
        sql`SELECT id FROM ${appTable(database, 'card')} WHERE household_id = ${sealed}`,
      ),
    ).toBeUndefined();
  });

  it('is bound to its own keys: a value made for another card is refused, and one card’s keys open nothing of another’s', async () => {
    const other = crypto.randomUUID();
    const wrong = await make(other);
    wrong.fields.shop = await cipher(shared, other, 'shop', 'Elsewhere');
    expect(refusal(await send(ada, [wrong]))).toBe('not_found');
    expect(
      await dbGet(database, sql`SELECT id FROM ${appTable(database, 'card')} WHERE id = ${other}`),
    ).toBeUndefined();
    // The same value, opened under another card's keys, under the list's keys derived for the card's id, and under the group's own: none opens it.
    const value = await cipher(shared, shared, 'number', 'secret-number');
    const where = { list: shared, table: 'card', row: shared, field: 'number' };
    expect(await openField(await cardRing(shared), where, value)).toBe('secret-number');
    for (const ring of [await cardRing(alone), await deriveListKeyring(group, shared), group])
      expect(await openField(ring, where, value)).toBeUndefined();
  });

  it('is changed and deleted by its Admin alone: a Member of the card, a person on a list only and a stranger are refused as not found', async () => {
    const own = await cipher(shared, shared, 'shop', 'Tesco Clubcard');
    for (const who of [grace, heidi, lin])
      expect(refusal(await send(who, [edit(shared, { shop: own })]))).toBe('not_found');
    expect(refusal(await send(grace, [edit(shared, { deletedAt: 5 })]))).toBe('not_found');
    applied(await send(ada, [edit(shared, { shop: own })]));
    const row = await dbGet<{ encrypted: string }>(
      database,
      sql`SELECT encrypted FROM ${appTable(database, 'card')} WHERE id = ${shared}`,
    );
    expect(JSON.parse(String(row?.encrypted)).shop).toBe(own);
    // Its Admin may put it away, and bring it back.
    applied(await send(ada, [edit(shared, { deletedAt: 5 })]));
    applied(await send(ada, [edit(shared, { deletedAt: null })]));
  });

  it('has its icon, colour and the name on it cleared by its Admin, and the shop, the number, the kind and the code never emptied', async () => {
    const card = crypto.randomUUID();
    applied(await send(ada, [await make(card, undefined, { position: 'a6' })]));
    const set = {
      icon: await cipher(card, card, 'icon', 'cart'),
      color: await cipher(card, card, 'color', '#2563eb'),
      holder: await cipher(card, card, 'holder', 'A. Lovelace'),
      note: await cipher(card, card, 'note', 'Scan at the till'),
    };
    applied(await send(ada, [edit(card, set)]));
    // Cleared again: each is `null`, which the server takes in the only form a card has.
    applied(await send(ada, [edit(card, { icon: null, color: null, holder: null, note: null })]));
    const row = await dbGet<{ encrypted: string }>(
      database,
      sql`SELECT encrypted FROM ${appTable(database, 'card')} WHERE id = ${card}`,
    );
    expect(Object.keys(JSON.parse(String(row?.encrypted))).sort()).toEqual([
      'code',
      'kind',
      'number',
      'shop',
    ]);
    // What a card cannot be without is never emptied, nor said in plain text.
    for (const field of ['shop', 'number', 'kind', 'code'])
      expect(refusal(await send(ada, [edit(card, { [field]: null })]))).toBe('invalid');
    // A plain value for a card is held and never written (the device sends it again, encrypted, after its next pull).
    expect((await send(ada, [edit(card, { holder: 'A. Lovelace' })])).status).toBe('held');
    const after = await dbGet<{ encrypted: string }>(
      database,
      sql`SELECT encrypted FROM ${appTable(database, 'card')} WHERE id = ${card}`,
    );
    expect(String(after?.encrypted)).not.toContain('Lovelace');
  });

  it('takes the longest number and code a card may have, as ciphertext', async () => {
    const card = crypto.randomUUID();
    const longest = {
      shop: 'S'.repeat(100),
      number: '9'.repeat(MAX_CARD_NUMBER_LENGTH),
      kind: 'qr',
      code: 'https://example.com/?'.padEnd(MAX_CARD_CODE_LENGTH, 'x'),
    };
    const made = await make(card, longest, { position: 'a5' });
    for (const value of Object.values(made.fields))
      if (typeof value === 'string' && value.startsWith('e2.'))
        expect(FIELD_VALUE.test(value)).toBe(true);
    applied(await send(ada, [made]));
    const row = await dbGet<{ encrypted: string }>(
      database,
      sql`SELECT encrypted FROM ${appTable(database, 'card')} WHERE id = ${card}`,
    );
    expect(
      await openField(
        await cardRing(card),
        { list: card, table: 'card', row: card, field: 'code' },
        JSON.parse(String(row?.encrypted)).code,
      ),
    ).toBe(longest.code);
  });

  it('is made by the group’s own account alone: someone on a card or a list of it makes none there', async () => {
    for (const who of [grace, heidi, lin]) {
      const card = crypto.randomUUID();
      expect(refusal(await send(who, [await make(card)]))).toBe('not_found');
    }
  });

  it('counts against the person’s limit, said in a sentence', async () => {
    const result = await send(
      ada,
      [await make(crypto.randomUUID(), undefined, { position: 'a9' })],
      { ...LIMITS, accountCards: 2 },
    );
    expect(result.status).toBe('refused');
    expect(result.status === 'refused' ? result.reason : '').toBe('limit');
    expect(result.status === 'refused' ? result.sentence : '').toBe(
      'You can have at most 2 cards, and you have them all.',
    );
  });
});

describe(`who is handed a card (${leg})`, () => {
  it('gives its people the card and its people, and the group’s Admin of a card nothing of another', async () => {
    const adas = await pull(ada);
    // Every card of hers (others the tests above made are hers too): both of these, and all of them visible.
    expect(ids(adas?.cards)).toEqual(expect.arrayContaining([alone, shared]));
    expect((adas?.cardMembers ?? []).map((row) => `${row.cardId}:${row.role}`)).toEqual(
      expect.arrayContaining([`${alone}:admin`, `${shared}:admin`, `${shared}:member`]),
    );
    expect(adas?.visibleCards?.slice().sort()).toEqual(ids(adas?.cards));
  });

  it('gives a person on a card only that card, its people and nothing else of the group, and not the other card', async () => {
    const hers = await pull(grace);
    expect(hers).toBeDefined();
    expect(ids(hers?.cards)).toEqual([shared]);
    expect(hers?.visibleCards).toEqual([shared]);
    expect((hers?.cardMembers ?? []).every((row) => row.cardId === shared)).toBe(true);
    expect((hers?.cardMembers ?? []).map((row) => row.role).sort()).toEqual(['admin', 'member']);
    // Nothing of the group's lists, items, products, categories, Inventory, notices of what was deleted or folded, or its keys.
    for (const table of [
      'lists',
      'items',
      'products',
      'categories',
      'inventory',
      'listCategories',
      'members',
      'aliases',
      'tombstones',
    ] as const)
      expect(hers?.[table] ?? [], table).toEqual([]);
    expect(hers?.visibleLists).toEqual([]);
    expect(hers?.encryption.keyring).toBeNull();
    // Her device is told how the group's content travels: it must encrypt, and never send a card in plain text to a group that has moved.
    expect(hers?.encryption.state).toBe('encrypted');
    expect(hers?.encryption.epoch).toBe(1);
    expect(JSON.stringify(hers)).not.toContain(alone);
    // The group is shown to her: it is how her device syncs it.
    expect(
      (await householdsOf(database, TEST_RING, grace.accountId)).map((each) => each.id),
    ).toContain(ada.household);
  });

  it('gives a person on a list and no card, and a stranger, no card: the group’s list is not a card’s people', async () => {
    const theirs = await pull(heidi);
    expect(theirs?.cards ?? []).toEqual([]);
    expect(theirs?.cardMembers ?? []).toEqual([]);
    expect(theirs?.visibleCards).toEqual([]);
    expect(JSON.stringify(theirs)).not.toContain(shared);
    expect(await pull(lin)).toBeUndefined();
    expect(await householdsOf(database, TEST_RING, lin.accountId)).not.toContainEqual(
      expect.objectContaining({ id: ada.household }),
    );
  });

  it('hands a person their own copy of a card’s keys, and only theirs, and only of a card they are on now', async () => {
    for (const [card, person] of [
      [shared, ada],
      [shared, grace],
      [alone, ada],
    ] as const)
      await dbRun(
        database,
        sql`INSERT INTO ${appTable(database, 'card_key')} (card_id, person_id, household_id, epoch, record, created_at)
            VALUES (${card}, ${person.personId}, ${ada.household}, 1, ${`cr1.${person.personId}.${card}`}, 1)`,
      );
    // A card she was on and left keeps her copy of its keys until the server deletes it (with the leave, 24.5): the pull does not hand it back, since she is not on it.
    const wasHers = crypto.randomUUID();
    applied(await send(ada, [await make(wasHers, undefined, { position: 'a7' })]));
    await addCardMember(database, {
      household: ada.household,
      card: wasHers,
      person: grace.personId,
      role: 'member',
      seq: 1,
      now: 1,
    });
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'card_member')} SET left_at = 5 WHERE card_id = ${wasHers} AND person_id = ${grace.personId}`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'card_key')} (card_id, person_id, household_id, epoch, record, created_at)
          VALUES (${wasHers}, ${grace.personId}, ${ada.household}, 1, 'cr1.left', 1)`,
    );
    const hers = await pull(grace);
    expect(hers?.encryption.cards).toEqual({ [shared]: `cr1.${grace.personId}.${shared}` });
    const adas = await pull(ada);
    expect(adas?.encryption.cards).toEqual({
      [shared]: `cr1.${ada.personId}.${shared}`,
      [alone]: `cr1.${ada.personId}.${alone}`,
    });
    expect((await pull(heidi))?.encryption.cards).toEqual({});
  });

  it('tells a card’s people when it is gone, and no one else: a tombstone carries the card', async () => {
    const gone = crypto.randomUUID();
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'tombstone')} (household_id, table_name, id, seq, created_at, list_id, card_id)
          VALUES (${ada.household}, 'card', ${gone}, 1000, 1, NULL, ${shared})`,
    );
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET seq = 1000 WHERE id = ${ada.household}`,
    );
    const seen = async (who: Someone) =>
      ((await pull(who))?.tombstones ?? []).some((each) => each.id === gone);
    expect(await seen(ada)).toBe(true);
    expect(await seen(grace)).toBe(true);
    expect(await seen(heidi)).toBe(false);
  });

  it('stops handing a card to someone who has left it, and keeps handing it to the rest', async () => {
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'card_member')} SET left_at = 5, seq = 2000 WHERE card_id = ${shared} AND person_id = ${grace.personId}`,
    );
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET seq = 2000 WHERE id = ${ada.household}`,
    );
    expect(await pull(grace)).toBeUndefined();
    expect(ids((await pull(ada))?.cards)).toEqual(expect.arrayContaining([alone, shared]));
  });

  it('lets a person on a card only change nothing of the group but cards, and nothing of a card but as its Admin', async () => {
    // Put Grace back on the shared card, as a Member.
    await addCardMember(database, {
      household: ada.household,
      card: shared,
      person: grace.personId,
      role: 'member',
      seq: 3000,
      now: Date.now(),
    });
    const attempt = await send(grace, [
      {
        table: 'list',
        id: ada.list,
        fields: { clearing: 'on_finish' },
      },
    ]);
    expect(refusal(attempt)).toBe('not_found');
    const made = await send(grace, [
      {
        table: 'inventory_item',
        id: crypto.randomUUID(),
        create: true,
        fields: { name: 'x', createdAt: 1, recurring: 0, hidden: 0 },
      },
    ]);
    expect(refusal(made)).toBe('not_found');
  });

  it('hands a card to someone who joins it from a group they have already pulled, though its rows are older than their cursor (a join stamps them)', async () => {
    const late = crypto.randomUUID();
    applied(await send(ada, [await make(late, undefined, { position: 'a8' })]));
    const now = await dbGet<{ seq: number | string }>(
      database,
      sql`SELECT seq FROM ${appTable(database, 'household')} WHERE id = ${ada.household}`,
    );
    const cursor = Number(now?.seq);
    // Heidi has pulled the group up to here, and is on no card of it.
    expect(
      (await pullHousehold(database, TEST_RING, heidi.accountId, ada.household, cursor))?.cards,
    ).toEqual([]);
    // She joins the card: its rows take the join's seq, which is past her cursor, and she is handed the card and its people.
    await addCardMember(database, {
      household: ada.household,
      card: late,
      person: heidi.personId,
      role: 'member',
      seq: cursor + 1,
      now: Date.now(),
    });
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET seq = ${cursor + 1} WHERE id = ${ada.household}`,
    );
    await stampCard(database, ada.household, late, cursor + 1);
    const joined = await pullHousehold(database, TEST_RING, heidi.accountId, ada.household, cursor);
    expect(ids(joined?.cards)).toEqual([late]);
    expect((joined?.cardMembers ?? []).map((row) => row.cardId)).toEqual([late, late]);
  });
});
