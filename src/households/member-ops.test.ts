import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOT_FOUND, TEST_RING, callAs, join, somebody, type Someone } from '../access/test-support';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { householdsOf, membersOf } from './households';
import { acceptInvitation, createInvitation, previewInvitation } from './invitations';
import { OPERATIONS } from './ops';

const { leg } = testTarget();
let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());

const leaves = (who: Someone, household: string) =>
  callAs(database, OPERATIONS, who, { op: 'member.leave', household });
const removes = (who: Someone, household: string, person: Someone) =>
  callAs(database, OPERATIONS, who, {
    op: 'member.remove',
    household,
    person: person.personId,
  });
const seqOf = async (household: string) =>
  Number(
    (
      await dbAll<{ seq: number | string }>(
        database,
        sql`SELECT seq FROM ${appTable(database, 'household')} WHERE id = ${household}`,
      )
    )[0]?.seq,
  );
const memberRow = async (household: string, person: Someone) =>
  (
    await dbAll<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'member')} WHERE household_id = ${household} AND person_id = ${person.personId}`,
    )
  )[0];

describe(`leaving a household (${leg})`, () => {
  it('lets a Member leave: the row stays with left_at, the counter steps, and the household is theirs no more', async () => {
    const ada = await somebody(database, 'Ada');
    const grace = await somebody(database, 'Grace');
    await join(database, ada.household, grace);
    const before = await seqOf(ada.household);
    expect((await leaves(grace, ada.household)).status).toBe(200);
    expect(await seqOf(ada.household)).toBe(before + 1);
    const row = await memberRow(ada.household, grace);
    expect(row?.left_at).not.toBeNull();
    expect(Number(row?.seq)).toBe(before + 1);
    expect((await householdsOf(database, TEST_RING, grace.accountId)).map((h) => h.id)).toEqual([
      grace.household,
    ]);
    const members = await membersOf(database, TEST_RING, ada.household, ada.accountId);
    expect(members?.map((m) => m.name)).toEqual(['Ada']);
    // Having left, they cannot do it again, and the household reads as not found to them.
    expect(await leaves(grace, ada.household)).toEqual(NOT_FOUND);
  });

  it('does not let the only Admin leave, and changes nothing', async () => {
    const ada = await somebody(database, 'Ada2');
    const grace = await somebody(database, 'Grace2');
    await join(database, ada.household, grace);
    const before = await seqOf(ada.household);
    const reply = await leaves(ada, ada.household);
    expect(reply.status).toBe(409);
    expect(String(reply.body.message)).toContain('only Admin');
    expect(await seqOf(ada.household)).toBe(before);
    expect((await memberRow(ada.household, ada))?.left_at).toBeNull();
    // A household of one: its Admin cannot leave it either.
    const solo = await somebody(database, 'Solo');
    expect((await leaves(solo, solo.household)).status).toBe(409);
  });

  it('lets an Admin leave when another Admin is staying', async () => {
    const ada = await somebody(database, 'Ada3');
    const grace = await somebody(database, 'Grace3');
    await join(database, ada.household, grace, 'admin');
    expect((await leaves(ada, ada.household)).status).toBe(200);
    expect((await memberRow(ada.household, ada))?.left_at).not.toBeNull();
    // Now Grace is the only one, and the only Admin.
    expect((await leaves(grace, ada.household)).status).toBe(409);
  });

  it('is not found for someone who was never in the household', async () => {
    const ada = await somebody(database, 'Ada4');
    const eve = await somebody(database, 'Eve4');
    expect(await leaves(eve, ada.household)).toEqual(NOT_FOUND);
    expect((await memberRow(ada.household, ada))?.left_at).toBeNull();
  });

  it('revokes the links a person made when they leave, and leaves other people’s alone', async () => {
    const ada = await somebody(database, 'Ada5');
    const grace = await somebody(database, 'Grace5');
    await join(database, ada.household, grace);
    const make = async (by: Someone) => {
      const made = await createInvitation(database, {
        household: ada.household,
        accountId: by.accountId,
        personId: by.personId,
        now: 1_800_000_000_000,
      });
      if (!made.ok) throw new Error(made.refused);
      return made.token;
    };
    const graces = await make(grace);
    const adas = await make(ada);
    await leaves(grace, ada.household);
    expect(await previewInvitation(database, TEST_RING, graces, 1_800_000_000_001)).toBeNull();
    expect(await previewInvitation(database, TEST_RING, adas, 1_800_000_000_001)).not.toBeNull();
  });

  it('gives the same row back, as a Member, when they accept a link again', async () => {
    const ada = await somebody(database, 'Ada6');
    const grace = await somebody(database, 'Grace6');
    await join(database, ada.household, grace);
    await leaves(grace, ada.household);
    const made = await createInvitation(database, {
      household: ada.household,
      accountId: ada.accountId,
      personId: ada.personId,
      now: 1_800_000_000_000,
    });
    if (!made.ok) throw new Error(made.refused);
    const back = await acceptInvitation(database, TEST_RING, {
      token: made.token,
      accountId: grace.accountId,
      limits: {
        householdMembers: 20,
        accountHouseholds: 20,
        householdLists: 100,
        listOpenItems: 500,
        householdProducts: 5000,
      },
      now: 1_800_000_000_001,
    });
    expect(back.status).toBe('joined');
    expect((await memberRow(ada.household, grace))?.left_at).toBeNull();
  });
});

describe(`removing a member (${leg})`, () => {
  it('lets the Admin remove a Member, as leaving does, and the Member is not told here', async () => {
    const ada = await somebody(database, 'Ada7');
    const grace = await somebody(database, 'Grace7');
    await join(database, ada.household, grace);
    const before = await seqOf(ada.household);
    expect((await removes(ada, ada.household, grace)).status).toBe(200);
    expect(await seqOf(ada.household)).toBe(before + 1);
    expect(Number((await memberRow(ada.household, grace))?.seq)).toBe(before + 1);
    expect((await householdsOf(database, TEST_RING, grace.accountId)).map((h) => h.id)).toEqual([
      grace.household,
    ]);
    // Removing again, or someone who is not in it, is a sentence and changes nothing.
    const again = await removes(ada, ada.household, grace);
    expect(again.status).toBe(409);
    expect(await seqOf(ada.household)).toBe(before + 1);
  });

  it('reads as not found for a Member’s attempt, to remove anyone, themselves included', async () => {
    const ada = await somebody(database, 'Ada8');
    const grace = await somebody(database, 'Grace8');
    const lin = await somebody(database, 'Lin8');
    await join(database, ada.household, grace);
    await join(database, ada.household, lin);
    const before = await seqOf(ada.household);
    expect(await removes(grace, ada.household, lin)).toEqual(NOT_FOUND);
    expect(await removes(grace, ada.household, ada)).toEqual(NOT_FOUND);
    expect(await removes(grace, ada.household, grace)).toEqual(NOT_FOUND);
    expect(await seqOf(ada.household)).toBe(before);
    expect(await membersOf(database, TEST_RING, ada.household, ada.accountId)).toHaveLength(3);
  });

  it('reads as not found for an outsider, and an Admin of another household cannot remove across', async () => {
    const ada = await somebody(database, 'Ada9');
    const grace = await somebody(database, 'Grace9');
    const eve = await somebody(database, 'Eve9');
    await join(database, ada.household, grace);
    expect(await removes(eve, ada.household, grace)).toEqual(NOT_FOUND);
    // Eve is the Admin of her own household and names Grace in it: Grace is not a member there, so nothing is removed from Ada's.
    expect((await removes(eve, eve.household, grace)).status).toBe(409);
    expect((await memberRow(ada.household, grace))?.left_at).toBeNull();
  });

  it('never removes an Admin, even another one', async () => {
    const ada = await somebody(database, 'Ada10');
    const grace = await somebody(database, 'Grace10');
    await join(database, ada.household, grace, 'admin');
    const reply = await removes(ada, ada.household, grace);
    expect(reply.status).toBe(409);
    expect(String(reply.body.message)).toContain('Admin cannot be removed');
    expect((await memberRow(ada.household, grace))?.left_at).toBeNull();
  });

  it('revokes the links the removed person made', async () => {
    const ada = await somebody(database, 'Ada11');
    const grace = await somebody(database, 'Grace11');
    await join(database, ada.household, grace);
    const made = await createInvitation(database, {
      household: ada.household,
      accountId: grace.accountId,
      personId: grace.personId,
      now: 1_800_000_000_000,
    });
    if (!made.ok) throw new Error(made.refused);
    await removes(ada, ada.household, grace);
    expect(await previewInvitation(database, TEST_RING, made.token, 1_800_000_000_001)).toBeNull();
  });
});
