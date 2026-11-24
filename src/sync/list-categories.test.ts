import { sql } from 'drizzle-orm';
import fc from 'fast-check';
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
import { canonicalName } from '../catalog/canonical';
import type { Database } from '../db/client';
import { dbAll, dbGet, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { OPERATIONS } from '../households/ops';
import {
  type Keyring,
  copySourceKey,
  deriveListKeyring,
  listNameKey,
  newKeyring,
  openField,
  sealField,
} from '../keys/household';
import type { Limits } from '../limits/config';
import { type ApplyResult, applyMutation } from './apply';
import { mergeChange } from './merge';
import { pullHousehold } from './pull';

/**
 * A list's copies of people's own categories (task 23.3, DESIGN.md §8.3, decisions 15 to 17), on the server, in a group that has moved: made by anyone on the list, changed
 * by its Admin, found by a source key a device makes under the list's keys (**never an id** of a row of another group), folded by it and made again after a delete, named by an
 * item or a product only on their own list, read by the list's people and no one else, and refused in a group the server still seals, not held. The marker is a word that
 * must be in no row of the group in plain text.
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
const MARKER = 'MARKERcopy7Garden';

let database: Database;
let ada: Someone;
let grace: Someone;
let heidi: Someone;
let lin: Someone;
let group: Keyring;
let hardware = '';
const rings = new Map<string, Keyring>();
const deps = (limits: Limits = LIMITS) => ({ database, ring: TEST_RING, limits });
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
const listRing = async (list: string): Promise<Keyring> => {
  const known = rings.get(list);
  if (known) return known;
  const made = await deriveListKeyring(group, list);
  rings.set(list, made);
  return made;
};
/** A value for a row of a list, as a device of someone on the list makes it: under the list's keys, bound to the list. */
const cipher = async (list: string, table: string, row: string, field: string, text: string) =>
  sealField(await listRing(list), { list, table, row, field }, text);
const copy = async (
  list: string,
  category: string,
  name: string,
  extra: Record<string, string | number | null> = {},
  id = crypto.randomUUID(),
) => ({
  table: 'list_category' as const,
  id,
  create: true as const,
  fields: {
    listId: list,
    sourceKey: await copySourceKey(await listRing(list), list, category),
    name: await cipher(list, 'list_category', id, 'name', name),
    position: 'a5',
    ...extra,
  } as Record<string, string | number | null>,
});
const edit = (id: string, fields: Record<string, string | number | null>) => ({
  table: 'list_category' as const,
  id,
  fields,
});
const send = (who: Someone, changes: Mutation['changes'][number][], limits?: Limits) =>
  applyMutation(deps(limits), who.accountId, mutation(ada.household, changes));
const rowOf = (id: string) =>
  dbGet<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'list_category')} WHERE id = ${id}`,
  );
const pull = async (who: Someone) =>
  pullHousehold(database, TEST_RING, who.accountId, ada.household, 0);
const product = async (list: string, id: string, name: string) => ({
  table: 'product' as const,
  id,
  create: true as const,
  fields: {
    listId: list,
    name: await cipher(list, 'product', id, 'name', name),
    nameKey: await listNameKey(await listRing(list), list, canonicalName(name)),
    createdAt: 1,
  } as Record<string, string | number | null>,
});
const item = async (
  who: Someone,
  list: string,
  id: string,
  productId: string,
  extra: Record<string, string | number | null> = {},
) => ({
  table: 'item' as const,
  id,
  create: true as const,
  fields: {
    listId: list,
    productId,
    name: await cipher(list, 'item', id, 'name', 'thing'),
    quantity: '1',
    position: 'a0',
    addedBy: who.personId,
    addedAt: 1,
    ...extra,
  } as Record<string, string | number | null>,
});
const starter = async (key: string) =>
  (
    await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'category')} WHERE household_id = ${ada.household} AND starter_key = ${key}`,
    )
  )?.id ?? '';

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
  // A second list of Ada's group, made by her (so that she is its Admin).
  hardware = crypto.randomUUID();
  applied(
    await send(ada, [
      {
        table: 'list',
        id: hardware,
        create: true,
        fields: {
          name: await cipher(hardware, 'list', hardware, 'name', 'Hardware'),
          position: 'a5',
          createdAt: 1,
          clearing: 'manual',
        },
      },
    ]),
  );
  // Grace is a Member of Groceries only; Heidi of Hardware only; Lin is nobody's here.
  await joinList(database, ada.household, ada.list, grace);
  await joinList(database, ada.household, hardware, heidi);
});
afterAll(async () => database.close());

describe(`a list’s copy of a person’s category (${leg})`, () => {
  it('is made by a Member of the list for their own category, and is read by the list’s people and no one else, with no id or group of anyone else’s in any column of the group', async () => {
    // The category and the group are of Grace's own: ids that must reach no row of Ada's group.
    const category = crypto.randomUUID();
    const made = await copy(ada.list, category, `Garden ${MARKER}`);
    applied(await send(grace, [made]));
    const row = await rowOf(made.id);
    expect(row?.sealed).toBe('');
    expect(String(row?.source_key)).toMatch(/^n3\./);
    expect(JSON.stringify(row)).not.toContain(MARKER);
    // Ada, its Admin, and Grace, a Member, read it, and open the name under the list's keys.
    for (const who of [ada, grace]) {
      const copies = (await pull(who))?.listCategories ?? [];
      const mine = copies.find((each) => each.id === made.id) as
        { listId: string; sourceKey: string; encrypted?: { name: string } } | undefined;
      expect(mine?.listId).toBe(ada.list);
      expect(
        await openField(
          await listRing(ada.list),
          { list: ada.list, table: 'list_category', row: made.id, field: 'name' },
          mine?.encrypted?.name ?? '',
        ),
      ).toBe(`Garden ${MARKER}`);
    }
    // Heidi is on another list of the group, and Lin is not in it: neither has it.
    expect(((await pull(heidi))?.listCategories ?? []).some((each) => each.id === made.id)).toBe(
      false,
    );
    expect(await pull(lin)).toBeUndefined();
    // **No row of the group holds the id of Grace's category or the id of Grace's group**, in any column: the source key is an HMAC, and that is all.
    const tables = await dbAll<{ name: string }>(
      database,
      database.dialect === 'postgres'
        ? sql`SELECT table_name AS name FROM information_schema.tables WHERE table_schema IN ('shopper')`
        : sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
    );
    for (const { name } of tables) {
      if (name.startsWith('sqlite_') || name.startsWith('__') || name === 'household') continue;
      const qualified =
        database.dialect === 'postgres' ? sql.raw(`"shopper"."${name}"`) : sql.raw(`"${name}"`);
      const rows = await dbAll<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${qualified}`,
      ).catch(() => []);
      const theirs = rows.filter(
        (each) => each.household_id === ada.household || each.id === ada.household,
      );
      const text = JSON.stringify(theirs);
      expect(text, `${name} holds the category's id`).not.toContain(category);
      expect(text, `${name} holds Grace's group`).not.toContain(grace.household);
    }
  });

  it('reaches someone who joins the list later, from a group they are already on and have pulled to the end of', async () => {
    const ivy = await somebody(database, 'Ivy');
    // Ivy is on Groceries and has pulled everything there is to the group's counter: a copy made on Hardware before she joins it is behind her cursor.
    await joinList(database, ada.household, ada.list, ivy);
    const early = await copy(hardware, crypto.randomUUID(), 'Before Ivy');
    applied(await send(ada, [early]));
    const first = await pull(ivy);
    expect((first?.listCategories ?? []).some((each) => each.id === early.id)).toBe(false);
    await joinList(database, ada.household, hardware, ivy);
    const next = await pullHousehold(
      database,
      TEST_RING,
      ivy.accountId,
      ada.household,
      first?.cursor ?? 0,
    );
    expect((next?.listCategories ?? []).map((each) => each.id)).toContain(early.id);
  });

  it('is changed and deleted by the list’s Admin alone: the Member who made it cannot, nor anyone not on the list, and its list and source key never change', async () => {
    const made = await copy(ada.list, crypto.randomUUID(), 'Shed');
    applied(await send(grace, [made]));
    const before = JSON.stringify(await rowOf(made.id));
    for (const changes of [
      [edit(made.id, { position: 'a9' })],
      [edit(made.id, { icon: 'apple' })],
      [edit(made.id, { deletedAt: 5 })],
      [
        edit(made.id, {
          name: await cipher(ada.list, 'list_category', made.id, 'name', 'Renamed'),
        }),
      ],
    ]) {
      expect(await send(grace, changes)).toMatchObject({ status: 'refused', reason: 'not_found' });
      expect(await send(heidi, changes)).toMatchObject({ status: 'refused', reason: 'not_found' });
    }
    expect(JSON.stringify(await rowOf(made.id))).toBe(before);
    // The Admin may: a name, a place, an icon, a delete, and bring it back.
    applied(
      await send(ada, [
        edit(made.id, {
          name: await cipher(ada.list, 'list_category', made.id, 'name', 'Garden shed'),
          position: 'a7',
          icon: 'apple',
        }),
      ]),
    );
    applied(await send(ada, [edit(made.id, { deletedAt: 5 })]));
    applied(await send(ada, [edit(made.id, { deletedAt: null })]));
    // Its list and its source key are set when it is made.
    expect(await send(ada, [edit(made.id, { listId: hardware })])).toMatchObject({
      status: 'refused',
      reason: 'not_found',
    });
    expect(
      await send(ada, [
        edit(made.id, { sourceKey: await copySourceKey(await listRing(ada.list), ada.list, 'x') }),
      ]),
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
    // Anyone may make one on a list they are on, and no one on a list they are not.
    expect(await send(heidi, [await copy(ada.list, crypto.randomUUID(), 'Nope')])).toMatchObject({
      status: 'refused',
      reason: 'not_found',
    });
    expect(await send(grace, [await copy(hardware, crypto.randomUUID(), 'Nope')])).toMatchObject({
      status: 'refused',
      reason: 'not_found',
    });
  });

  it('is refused in a group the server still seals, with its own sentence, and not held', async () => {
    const sealed = await somebody(database, 'Sealed');
    const bare = {
      table: 'list_category' as const,
      id: crypto.randomUUID(),
      create: true as const,
      fields: {
        listId: sealed.list,
        sourceKey: `n3.${'A'.repeat(43)}`,
        name: `e2.1.${sealed.list}.${crypto.randomUUID()}.${'A'.repeat(24)}`,
        position: 'a5',
      },
    };
    const result = await applyMutation(
      deps(),
      sealed.accountId,
      mutation(sealed.household, [bare]),
    );
    // Exactly refused (a held mutation would keep itself and everything after it in the outbox for ever), for the reason and in the words of it.
    expect(result).toEqual({
      status: 'refused',
      reason: 'unsupported',
      sentence: 'Your own categories can be put on this list once its group is encrypted.',
    });
    expect(await rowOf(bare.id)).toBeUndefined();
    // The same in the other form (a device's own, with the name as text): refused too, whichever form was sent.
    const plain = await applyMutation(
      deps(),
      sealed.accountId,
      mutation(sealed.household, [
        { ...bare, id: crypto.randomUUID(), fields: { ...bare.fields, name: 'Garden' } },
      ]),
    );
    expect(plain).toEqual({
      status: 'refused',
      reason: 'unsupported',
      sentence: 'Your own categories can be put on this list once its group is encrypted.',
    });
  });

  it('is bound to its list: a name for another list or for the group is refused, and plain text sent to a group that has moved is held for the device to send again encrypted', async () => {
    const id = crypto.randomUUID();
    const make = (name: string) => ({
      ...{
        table: 'list_category' as const,
        id,
        create: true as const,
        fields: {
          listId: ada.list,
          sourceKey: `n3.${'B'.repeat(43)}`,
          name,
          position: 'a5',
        } as Record<string, string | number | null>,
      },
    });
    const elsewhere = await cipher(hardware, 'list_category', id, 'name', 'x');
    expect(await send(ada, [make(elsewhere)])).toMatchObject({
      status: 'refused',
      reason: 'not_found',
    });
    const group = await sealField(
      await listRing(ada.household),
      { list: ada.household, table: 'list_category', row: id, field: 'name' },
      'x',
    );
    expect(await send(ada, [make(group)])).toMatchObject({
      status: 'refused',
      reason: 'not_found',
    });
    expect((await send(ada, [make(`Garden ${MARKER}`)])).status).toBe('held');
    expect(await rowOf(id)).toBeUndefined();
    // For its own list, whichever table it names: the server cannot open it, the device does.
    expect(
      (await send(ada, [make(await cipher(ada.list, 'list_category', id, 'name', 'ok'))])).status,
    ).toBe('applied');
  });

  it('is one copy for a source key on a list: making it again folds into it, brings it back after a delete, keeps its name, and the fold is told to the list’s people alone', async () => {
    const category = crypto.randomUUID();
    const first = await copy(ada.list, category, 'Hardware');
    applied(await send(grace, [first]));
    applied(await send(ada, [edit(first.id, { deletedAt: 9 })]));
    const again = await copy(ada.list, category, 'Hardware again');
    const result = applied(await send(grace, [again]));
    expect(result.folds).toEqual([{ table: 'list_category', from: again.id, to: first.id }]);
    const row = await rowOf(first.id);
    expect(row?.deleted_at).toBeNull();
    // The name that stands is the first's.
    const stands = (await pull(grace))?.listCategories?.find((each) => each.id === first.id) as
      { encrypted?: { name: string } } | undefined;
    expect(
      await openField(
        await listRing(ada.list),
        { list: ada.list, table: 'list_category', row: first.id, field: 'name' },
        stands?.encrypted?.name ?? '',
      ),
    ).toBe('Hardware');
    expect(await rowOf(again.id)).toBeUndefined();
    // The alias and the tombstone carry the list: Grace is on it, Heidi is not.
    const aliases = (await pull(grace))?.aliases.filter((each) => each.table === 'list_category');
    expect(aliases).toEqual([expect.objectContaining({ from: again.id, to: first.id })]);
    expect((await pull(heidi))?.aliases.some((each) => each.table === 'list_category')).toBe(false);
    expect((await pull(heidi))?.tombstones.some((each) => each.table === 'list_category')).toBe(
      false,
    );
    // Another list has its own copy for the same category, under its own key, and they are not folded.
    const there = await copy(hardware, category, 'Hardware');
    applied(await send(heidi, [there]));
    expect((await rowOf(there.id))?.source_key).not.toBe(row?.source_key);
    // An item made naming the copy that was folded is stored naming the one that stands.
    const productId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    applied(
      await send(grace, [
        await product(ada.list, productId, 'Hammer'),
        await item(grace, ada.list, itemId, productId, { categoryId: again.id }),
      ]),
    );
    expect(
      (
        await dbGet<{ category_id: string }>(
          database,
          sql`SELECT category_id FROM ${appTable(database, 'item')} WHERE id = ${itemId}`,
        )
      )?.category_id,
    ).toBe(first.id);
  });

  it('is what an item or a product names, on its own list: a starter category too, a copy of another list or a category of the person’s own is not, a deleted copy may be', async () => {
    const mine = await copy(ada.list, crypto.randomUUID(), 'Tools');
    const theirs = await copy(hardware, crypto.randomUUID(), 'Nails');
    applied(await send(grace, [mine]));
    applied(await send(heidi, [theirs]));
    const productId = crypto.randomUUID();
    applied(await send(grace, [await product(ada.list, productId, 'Screwdriver')]));
    const named = async (categoryId: string) =>
      send(grace, [await item(grace, ada.list, crypto.randomUUID(), productId, { categoryId })]);
    applied(await named(mine.id));
    applied(await named(await starter('produce')));
    expect(await named(theirs.id)).toMatchObject({ status: 'refused', reason: 'not_found' });
    // A category of the person's own (5a), which is theirs alone, is not what a list names.
    await dbRun(
      database,
      sql`INSERT INTO ${appTable(database, 'category')} (id, household_id, starter_key, position, hidden, seq) VALUES (${'11111111-1111-4111-8111-aaaaaaaaaaaa'}, ${ada.household}, ${null}, ${'zz'}, ${false}, ${1})`,
    );
    expect(await named('11111111-1111-4111-8111-aaaaaaaaaaaa')).toMatchObject({
      status: 'refused',
      reason: 'not_found',
    });
    // A product's category is held to the same: a copy of its own list, and not one of another's.
    const asProduct = async (categoryId: string) => {
      const made = await product(ada.list, crypto.randomUUID(), `P ${crypto.randomUUID()}`);
      return send(grace, [{ ...made, fields: { ...made.fields, categoryId } }]);
    };
    applied(await asProduct(mine.id));
    expect(await asProduct(theirs.id)).toMatchObject({ status: 'refused', reason: 'not_found' });
    expect(await asProduct('11111111-1111-4111-8111-aaaaaaaaaaaa')).toMatchObject({
      status: 'refused',
      reason: 'not_found',
    });
    // A deleted copy may be named, as a deleted product may: the item shows under Other until the copy is made again.
    applied(await send(ada, [edit(mine.id, { deletedAt: 3 })]));
    applied(await named(mine.id));
  });

  it('is checked when an item changes list: it cannot be moved onto a list with the copy of the one it left, and takes a category valid there', async () => {
    const copyHere = await copy(ada.list, crypto.randomUUID(), 'Here');
    applied(await send(ada, [copyHere]));
    const productHere = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    applied(
      await send(ada, [
        await product(ada.list, productHere, 'Clamp'),
        await item(ada, ada.list, itemId, productHere, { categoryId: copyHere.id }),
      ]),
    );
    const productThere = crypto.randomUUID();
    const move = async (extra: Record<string, string | number | null>) =>
      send(ada, [
        await product(hardware, productThere, 'Clamp'),
        {
          table: 'item',
          id: itemId,
          fields: {
            listId: hardware,
            productId: productThere,
            name: await cipher(hardware, 'item', itemId, 'name', 'Clamp'),
            note: null,
            ...extra,
          },
        },
      ]);
    // Naming nothing, the item keeps the copy of the list it leaves: refused, in the words of a move.
    expect(await move({})).toMatchObject({ status: 'refused', reason: 'not_found' });
    // Naming a copy of the list it goes to, or a starter category: applied.
    const there = await copy(hardware, crypto.randomUUID(), 'There');
    applied(await send(ada, [there]));
    applied(await move({ categoryId: there.id }));
    expect(
      (
        await dbGet<{ list_id: string; category_id: string }>(
          database,
          sql`SELECT list_id, category_id FROM ${appTable(database, 'item')} WHERE id = ${itemId}`,
        )
      )?.category_id,
    ).toBe(there.id);
  });

  it('is held to a limit for the list, with a sentence of its own, and a deleted one gives its place back', async () => {
    const small = { ...LIMITS, householdCategories: 2 };
    const fresh = async (name: string) => {
      const id = crypto.randomUUID();
      applied(
        await send(ada, [
          {
            table: 'list',
            id,
            create: true,
            fields: {
              name: await cipher(id, 'list', id, 'name', name),
              position: 'a6',
              createdAt: 1,
              clearing: 'manual',
            },
          },
        ]),
      );
      return id;
    };
    const full = await fresh('Limited');
    const empty = await fresh('Not limited');
    const a = await copy(full, crypto.randomUUID(), 'A');
    const b = await copy(full, crypto.randomUUID(), 'B');
    expect((await send(ada, [a], small)).status).toBe('applied');
    expect((await send(ada, [b], small)).status).toBe('applied');
    const refused = await send(ada, [await copy(full, crypto.randomUUID(), 'C')], small);
    expect(refused).toMatchObject({
      status: 'refused',
      reason: 'limit',
      sentence: expect.stringContaining('A list can have at most 2 categories of people’s own'),
    });
    // The count is the list's: another list of the group is not full.
    expect((await send(ada, [await copy(empty, crypto.randomUUID(), 'D')], small)).status).toBe(
      'applied',
    );
    applied(await send(ada, [edit(a.id, { deletedAt: 4 })], small));
    expect((await send(ada, [await copy(full, crypto.randomUUID(), 'C')], small)).status).toBe(
      'applied',
    );
  });

  it('goes with its list when an archived list is deleted for good, and with nothing else', async () => {
    const doomed = crypto.randomUUID();
    applied(
      await send(ada, [
        {
          table: 'list',
          id: doomed,
          create: true,
          fields: {
            name: await cipher(doomed, 'list', doomed, 'name', 'Doomed'),
            position: 'a6',
            createdAt: 1,
            clearing: 'manual',
          },
        },
      ]),
    );
    const here = await copy(doomed, crypto.randomUUID(), 'Gone with it');
    const elsewhere = await copy(hardware, crypto.randomUUID(), 'Stays');
    applied(await send(ada, [here, elsewhere]));
    applied(await send(ada, [{ table: 'list', id: doomed, fields: { archivedAt: 2 } }]));
    expect(
      await callAs(database, OPERATIONS, ada, {
        op: 'list.delete',
        household: ada.household,
        list: doomed,
      }),
    ).toEqual({ status: 200, body: { ok: true } });
    expect(await rowOf(here.id)).toBeUndefined();
    expect(await rowOf(elsewhere.id)).toBeDefined();
    // A person who is not on a list cannot delete it, and so cannot delete its copies.
    expect(
      await callAs(database, OPERATIONS, lin, {
        op: 'list.delete',
        household: ada.household,
        list: hardware,
      }),
    ).toEqual(NOT_FOUND);
    expect(await rowOf(elsewhere.id)).toBeDefined();
  });
});

describe(`the order of arrival decides for a list’s copies too (${leg})`, () => {
  it('leaves the rows the merge says, for any order of the Admin’s devices’ changes, with the counter one for each mutation', async () => {
    const list = crypto.randomUUID();
    applied(
      await send(ada, [
        {
          table: 'list',
          id: list,
          create: true,
          fields: {
            name: await cipher(list, 'list', list, 'name', 'Property'),
            position: 'a8',
            createdAt: 1,
            clearing: 'manual',
          },
        },
      ]),
    );
    const ids: string[] = [];
    for (const [i] of [0, 1, 2].entries()) {
      const made = await copy(list, crypto.randomUUID(), `Own ${i}`, { position: `a${i}` });
      applied(await send(ada, [made]));
      ids.push(made.id);
    }
    const names = new Map<string, { a: string; b: string }>();
    for (const id of ids)
      names.set(id, {
        a: await cipher(list, 'list_category', id, 'name', 'a'),
        b: await cipher(list, 'list_category', id, 'name', 'b'),
      });
    const seqOf = async () =>
      Number(
        (
          await dbGet<{ seq: number | string }>(
            database,
            sql`SELECT seq FROM ${appTable(database, 'household')} WHERE id = ${ada.household}`,
          )
        )?.seq,
      );
    const content = (row: Record<string, unknown> | undefined) =>
      JSON.parse(String(row?.encrypted ?? '{}')) as Record<string, string>;
    const field = fc.oneof(
      fc.record({ position: fc.constantFrom('a0', 'a4', 'b0', 'zz') }),
      fc.record({ icon: fc.constantFrom('apple', 'milk', null) }),
      fc.record({ name: fc.constantFrom('a', 'b') }),
      fc.record({ deletedAt: fc.constantFrom(7, null) }),
      fc.record({ position: fc.constantFrom('a1', 'a9'), icon: fc.constantFrom('apple', null) }),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 2 }), field), { minLength: 1, maxLength: 12 }),
        async (changes) => {
          const start = await seqOf();
          const model = new Map<
            string,
            { values: Record<string, string | number | null>; fseq: Record<string, number> }
          >();
          for (const id of ids) {
            const row = await rowOf(id);
            model.set(id, {
              values: {
                name: content(row).name ?? null,
                icon: (row?.icon as string | null) ?? null,
                position: String(row?.position),
                deletedAt: (row?.deleted_at as number | null) ?? null,
                listId: list,
                sourceKey: String(row?.source_key),
              },
              fseq: JSON.parse(String(row?.fseq)) as Record<string, number>,
            });
          }
          let seq = start;
          for (const [index, fields] of changes) {
            const id = ids[index] ?? '';
            const sent =
              'name' in fields
                ? { name: names.get(id)?.[fields.name as 'a' | 'b'] ?? null }
                : fields;
            const result = applied(await send(ada, [edit(id, sent)]));
            seq += 1;
            expect(result.seq).toBe(seq);
            const entry = model.get(id);
            if (entry) {
              const merged = mergeChange(entry.values, entry.fseq, sent, seq);
              model.set(id, { values: { ...merged.values }, fseq: { ...merged.fseq } });
            }
          }
          expect(await seqOf()).toBe(seq);
          for (const id of ids) {
            const row = await rowOf(id);
            const want = model.get(id);
            expect({
              name: content(row).name ?? null,
              icon: (row?.icon as string | null) ?? null,
              position: String(row?.position),
              deletedAt: (row?.deleted_at as number | null) ?? null,
              fseq: JSON.parse(String(row?.fseq)),
            }).toEqual({
              name: want?.values.name ?? null,
              icon: want?.values.icon ?? null,
              position: want?.values.position,
              deletedAt: want?.values.deletedAt ?? null,
              fseq: want?.fseq,
            });
          }
        },
      ),
      { numRuns: 15 },
    );
  });
});
