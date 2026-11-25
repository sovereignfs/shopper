import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NOT_FOUND,
  TEST_RING,
  callAs,
  joinList,
  somebody,
  type Someone,
} from '../access/test-support';
import type { Mutation } from '../actions/format';
import { listCardId } from '../cards/links';
import { addCardMember, stampCard } from '../cards/members';
import type { Database } from '../db/client';
import { dbAll, dbGet, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { OPERATIONS } from '../households/ops';
import {
  type Keyring,
  deriveCardKeyring,
  deriveListKeyring,
  newKeyring,
  sealField,
} from '../keys/household';
import type { Limits } from '../limits/config';
import { addListMember, stampList } from '../lists/members';
import { type ApplyResult, applyMutation } from './apply';
import { pullHousehold } from './pull';

/**
 * **A card linked to a list** (task 24.6, DESIGN.md §7.7, RFC 0007), on every database: the card for this shop, one tap from Shop mode. A link is **a list and a card of the same group and nothing
 * else**; it is made, unlinked and made again by **the list's Admin who is also on the card**, its id is its pair's, and **it is handed only to the people who are on both**. Every refusal reads as
 * not found: someone on the list and not the card, someone on the card and not the list, a Member of both, an Admin of the list who is not on the card, a card or a list of another group, and an id that is
 * not the pair's. A person who joins the list, or the card, after the link was made is handed it when they join (both orders, with a device that had pulled before).
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

let database: Database;
let ada: Someone;
let grace: Someone;
let heidi: Someone;
let mia: Someone;
let zed: Someone;
let lin: Someone;
let group: Keyring;
let shared = '';
let other = '';
let hardware = '';
const deps = () => ({ database, ring: TEST_RING, limits: LIMITS });
const mutation = (household: string, changes: Mutation['changes'][number][]): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: household,
  changes,
});
const applied = (result: ApplyResult) => {
  if (result.status !== 'applied')
    throw new Error(`expected applied, got ${JSON.stringify(result)}`);
  return result;
};
const refusal = (result: ApplyResult) =>
  result.status === 'refused' ? result.reason : `not refused: ${result.status}`;
const send = (who: Someone, household: string, changes: Mutation['changes'][number][]) =>
  applyMutation(deps(), who.accountId, mutation(household, changes));
const sendA = (who: Someone, changes: Mutation['changes'][number][]) =>
  send(who, ada.household, changes);

const makeCard = async (owner: Someone, ring: Keyring, id: string, position = 'a1') => {
  const cipher = (field: string, text: string) =>
    sealField(ring, { list: id, table: 'card', row: id, field }, text);
  applied(
    await send(owner, owner.household, [
      {
        table: 'card',
        id,
        create: true,
        fields: {
          shop: await cipher('shop', 'Tesco'),
          number: await cipher('number', '1234'),
          kind: await cipher('kind', 'code128'),
          code: await cipher('code', '1234'),
          position,
          createdAt: 1,
        },
      },
    ]),
  );
};
const makeList = async (id: string) => {
  applied(
    await sendA(ada, [
      {
        table: 'list',
        id,
        create: true,
        fields: {
          name: await sealField(
            await deriveListKeyring(group, id),
            { list: id, table: 'list', row: id, field: 'name' },
            'Hardware',
          ),
          position: 'a2',
          createdAt: 1,
        },
      },
    ]),
  );
};
const link = (list: string, card: string, extra: Record<string, string | number | null> = {}) => ({
  table: 'list_card' as const,
  id: listCardId(list, card),
  create: true as const,
  fields: { listId: list, cardId: card, createdAt: 1, ...extra },
});
const pull = (who: Someone, cursor = 0) =>
  pullHousehold(database, TEST_RING, who.accountId, ada.household, cursor);
const rowsOf = () =>
  dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'list_card')} ORDER BY id`,
  );
const linksOf = async (who: Someone, cursor = 0) =>
  ((await pull(who, cursor))?.listCards ?? []).map((row) => String(row.id)).sort();
const clear = () =>
  dbRun(
    database,
    sql`DELETE FROM ${appTable(database, 'list_card')} WHERE household_id = ${ada.household}`,
  );

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  heidi = await somebody(database, 'Heidi');
  mia = await somebody(database, 'Mia');
  zed = await somebody(database, 'Zed');
  lin = await somebody(database, 'Lin');
  for (const who of [ada, grace])
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${who.household}`,
    );
  group = newKeyring();
  shared = crypto.randomUUID();
  other = crypto.randomUUID();
  hardware = crypto.randomUUID();
  await makeCard(ada, await deriveCardKeyring(group, shared), shared);
  await makeCard(ada, await deriveCardKeyring(group, other), other, 'a2');
  await makeList(hardware);
  // Grace is on the shared card and on no list; Heidi is on Groceries and on no card; Mia is on Groceries and on the shared card; Zed is an Admin of Groceries and on no card.
  for (const [who, card] of [
    [grace, shared],
    [mia, shared],
  ] as const)
    await addCardMember(database, {
      household: ada.household,
      card,
      person: who.personId,
      role: 'member',
      seq: 1,
      now: Date.now(),
    });
  await joinList(database, ada.household, ada.list, heidi);
  await joinList(database, ada.household, ada.list, mia);
  await joinList(database, ada.household, ada.list, zed, 'admin');
});
afterAll(async () => database.close());

describe(`the id of a link (${leg})`, () => {
  it('is made from the pair, the same whichever device makes it, and is an id', () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(listCardId(a, b)).toBe(listCardId(a, b));
    expect(listCardId(a, b)).not.toBe(listCardId(a, crypto.randomUUID()));
    expect(listCardId(a, b)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(() => listCardId('nope', b)).toThrow();
  });
});

describe(`linking a card to a list (${leg})`, () => {
  it('is done by the list’s Admin who is on the card: a row of the pair with nothing in it, handed to the people on both and to no one else', async () => {
    applied(await sendA(ada, [link(ada.list, shared)]));
    const [row] = await rowsOf();
    expect(row).toMatchObject({
      id: listCardId(ada.list, shared),
      household_id: ada.household,
      list_id: ada.list,
      card_id: shared,
      deleted_at: null,
    });
    // Mia is on both; Ada is on both. Heidi is on the list and not the card, Grace on the card and not the list, Zed an Admin of the list and not on the card: none is handed it.
    const id = listCardId(ada.list, shared);
    expect(await linksOf(ada)).toEqual([id]);
    expect(await linksOf(mia)).toEqual([id]);
    for (const who of [heidi, grace, zed]) expect(await linksOf(who)).toEqual([]);
    // Mia is on the card and in the group, and not on the list Hardware: a link of that list to the card is Ada's and no one else's.
    applied(await sendA(ada, [link(hardware, shared)]));
    expect(await linksOf(mia)).toEqual([id]);
    expect(await linksOf(ada)).toEqual([id, listCardId(hardware, shared)].sort());
    await dbRun(
      database,
      sql`DELETE FROM ${appTable(database, 'list_card')} WHERE id = ${listCardId(hardware, shared)}`,
    );
    // A stranger is not on the group at all.
    expect(await pull(lin)).toBeUndefined();
  });

  it('is the same link when made twice, and made again after an unlink: one row, and the unlink cleared', async () => {
    const id = listCardId(ada.list, shared);
    applied(await sendA(ada, [link(ada.list, shared)]));
    expect(await rowsOf()).toHaveLength(1);
    // Unlinked, then linked again: the same row, which an unlink did not remove.
    applied(await sendA(ada, [{ table: 'list_card', id, fields: { deletedAt: 5 } }]));
    expect((await rowsOf())[0]).toMatchObject({ deleted_at: 5 });
    expect((await pull(mia))?.listCards?.[0]).toMatchObject({ id, deletedAt: 5 });
    applied(await sendA(ada, [link(ada.list, shared, { deletedAt: null })]));
    expect(await rowsOf()).toHaveLength(1);
    expect((await rowsOf())[0]).toMatchObject({ deleted_at: null });
  });

  it('holds nothing of what a person wrote: no sealed field, and nothing in plain text in any column', async () => {
    const [row] = await rowsOf();
    expect(Object.keys(row ?? {}).sort()).toEqual(
      [
        'card_id',
        'created_at',
        'deleted_at',
        'encrypted',
        'fseq',
        'household_id',
        'id',
        'list_id',
        'sealed',
        'seq',
      ].sort(),
    );
    expect(row?.sealed).toBe('');
    expect(JSON.parse(String(row?.encrypted))).toEqual({});
  });

  it('is refused as not found for everyone else, and writes nothing', async () => {
    await clear();
    const attempts: [string, Someone, Mutation['changes'][number]][] = [
      ['someone on the list and not the card', heidi, link(ada.list, other)],
      ['a Member of both the list and the card', mia, link(ada.list, shared)],
      ['an Admin of the list who is not on the card', zed, link(ada.list, shared)],
      ['someone on the card and on no list', grace, link(hardware, shared)],
    ];
    for (const [what, who, change] of attempts)
      expect(refusal(await sendA(who, [change])), what).toBe('not_found');
    // A stranger is not on the group, and Ada's household named by them is not theirs.
    expect(refusal(await sendA(lin, [link(ada.list, shared)]))).toBe('not_found');
    expect(await rowsOf()).toEqual([]);
  });

  it('is refused for a card of another group, a list of another group, and an id that is not the pair’s', async () => {
    // A card that is Grace's, in Grace's group, which Ada is on: she may see it, and it is not her group's.
    const hers = crypto.randomUUID();
    await makeCard(grace, await deriveCardKeyring(newKeyring(), hers), hers);
    await addCardMember(database, {
      household: grace.household,
      card: hers,
      person: ada.personId,
      role: 'member',
      seq: 1,
      now: Date.now(),
    });
    expect(refusal(await sendA(ada, [link(ada.list, hers)]))).toBe('not_found');
    // Grace's own list, which Ada is not on, in a mutation for Ada's group; and Ada's list in a mutation for Grace's group.
    expect(refusal(await sendA(ada, [link(grace.list, shared)]))).toBe('not_found');
    expect(refusal(await send(ada, grace.household, [link(ada.list, hers)]))).toBe('not_found');
    // Not the pair's id: a random one, and another pair's.
    const random = { ...link(ada.list, shared), id: crypto.randomUUID() };
    expect(refusal(await sendA(ada, [random]))).toBe('not_found');
    const elses = { ...link(ada.list, shared), id: listCardId(ada.list, other) };
    expect(refusal(await sendA(ada, [elses]))).toBe('not_found');
    // A list or a card that is not there, and a list named where a card is.
    expect(refusal(await sendA(ada, [link(ada.list, crypto.randomUUID())]))).toBe('not_found');
    expect(refusal(await sendA(ada, [link(crypto.randomUUID(), shared)]))).toBe('not_found');
    expect(refusal(await sendA(ada, [link(shared, ada.list)]))).toBe('not_found');
    expect(await rowsOf()).toEqual([]);
  });

  it('keeps its pair for good: a link cannot be pointed at another list or card, and an Admin who is not on the card cannot unlink it', async () => {
    const id = listCardId(ada.list, shared);
    applied(await sendA(ada, [link(ada.list, shared)]));
    expect(
      refusal(await sendA(ada, [{ table: 'list_card', id, fields: { listId: hardware } }])),
    ).toBe('not_found');
    expect(refusal(await sendA(ada, [{ table: 'list_card', id, fields: { cardId: other } }]))).toBe(
      'not_found',
    );
    // Someone who may not unlink it: a Member of both, an Admin of the list not on the card, someone on the list only, someone on the card only.
    for (const who of [mia, zed, heidi, grace])
      expect(
        refusal(await sendA(who, [{ table: 'list_card', id, fields: { deletedAt: 9 } }])),
      ).toBe('not_found');
    expect((await rowsOf())[0]).toMatchObject({
      deleted_at: null,
      list_id: ada.list,
      card_id: shared,
    });
  });
});

describe(`a person who joins after the link was made (${leg})`, () => {
  it('is handed it when they join the card, and when they join the list, having pulled before: each order with a link of its own, and the cursor they had', async () => {
    await clear();
    const nina = await somebody(database, 'Nina');
    const owen = await somebody(database, 'Owen');
    // Nina is on the list only and will join the card `other`; Owen is on the card `shared` only and will join the list. Each link is of one of them alone, so that joining the one does not hand over
    // the other's, and each pulls the group first, so that their cursors are past what is there.
    await joinList(database, ada.household, ada.list, nina);
    await addCardMember(database, {
      household: ada.household,
      card: shared,
      person: owen.personId,
      role: 'member',
      seq: 1,
      now: Date.now(),
    });
    applied(await sendA(ada, [link(ada.list, other), link(ada.list, shared)]));
    const ninaPulled = await pull(nina);
    const owenPulled = await pull(owen);
    expect(ninaPulled?.listCards ?? []).toEqual([]);
    expect(owenPulled?.listCards ?? []).toEqual([]);
    const step = async () =>
      Number(
        (
          await dbAll<{ seq: number | string }>(
            database,
            sql`UPDATE ${appTable(database, 'household')} SET seq = seq + 1 WHERE id = ${ada.household} RETURNING seq`,
          )
        )[0]?.seq,
      );
    // Nina joins the card: the card, its people and **its links** are stamped at the join, so her cursor (past all of them) pulls the link.
    let seq = await step();
    await addCardMember(database, {
      household: ada.household,
      card: other,
      person: nina.personId,
      role: 'member',
      seq,
      now: Date.now(),
    });
    await stampCard(database, ada.household, other, seq);
    expect(await linksOf(nina, ninaPulled?.cursor ?? 0)).toEqual([listCardId(ada.list, other)]);
    // Owen joins the list: its rows and **its links** are stamped, and he is handed the link of the card he is on and not the other.
    seq = await step();
    await addListMember(database, {
      household: ada.household,
      list: ada.list,
      person: owen.personId,
      role: 'member',
      seq,
      now: Date.now(),
    });
    await stampList(database, ada.household, ada.list, seq);
    expect(await linksOf(owen, owenPulled?.cursor ?? 0)).toEqual([listCardId(ada.list, shared)]);
  });
});

describe(`a link goes with the list or the card it is of (${leg})`, () => {
  it('is deleted with its card by its Admin, and with its list when the list is deleted for good, and from nowhere else', async () => {
    await clear();
    applied(
      await sendA(ada, [link(ada.list, shared), link(hardware, shared), link(hardware, other)]),
    );
    expect(await rowsOf()).toHaveLength(3);
    // The card goes: its links with it, the other card's link stays.
    const doomed = crypto.randomUUID();
    await makeCard(ada, await deriveCardKeyring(group, doomed), doomed, 'a9');
    applied(await sendA(ada, [link(ada.list, doomed)]));
    expect(await rowsOf()).toHaveLength(4);
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'card.delete',
          household: ada.household,
          card: doomed,
        })
      ).status,
    ).toBe(200);
    expect((await rowsOf()).map((row) => row.card_id).sort()).toEqual(
      [other, shared, shared].sort(),
    );
    // The list goes (archived first, as a list is): its links with it.
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'list')} SET archived_at = 1 WHERE id = ${hardware}`,
    );
    const gone = await callAs(database, OPERATIONS, ada, {
      op: 'list.delete',
      household: ada.household,
      list: hardware,
    });
    expect(gone.status).toBe(200);
    expect((await rowsOf()).map((row) => row.list_id)).toEqual([ada.list]);
    // Not the Admin of the list, or not found: nothing else changed.
    expect(
      await callAs(database, OPERATIONS, heidi, {
        op: 'list.delete',
        household: ada.household,
        list: ada.list,
      }),
    ).toEqual(NOT_FOUND);
    expect(await rowsOf()).toHaveLength(1);
    const left = await dbGet<{ n: number | string }>(
      database,
      sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'list_card')} WHERE card_id = ${doomed}`,
    );
    expect(Number(left?.n)).toBe(0);
  });
});
