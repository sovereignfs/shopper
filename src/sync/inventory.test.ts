import { sql } from 'drizzle-orm';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import { inventoryNameKey } from '../catalog/inventory-key';
import { productNameKey } from '../catalog/product-key';
import { starterEntryByKey } from '../catalog/starter';
import { unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limits } from '../limits/config';
import { type ApplyResult, applyMutation } from './apply';
import { mergeChange } from './merge';
import { pullHousehold } from './pull';

/**
 * A person's Inventory on the server (task 23.3, DESIGN.md §8.8): written and read by the account whose own group it is, **and nobody else, whoever is on any of
 * that group's lists**: rows, and what a fold or a delete leaves behind, which is of no list and would otherwise go to every member.
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
};
const PLANTED = 'PLANTED-Good-Bin-Bags';
const NOTE = 'PLANTED-the-strong-ones';

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
  // Grace is on Ada's lists, as someone a list is shared with: her own group is hers, and Ada's is not.
  await join(database, ada.household, grace);
});
afterAll(async () => database.close());

const deps = (limits: Limits = LIMITS) => ({ database, ring: TEST_RING, limits });
const mutation = (household: string, changes: Mutation['changes'][number][]): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: household,
  changes,
});
const make = (id: string, fields: Record<string, string | number | null>) => ({
  table: 'inventory_item' as const,
  id,
  create: true as const,
  fields: { createdAt: 1, recurring: 0, hidden: 0, ...fields },
});
const edit = (id: string, fields: Record<string, string | number | null>) => ({
  table: 'inventory_item' as const,
  id,
  fields,
});
const rowOf = (id: string) =>
  dbGet<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'inventory_item')} WHERE id = ${id}`,
  );
const inventoryOf = async (who: Someone, household: string) =>
  (await pullHousehold(database, TEST_RING, who.accountId, household, 0))?.inventory ?? [];
const applied = (result: ApplyResult) => {
  if (result.status !== 'applied') throw new Error(`expected applied, got ${result.status}`);
  return result;
};

describe(`the account’s own Inventory on the server (${leg})`, () => {
  it('makes an item sealed, with a name key of its own, a flag as the dialect’s boolean, and hands it back to the account', async () => {
    const id = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [
          make(id, { name: PLANTED, note: NOTE, recurring: 1, quantity: '1', unit: 'pcs' }),
        ]),
      ),
    );
    const row = await rowOf(id);
    // What a person wrote is in the sealed envelope and in no column, and the key is of its own, never a product's of the same name.
    expect(JSON.stringify(row)).not.toContain('PLANTED');
    const sealed = unsealRow('inventory_item', id, String(row?.sealed), TEST_RING);
    expect(sealed).toEqual({ name: PLANTED, note: NOTE });
    expect(row?.name_key).toBe(inventoryNameKey(TEST_RING, ada.household, PLANTED));
    expect(row?.name_key).not.toBe(productNameKey(TEST_RING, ada.household, PLANTED));
    expect(Boolean(row?.recurring)).toBe(true);
    expect(Boolean(row?.hidden)).toBe(false);

    const pulled = (await inventoryOf(ada, ada.household)).find((each) => each.id === id);
    expect(pulled).toMatchObject({
      name: PLANTED,
      note: NOTE,
      recurring: true,
      hidden: false,
      quantity: '1',
      unit: 'pcs',
      starterKey: null,
      deletedAt: null,
    });
  });

  it('changes a flag in either direction, and reads it back as a boolean on this dialect', async () => {
    const id = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(id, { name: 'Flag test item' })]),
      ),
    );
    const flagged = async () =>
      (await inventoryOf(ada, ada.household)).find((each) => each.id === id);
    expect(await flagged()).toMatchObject({ hidden: false, recurring: false });
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { hidden: 1, recurring: 1 })]),
      ),
    );
    expect(await flagged()).toMatchObject({ hidden: true, recurring: true });
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { hidden: 0 })]),
      ),
    );
    expect(await flagged()).toMatchObject({ hidden: false, recurring: true });
  });

  it('overrides a starter entry by its key: it keeps the starter’s name until renamed, and the entry’s key stays', async () => {
    const entry = starterEntryByKey('oat-milk') ?? starterEntryByKey('milk');
    if (!entry) throw new Error('no starter entry to override');
    const id = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(id, { starterKey: entry.key, recurring: 1 })]),
      ),
    );
    let row = await rowOf(id);
    // No name of its own, and the key is the starter's name's.
    expect(unsealRow('inventory_item', id, String(row?.sealed), TEST_RING)).toEqual({});
    expect(row?.name_key).toBe(inventoryNameKey(TEST_RING, ada.household, entry.name));
    expect(row?.starter_key).toBe(entry.key);

    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(id, { name: 'Barista oat drink' })]),
      ),
    );
    row = await rowOf(id);
    expect(row?.starter_key).toBe(entry.key);
    expect(row?.name_key).toBe(inventoryNameKey(TEST_RING, ada.household, 'Barista oat drink'));
    const pulled = (await inventoryOf(ada, ada.household)).find((each) => each.id === id);
    expect(pulled).toMatchObject({ starterKey: entry.key, name: 'Barista oat drink' });
  });

  it('refuses a starter entry the build does not have for an override that has no name, and a row with neither a name nor an entry', async () => {
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(crypto.randomUUID(), { starterKey: 'no-such-entry-here' })]),
      ),
    ).toMatchObject({ status: 'refused', reason: 'invalid' });
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(crypto.randomUUID(), { note: 'nothing to call it' })]),
      ),
    ).toMatchObject({ status: 'refused', reason: 'invalid' });
  });

  it('folds an override of an entry already overridden, whatever either was renamed to, and never turns a row into another entry’s override', async () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(first, { starterKey: 'bread', name: 'Sourdough' })]),
      ),
    );
    // Another device overrode the same entry offline, with the starter's own name: it is the same entry, so it is one row.
    const result = applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(second, { starterKey: 'bread', note: 'sliced' })]),
      ),
    );
    expect(result).toMatchObject({ folds: [{ table: 'inventory_item', from: second, to: first }] });
    expect(await rowOf(second)).toBeUndefined();
    const kept = await rowOf(first);
    expect(unsealRow('inventory_item', first, String(kept?.sealed), TEST_RING)).toMatchObject({
      name: 'Sourdough',
      note: 'sliced',
    });
    // A row cannot be pointed at another entry.
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(first, { starterKey: 'apple' })]),
      ),
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
  });

  it('folds the same name made twice, however it is written, restoring the one that was deleted, and refuses a rename into a name that is taken', async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(a, { name: 'Dish  Sponges' })]),
      ),
    );
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(a, { deletedAt: 5 })]),
      ),
    );
    // Made again, as another case and spacing, it is the same thing: folded into the deleted one, which is back.
    const result = applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(b, { name: 'dish sponges', note: 'green ones' })]),
      ),
    );
    expect(result).toMatchObject({ folds: [{ from: b, to: a }] });
    const row = await rowOf(a);
    expect(row?.deleted_at ?? null).toBeNull();
    expect(unsealRow('inventory_item', a, String(row?.sealed), TEST_RING)).toMatchObject({
      note: 'green ones',
    });
    // The folded id leads to the survivor: a later change to it is a change to that one.
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(b, { recurring: 1 })]),
      ),
    );
    expect(Boolean((await rowOf(a))?.recurring)).toBe(true);

    const other = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(other, { name: 'Something else' })]),
      ),
    );
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(other, { name: 'DISH SPONGES' })]),
      ),
    ).toMatchObject({ status: 'refused', reason: 'duplicate' });
  });

  it('counts a person’s items against the limit, with its sentence, and a deleted one does not count', async () => {
    const owner = await somebody(database, 'Limit');
    const limits = { ...LIMITS, inventoryItems: 2 };
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const [index, id] of ids.slice(0, 2).entries())
      applied(
        await applyMutation(
          deps(limits),
          owner.accountId,
          mutation(owner.household, [make(id, { name: `Limited ${index}` })]),
        ),
      );
    expect(
      await applyMutation(
        deps(limits),
        owner.accountId,
        mutation(owner.household, [make(ids[2] ?? '', { name: 'Limited 2' })]),
      ),
    ).toMatchObject({
      status: 'refused',
      reason: 'limit',
      sentence: expect.stringContaining('Inventory can hold at most 2 items'),
    });
    applied(
      await applyMutation(
        deps(limits),
        owner.accountId,
        mutation(owner.household, [edit(ids[0] ?? '', { deletedAt: 9 })]),
      ),
    );
    applied(
      await applyMutation(
        deps(limits),
        owner.accountId,
        mutation(owner.household, [make(ids[2] ?? '', { name: 'Limited 2' })]),
      ),
    );
  });
});

describe(`nobody else’s (${leg})`, () => {
  it('refuses a person on one of the group’s lists, and a stranger, as not found: to make an item, to change one, to delete one', async () => {
    const mine = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [make(mine, { name: 'Ada’s own thing' })]),
      ),
    );
    const before = JSON.stringify(await rowOf(mine));
    for (const who of [grace, lin]) {
      for (const changes of [
        [make(crypto.randomUUID(), { name: 'Sneaky' })],
        [edit(mine, { name: 'Renamed by someone else' })],
        [edit(mine, { hidden: 1 })],
        [edit(mine, { deletedAt: 3 })],
      ])
        expect(
          await applyMutation(deps(), who.accountId, mutation(ada.household, changes)),
        ).toMatchObject({ status: 'refused', reason: 'not_found' });
    }
    expect(JSON.stringify(await rowOf(mine))).toBe(before);
    // Her own group is hers: the same person writes there.
    applied(
      await applyMutation(
        deps(),
        grace.accountId,
        mutation(grace.household, [make(crypto.randomUUID(), { name: 'Grace’s own thing' })]),
      ),
    );
    // And Ada cannot reach into it.
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(grace.household, [make(crypto.randomUUID(), { name: 'Ada in Grace’s group' })]),
      ),
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
  });

  it('hands a person on one of the group’s lists none of it in a pull, rows, deletes and folds alike, while the account has all of it', async () => {
    const host = await somebody(database, 'Hostess');
    const guest = await somebody(database, 'Guest');
    await join(database, host.household, guest);
    const one = crypto.randomUUID();
    const folded = crypto.randomUUID();
    const gone = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        host.accountId,
        mutation(host.household, [
          make(one, { name: 'Hostess tea' }),
          make(gone, { name: 'Hostess biscuits' }),
        ]),
      ),
    );
    // A fold and a delete: what they leave behind is of no list.
    applied(
      await applyMutation(
        deps(),
        host.accountId,
        mutation(host.household, [make(folded, { name: 'hostess  TEA' })]),
      ),
    );
    applied(
      await applyMutation(
        deps(),
        host.accountId,
        mutation(host.household, [edit(gone, { deletedAt: 7 })]),
      ),
    );

    const own = await pullHousehold(database, TEST_RING, host.accountId, host.household, 0);
    expect(own?.inventory?.map((row) => row.name).sort()).toEqual([
      'Hostess biscuits',
      'Hostess tea',
    ]);
    expect(own?.aliases.some((alias) => alias.table === 'inventory_item')).toBe(true);

    const theirs = await pullHousehold(database, TEST_RING, guest.accountId, host.household, 0);
    // The guest has the group's lists and nothing of its Inventory: no row, no alias, no tombstone, and nothing that says one was made.
    expect(theirs?.lists.length).toBeGreaterThan(0);
    expect(theirs?.inventory ?? []).toEqual([]);
    expect(theirs?.aliases.filter((alias) => alias.table === 'inventory_item')).toEqual([]);
    expect(theirs?.tombstones.filter((tombstone) => tombstone.table === 'inventory_item')).toEqual(
      [],
    );
    const said = JSON.stringify(theirs);
    expect(said).not.toContain('Hostess tea');
    expect(said).not.toContain('Hostess biscuits');
    // A person who is no one in that group gets nothing at all, as before.
    expect(
      await pullHousehold(database, TEST_RING, lin.accountId, host.household, 0),
    ).toBeUndefined();
  });
});

describe(`the order of arrival decides, for Inventory too (${leg})`, () => {
  it('leaves the rows the merge says, for any interleaving of one account’s devices’ changes, flags included, with the counter one for each mutation', async () => {
    const owner = await somebody(database, 'Property');
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const [i, id] of ids.entries())
      applied(
        await applyMutation(
          deps(),
          owner.accountId,
          mutation(owner.household, [make(id, { name: `Thing ${i}` })]),
        ),
      );
    const seqOf = async () =>
      Number(
        (
          await dbGet<{ seq: number | string }>(
            database,
            sql`SELECT seq FROM ${appTable(database, 'household')} WHERE id = ${owner.household}`,
          )
        )?.seq,
      );

    const field = fc.oneof(
      fc.record({ recurring: fc.constantFrom(0, 1) }),
      fc.record({ hidden: fc.constantFrom(0, 1) }),
      fc.record({ icon: fc.constantFrom('apple', 'banana', 'milk', null) }),
      fc.record({ quantity: fc.constantFrom('1', '2', '2.5', null) }),
      fc.record({ note: fc.constantFrom('a', 'b', null) }),
      fc.record({ deletedAt: fc.constantFrom(7, null) }),
      fc.record({ recurring: fc.constantFrom(0, 1), hidden: fc.constantFrom(0, 1) }),
    );
    const change = fc.tuple(fc.integer({ min: 0, max: 2 }), field);

    await fc.assert(
      fc.asyncProperty(fc.array(change, { minLength: 1, maxLength: 12 }), async (changes) => {
        const start = await seqOf();
        const model = new Map<
          string,
          { values: Record<string, string | number | null>; fseq: Record<string, number> }
        >();
        for (const id of ids) {
          const row = await rowOf(id);
          const sealed = unsealRow('inventory_item', id, String(row?.sealed), TEST_RING);
          model.set(id, {
            values: {
              name: sealed.name ?? null,
              note: sealed.note ?? null,
              icon: (row?.icon as string | null) ?? null,
              quantity: (row?.quantity as string | null) ?? null,
              recurring: row?.recurring ? 1 : 0,
              hidden: row?.hidden ? 1 : 0,
              deletedAt: (row?.deleted_at as number | null) ?? null,
              starterKey: null,
              categoryId: null,
              unit: null,
              createdAt: 1,
            },
            fseq: JSON.parse(String(row?.fseq)) as Record<string, number>,
          });
        }
        let seq = start;
        for (const [index, fields] of changes) {
          const id = ids[index] ?? '';
          const result = applied(
            await applyMutation(
              deps(),
              owner.accountId,
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
        expect(await seqOf()).toBe(seq);
        for (const id of ids) {
          const row = await rowOf(id);
          const sealed = unsealRow('inventory_item', id, String(row?.sealed), TEST_RING);
          const want = model.get(id);
          expect({
            note: sealed.note ?? null,
            icon: (row?.icon as string | null) ?? null,
            quantity: (row?.quantity as string | null) ?? null,
            recurring: row?.recurring ? 1 : 0,
            hidden: row?.hidden ? 1 : 0,
            deletedAt: (row?.deleted_at as number | null) ?? null,
            fseq: JSON.parse(String(row?.fseq)),
          }).toEqual({
            note: want?.values.note ?? null,
            icon: want?.values.icon ?? null,
            quantity: want?.values.quantity ?? null,
            recurring: want?.values.recurring,
            hidden: want?.values.hidden,
            deletedAt: want?.values.deletedAt ?? null,
            fseq: want?.fseq,
          });
          expect(Number(row?.seq)).toBeLessThanOrEqual(seq);
        }
      }),
      { numRuns: 15 },
    );
  });
});
