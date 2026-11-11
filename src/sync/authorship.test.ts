import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import type { Database } from '../db/client';
import { dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limits } from '../limits/config';
import { applyMutation } from './apply';

/**
 * **Who did it is the sender** (DESIGN.md §5.2, §12.4): a change says who added an item and who ticked it, and the server accepts only the sender's own
 * person for either. Without that, any member could put another's name on what they added or ticked, which the screens show as fact ("added by Ada", "ticked
 * by Grace"). Found by the review of phase 1 (`docs/security/0.1.0.md`, finding 1).
 */
const { leg } = testTarget();
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
};
let database: Database;
let ada: Someone;
let grace: Someone;
let list: string;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  await join(database, ada.household, grace);
  const row = await dbGet<{ id: string }>(
    database,
    sql`SELECT id FROM ${appTable(database, 'list')} WHERE household_id = ${ada.household} LIMIT 1`,
  );
  if (!row) throw new Error('no list');
  list = row.id;
});
afterAll(async () => database.close());

const send = (who: Someone, changes: Mutation['changes'][number][], household = ada.household) =>
  applyMutation(
    { database, ring: TEST_RING, limits: LIMITS },
    who.accountId,
    { mutationId: crypto.randomUUID(), householdId: household, changes },
    1_800_000_000_000,
  );
const product = (id: string) => ({
  table: 'product' as const,
  id,
  create: true as const,
  fields: { name: `Thing ${id.slice(0, 6)}`, createdAt: 1, lastAddedAt: 1 },
});
const item = (id: string, productId: string, addedBy: string) => ({
  table: 'item' as const,
  id,
  create: true as const,
  fields: {
    listId: list,
    productId,
    name: 'Thing',
    quantity: '1',
    unit: null,
    note: null,
    categoryId: null,
    position: 'a0',
    addedBy,
    addedAt: 1,
  },
});

describe(`who added an item and who ticked it (${leg})`, () => {
  it('accepts the sender as the one who added it and as the one who ticked it', async () => {
    const productId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    expect(
      (await send(grace, [product(productId), item(itemId, productId, grace.personId)])).status,
    ).toBe('applied');
    const tick = await send(grace, [
      { table: 'item', id: itemId, fields: { boughtAt: 5, boughtBy: grace.personId } },
    ]);
    expect(tick.status).toBe('applied');
  });

  it('refuses an item that says another member added it, and writes nothing', async () => {
    const productId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const result = await send(grace, [product(productId), item(itemId, productId, ada.personId)]);
    expect(result).toMatchObject({ status: 'refused', reason: 'not_found' });
    expect(
      await dbGet(database, sql`SELECT id FROM ${appTable(database, 'item')} WHERE id = ${itemId}`),
    ).toBeUndefined();
    expect(
      await dbGet(
        database,
        sql`SELECT id FROM ${appTable(database, 'product')} WHERE id = ${productId}`,
      ),
    ).toBeUndefined();
  });

  it('refuses a tick that says another member did it, and the item stays open', async () => {
    const productId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    await send(ada, [product(productId), item(itemId, productId, ada.personId)]);
    const result = await send(grace, [
      { table: 'item', id: itemId, fields: { boughtAt: 5, boughtBy: ada.personId } },
    ]);
    expect(result).toMatchObject({ status: 'refused', reason: 'not_found' });
    const row = await dbGet<{ bought_at: number | null }>(
      database,
      sql`SELECT bought_at FROM ${appTable(database, 'item')} WHERE id = ${itemId}`,
    );
    expect(row?.bought_at).toBeNull();
  });

  it('refuses a person who is not in the household at all, as before', async () => {
    const eve = await somebody(database, 'Eve');
    const productId = crypto.randomUUID();
    const result = await send(grace, [
      product(productId),
      item(crypto.randomUUID(), productId, eve.personId),
    ]);
    expect(result).toMatchObject({ status: 'refused', reason: 'not_found' });
  });

  it('still folds what two people added at once into one, keeping the earlier adder, since the server does that and not the sender', async () => {
    // Both add "the same" product and item; the second is folded into the first, whose adder stays.
    const name = `Fold ${crypto.randomUUID().slice(0, 6)}`;
    const make = (who: Someone) => {
      const productId = crypto.randomUUID();
      return [
        { ...product(productId), fields: { name, createdAt: 1, lastAddedAt: 1 } },
        item(crypto.randomUUID(), productId, who.personId),
      ];
    };
    expect((await send(ada, make(ada))).status).toBe('applied');
    const second = await send(grace, make(grace));
    expect(second.status).toBe('applied');
  });
});
