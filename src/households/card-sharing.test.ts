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
import { memberOf, onCard } from '../access/membership';
import { addCardMember } from '../cards/members';
import type { Database } from '../db/client';
import { dbAll, dbGet, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limits } from '../limits/config';
import { applyMutation } from '../sync/apply';
import { acceptInvitation, previewInvitation } from './invitations';
import { createInvitation } from './invitations';
import { OPERATIONS } from './ops';

/**
 * **Sharing a card** (task 24.5, DESIGN.md §7.7, §13.5, RFC 0007), on every database: a card's Admin makes a link that carries the card's keys and no other's; whoever accepts is on that card and **nothing
 * else of its group** (no list, no other card); the Admin alone makes, lists and revokes links, and removes people; a Member leaves; a deleted card takes its links and the keys they hold. Every
 * operation is called as a second person (a Member of the card, a person on a list of the same group who is not on the card, a stranger), and **each statement refuses on its own**: the operations
 * are called directly as well as through the door, whose early refusal would let nobody through.
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
const WRAPPED = `ck2.${'A'.repeat(12)}.${'B'.repeat(40)}`;
const RECORD = `cr1.${'C'.repeat(12)}.${'D'.repeat(40)}`;
const NOW = 1_800_000_000_000;

let database: Database;
let ada: Someone;
let grace: Someone;
let heidi: Someone;
let lin: Someone;
let mia: Someone;
let card = '';
const cipher = (id: string) => `e2.1.${id}.${id}.${'A'.repeat(24)}`;

async function makeCard(who: Someone, id: string, over: Partial<Limits> = {}): Promise<string> {
  const made = await applyMutation(
    { database, ring: TEST_RING, limits: { ...LIMITS, ...over } },
    who.accountId,
    {
      mutationId: crypto.randomUUID(),
      householdId: who.household,
      changes: [
        {
          table: 'card',
          id,
          create: true,
          fields: {
            shop: cipher(id),
            number: cipher(id),
            kind: cipher(id),
            code: cipher(id),
            position: 'a1',
            createdAt: 1,
          },
        },
      ],
    },
  );
  expect(made.status).toBe('applied');
  return id;
}

const link = async (who: Someone, id = card, now = NOW) => {
  const made = await callAs(
    database,
    OPERATIONS,
    who,
    { op: 'card.invite.create', household: ada.household, card: id, wrappedKey: WRAPPED },
    now,
  );
  expect(made.status).toBe(200);
  const result = made.body.result as { id: string; path: string; expiresAt: number };
  return { id: result.id, token: result.path.replace('/invite/', '') };
};
const accept = (who: Someone, token: string, over: Partial<Limits> = {}, now = NOW + 1000) =>
  acceptInvitation(database, TEST_RING, {
    token,
    accountId: who.accountId,
    limits: { ...LIMITS, ...over },
    now,
  });
const scalar = async (query: ReturnType<typeof sql>) =>
  Number((await dbGet<{ n: number | string }>(database, query))?.n);
const people = (id = card) =>
  scalar(
    sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'card_member')} WHERE card_id = ${id} AND left_at IS NULL`,
  );
const links = (where: ReturnType<typeof sql>) =>
  dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'invitation')} WHERE ${where}`,
  );
const on = async (who: Someone, id = card) =>
  Boolean(
    (
      await dbGet<{ yes: number | boolean }>(
        database,
        sql`SELECT ${onCard(database, id, who.accountId)} AS yes`,
      )
    )?.yes,
  );
const inGroup = async (who: Someone, household = ada.household) =>
  Boolean(
    (
      await dbGet<{ yes: number | boolean }>(
        database,
        sql`SELECT ${memberOf(database, household, who.accountId)} AS yes`,
      )
    )?.yes,
  );

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  heidi = await somebody(database, 'Heidi');
  lin = await somebody(database, 'Lin');
  mia = await somebody(database, 'Mia');
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
  );
  card = await makeCard(ada, crypto.randomUUID());
  // Grace is a Member of the card (as accepting a link makes her), and the person the Admin's operations must refuse.
  await addCardMember(database, {
    household: ada.household,
    card,
    person: grace.personId,
    role: 'member',
    seq: 1,
    now: 1,
  });
  // Lin is on a list of Ada's group and not on the card: the person a card must not be shown to.
  await joinList(database, ada.household, ada.list, lin);
});
afterAll(async () => database.close());

describe(`making a link to a card (${leg})`, () => {
  it('is its Admin’s alone: the statement refuses a Member, someone on a list of its group and a stranger, and writes nothing', async () => {
    const before = (await links(sql`card_id = ${card}`)).length;
    const { createCardInvite } = await import('./card-ops');
    for (const who of [grace, lin, heidi]) {
      const refused = await createCardInvite.run(
        {
          database,
          ring: TEST_RING,
          accountId: who.accountId,
          personId: who.personId,
          household: ada.household,
          now: NOW,
        },
        { card, wrappedKey: WRAPPED },
      );
      expect(refused.ok).toBe(false);
    }
    expect((await links(sql`card_id = ${card}`)).length).toBe(before);
  });

  it('is refused by the statement for a card that is not the household it names, whoever asks', async () => {
    const { createCardInvite } = await import('./card-ops');
    const before = (await links(sql`card_id = ${card}`)).length;
    // Ada is the card's Admin, and names a household that is not the card's (one that has moved, so that only the card's place in it is what is wrong): the row would carry the wrong group.
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${grace.household}`,
    );
    const refused = await createCardInvite.run(
      {
        database,
        ring: TEST_RING,
        accountId: ada.accountId,
        personId: ada.personId,
        household: grace.household,
        now: NOW,
      },
      { card, wrappedKey: WRAPPED },
    );
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'sealed', epoch = 0 WHERE id = ${grace.household}`,
    );
    expect(refused.ok).toBe(false);
    expect((await links(sql`card_id = ${card}`)).length).toBe(before);
  });

  it('reads as not found through the door for them, for a card that is not the group’s or not there, and is invalid without the card’s keys', async () => {
    for (const who of [lin, heidi, grace])
      expect(
        await callAs(database, OPERATIONS, who, {
          op: 'card.invite.create',
          household: ada.household,
          card,
          wrappedKey: WRAPPED,
        }),
      ).toEqual(NOT_FOUND);
    for (const other of [crypto.randomUUID(), 'not-an-id'])
      expect(
        await callAs(database, OPERATIONS, ada, {
          op: 'card.invite.create',
          household: ada.household,
          card: other,
          wrappedKey: WRAPPED,
        }),
      ).toEqual(NOT_FOUND);
    expect(
      await callAs(database, OPERATIONS, ada, {
        op: 'card.invite.create',
        household: grace.household,
        card,
        wrappedKey: WRAPPED,
      }),
    ).toEqual(NOT_FOUND);
    // A link to a card carries its keys, under the prefix that says so: none, or a list's (`lk2.`), is not one.
    for (const wrappedKey of [undefined, `lk2.${'A'.repeat(12)}.${'B'.repeat(40)}`, 'ck2.x'])
      expect(
        (
          await callAs(database, OPERATIONS, ada, {
            op: 'card.invite.create',
            household: ada.household,
            card,
            ...(wrappedKey ? { wrappedKey } : {}),
          })
        ).status,
      ).toBe(400);
  });

  it('stores only the hash of the token and the card’s wrapped keys, and shows the token once', async () => {
    const made = await link(ada);
    expect(made.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = await links(sql`id = ${made.id}`);
    expect(row).toMatchObject({
      card_id: card,
      list_id: null,
      household_id: ada.household,
      created_by: ada.personId,
      wrapped_key: WRAPPED,
    });
    expect(JSON.stringify(row)).not.toContain(made.token);
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is refused for a card of a group that has not moved, and past twenty waiting links', async () => {
    const sealed = await somebody(database, 'Sealed');
    const there = crypto.randomUUID();
    // A card is never kept in a group the server seals, so the row is put there as the statement would have to meet it.
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'card')} (id, household_id, position, created_at, seq, fseq) VALUES (${there}, ${sealed.household}, 'a1', 1, 1, '{}')`,
    );
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'card_member')} (id, household_id, card_id, person_id, role, joined_at, left_at, seq) VALUES (${crypto.randomUUID()}, ${sealed.household}, ${there}, ${sealed.personId}, 'admin', 1, NULL, 1)`,
    );
    const refused = await callAs(database, OPERATIONS, sealed, {
      op: 'card.invite.create',
      household: sealed.household,
      card: there,
      wrappedKey: WRAPPED,
    });
    expect(refused.status).toBe(409);
    expect(await links(sql`card_id = ${there}`)).toEqual([]);

    const crowded = await makeCard(ada, crypto.randomUUID());
    for (let i = 0; i < 20; i += 1) await link(ada, crowded);
    const over = await callAs(
      database,
      OPERATIONS,
      ada,
      { op: 'card.invite.create', household: ada.household, card: crowded, wrappedKey: WRAPPED },
      NOW,
    );
    expect(over.status).toBe(409);
    expect(over.body.message).toContain('20 links waiting');
  });
});

describe(`the page and the door for a link to a card (${leg})`, () => {
  it('tells who invited and that it is a card, and nothing else; a dead link tells nothing', async () => {
    const made = await link(ada);
    expect(await previewInvitation(database, TEST_RING, made.token, NOW + 1)).toEqual({
      kind: 'card',
      invitedBy: 'Ada',
      encrypted: true,
    });
    // A link to a list says it is one.
    const listLink = await createInvitation(database, {
      household: ada.household,
      list: ada.list,
      accountId: ada.accountId,
      personId: ada.personId,
      now: NOW,
      wrappedKey: 'lk2.a.b',
    });
    if (!listLink.ok) throw new Error(listLink.refused);
    expect((await previewInvitation(database, TEST_RING, listLink.token, NOW + 1))?.kind).toBe(
      'list',
    );
    expect(
      await previewInvitation(database, TEST_RING, made.token, NOW + 15 * 86_400_000),
    ).toBeNull();
  });

  it('puts the person on that card and on nothing else of its group, gives the card’s keys once, and uses the link up', async () => {
    const made = await link(ada);
    const listsBefore = await scalar(
      sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'list_member')} WHERE person_id = ${mia.personId}`,
    );
    expect(await accept(mia, made.token)).toEqual({
      status: 'joined',
      household: ada.household,
      card,
      person: mia.personId,
      wrappedKey: WRAPPED,
    });
    expect(await on(mia)).toBe(true);
    // Nothing but the card: not a list, not the group, not another card.
    expect(
      await scalar(
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'list_member')} WHERE person_id = ${mia.personId}`,
      ),
    ).toBe(listsBefore);
    expect(await inGroup(mia)).toBe(false);
    const [row] = await links(sql`id = ${made.id}`);
    expect(row).toMatchObject({ accepted_by: mia.personId, wrapped_key: null });
    // The card, its people and its records are stamped at the join's `seq`, so that a device whose cursor is past them pulls them.
    const seq = await scalar(
      sql`SELECT seq AS n FROM ${appTable(database, 'household')} WHERE id = ${ada.household}`,
    );
    expect(
      await scalar(sql`SELECT seq AS n FROM ${appTable(database, 'card')} WHERE id = ${card}`),
    ).toBe(seq);
    expect(
      await scalar(
        sql`SELECT seq AS n FROM ${appTable(database, 'card_member')} WHERE card_id = ${card} AND person_id = ${mia.personId}`,
      ),
    ).toBe(seq);
    const other = await makeCard(ada, crypto.randomUUID());
    expect(await on(mia, other)).toBe(false);
    expect(await accept(heidi, made.token)).toEqual({ status: 'invalid' });
    expect(await on(heidi)).toBe(false);
  });

  it('says a person already on the card is, changes nothing, and leaves the link unused (the Admin keeps their role)', async () => {
    const made = await link(ada);
    expect(await accept(grace, made.token)).toEqual({
      status: 'already',
      household: ada.household,
      card,
    });
    expect(await accept(ada, made.token)).toEqual({
      status: 'already',
      household: ada.household,
      card,
    });
    expect(
      (
        await dbGet<{ role: string }>(
          database,
          sql`SELECT role FROM ${appTable(database, 'card_member')} WHERE card_id = ${card} AND person_id = ${ada.personId}`,
        )
      )?.role,
    ).toBe('admin');
    const [row] = await links(sql`id = ${made.id}`);
    expect(row).toMatchObject({ accepted_at: null, wrapped_key: WRAPPED });
  });

  it('refuses a link past the card’s people or the account’s cards, in the statement, and leaves the link good', async () => {
    const small = await makeCard(ada, crypto.randomUUID());
    const made = await link(ada, small);
    // Two people on a card at most: Ada is one, Lin the other, and Heidi is refused.
    expect((await accept(lin, made.token, { householdMembers: 2 })).status).toBe('joined');
    const second = await link(ada, small);
    const full = await accept(heidi, second.token, { householdMembers: 2 });
    expect(full).toEqual({
      status: 'refused',
      message: 'A card can be shared with at most 2 people, and this one has them all.',
    });
    expect(await on(heidi, small)).toBe(false);
    expect((await links(sql`id = ${second.id}`))[0]).toMatchObject({ accepted_at: null });
    // The cards an account is on, its own included: Grace is on one, and one is all she may have.
    const another = await makeCard(ada, crypto.randomUUID());
    const third = await link(ada, another);
    expect(await accept(grace, third.token, { accountCards: 1 })).toEqual({
      status: 'refused',
      message: 'You can have at most 1 card, and you have them all.',
    });
    expect(await on(grace, another)).toBe(false);
    expect((await links(sql`id = ${third.id}`))[0]).toMatchObject({ accepted_at: null });
  });

  it('is dead once revoked, once expired and once the card is gone', async () => {
    const revoked = await link(ada);
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'card.invite.revoke',
          household: ada.household,
          card,
          invitation: revoked.id,
        })
      ).status,
    ).toBe(200);
    expect(await accept(heidi, revoked.token)).toEqual({ status: 'invalid' });
    expect((await links(sql`id = ${revoked.id}`))[0]).toMatchObject({ wrapped_key: null });
    const stale = await link(ada, card, NOW);
    expect(await accept(heidi, stale.token, {}, NOW + 15 * 86_400_000)).toEqual({
      status: 'invalid',
    });
    expect(await on(heidi)).toBe(false);
  });
});

describe(`a card's links, read and revoked (${leg})`, () => {
  it('are its Admin’s to list and revoke: others read as not found, and a list’s links are not a card’s', async () => {
    const made = await link(ada);
    const listed = await callAs(database, OPERATIONS, ada, {
      op: 'card.invite.list',
      household: ada.household,
      card,
    });
    expect(listed.status).toBe(200);
    const shown = listed.body.result as { id: string; by: string; canRevoke: boolean }[];
    expect(shown.find((each) => each.id === made.id)).toMatchObject({
      by: 'Ada',
      canRevoke: true,
    });
    // Never the token or its hash.
    expect(JSON.stringify(listed.body)).not.toContain(made.token);
    expect(JSON.stringify(listed.body)).not.toContain('token_hash');
    for (const who of [grace, lin, heidi]) {
      expect(
        await callAs(database, OPERATIONS, who, {
          op: 'card.invite.list',
          household: ada.household,
          card,
        }),
      ).toEqual(NOT_FOUND);
      expect(
        await callAs(database, OPERATIONS, who, {
          op: 'card.invite.revoke',
          household: ada.household,
          card,
          invitation: made.id,
        }),
      ).toEqual(NOT_FOUND);
    }
    // The list's own listing never shows a card's links.
    const ofList = await callAs(database, OPERATIONS, ada, {
      op: 'invite.list',
      household: ada.household,
      list: ada.list,
    });
    expect((ofList.body.result as { id: string }[]).some((each) => each.id === made.id)).toBe(
      false,
    );
    // The statements refuse on their own for someone who is not the Admin: a Member's revoking changes nothing, and their listing is empty.
    const { revokeCardInvite } = await import('./card-ops');
    const { liveCardInvitations } = await import('./card-invitations');
    const asGrace = {
      database,
      ring: TEST_RING,
      accountId: grace.accountId,
      personId: grace.personId,
      household: ada.household,
      now: NOW,
    };
    expect((await revokeCardInvite.run(asGrace, { card, invitation: made.id })).ok).toBe(false);
    expect((await links(sql`id = ${made.id}`))[0]).toMatchObject({ revoked_at: null });
    expect(
      await liveCardInvitations(database, TEST_RING, {
        household: ada.household,
        card,
        accountId: grace.accountId,
        now: NOW,
      }),
    ).toEqual([]);
    // Revoking a link of another card, or one that is gone, is refused by the statement.
    const other = await makeCard(ada, crypto.randomUUID());
    const refused = await callAs(database, OPERATIONS, ada, {
      op: 'card.invite.revoke',
      household: ada.household,
      card: other,
      invitation: made.id,
    });
    expect(refused.status).toBe(409);
    expect((await links(sql`id = ${made.id}`))[0]).toMatchObject({ revoked_at: null });
  });
});

describe(`keeping the card's keys (${leg})`, () => {
  it('writes the person’s own copy for a card they are on, replaces it, and refuses everyone else in the statement', async () => {
    const { keepCardKeys } = await import('../keys/server/key-ops');
    const ctx = (who: Someone, household = ada.household) => ({
      database,
      ring: TEST_RING,
      accountId: who.accountId,
      personId: who.personId,
      household,
      now: NOW,
    });
    const copies = (who: Someone) =>
      scalar(
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'card_key')} WHERE card_id = ${card} AND person_id = ${who.personId}`,
      );
    expect((await keepCardKeys.run(ctx(grace), { card, record: RECORD })).ok).toBe(true);
    expect(await copies(grace)).toBe(1);
    const next = `cr1.${'E'.repeat(12)}.${'F'.repeat(40)}`;
    expect((await keepCardKeys.run(ctx(grace), { card, record: next })).ok).toBe(true);
    expect(
      (
        await dbGet<{ record: string }>(
          database,
          sql`SELECT record FROM ${appTable(database, 'card_key')} WHERE card_id = ${card} AND person_id = ${grace.personId}`,
        )
      )?.record,
    ).toBe(next);
    // A card of another group named with a household the person is in (and that has moved): the card is not that group's.
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${grace.household}`,
    );
    expect((await keepCardKeys.run(ctx(grace, grace.household), { card, record: RECORD })).ok).toBe(
      false,
    );
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'sealed', epoch = 0 WHERE id = ${grace.household}`,
    );
    // Not on the card (a list's person, a stranger), a card of another group, and a card that is not there.
    for (const who of [lin, heidi]) {
      expect((await keepCardKeys.run(ctx(who), { card, record: RECORD })).ok).toBe(false);
      expect(await copies(who)).toBe(0);
    }
    expect((await keepCardKeys.run(ctx(grace, grace.household), { card, record: RECORD })).ok).toBe(
      false,
    );
    expect(
      (await keepCardKeys.run(ctx(grace), { card: crypto.randomUUID(), record: RECORD })).ok,
    ).toBe(false);
    // Through the door: a stranger and a list's person read as not found; a record that is not a card's (a list's `lr1.`) is invalid.
    for (const who of [lin, heidi])
      expect(
        await callAs(database, OPERATIONS, who, {
          op: 'card.key.mine',
          household: ada.household,
          card,
          record: RECORD,
        }),
      ).toEqual(NOT_FOUND);
    expect(
      (
        await callAs(database, OPERATIONS, grace, {
          op: 'card.key.mine',
          household: ada.household,
          card,
          record: `lr1.${'C'.repeat(12)}.${'D'.repeat(40)}`,
        })
      ).status,
    ).toBe(400);
  });
});

describe(`leaving a card and removing someone from it (${leg})`, () => {
  it('lets a Member leave, which steps the group, ends the row, deletes their keys, and lets them join again as a Member', async () => {
    const mine = await makeCard(ada, crypto.randomUUID());
    const first = await link(ada, mine);
    expect((await accept(grace, first.token)).status).toBe('joined');
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'card_key')} (card_id, person_id, household_id, epoch, record, created_at)
          VALUES (${mine}, ${grace.personId}, ${ada.household}, 1, ${RECORD}, 1)`,
    );
    // A link she made that is still waiting stops with her membership (a link does not outlive whoever sent it).
    const hers = await link(ada, mine);
    await dbRun(
      database,
      sql`UPDATE ${appTable(database, 'invitation')} SET created_by = ${grace.personId} WHERE id = ${hers.id}`,
    );
    const seq = () =>
      scalar(
        sql`SELECT seq AS n FROM ${appTable(database, 'household')} WHERE id = ${ada.household}`,
      );
    const before = await seq();
    // Not for a stranger, nor for someone on a list of the group.
    for (const who of [lin, heidi])
      expect(
        await callAs(database, OPERATIONS, who, {
          op: 'card.member.leave',
          household: ada.household,
          card: mine,
        }),
      ).toEqual(NOT_FOUND);
    expect(await seq()).toBe(before);
    const left = await callAs(database, OPERATIONS, grace, {
      op: 'card.member.leave',
      household: ada.household,
      card: mine,
    });
    expect(left.status).toBe(200);
    expect(await seq()).toBe(before + 1);
    expect((await links(sql`id = ${hers.id}`))[0]).toMatchObject({ wrapped_key: null });
    expect((await links(sql`id = ${hers.id}`))[0]?.revoked_at).not.toBeNull();
    expect(await on(grace, mine)).toBe(false);
    expect(
      (
        await dbGet<{ left_at: unknown; seq: number | string }>(
          database,
          sql`SELECT left_at, seq FROM ${appTable(database, 'card_member')} WHERE card_id = ${mine} AND person_id = ${grace.personId}`,
        )
      )?.left_at,
    ).not.toBeNull();
    expect(
      await scalar(
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'card_key')} WHERE card_id = ${mine} AND person_id = ${grace.personId}`,
      ),
    ).toBe(0);
    // Said again, it is not hers any more.
    expect(
      await callAs(database, OPERATIONS, grace, {
        op: 'card.member.leave',
        household: ada.household,
        card: mine,
      }),
    ).toEqual(NOT_FOUND);
    // A new link brings her back on the same row, as a Member.
    const again = await link(ada, mine);
    expect((await accept(grace, again.token)).status).toBe('joined');
    expect(await people(mine)).toBe(2);
    expect(
      await scalar(
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'card_member')} WHERE card_id = ${mine} AND person_id = ${grace.personId}`,
      ),
    ).toBe(1);
  });

  it('never lets its Admin leave, and lets the Admin remove a Member and no one else', async () => {
    const mine = await makeCard(ada, crypto.randomUUID());
    expect((await accept(grace, (await link(ada, mine)).token)).status).toBe('joined');
    expect((await accept(heidi, (await link(ada, mine)).token)).status).toBe('joined');
    const leave = await callAs(database, OPERATIONS, ada, {
      op: 'card.member.leave',
      household: ada.household,
      card: mine,
    });
    expect(leave.status).toBe(409);
    expect(leave.body.message).toContain('Delete it instead');
    // A Member cannot remove anyone, and a list's person cannot either.
    for (const who of [grace, lin])
      expect(
        await callAs(database, OPERATIONS, who, {
          op: 'card.member.remove',
          household: ada.household,
          card: mine,
          person: heidi.personId,
        }),
      ).toEqual(NOT_FOUND);
    expect(await on(heidi, mine)).toBe(true);
    // And the statement refuses on its own for them: calling it as a Member changes nothing.
    const { removeCardMember } = await import('./card-member-ops');
    const asGrace = {
      database,
      ring: TEST_RING,
      accountId: grace.accountId,
      personId: grace.personId,
      household: ada.household,
      now: NOW,
    };
    expect((await removeCardMember.run(asGrace, { card: mine, person: heidi.personId })).ok).toBe(
      false,
    );
    expect(await on(heidi, mine)).toBe(true);
    // The Admin is never the target.
    const self = await callAs(database, OPERATIONS, ada, {
      op: 'card.member.remove',
      household: ada.household,
      card: mine,
      person: ada.personId,
    });
    expect(self.status).toBe(409);
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'card_key')} (card_id, person_id, household_id, epoch, record, created_at)
          VALUES (${mine}, ${heidi.personId}, ${ada.household}, 1, ${RECORD}, 1)`,
    );
    // A link Heidi made would stop with her (a Member makes none, but the statement is the same one that a person's departure uses).
    const removed = await callAs(database, OPERATIONS, ada, {
      op: 'card.member.remove',
      household: ada.household,
      card: mine,
      person: heidi.personId,
    });
    expect(removed.status).toBe(200);
    expect(await on(heidi, mine)).toBe(false);
    expect(await on(grace, mine)).toBe(true);
    expect(
      await scalar(
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'card_key')} WHERE card_id = ${mine} AND person_id = ${heidi.personId}`,
      ),
    ).toBe(0);
    // Someone who is not on it, or already gone, reads as not found to the Admin's statement.
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'card.member.remove',
          household: ada.household,
          card: mine,
          person: heidi.personId,
        })
      ).status,
    ).toBe(409);
  });
});

describe(`deleting a card takes its links and the keys they hold (${leg})`, () => {
  it('deletes every link to it, waiting or used, so that no wrapped key outlives the card', async () => {
    const doomed = await makeCard(ada, crypto.randomUUID());
    const waiting = await link(ada, doomed);
    const used = await link(ada, doomed);
    expect((await accept(grace, used.token)).status).toBe('joined');
    expect((await links(sql`card_id = ${doomed}`)).length).toBe(2);
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'card.delete',
          household: ada.household,
          card: doomed,
        })
      ).status,
    ).toBe(200);
    expect(await links(sql`card_id = ${doomed}`)).toEqual([]);
    expect(await accept(heidi, waiting.token)).toEqual({ status: 'invalid' });
    expect(await previewInvitation(database, TEST_RING, waiting.token, NOW + 1)).toBeNull();
  });
});
