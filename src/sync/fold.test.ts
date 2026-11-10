import { sql } from 'drizzle-orm';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import { unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limits } from '../limits/config';
import { applyMutation, type ApplyResult } from './apply';
import { foldProductFields, resolveAlias } from './fold';

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
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  await join(database, ada.household, grace);
});
afterAll(async () => database.close());

// A getter, since the database is opened in beforeAll and this is read at import.
const deps = {
  get database() {
    return database;
  },
  ring: TEST_RING,
  limits: LIMITS,
};
const mutation = (changes: Mutation['changes'][number][]): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: ada.household,
  changes,
});
const create = (id: string, name: string, extra: Record<string, string | number | null> = {}) => ({
  table: 'product' as const,
  id,
  create: true as const,
  fields: { name, createdAt: 1, ...extra },
});
const edit = (id: string, fields: Record<string, string | number | null>) => ({
  table: 'product' as const,
  id,
  fields,
});
const ok = (r: ApplyResult) => {
  if (r.status === 'refused') throw new Error(`refused: ${r.reason}`);
  return r;
};
const products = () =>
  dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'product')} WHERE household_id = ${ada.household}`,
  );
const aliases = () =>
  dbAll<{ from_id: string; to_id: string; seq: number | string }>(
    database,
    sql`SELECT from_id, to_id, seq FROM ${appTable(database, 'alias')} WHERE household_id = ${ada.household}`,
  );

describe(`folding a product made twice (${leg})`, () => {
  it('makes one product of two members adding the same name, records the alias and a tombstone at the mutation’s counter, and keeps the first’s id', async () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    ok(
      await applyMutation(
        deps,
        ada.accountId,
        mutation([create(first, 'Oat milk', { icon: 'milk' })]),
      ),
    );
    const result = ok(
      await applyMutation(
        deps,
        grace.accountId,
        mutation([
          create(second, 'OAT  MILK', { icon: 'apple', note: 'barista', defaultQuantity: '2' }),
        ]),
      ),
    );
    expect(result.folds).toEqual([{ table: 'product', from: second, to: first }]);
    expect(result.changed).toEqual([{ table: 'product', id: first }]);

    const rows = (await products()).filter((r) => [first, second].includes(String(r.id)));
    expect(rows.map((r) => r.id)).toEqual([first]);
    // What the first had is kept, and what it had nothing in is taken from the second.
    const row = rows[0];
    expect(row?.icon).toBe('milk');
    expect(row?.default_quantity).toBe('2');
    expect(unsealRow('product', first, String(row?.sealed), TEST_RING)).toEqual({
      name: 'Oat milk',
      note: 'barista',
    });
    expect((await aliases()).find((a) => a.from_id === second)).toMatchObject({
      to_id: first,
      seq: result.seq,
    });
    const tomb = await dbGet<{ seq: number | string }>(
      database,
      sql`SELECT seq FROM ${appTable(database, 'tombstone')} WHERE household_id = ${ada.household} AND id = ${second}`,
    );
    expect(Number(tomb?.seq)).toBe(result.seq);
  });

  it('applies a later change that names the folded id to the product it became', async () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    ok(await applyMutation(deps, ada.accountId, mutation([create(first, 'Flour')])));
    ok(await applyMutation(deps, grace.accountId, mutation([create(second, 'flour')])));
    const result = ok(
      await applyMutation(deps, grace.accountId, mutation([edit(second, { icon: 'croissant' })])),
    );
    expect(result.changed).toEqual([{ table: 'product', id: first }]);
    expect((await products()).find((r) => r.id === first)?.icon).toBe('croissant');
    expect(await resolveAlias(database, ada.household, 'product', second)).toBe(first);
    expect(await resolveAlias(database, ada.household, 'product', first)).toBe(first);
  });

  it('follows a chain, and a fold does not count against the limit and is a replay when sent again', async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const owner = await somebody(database, 'Chain');
    const small: Limits = { ...LIMITS, householdProducts: 1 };
    const m = (changes: Mutation['changes'][number][]): Mutation => ({
      mutationId: crypto.randomUUID(),
      householdId: owner.household,
      changes,
    });
    ok(await applyMutation({ ...deps, limits: small }, owner.accountId, m([create(a, 'Tea')])));
    const again = m([create(b, 'tea')]);
    expect(
      ok(await applyMutation({ ...deps, limits: small }, owner.accountId, again)).folds,
    ).toHaveLength(1);
    expect(await applyMutation({ ...deps, limits: small }, owner.accountId, again)).toMatchObject({
      status: 'replayed',
    });
    expect(
      await applyMutation(
        { ...deps, limits: small },
        owner.accountId,
        m([create(crypto.randomUUID(), 'Coffee')]),
      ),
    ).toMatchObject({ reason: 'limit' });
  });

  it('is not a fold when the same id is made again: an id that exists is an edit', async () => {
    const id = crypto.randomUUID();
    ok(await applyMutation(deps, ada.accountId, mutation([create(id, 'Sugar')])));
    const again = ok(
      await applyMutation(deps, ada.accountId, mutation([create(id, 'Sugar', { icon: 'candy' })])),
    );
    expect(again.folds).toEqual([]);
    expect((await products()).find((r) => r.id === id)?.icon).toBe('candy');
  });

  it('never leaves a household with two products of one name key, however many make it at once', async () => {
    const owner = await somebody(database, 'Property');
    const friend = await somebody(database, 'Friend');
    await join(database, owner.household, friend);
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.constantFrom('Milk', 'milk', ' MILK ', 'Bread', 'bread', 'Rice', 'rice  '),
            fc.boolean(),
          ),
          { minLength: 2, maxLength: 8 },
        ),
        async (makes) => {
          await Promise.all(
            makes.map(([name, byFriend]) =>
              applyMutation({ ...deps }, (byFriend ? friend : owner).accountId, {
                mutationId: crypto.randomUUID(),
                householdId: owner.household,
                changes: [create(crypto.randomUUID(), name)],
              }),
            ),
          );
          const rows = await dbAll<{ name_key: string; id: string }>(
            database,
            sql`SELECT name_key, id FROM ${appTable(database, 'product')} WHERE household_id = ${owner.household}`,
          );
          expect(new Set(rows.map((r) => r.name_key)).size).toBe(rows.length);
          const ali = await dbAll<{ from_id: string; to_id: string }>(
            database,
            sql`SELECT from_id, to_id FROM ${appTable(database, 'alias')} WHERE household_id = ${owner.household}`,
          );
          const live = new Set(rows.map((r) => r.id));
          for (const a of ali)
            expect(
              live.has(await resolveAlias(database, owner.household, 'product', a.from_id)),
            ).toBe(true);
        },
      ),
      { numRuns: 8 },
    );
  });
});

describe('what a fold takes from the new row', () => {
  it('takes a field the existing one has nothing in, keeps what it has, and the later lastAddedAt', () => {
    expect(
      foldProductFields(
        { note: null, icon: 'milk', lastAddedAt: 5 },
        { note: 'x', icon: 'apple', lastAddedAt: 9 },
      ),
    ).toEqual({ note: 'x', lastAddedAt: 9 });
    expect(foldProductFields({ note: 'a', lastAddedAt: 9 }, { note: 'b', lastAddedAt: 5 })).toEqual(
      {},
    );
    expect(foldProductFields({}, {})).toEqual({});
  });
});
