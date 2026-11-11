import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NOT_FOUND,
  TEST_RING,
  callAs,
  join,
  leave,
  somebody,
  type Someone,
} from '../access/test-support';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limits } from '../limits/config';
import { membersOf } from './households';
import {
  INVITATION_TTL_MS,
  MAX_LIVE_INVITATIONS,
  TOKEN_PATTERN,
  acceptInvitation,
  createInvitation,
  hashToken,
  liveInvitations,
  previewInvitation,
  revokeInvitation,
} from './invitations';
import { OPERATIONS } from './ops';

const { leg } = testTarget();
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
};
const NOW = 1_800_000_000_000;

let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());

const make = async (by: Someone, household = by.household, now = NOW) => {
  const made = await createInvitation(database, {
    household,
    accountId: by.accountId,
    personId: by.personId,
    now,
  });
  if (!made.ok) throw new Error(made.refused);
  return made;
};
const accept = (who: Someone, token: string, over: Partial<Limits> = {}, now = NOW + 1000) =>
  acceptInvitation(database, TEST_RING, {
    token,
    accountId: who.accountId,
    limits: { ...LIMITS, ...over },
    now,
  });
const rows = (where: ReturnType<typeof sql>) =>
  dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'invitation')} WHERE ${where}`,
  );

describe(`invitations by link (${leg})`, () => {
  it('makes a link whose token is 32 random bytes, stored only as its hash, valid for 14 days', async () => {
    const ada = await somebody(database, 'Ada');
    const made = await make(ada);
    expect(made.token).toMatch(TOKEN_PATTERN);
    expect(made.expiresAt - NOW).toBe(INVITATION_TTL_MS);
    expect(INVITATION_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
    const stored = await rows(sql`id = ${made.id}`);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.token_hash).toBe(hashToken(made.token));
    expect(JSON.stringify(stored)).not.toContain(made.token);
    expect((await make(ada)).token).not.toBe(made.token);
  });

  it('is accepted once: a member is added, the link is used, and a second acceptance finds nothing', async () => {
    const ada = await somebody(database, 'Ada2');
    const grace = await somebody(database, 'Grace2');
    const lin = await somebody(database, 'Lin2');
    const { token } = await make(ada);
    expect(await accept(grace, token)).toEqual({ status: 'joined', household: ada.household });
    const members = await membersOf(database, TEST_RING, ada.household, ada.accountId);
    expect(members?.map((m) => [m.name, m.role])).toEqual([
      ['Ada2', 'admin'],
      ['Grace2', 'member'],
    ]);
    expect(await accept(lin, token)).toEqual({ status: 'invalid' });
    expect(await accept(grace, token)).toEqual({ status: 'invalid' });
    expect(await membersOf(database, TEST_RING, ada.household, ada.accountId)).toHaveLength(2);
    expect((await rows(sql`token_hash = ${hashToken(token)}`))[0]).toMatchObject({
      accepted_by: grace.personId,
    });
  });

  it('shows the same nothing for an unknown, expired, revoked or used link, and the household and inviter for a live one', async () => {
    const ada = await somebody(database, 'Ada3');
    const grace = await somebody(database, 'Grace3');
    const live = await make(ada);
    expect(await previewInvitation(database, TEST_RING, live.token, NOW + 1)).toEqual({
      household: 'Ada3’s lists',
      invitedBy: 'Ada3',
    });
    const expired = await make(ada, ada.household, NOW - INVITATION_TTL_MS - 1);
    const revoked = await make(ada);
    expect(
      await revokeInvitation(database, {
        household: ada.household,
        accountId: ada.accountId,
        personId: ada.personId,
        invitation: revoked.id,
        now: NOW,
      }),
    ).toBe(true);
    const used = await make(ada);
    await accept(grace, used.token);
    const unknown = 'A'.repeat(43);
    for (const token of [expired.token, revoked.token, used.token, unknown, 'short', ''])
      expect(await previewInvitation(database, TEST_RING, token, NOW + 1), token).toBeNull();
    for (const token of [expired.token, revoked.token, unknown, 'short'])
      expect(await accept(grace, token), token).toEqual({ status: 'invalid' });
  });

  it('tells a person already in the household so, changes nothing and leaves the link unused', async () => {
    const ada = await somebody(database, 'Ada4');
    const grace = await somebody(database, 'Grace4');
    await join(database, ada.household, grace);
    const { token } = await make(ada);
    expect(await accept(grace, token)).toEqual({ status: 'already', household: ada.household });
    expect(await membersOf(database, TEST_RING, ada.household, ada.accountId)).toHaveLength(2);
    expect(await previewInvitation(database, TEST_RING, token, NOW + 1)).not.toBeNull();
    // The link is still good for someone else.
    const lin = await somebody(database, 'Lin4');
    expect((await accept(lin, token)).status).toBe('joined');
  });

  it('refuses at the limit of members and at the limit of households, with the limit’s sentence, and leaves the link unused', async () => {
    const ada = await somebody(database, 'Ada5');
    const grace = await somebody(database, 'Grace5');
    const lin = await somebody(database, 'Lin5');
    const { token } = await make(ada);
    const full = await accept(grace, token, { householdMembers: 1 });
    expect(full).toMatchObject({ status: 'refused' });
    expect(full.status === 'refused' && full.message).toContain('at most 1 person');
    const tooMany = await accept(grace, token, { accountHouseholds: 1 });
    expect(tooMany).toMatchObject({ status: 'refused' });
    expect(tooMany.status === 'refused' && tooMany.message).toContain('at most 1 household');
    expect(await membersOf(database, TEST_RING, ada.household, ada.accountId)).toHaveLength(1);
    expect(await previewInvitation(database, TEST_RING, token, NOW + 1)).not.toBeNull();
    expect((await accept(lin, token)).status).toBe('joined');
  });

  it('gives back the same row, as a Member, to someone who left and joins again', async () => {
    const ada = await somebody(database, 'Ada6');
    const grace = await somebody(database, 'Grace6');
    await join(database, ada.household, grace, 'admin');
    await leave(database, ada.household, grace);
    expect((await accept(grace, (await make(ada)).token)).status).toBe('joined');
    const members = await membersOf(database, TEST_RING, ada.household, ada.accountId);
    expect(members?.map((m) => [m.name, m.role])).toEqual([
      ['Ada6', 'admin'],
      ['Grace6', 'member'],
    ]);
    const mine = await dbAll<{ n: number | string }>(
      database,
      sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'member')} WHERE household_id = ${ada.household} AND person_id = ${grace.personId}`,
    );
    expect(Number(mine[0]?.n)).toBe(1);
  });

  it('steps the household’s counter when someone joins, so that devices learn of it', async () => {
    const ada = await somebody(database, 'Ada7');
    const grace = await somebody(database, 'Grace7');
    const seq = async () =>
      Number(
        (
          await dbAll<{ seq: number | string }>(
            database,
            sql`SELECT seq FROM ${appTable(database, 'household')} WHERE id = ${ada.household}`,
          )
        )[0]?.seq,
      );
    const before = await seq();
    await accept(grace, (await make(ada)).token);
    expect(await seq()).toBe(before + 1);
  });

  it('allows at most 20 live links in a household, and a used or revoked one makes room', async () => {
    const ada = await somebody(database, 'Ada8');
    const tokens: { id: string; token: string }[] = [];
    for (let i = 0; i < MAX_LIVE_INVITATIONS; i++) tokens.push(await make(ada));
    const over = await createInvitation(database, {
      household: ada.household,
      accountId: ada.accountId,
      personId: ada.personId,
      now: NOW,
    });
    expect(over).toMatchObject({ ok: false });
    const first = tokens[0];
    if (!first) throw new Error('none');
    await revokeInvitation(database, {
      household: ada.household,
      accountId: ada.accountId,
      personId: ada.personId,
      invitation: first.id,
      now: NOW,
    });
    expect((await make(ada)).token).toBeTruthy();
    // Expired ones are not live and do not count.
    const bob = await somebody(database, 'Bob8');
    for (let i = 0; i < MAX_LIVE_INVITATIONS; i++)
      await make(bob, bob.household, NOW - INVITATION_TTL_MS - 1);
    expect((await make(bob)).token).toBeTruthy();
  });

  it('is revoked by whoever made it or an Admin, and by no other Member or outsider', async () => {
    const ada = await somebody(database, 'Ada9');
    const grace = await somebody(database, 'Grace9');
    const lin = await somebody(database, 'Lin9');
    const eve = await somebody(database, 'Eve9');
    await join(database, ada.household, grace);
    await join(database, ada.household, lin);
    const revoke = (who: Someone, invitation: string) =>
      revokeInvitation(database, {
        household: ada.household,
        accountId: who.accountId,
        personId: who.personId,
        invitation,
        now: NOW,
      });
    const byGrace = await make(grace, ada.household);
    expect(await revoke(lin, byGrace.id)).toBe(false);
    expect(await revoke(eve, byGrace.id)).toBe(false);
    expect(await revoke(grace, byGrace.id)).toBe(true);
    expect(await revoke(grace, byGrace.id)).toBe(false);
    const again = await make(grace, ada.household);
    expect(await revoke(ada, again.id)).toBe(true);
    expect(await previewInvitation(database, TEST_RING, again.token, NOW + 1)).toBeNull();
  });

  it('lists the live links to a member only, saying who made each and who may revoke it', async () => {
    const ada = await somebody(database, 'Ada10');
    const grace = await somebody(database, 'Grace10');
    const eve = await somebody(database, 'Eve10');
    await join(database, ada.household, grace);
    await make(ada);
    await make(grace, ada.household, NOW + 1);
    const asGrace = await liveInvitations(database, TEST_RING, {
      household: ada.household,
      accountId: grace.accountId,
      now: NOW + 1,
    });
    expect(asGrace.map((l) => [l.by, l.canRevoke])).toEqual([
      ['Ada10', false],
      ['Grace10', true],
    ]);
    const asAda = await liveInvitations(database, TEST_RING, {
      household: ada.household,
      accountId: ada.accountId,
      now: NOW + 1,
    });
    expect(asAda.every((l) => l.canRevoke)).toBe(true);
    expect(JSON.stringify(asAda)).not.toContain('token');
    expect(
      await liveInvitations(database, TEST_RING, {
        household: ada.household,
        accountId: eve.accountId,
        now: NOW + 1,
      }),
    ).toEqual([]);
  });
});

describe(`the operations, as a second person (${leg})`, () => {
  it('invite.create is a member’s, returns the path once, and is not found for an outsider', async () => {
    const ada = await somebody(database, 'AdaOp');
    const grace = await somebody(database, 'GraceOp');
    const eve = await somebody(database, 'EveOp');
    await join(database, ada.household, grace);
    const made = await callAs(database, OPERATIONS, grace, {
      op: 'invite.create',
      household: ada.household,
    });
    expect(made.status).toBe(200);
    const result = made.body.result as { path: string; id: string };
    expect(result.path).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(
      await callAs(database, OPERATIONS, eve, { op: 'invite.create', household: ada.household }),
    ).toEqual(NOT_FOUND);
    expect(await rows(sql`household_id = ${ada.household}`)).toHaveLength(1);
  });

  it('invite.revoke by another Member or an outsider is refused or not found, and by the creator or an Admin works', async () => {
    const ada = await somebody(database, 'AdaRv');
    const grace = await somebody(database, 'GraceRv');
    const lin = await somebody(database, 'LinRv');
    const eve = await somebody(database, 'EveRv');
    await join(database, ada.household, grace);
    await join(database, ada.household, lin);
    const made = await callAs(database, OPERATIONS, grace, {
      op: 'invite.create',
      household: ada.household,
    });
    const id = (made.body.result as { id: string }).id;
    const attempt = (who: Someone) =>
      callAs(database, OPERATIONS, who, {
        op: 'invite.revoke',
        household: ada.household,
        invitation: id,
      });
    expect(await attempt(eve)).toEqual(NOT_FOUND);
    expect((await attempt(lin)).status).toBe(409);
    expect((await rows(sql`id = ${id}`))[0]?.revoked_at).toBeNull();
    expect((await attempt(ada)).status).toBe(200);
    expect((await rows(sql`id = ${id}`))[0]?.revoked_at).not.toBeNull();
  });

  it('cannot revoke a link of another household by naming it in one’s own', async () => {
    const ada = await somebody(database, 'AdaX');
    const grace = await somebody(database, 'GraceX');
    const made = await make(grace);
    const reply = await callAs(database, OPERATIONS, ada, {
      op: 'invite.revoke',
      household: ada.household,
      invitation: made.id,
    });
    expect(reply.status).toBe(409);
    expect((await rows(sql`id = ${made.id}`))[0]?.revoked_at).toBeNull();
  });
});
