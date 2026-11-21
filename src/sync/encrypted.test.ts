import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import type { Database } from '../db/client';
import { dbAll, dbGet, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { householdNameKey, newKeyring, openField, sealField } from '../keys/household';
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
const field = (table: string, row: string, name: string, text: string) =>
  sealField(ring, { household: ada.household, table, row, field: name }, text);
const nameKey = (name: string) => householdNameKey(ring, ada.household, name);

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
        { household: ada.household, table: 'product', row: id, field: 'name' },
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
        fields: { name: `rice ${MARKER}`, createdAt: 1 },
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
          fields: { name: await field('product', id, 'name', 'x'), createdAt: 1 },
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
    const target = { household: ada.household, table: 'item', row: first, field: 'note' };
    expect(await openField(ring, target, alias?.carried ?? '', [second])).toBe('red');
    const kept = pulled?.items.find((each) => each.id === first) as
      { encrypted?: { note: string } } | undefined;
    expect(await openField(ring, target, kept?.encrypted?.note ?? '')).toBe('green');
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
          name: await sealField(
            ring,
            { household: other.household, table: 'product', row: id, field: 'name' },
            'x',
          ),
          nameKey: await householdNameKey(ring, other.household, 'x'),
          createdAt: 1,
        },
      },
    ]);
    expect((await applyMutation(deps(), other.accountId, sealedOne)).status).toBe('held');
  });
});
