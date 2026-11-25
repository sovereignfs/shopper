import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOT_FOUND, TEST_RING, callAs, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import type { Mutation } from '../actions/format';
import { addItem } from '../actions/items';
import { archiveList, makeList, renameList } from '../actions/lists';
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
import { personRecords } from '../portability/records';
import { adoptListMembers, adoptProductLists, splitSharedProducts } from './members';

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
  inventoryItems: 5000,
  householdCategories: 100,
  accountCards: 100,
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

  it('refuses the other list’s links, people and export to the person', async () => {
    const { ada, grace, hardware } = await setUp();
    const link = await createInvitation(database, {
      household: ada.household,
      list: hardware.id,
      accountId: ada.accountId,
      personId: ada.personId,
      now: Date.now(),
    });
    if (!link.ok) throw new Error(link.refused);
    for (const body of [
      { op: 'invite.revoke', household: ada.household, list: hardware.id, invitation: link.id },
      { op: 'member.remove', household: ada.household, list: hardware.id, person: ada.personId },
      { op: 'member.leave', household: ada.household, list: hardware.id },
    ])
      expect(await callAs(database, OPERATIONS, grace, body)).toEqual(NOT_FOUND);
    const exported = JSON.stringify(await personRecords(database, TEST_RING, grace.accountId));
    expect(exported).not.toContain(hardware.id);
    expect(exported).toContain(ada.list);
  });

  it('lets nobody join a list by a link once the list is deleted', async () => {
    const ada = await somebody(database, 'Ada');
    const grace = await somebody(database, 'Grace');
    const made = makeList(env(), { householdId: ada.household, name: 'Gone', position: 'a1' });
    expect((await send(ada, made)).status).toBe('applied');
    const gone = listRow({
      id: made.changes[0]?.id ?? '',
      householdId: ada.household,
      name: 'Gone',
    });
    const link = await createInvitation(database, {
      household: ada.household,
      list: gone.id,
      accountId: ada.accountId,
      personId: ada.personId,
      now: Date.now(),
    });
    if (!link.ok) throw new Error(link.refused);
    expect((await send(ada, archiveList(env(), gone))).status).toBe('applied');
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'list.delete',
          household: ada.household,
          list: gone.id,
        })
      ).status,
    ).toBe(200);
    const joined = await acceptInvitation(database, TEST_RING, {
      token: link.token,
      accountId: grace.accountId,
      limits: LIMITS,
      now: Date.now(),
    });
    expect(joined.status).toBe('invalid');
    expect((await householdsOf(database, TEST_RING, grace.accountId)).map((h) => h.id)).toEqual([
      grace.household,
    ]);
  });

  it('never folds an add on a shared list into a product of another list (21.3)', async () => {
    const { ada, grace, screwProduct } = await setUp();
    const groceries = listRow({ id: ada.list, householdId: ada.household, name: 'Groceries' });
    const adding = addItem(env(), {
      list: groceries,
      name: 'Screws',
      last: null,
      by: grace.personId,
    });
    expect((await send(grace, adding)).status).toBe('applied');
    const used = await dbGet<{ product_id: string }>(
      database,
      sql`SELECT product_id FROM ${appTable(database, 'item')} WHERE list_id = ${ada.list}`,
    );
    expect(used?.product_id).not.toBe(screwProduct);
    const pull = await pullHousehold(database, TEST_RING, grace.accountId, ada.household, 0);
    expect(pull?.products.some((row) => row.id === screwProduct)).toBe(false);
  });

  it('refuses an item that names another list’s product, and deletes a list’s catalog with it (21.3)', async () => {
    const { ada, grace, hardware, screwProduct } = await setUp();
    const groceries = listRow({ id: ada.list, householdId: ada.household, name: 'Groceries' });
    const adding = addItem(env(), {
      list: groceries,
      name: 'Screws',
      last: null,
      by: grace.personId,
    });
    const pointed = {
      ...adding,
      changes: adding.changes
        .filter((change) => change.table === 'item')
        .map((change) => ({ ...change, fields: { ...change.fields, productId: screwProduct } })),
    };
    expect((await send(grace, pointed)).status).toBe('refused');
    const pull = await pullHousehold(database, TEST_RING, grace.accountId, ada.household, 0);
    expect(pull?.products.some((row) => row.id === screwProduct)).toBe(false);

    expect((await send(ada, archiveList(env(), hardware))).status).toBe('applied');
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'list.delete',
          household: ada.household,
          list: hardware.id,
        })
      ).status,
    ).toBe(200);
    const left = await dbAll<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'product')} WHERE id = ${screwProduct}`,
    );
    expect(left).toEqual([]);
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

describe(`products from before lists had catalogs (${leg})`, () => {
  it('are given the list of the first item that used them, else the group’s first list, once', async () => {
    const ada = await somebody(database, 'Ada');
    const made = makeList(env(), { householdId: ada.household, name: 'Hardware', position: 'a1' });
    expect((await send(ada, made)).status).toBe('applied');
    const hardware = listRow({
      id: made.changes[0]?.id ?? '',
      householdId: ada.household,
      name: 'Hardware',
    });
    const screws = addItem(env(), { list: hardware, name: 'Screws', last: null, by: ada.personId });
    expect((await send(ada, screws)).status).toBe('applied');
    const used = screws.changes.find((change) => change.table === 'product')?.id ?? '';
    const spare = crypto.randomUUID();
    await dbAll(
      database,
      sql`INSERT INTO ${appTable(database, 'product')} (id, household_id, name_key, sealed, created_at)
          VALUES (${spare}, ${ada.household}, ${'nk-' + spare}, ${''}, 1) RETURNING id`,
    );
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, 'product')} SET list_id = NULL WHERE household_id = ${ada.household} RETURNING id`,
    );
    expect(await adoptProductLists(database)).toBeGreaterThan(0);
    const lists = await dbAll<{ id: string; list_id: string | null }>(
      database,
      sql`SELECT id, list_id FROM ${appTable(database, 'product')} WHERE household_id = ${ada.household}`,
    );
    expect(lists.find((row) => row.id === used)?.list_id).toBe(hardware.id);
    expect(lists.find((row) => row.id === spare)?.list_id).toBe(ada.list);
    const again = await dbAll<{ household_id: string }>(
      database,
      sql`SELECT household_id FROM ${appTable(database, 'product')} WHERE list_id IS NULL AND household_id = ${ada.household}`,
    );
    expect(again).toEqual([]);
  });
});

describe(`a list’s keys (${leg})`, () => {
  it('are kept only by someone on the list, only in a group that has moved, handed back only to them, and go when they leave (21.4)', async () => {
    const { ada, grace, hardware } = await setUp();
    const keep = (who: Someone, list: string) =>
      callAs(database, OPERATIONS, who, {
        op: 'list.key.mine',
        household: ada.household,
        list,
        record: `lr1.${'a'.repeat(16)}.${'b'.repeat(32)}`,
      });
    // Still sealed by the server: nothing to keep.
    expect((await keep(grace, ada.list)).status).not.toBe(200);
    await dbAll(
      database,
      sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household} RETURNING id`,
    );
    // Not on Hardware: as if it were not there.
    expect(await keep(grace, hardware.id)).toEqual(NOT_FOUND);
    expect((await keep(grace, ada.list)).status).toBe(200);
    const graces = await pullHousehold(database, TEST_RING, grace.accountId, ada.household, 0);
    expect(Object.keys(graces?.encryption.lists ?? {})).toEqual([ada.list]);
    // The group's keyring is its own account's alone.
    await dbAll(
      database,
      sql`INSERT INTO ${appTable(database, 'household_key')} (household_id, person_id, epoch, record, created_at)
          VALUES (${ada.household}, ${grace.personId}, 1, 'hk1.x.y', 1) RETURNING person_id`,
    );
    expect(
      (await pullHousehold(database, TEST_RING, grace.accountId, ada.household, 0))?.encryption
        .keyring,
    ).toBeNull();
    const adas = await pullHousehold(database, TEST_RING, ada.accountId, ada.household, 0);
    expect(adas?.encryption.lists).toEqual({});
    // Leaving the list takes their copy with it.
    expect(
      (
        await callAs(database, OPERATIONS, grace, {
          op: 'member.leave',
          household: ada.household,
          list: ada.list,
        })
      ).status,
    ).toBe(200);
    const left = await dbAll<{ list_id: string }>(
      database,
      sql`SELECT list_id FROM ${appTable(database, 'list_key')} WHERE person_id = ${grace.personId}`,
    );
    expect(left).toEqual([]);
  });
});

describe(`a product items of two lists use, from before (${leg})`, () => {
  it('is copied to the other list, sealed again for its new id, and the items there point at the copy (21.4)', async () => {
    const { ada, hardware, screwProduct } = await setUp();
    const onList = async (list: ReturnType<typeof listRow>, name: string) => {
      const adding = addItem(env(), { list, name, last: null, by: ada.personId });
      expect((await send(ada, adding)).status).toBe('applied');
      const item = adding.changes.find((change) => change.table === 'item')?.id ?? '';
      // As before 21.3: the item points at the Hardware product.
      await dbAll(
        database,
        sql`UPDATE ${appTable(database, 'item')} SET product_id = ${screwProduct} WHERE id = ${item} RETURNING id`,
      );
      return { item, own: adding.changes.find((change) => change.table === 'product')?.id };
    };
    const made = makeList(env(), { householdId: ada.household, name: 'Party', position: 'a2' });
    expect((await send(ada, made)).status).toBe('applied');
    const party = listRow({ id: made.changes[0]?.id ?? '', householdId: ada.household });
    const groceries = listRow({ id: ada.list, householdId: ada.household, name: 'Groceries' });
    // Groceries has a Screws of its own; Party has none of that name.
    const g = await onList(groceries, 'Screws');
    const p = await onList(party, 'Balloons');

    expect(await splitSharedProducts(database, TEST_RING)).toBeGreaterThan(0);
    const productOf = async (item: string) =>
      (
        await dbGet<{ product_id: string }>(
          database,
          sql`SELECT product_id FROM ${appTable(database, 'item')} WHERE id = ${item}`,
        )
      )?.product_id ?? '';
    expect(await productOf(g.item)).toBe(g.own);
    const copied = await productOf(p.item);
    expect(copied).not.toBe(screwProduct);
    const copy = await dbGet<{ list_id: string; sealed: string }>(
      database,
      sql`SELECT list_id, sealed FROM ${appTable(database, 'product')} WHERE id = ${copied}`,
    );
    expect(copy?.list_id).toBe(party.id);
    const { unsealRow } = await import('../crypto/sealed');
    expect(unsealRow('product', copied, copy?.sealed ?? '', TEST_RING).name).toBe('Screws');
    const hardwareItems = await dbAll<{ product_id: string }>(
      database,
      sql`SELECT product_id FROM ${appTable(database, 'item')} WHERE list_id = ${hardware.id}`,
    );
    expect(hardwareItems.map((row) => row.product_id)).toEqual([screwProduct]);
    // Once is enough.
    expect(await splitSharedProducts(database, TEST_RING)).toBe(0);
  });
});
