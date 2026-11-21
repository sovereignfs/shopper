import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOT_FOUND, TEST_RING, callAs, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import type { Mutation } from '../actions/format';
import { addItem } from '../actions/items';
import { makeList, renameList } from '../actions/lists';
import { list as listRow } from '../actions/test-support';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { householdsOf } from '../households/households';
import { acceptInvitation, createInvitation } from '../households/invitations';
import { OPERATIONS } from '../households/ops';
import type { Limits } from '../limits/config';
import { applyMutation } from '../sync/apply';
import { pullHousehold } from '../sync/pull';
import { adoptListMembers } from './members';

/**
 * **Sharing one list shows that list and nothing more** (RFC 0004): the bug this fixes was that a person invited to one list saw every list of the
 * household. Ada has Groceries and a Hardware store list; Grace is given Groceries by a link, and must find nothing of the Hardware store: not the
 * list, its items, its products, its people, nor a way to change it.
 */
const { leg } = testTarget();
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
};
const env = (): Env => ({ now: 1_800_000_000_000, newId: () => crypto.randomUUID() });

let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());

const send = (who: Someone, mutation: Mutation | null) => {
  if (!mutation) throw new Error('nothing to send');
  return applyMutation({ database, ring: TEST_RING, limits: LIMITS }, who.accountId, mutation);
};

/** Ada with Groceries (shared with Grace by a link) and a Hardware store list with an item on it (shared with nobody). */
async function setUp() {
  const ada = await somebody(database, 'Ada');
  const grace = await somebody(database, 'Grace');
  const made = makeList(env(), {
    householdId: ada.household,
    name: 'Hardware store',
    position: 'a1',
  });
  expect((await send(ada, made)).status).toBe('applied');
  const hardware = listRow({
    id: made.changes[0]?.id ?? '',
    householdId: ada.household,
    name: 'Hardware store',
  });
  const screws = addItem(env(), { list: hardware, name: 'Screws', last: null, by: ada.personId });
  expect((await send(ada, screws)).status).toBe('applied');
  const link = await createInvitation(database, {
    household: ada.household,
    list: ada.list,
    accountId: ada.accountId,
    personId: ada.personId,
    now: Date.now(),
  });
  if (!link.ok) throw new Error(link.refused);
  const joined = await acceptInvitation(database, TEST_RING, {
    token: link.token,
    accountId: grace.accountId,
    limits: LIMITS,
    now: Date.now(),
  });
  expect(joined.status).toBe('joined');
  const screwProduct = screws.changes.find((change) => change.table === 'product')?.id ?? '';
  return { ada, grace, hardware, screwProduct };
}

describe(`one list shared (${leg})`, () => {
  it('gives the person only that list: its items and people, never another list of the group', async () => {
    const { ada, grace, hardware, screwProduct } = await setUp();
    const pull = await pullHousehold(database, TEST_RING, grace.accountId, ada.household, 0);
    expect(pull?.lists.map((row) => row.id)).toEqual([ada.list]);
    expect(pull?.visibleLists).toEqual([ada.list]);
    expect(pull?.items.some((row) => row.listId === hardware.id)).toBe(false);
    expect(pull?.products.some((row) => row.id === screwProduct)).toBe(false);
    expect(pull?.members.every((row) => row.listId === ada.list)).toBe(true);
    // Ada still sees both.
    const own = await pullHousehold(database, TEST_RING, ada.accountId, ada.household, 0);
    expect(own?.lists.map((row) => row.id).sort()).toEqual([ada.list, hardware.id].sort());
  });

  it('refuses a change to the other list, as not found, and changes nothing', async () => {
    const { ada, grace, hardware } = await setUp();
    const rename = renameList(env(), hardware, 'Mine now');
    const renamed = await send(grace, rename);
    expect(renamed.status).toBe('refused');
    const adding = await send(
      grace,
      addItem(env(), { list: hardware, name: 'Nails', last: null, by: grace.personId }),
    );
    expect(adding.status).toBe('refused');
    const items = await dbAll<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'item')} WHERE list_id = ${hardware.id}`,
    );
    expect(items).toHaveLength(1);
    for (const body of [
      { op: 'invite.create', household: ada.household, list: hardware.id },
      { op: 'invite.list', household: ada.household, list: hardware.id },
      { op: 'list.delete', household: ada.household, list: hardware.id },
      { op: 'list.delete', household: ada.household, list: ada.list },
    ])
      expect(await callAs(database, OPERATIONS, grace, body)).toEqual(NOT_FOUND);
  });

  it('forgets the group for the person once they are on none of its lists', async () => {
    const { ada, grace } = await setUp();
    const left = await callAs(database, OPERATIONS, grace, {
      op: 'member.leave',
      household: ada.household,
      list: ada.list,
    });
    expect(left.status).toBe(200);
    expect(await pullHousehold(database, TEST_RING, grace.accountId, ada.household, 0)).toBe(
      undefined,
    );
    expect((await householdsOf(database, TEST_RING, grace.accountId)).map((h) => h.id)).toEqual([
      grace.household,
    ]);
  });
});

describe(`a household from 0.1.0 (${leg})`, () => {
  it('becomes lists of their own: every member keeps every list, and nothing made after is shared', async () => {
    const ada = await somebody(database, 'Ada');
    const grace = await somebody(database, 'Grace');
    // As 0.1.0 left it: Grace a member of Ada's household, nobody on its lists, a link to the household waiting.
    await dbAll(
      database,
      sql`DELETE FROM ${appTable(database, 'list_member')} WHERE household_id = ${ada.household} RETURNING id`,
    );
    await dbAll(
      database,
      sql`INSERT INTO ${appTable(database, 'member')} (id, household_id, person_id, role, joined_at, seq)
          VALUES (${crypto.randomUUID()}, ${ada.household}, ${grace.personId}, 'member', 1, 1) RETURNING id`,
    );
    const invitation = crypto.randomUUID();
    await dbAll(
      database,
      sql`INSERT INTO ${appTable(database, 'invitation')} (id, household_id, token_hash, created_by, created_at, expires_at)
          VALUES (${invitation}, ${ada.household}, ${`hash-${invitation}`}, ${ada.personId}, 1, ${Date.now() + 86_400_000}) RETURNING id`,
    );

    expect(await adoptListMembers(database, Date.now())).toBeGreaterThan(0);
    const on = await dbAll<{ person_id: string; role: string }>(
      database,
      sql`SELECT person_id, role FROM ${appTable(database, 'list_member')} WHERE list_id = ${ada.list} AND left_at IS NULL ORDER BY role`,
    );
    expect(on).toEqual([
      { person_id: ada.personId, role: 'admin' },
      { person_id: grace.personId, role: 'member' },
    ]);
    const graceMember = await dbGet<{ left_at: number | string | null }>(
      database,
      sql`SELECT left_at FROM ${appTable(database, 'member')} WHERE household_id = ${ada.household} AND person_id = ${grace.personId}`,
    );
    expect(graceMember?.left_at).not.toBeNull();
    const link = await dbGet<{ revoked_at: number | string | null }>(
      database,
      sql`SELECT revoked_at FROM ${appTable(database, 'invitation')} WHERE id = ${invitation}`,
    );
    expect(link?.revoked_at).not.toBeNull();
    // Grace still has Groceries; a list Ada makes now is Ada's alone.
    const made = makeList(env(), { householdId: ada.household, name: 'Later', position: 'a2' });
    expect((await send(ada, made)).status).toBe('applied');
    const pull = await pullHousehold(database, TEST_RING, grace.accountId, ada.household, 0);
    expect(pull?.lists.map((row) => row.id)).toEqual([ada.list]);
    // Safe to run again: nothing left to do for this group.
    const again = await dbAll<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'list_member')} WHERE household_id = ${ada.household}`,
    );
    await adoptListMembers(database, Date.now());
    const after = await dbAll<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'list_member')} WHERE household_id = ${ada.household}`,
    );
    expect(after).toHaveLength(again.length);
  });
});
