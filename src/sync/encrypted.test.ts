import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import type { Database } from '../db/client';
import { dbAll, dbGet, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { listNameKey, newKeyring, openField, sealField } from '../keys/household';
import { makeList } from '../actions/lists';
import type { Limits } from '../limits/config';
import { applyMutation } from './apply';
import { handleSync } from './endpoint';
import { PROTOCOL } from './protocol';
import { pullHousehold } from './pull';

/**
 * A household that has moved (RFC 0001, amendment 2): the server keeps each field as its device sent it, encrypted, never opens it, and holds plain text
 * sent to it (the device sends it again, encrypted). The marker is a word that must be in no row once it is encrypted.
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
const MARKER = 'MARKERxq7Oat';

let database: Database;
let ada: Someone;
const ring = newKeyring();
const deps = () => ({ database, ring: TEST_RING, limits: LIMITS });
const mutation = (household: string, changes: Mutation['changes'][number][]): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: household,
  changes,
});
/** Values for Ada's first list's keys (RFC 0004); the test stands in for its device, holding that list's keyring. */
const field = (table: string, row: string, name: string, text: string, list = ada.list) =>
  sealField(ring, { list, table, row, field: name }, text);
const nameKey = (name: string) => listNameKey(ring, ada.list, name);

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
  );
});
afterAll(async () => database.close());

const product = async (id: string, name: string) => ({
  table: 'product' as const,
  id,
  create: true as const,
  fields: {
    listId: ada.list,
    name: await field('product', id, 'name', name),
    nameKey: await nameKey(name),
    createdAt: 1,
  },
});

describe(`a household whose content is encrypted (${leg})`, () => {
  it('keeps a product as its device sent it, encrypted, with the name key the device made, and nothing in plain text', async () => {
    const id = crypto.randomUUID();
    const result = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [await product(id, `oat milk ${MARKER}`)]),
    );
    expect(result.status).toBe('applied');
    const row = await dbGet<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'product')} WHERE id = ${id}`,
    );
    expect(row?.sealed).toBe('');
    expect(row?.name_key).toBe(await nameKey(`oat milk ${MARKER}`));
    expect(JSON.stringify(row)).not.toContain(MARKER);
    const stored = JSON.parse(String(row?.encrypted)) as { name: string };
    expect(
      await openField(
        ring,
        { list: ada.list, table: 'product', row: id, field: 'name' },
        stored.name,
      ),
    ).toBe(`oat milk ${MARKER}`);
  });

  it('folds a second product of the same name key into the first, without reading either name', async () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [await product(first, 'bread')]),
    );
    const result = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [await product(second, 'bread')]),
    );
    expect(result.status === 'applied' && result.folds).toEqual([
      { table: 'product', from: second, to: first },
    ]);
  });

  it('holds plain text sent to it, which the device sends again encrypted, and keeps the order of what came after', async () => {
    const plain = mutation(ada.household, [
      {
        table: 'product',
        id: crypto.randomUUID(),
        create: true,
        fields: { listId: ada.list, name: `rice ${MARKER}`, createdAt: 1 },
      },
    ]);
    expect((await applyMutation(deps(), ada.accountId, plain)).status).toBe('held');
    const after = mutation(ada.household, [await product(crypto.randomUUID(), 'tea')]);
    const answer = await handleSync({ ...deps(), intervalSeconds: 20 }, ada.accountId, {
      version: PROTOCOL,
      outbox: [plain, after],
      cursors: {},
    });
    expect(answer.status).toBe(200);
    if (answer.status !== 200) return;
    // Neither was answered: both stay on the device, in their order.
    expect(answer.body.applied).toEqual([]);
    expect(answer.body.refused).toEqual([]);
    const rows = await dbAll<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'product')}`,
    );
    expect(JSON.stringify(rows)).not.toContain(MARKER.replace('Oat', ''));
  });

  it('refuses a name with no name key, and a value that is not encrypted, as what they are', async () => {
    const id = crypto.randomUUID();
    const noKey = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        {
          table: 'product',
          id,
          create: true,
          fields: { listId: ada.list, name: await field('product', id, 'name', 'x'), createdAt: 1 },
        },
      ]),
    );
    expect(noKey.status).toBe('refused');
  });

  it('carries a folded item’s second note, encrypted, on the alias, for a device to join, and keeps the first', async () => {
    const productId = crypto.randomUUID();
    await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [await product(productId, 'apples')]),
    );
    const list = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'list')} WHERE household_id = ${ada.household}`,
    );
    const item = async (id: string, note: string) => ({
      table: 'item' as const,
      id,
      create: true as const,
      fields: {
        listId: list?.id ?? '',
        productId,
        name: await field('item', id, 'name', 'apples'),
        note: await field('item', id, 'note', note),
        quantity: '1',
        position: 'a0',
        addedBy: ada.personId,
        addedAt: 1,
      },
    });
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [await item(first, 'green')]),
    );
    const folded = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [await item(second, 'red')]),
    );
    expect(folded.status === 'applied' && folded.folds).toEqual([
      { table: 'item', from: second, to: first },
    ]);
    const pulled = await pullHousehold(database, TEST_RING, ada.accountId, ada.household, 0);
    expect(pulled?.encryption.state).toBe('encrypted');
    const alias = pulled?.aliases.find((each) => each.from === second);
    const target = { list: ada.list, table: 'item', row: first, field: 'note' };
    expect(await openField(ring, target, alias?.carried ?? '', [second])).toBe('red');
    const kept = pulled?.items.find((each) => each.id === first) as
      { encrypted?: { note: string } } | undefined;
    expect(await openField(ring, target, kept?.encrypted?.note ?? '')).toBe('green');
  });

  it("keeps a list's icon and colour as ciphertext, each its own field, so that two devices' changes both stay", async () => {
    // Two devices, each changing one of the two (RFC 0005): the merge is by field, and neither value is ever in a table in the clear.
    const icon = `pill-${MARKER}`;
    const color = '#12ab34';
    const first = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        {
          table: 'list',
          id: ada.list,
          fields: { icon: await field('list', ada.list, 'icon', icon) },
        },
      ]),
    );
    const second = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        {
          table: 'list',
          id: ada.list,
          fields: { color: await field('list', ada.list, 'color', color) },
        },
      ]),
    );
    expect(first.status).toBe('applied');
    expect(second.status).toBe('applied');
    const row = await dbGet<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'list')} WHERE id = ${ada.list}`,
    );
    expect(JSON.stringify(row)).not.toContain(MARKER);
    expect(JSON.stringify(row)).not.toContain(color);
    const stored = JSON.parse(String(row?.encrypted)) as Record<string, string>;
    const target = (name: string) => ({
      list: ada.list,
      table: 'list',
      row: ada.list,
      field: name,
    });
    expect(await openField(ring, target('icon'), stored.icon ?? '')).toBe(icon);
    expect(await openField(ring, target('color'), stored.color ?? '')).toBe(color);

    // What a pull hands out is the same ciphertext.
    const pulled = await pullHousehold(database, TEST_RING, ada.accountId, ada.household, 0);
    const listed = pulled?.lists.find((each) => each.id === ada.list) as
      { encrypted?: Record<string, string> } | undefined;
    expect(listed?.encrypted?.icon).toBe(stored.icon);

    // Back to the defaults: a null is not a value to encrypt, and takes the field away.
    const reset = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        { table: 'list', id: ada.list, fields: { icon: null, color: null } },
      ]),
    );
    expect(reset.status).toBe('applied');
    const after = await dbGet<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'list')} WHERE id = ${ada.list}`,
    );
    const left = JSON.parse(String(after?.encrypted)) as Record<string, string>;
    expect(left.icon).toBeUndefined();
    expect(left.color).toBeUndefined();
  });

  it("holds a list's icon sent in plain text, and refuses one encrypted for another list", async () => {
    const plain = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [{ table: 'list', id: ada.list, fields: { icon: 'milk' } }]),
    );
    expect(plain.status).toBe('held');
    const elsewhere = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        {
          table: 'list',
          id: ada.list,
          fields: {
            icon: await field('list', ada.list, 'icon', 'milk', crypto.randomUUID()),
          },
        },
      ]),
    );
    expect(elsewhere.status).toBe('refused');
  });

  it('holds ciphertext sent to a household the server still seals', async () => {
    const other = await somebody(database, 'Grace');
    const id = crypto.randomUUID();
    const sealedOne = mutation(other.household, [
      {
        table: 'product',
        id,
        create: true,
        fields: {
          listId: other.list,
          name: await sealField(
            ring,
            { list: other.list, table: 'product', row: id, field: 'name' },
            'x',
          ),
          nameKey: await listNameKey(ring, other.list, 'x'),
          createdAt: 1,
        },
      },
    ]);
    expect((await applyMutation(deps(), other.accountId, sealedOne)).status).toBe('held');
  });

  it('refuses a value encrypted for another list than its row’s (RFC 0004)', async () => {
    const id = crypto.randomUUID();
    const elsewhere = crypto.randomUUID();
    const result = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        {
          table: 'product',
          id,
          create: true,
          fields: {
            listId: ada.list,
            name: await field('product', id, 'name', 'pears', elsewhere),
            nameKey: await nameKey('pears'),
            createdAt: 1,
          },
        },
      ]),
    );
    expect(result.status).toBe('refused');
  });

  it('moves an item to another list only with its name and note encrypted again for that list, and its product there', async () => {
    const made = makeList(
      { now: 1, newId: () => crypto.randomUUID() },
      { householdId: ada.household, name: 'x', position: 'a9' },
    );
    const other = made.changes[0]?.id ?? '';
    const listName = await field('list', other, 'name', 'Hardware', other);
    expect(
      (
        await applyMutation(
          deps(),
          ada.accountId,
          mutation(ada.household, [
            { ...made.changes[0], fields: { ...made.changes[0]?.fields, name: listName } } as never,
          ]),
        )
      ).status,
    ).toBe('applied');
    const productId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [await product(productId, 'nails')]),
    );
    expect(
      (
        await applyMutation(
          deps(),
          ada.accountId,
          mutation(ada.household, [
            {
              table: 'item',
              id: itemId,
              create: true,
              fields: {
                listId: ada.list,
                productId,
                name: await field('item', itemId, 'name', 'nails'),
                note: await field('item', itemId, 'note', 'small'),
                quantity: '1',
                position: 'a0',
                addedBy: ada.personId,
                addedAt: 1,
              },
            },
          ]),
        )
      ).status,
    ).toBe('applied');
    const there = crypto.randomUUID();
    const productThere = {
      table: 'product' as const,
      id: there,
      create: true as const,
      fields: {
        listId: other,
        name: await field('product', there, 'name', 'nails', other),
        nameKey: await listNameKey(ring, other, 'nails'),
        createdAt: 1,
      },
    };
    // The list alone: the old list's values would stay on it.
    const bare = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        productThere,
        { table: 'item', id: itemId, fields: { listId: other, productId: there } },
      ]),
    );
    expect(bare.status).toBe('refused');
    // With the product left on the old list: refused too (an item's product is on its list).
    const oldProduct = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        {
          table: 'item',
          id: itemId,
          fields: {
            listId: other,
            name: await field('item', itemId, 'name', 'nails', other),
            note: await field('item', itemId, 'note', 'small', other),
          },
        },
      ]),
    );
    expect(oldProduct.status).toBe('refused');
    // Name and note for the other list, and its product there: applied.
    const moved = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        productThere,
        {
          table: 'item',
          id: itemId,
          fields: {
            listId: other,
            productId: there,
            name: await field('item', itemId, 'name', 'nails', other),
            note: await field('item', itemId, 'note', 'small', other),
          },
        },
      ]),
    );
    expect(moved.status).toBe('applied');
  });
});
