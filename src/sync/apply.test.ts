import { sql } from 'drizzle-orm';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, leave, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import { unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limits } from '../limits/config';
import { productNameKey } from '../catalog/product-key';
import { type ApplyResult, applyMutation } from './apply';
import { mergeChange } from './merge';

const { leg } = testTarget();
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
};
const PLANTED = 'PLANTED-Oat-Milk-Brand';

let database: Database;
let ada: Someone;
let grace: Someone;
let lin: Someone;

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  lin = await somebody(database, 'Lin');
  await join(database, ada.household, grace);
});
afterAll(async () => database.close());

const deps = (limits: Limits = LIMITS) => ({ database, ring: TEST_RING, limits });
const mutation = (household: string, changes: Mutation['changes'][number][]): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: household,
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

const seqOf = async (household: string) =>
  Number(
    (
      await dbGet<{ seq: number | string }>(
        database,
        sql`SELECT seq FROM ${appTable(database, 'household')} WHERE id = ${household}`,
      )
    )?.seq,
  );
const productRow = (id: string) =>
  dbGet<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'product')} WHERE id = ${id}`,
  );
const count = async (table: string, where: ReturnType<typeof sql>) =>
  Number(
    (
      await dbGet<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, table)} WHERE ${where}`,
      )
    )?.n,
  );
const applied = (result: ApplyResult) => {
  if (result.status === 'refused') throw new Error(`refused: ${result.reason}: ${result.sentence}`);
  return result;
};

describe(`applying a mutation (${leg})`, () => {
  it('makes a row, seals its name and note, derives its name key, stamps every field, and steps the counter by one', async () => {
    const before = await seqOf(ada.household);
    const id = crypto.randomUUID();
    const result = applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [create(id, 'Oat Milk', { note: PLANTED, icon: 'milk' })]),
      ),
    );
    expect(result).toMatchObject({
      status: 'applied',
      seq: before + 1,
      changed: [{ table: 'product', id }],
    });
    expect(await seqOf(ada.household)).toBe(before + 1);

    const row = await productRow(id);
    expect(row).toMatchObject({
      household_id: ada.household,
      icon: 'milk',
      seq: before + 1,
      name_key: productNameKey(TEST_RING, ada.household, 'oat milk'),
    });
    expect(JSON.parse(String(row?.fseq))).toEqual({
      name: before + 1,
      createdAt: before + 1,
      note: before + 1,
      icon: before + 1,
    });
    expect(unsealRow('product', id, String(row?.sealed), TEST_RING)).toEqual({
      name: 'Oat Milk',
      note: PLANTED,
    });
    expect(JSON.stringify(row)).not.toContain('Oat Milk');
    expect(JSON.stringify(row)).not.toContain(PLANTED);
  });

  it('lets two members change different fields of one row, and both stand', async () => {
    const id = crypto.randomUUID();
    applied(
      await applyMutation(deps(), ada.accountId, mutation(ada.household, [create(id, 'Bread')])),
    );
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { icon: 'croissant' })]),
      ),
    );
    applied(
      await applyMutation(
        deps(),
        grace.accountId,
        mutation(ada.household, [edit(id, { note: 'wholemeal', defaultQuantity: '2' })]),
      ),
    );
    const row = await productRow(id);
    expect(row).toMatchObject({ icon: 'croissant', default_quantity: '2' });
    expect(unsealRow('product', id, String(row?.sealed), TEST_RING)).toEqual({
      name: 'Bread',
      note: 'wholemeal',
    });
    const stamps = JSON.parse(String(row?.fseq)) as Record<string, number>;
    expect(stamps.icon).toBeLessThan(stamps.note ?? 0);
    expect(stamps.name).toBeLessThan(stamps.icon ?? 0);
  });

  it('lets the later of two changes of one field win, and stamps it with the later counter', async () => {
    const id = crypto.randomUUID();
    applied(
      await applyMutation(deps(), ada.accountId, mutation(ada.household, [create(id, 'Rice')])),
    );
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { icon: 'apple' })]),
      ),
    );
    const last = applied(
      await applyMutation(
        deps(),
        grace.accountId,
        mutation(ada.household, [edit(id, { icon: 'banana' })]),
      ),
    );
    const row = await productRow(id);
    expect(row?.icon).toBe('banana');
    expect(JSON.parse(String(row?.fseq)).icon).toBe(last.seq);
  });

  it('writes nothing when a change changes nothing, and does not move the row’s counter', async () => {
    const id = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [create(id, 'Salt', { icon: 'package' })]),
      ),
    );
    const rowBefore = await productRow(id);
    const result = applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { icon: 'package' })]),
      ),
    );
    expect(result.changed).toEqual([]);
    expect((await productRow(id))?.seq).toBe(rowBefore?.seq);
  });
});

describe(`a mutation sent again (${leg})`, () => {
  it('is answered as it was and writes nothing, including when it is sent many times at once', async () => {
    const id = crypto.randomUUID();
    const m = mutation(ada.household, [create(id, 'Pasta')]);
    const first = applied(await applyMutation(deps(), ada.accountId, m));
    const seq = await seqOf(ada.household);
    const again = applied(await applyMutation(deps(), ada.accountId, m));
    expect(again).toEqual({ status: 'replayed', seq: first.seq, changed: [], folds: [] });
    expect(await seqOf(ada.household)).toBe(seq);

    const racing = mutation(ada.household, [create(crypto.randomUUID(), 'Beans')]);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => applyMutation(deps(), ada.accountId, racing)),
    );
    expect(results.filter((r) => r.status === 'applied')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'replayed')).toHaveLength(4);
    expect(await seqOf(ada.household)).toBe(seq + 1);
    expect(await count('applied_mutation', sql`id = ${racing.mutationId}`)).toBe(1);
  });

  it('is a different mutation for another account, which sends its own ids', async () => {
    const m = mutation(ada.household, [create(crypto.randomUUID(), 'Oats')]);
    applied(await applyMutation(deps(), ada.accountId, m));
    // The same mutation id from an account that is in the household is its own mutation: nothing links it to Ada's.
    const replay = await applyMutation(deps(), grace.accountId, {
      ...m,
      changes: [create(crypto.randomUUID(), 'Rye')],
    });
    expect(replay.status).toBe('applied');
  });
});

describe(`what is refused (${leg})`, () => {
  it('a mutation for a household the account is not in, an outsider and a former member alike, reads as not found and writes nothing', async () => {
    const seq = await seqOf(ada.household);
    const id = crypto.randomUUID();
    for (const who of [lin, { accountId: 'a-stranger' }]) {
      const result = await applyMutation(
        deps(),
        who.accountId,
        mutation(ada.household, [create(id, 'Sneaky')]),
      );
      expect(result).toMatchObject({ status: 'refused', reason: 'not_found' });
    }
    await join(database, ada.household, lin);
    await leave(database, ada.household, lin);
    expect(
      await applyMutation(deps(), lin.accountId, mutation(ada.household, [create(id, 'Sneaky')])),
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
    expect(await seqOf(ada.household)).toBe(seq);
    expect(await productRow(id)).toBeUndefined();
  });

  it('a household that does not exist reads the same as one that is not the account’s', async () => {
    const a = await applyMutation(
      deps(),
      ada.accountId,
      mutation(crypto.randomUUID(), [create(crypto.randomUUID(), 'x')]),
    );
    const b = await applyMutation(
      deps(),
      ada.accountId,
      mutation(grace.household, [create(crypto.randomUUID(), 'x')]),
    );
    expect(a).toEqual(b);
  });

  it('a row that is another household’s, to change or to make, and one that is not there, read as not found', async () => {
    const mine = crypto.randomUUID();
    const theirs = crypto.randomUUID();
    applied(
      await applyMutation(deps(), ada.accountId, mutation(ada.household, [create(mine, 'Mine')])),
    );
    applied(
      await applyMutation(
        deps(),
        grace.accountId,
        mutation(grace.household, [create(theirs, 'Theirs')]),
      ),
    );
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(theirs, { icon: 'apple' })]),
      ),
    ).toMatchObject({ reason: 'not_found' });
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [create(theirs, 'Hijack')]),
      ),
    ).toMatchObject({ reason: 'not_found' });
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(crypto.randomUUID(), { icon: 'apple' })]),
      ),
    ).toMatchObject({ reason: 'not_found' });
    expect((await productRow(theirs))?.icon).toBeNull();
    expect((await productRow(mine))?.household_id).toBe(ada.household);
  });

  it('a reference to a category that is another household’s, or is not there, and to one of its own, which is fine', async () => {
    const own = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'category')} WHERE household_id = ${ada.household} AND starter_key = 'bakery'`,
    );
    const theirs = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'category')} WHERE household_id = ${lin.household} AND starter_key = 'bakery'`,
    );
    const id = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [create(id, 'Bun', { categoryId: own?.id ?? '' })]),
      ),
    );
    expect((await productRow(id))?.category_id).toBe(own?.id);
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { categoryId: theirs?.id ?? '' })]),
      ),
    ).toMatchObject({ reason: 'not_found' });
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { categoryId: crypto.randomUUID() })]),
      ),
    ).toMatchObject({ reason: 'not_found' });
    expect((await productRow(id))?.category_id).toBe(own?.id);
  });

  it('a malformed mutation, with a sentence, before anything is read', async () => {
    const result = await applyMutation(
      { ...deps(), tables: {} },
      ada.accountId,
      mutation(ada.household, [create(crypto.randomUUID(), 'x')]),
    );
    expect(result).toMatchObject({ status: 'refused', reason: 'unsupported' });
  });

  it('a rename to a name the household already has, which is a person’s decision and is refused', async () => {
    const taken = crypto.randomUUID();
    const other = crypto.randomUUID();
    applied(
      await applyMutation(deps(), ada.accountId, mutation(ada.household, [create(taken, 'Honey')])),
    );
    applied(
      await applyMutation(deps(), ada.accountId, mutation(ada.household, [create(other, 'Jam')])),
    );
    const result = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [edit(other, { name: 'HONEY' })]),
    );
    expect(result).toMatchObject({ status: 'refused', reason: 'duplicate' });
  });

  it('a product past the household’s limit, with the limit’s sentence, and a deleted one does not count', async () => {
    const owner = await somebody(database, 'Limited');
    const small = { ...LIMITS, householdProducts: 2 };
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    applied(
      await applyMutation(
        deps(small),
        owner.accountId,
        mutation(owner.household, [create(ids[0] ?? '', 'One')]),
      ),
    );
    applied(
      await applyMutation(
        deps(small),
        owner.accountId,
        mutation(owner.household, [create(ids[1] ?? '', 'Two')]),
      ),
    );
    const over = await applyMutation(
      deps(small),
      owner.accountId,
      mutation(owner.household, [create(ids[2] ?? '', 'Three')]),
    );
    expect(over).toEqual({
      status: 'refused',
      reason: 'limit',
      sentence: "A household's catalog can hold at most 2 products, and this one holds them all.",
    });
    applied(
      await applyMutation(
        deps(small),
        owner.accountId,
        mutation(owner.household, [edit(ids[0] ?? '', { deletedAt: 5 })]),
      ),
    );
    applied(
      await applyMutation(
        deps(small),
        owner.accountId,
        mutation(owner.household, [create(ids[2] ?? '', 'Three')]),
      ),
    );
  });

  it('rolls the whole mutation back when any change is refused: nothing half applied, the counter not stepped, the id not recorded', async () => {
    const seq = await seqOf(ada.household);
    const first = crypto.randomUUID();
    const m = mutation(ada.household, [
      create(first, 'Half'),
      edit(crypto.randomUUID(), { icon: 'apple' }),
    ]);
    expect(await applyMutation(deps(), ada.accountId, m)).toMatchObject({
      status: 'refused',
      reason: 'not_found',
    });
    expect(await productRow(first)).toBeUndefined();
    expect(await seqOf(ada.household)).toBe(seq);
    expect(await count('applied_mutation', sql`id = ${m.mutationId}`)).toBe(0);
  });
});

describe(`deleting and restoring (${leg})`, () => {
  it('an edit restores a deleted row, a change that says it is deleted is believed, and two deletes are a delete', async () => {
    const id = crypto.randomUUID();
    applied(
      await applyMutation(deps(), ada.accountId, mutation(ada.household, [create(id, 'Tea')])),
    );
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { deletedAt: 10 })]),
      ),
    );
    applied(
      await applyMutation(
        deps(),
        grace.accountId,
        mutation(ada.household, [edit(id, { deletedAt: 11 })]),
      ),
    );
    // Two deletes are a delete; the later says when.
    expect((await productRow(id))?.deleted_at).toBe(11);
    // An edit of something else by someone who did not see the delete brings it back.
    applied(
      await applyMutation(
        deps(),
        grace.accountId,
        mutation(ada.household, [edit(id, { icon: 'coffee' })]),
      ),
    );
    const row = await productRow(id);
    expect(row).toMatchObject({ icon: 'coffee', deleted_at: null });
    // And an undo of the delete is a restore like any other.
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { deletedAt: 12 })]),
      ),
    );
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { deletedAt: null })]),
      ),
    );
    expect((await productRow(id))?.deleted_at).toBeNull();
  });
});

describe(`the order of arrival decides, and nothing else does (${leg})`, () => {
  it('leaves the rows the merge says, for any interleaving of devices’ changes, with the counter one for each mutation', async () => {
    const owner = await somebody(database, 'Property');
    const friend = await somebody(database, 'Friend');
    await join(database, owner.household, friend);
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    // The rows exist first, as they do after a sync.
    for (const [i, id] of ids.entries())
      applied(
        await applyMutation(
          deps(),
          owner.accountId,
          mutation(owner.household, [create(id, `Thing ${i}`)]),
        ),
      );

    const field = fc.oneof(
      fc.record({ icon: fc.constantFrom('apple', 'banana', 'milk', null) }),
      fc.record({ defaultQuantity: fc.constantFrom('1', '2', '2.5', null) }),
      fc.record({ note: fc.constantFrom('a', 'b', null) }),
      fc.record({ deletedAt: fc.constantFrom(7, null) }),
      fc.record({ icon: fc.constantFrom('apple', 'milk'), note: fc.constantFrom('x', 'y') }),
    );
    const change = fc.tuple(fc.integer({ min: 0, max: 2 }), field, fc.boolean());

    await fc.assert(
      fc.asyncProperty(fc.array(change, { minLength: 1, maxLength: 12 }), async (changes) => {
        const start = await seqOf(owner.household);
        // The model: the rows as they are now, changed in the order the server will meet them.
        const model = new Map<
          string,
          { values: Record<string, string | number | null>; fseq: Record<string, number> }
        >();
        for (const id of ids) {
          const row = await productRow(id);
          const sealed = unsealRow('product', id, String(row?.sealed), TEST_RING);
          model.set(id, {
            values: {
              name: sealed.name ?? null,
              note: sealed.note ?? null,
              icon: (row?.icon as string | null) ?? null,
              defaultQuantity: (row?.default_quantity as string | null) ?? null,
              deletedAt: (row?.deleted_at as number | null) ?? null,
              categoryId: null,
              defaultUnit: null,
              lastAddedAt: null,
              createdAt: 1,
            },
            fseq: JSON.parse(String(row?.fseq)) as Record<string, number>,
          });
        }
        let seq = start;
        for (const [index, fields, byFriend] of changes) {
          const id = ids[index] ?? '';
          const who = byFriend ? friend : owner;
          const result = applied(
            await applyMutation(
              deps(),
              who.accountId,
              mutation(owner.household, [edit(id, fields)]),
            ),
          );
          seq += 1;
          expect(result.seq).toBe(seq);
          const entry = model.get(id);
          if (entry) {
            const merged = mergeChange(entry.values, entry.fseq, fields, seq);
            model.set(id, { values: { ...merged.values }, fseq: { ...merged.fseq } });
          }
        }
        expect(await seqOf(owner.household)).toBe(seq);
        for (const id of ids) {
          const row = await productRow(id);
          const sealed = unsealRow('product', id, String(row?.sealed), TEST_RING);
          const want = model.get(id);
          expect({
            note: sealed.note ?? null,
            icon: (row?.icon as string | null) ?? null,
            defaultQuantity: (row?.default_quantity as string | null) ?? null,
            deletedAt: (row?.deleted_at as number | null) ?? null,
            fseq: JSON.parse(String(row?.fseq)),
          }).toEqual({
            note: want?.values.note ?? null,
            icon: want?.values.icon ?? null,
            defaultQuantity: want?.values.defaultQuantity ?? null,
            deletedAt: want?.values.deletedAt ?? null,
            fseq: want?.fseq,
          });
          // No row is ahead of the household.
          expect(Number(row?.seq)).toBeLessThanOrEqual(seq);
        }
      }),
      { numRuns: 15 },
    );
  });
});

describe('the pure merge', () => {
  it('sets what is said and leaves the rest, stamps only what changed, and restores a deleted row unless it says deletedAt', () => {
    const base = { a: 'x', b: 'y', deletedAt: null };
    const one = mergeChange(base, { a: 1, b: 1 }, { a: 'z' }, 5);
    expect(one).toEqual({
      values: { a: 'z', b: 'y', deletedAt: null },
      fseq: { a: 5, b: 1 },
      changed: ['a'],
    });
    expect(mergeChange(base, {}, { a: 'x' }, 5).changed).toEqual([]);
    const dead = { a: 'x', deletedAt: 3 };
    expect(mergeChange(dead, {}, { a: 'q' }, 6)).toMatchObject({
      values: { a: 'q', deletedAt: null },
      changed: ['a', 'deletedAt'],
    });
    expect(mergeChange(dead, {}, { deletedAt: 4 }, 6)).toMatchObject({ values: { deletedAt: 4 } });
    expect(mergeChange(dead, {}, { deletedAt: null }, 6).values.deletedAt).toBeNull();
  });
});
