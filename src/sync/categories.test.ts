import { sql } from 'drizzle-orm';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import { STARTER_CATEGORIES } from '../catalog/categories';
import { sealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import {
  type Keyring,
  deriveInventoryKeyring,
  deriveListKeyring,
  newKeyring,
  openField,
  sealField,
} from '../keys/household';
import type { Limits } from '../limits/config';
import { applyMutation } from './apply';
import { mergeChange } from './merge';
import { pullHousehold } from './pull';

/**
 * A person's own categories (task 23.3, DESIGN.md §8.3), on the server: **theirs alone.** Everyone on a list of their group reads the starter categories, by
 * their key and the code's names, and nothing else: none of the person's own, no name they gave a starter, no ciphertext, no tombstone. And what an item or a
 * product says is a starter category, for anyone else on the list could not read a person's own. The marker is a word that must reach no one else.
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
const MARKER = 'MARKERcat3Hardware';

let database: Database;
let ada: Someone;
let grace: Someone;
let mover: Someone;
let moverGuest: Someone;
const ownId = crypto.randomUUID();
const tombId = crypto.randomUUID();
const movedOwnId = crypto.randomUUID();
const deps = () => ({ database, ring: TEST_RING, limits: LIMITS });
const table = () => appTable(database, 'category');

/** Steps a group's counter and gives the number, so that a row written by hand is one a pull at cursor 0 takes. */
const step = async (household: string): Promise<number> =>
  Number(
    (
      await dbGet<{ seq: number | string }>(
        database,
        sql`UPDATE ${appTable(database, 'household')} SET seq = seq + 1 WHERE id = ${household} RETURNING seq`,
      )
    )?.seq,
  );

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  mover = await somebody(database, 'Mover');
  moverGuest = await somebody(database, 'Mover-guest');
  // Grace and the mover's guest are on a list of the group, as people a list is shared with.
  await join(database, ada.household, grace);
  await join(database, mover.household, moverGuest);

  // Ada, with a group the server seals: a category of her own, the starter _Produce_ given a name of hers, and what a delete of hers left behind.
  const seq = await step(ada.household);
  await dbRun(
    database,
    sql`INSERT INTO ${table()} (id, household_id, starter_key, sealed, icon, position, hidden, seq)
        VALUES (${ownId}, ${ada.household}, ${null}, ${sealRow('category', ownId, { name: `Hardware ${MARKER}` }, TEST_RING)}, ${'package'}, ${'zz'}, ${false}, ${seq})`,
  );
  const produce = await dbGet<{ id: string }>(
    database,
    sql`SELECT id FROM ${table()} WHERE household_id = ${ada.household} AND starter_key = ${'produce'}`,
  );
  await dbRun(
    database,
    sql`UPDATE ${table()} SET sealed = ${sealRow('category', produce?.id ?? '', { name: `Fruit and veg ${MARKER}` }, TEST_RING)}, seq = ${seq} WHERE id = ${produce?.id ?? ''}`,
  );
  await dbRun(
    database,
    sql`INSERT INTO ${appTable(database, 'tombstone')} (household_id, list_id, table_name, id, seq, created_at)
        VALUES (${ada.household}, ${null}, ${'category'}, ${tombId}, ${seq}, ${1})`,
  );

  // The mover's group has moved to device encryption: the same, as ciphertext.
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${mover.household}`,
  );
  const movedSeq = await step(mover.household);
  await dbRun(
    database,
    sql`INSERT INTO ${table()} (id, household_id, starter_key, sealed, encrypted, icon, position, hidden, seq)
        VALUES (${movedOwnId}, ${mover.household}, ${null}, ${''}, ${JSON.stringify({ name: `e2.1.${mover.household}.${movedOwnId}.${MARKER}AAAAAAAAAA` })}, ${'package'}, ${'zz'}, ${false}, ${movedSeq})`,
  );
  await dbRun(
    database,
    sql`UPDATE ${table()} SET sealed = ${''}, encrypted = ${JSON.stringify({ name: `e2.1.${mover.household}.${movedOwnId}.${MARKER}BBBBBBBBBB` })}, seq = ${movedSeq}
        WHERE household_id = ${mover.household} AND starter_key = ${'bakery'}`,
  );
});
afterAll(async () => database.close());

const pull = async (who: Someone, household: string) => {
  const found = await pullHousehold(database, TEST_RING, who.accountId, household, 0);
  if (!found) throw new Error('no pull');
  return found;
};
const named = (rows: readonly Record<string, unknown>[]) => rows.map((row) => String(row.name));

describe(`a person’s own categories are theirs alone (${leg})`, () => {
  it('gives anyone else on a list of the group the starter categories by the code’s names, and nothing of the person’s own, nor what they named a starter', async () => {
    const theirs = await pull(grace, ada.household);
    expect(theirs.categories).toHaveLength(STARTER_CATEGORIES.length);
    expect(theirs.categories.every((row) => row.starterKey !== null)).toBe(true);
    expect(named(theirs.categories)).toEqual(
      expect.arrayContaining(STARTER_CATEGORIES.map((each) => each.name)),
    );
    expect(theirs.categories.find((row) => row.starterKey === 'produce')?.name).toBe('Produce');
    expect(JSON.stringify(theirs)).not.toContain(MARKER);
    expect(theirs.categories.some((row) => 'encrypted' in row)).toBe(false);
    // What a delete of a category of the group's leaves is no list's, and the owner's alone.
    expect(theirs.tombstones.some((each) => each.table === 'category')).toBe(false);
  });

  it('gives the owner all of it: their own category by its name, the starter by theirs, and the tombstone', async () => {
    const mine = await pull(ada, ada.household);
    expect(mine.categories).toHaveLength(STARTER_CATEGORIES.length + 1);
    expect(mine.categories.find((row) => row.id === ownId)?.name).toBe(`Hardware ${MARKER}`);
    expect(mine.categories.find((row) => row.starterKey === 'produce')?.name).toBe(
      `Fruit and veg ${MARKER}`,
    );
    expect(mine.tombstones.some((each) => each.table === 'category' && each.id === tombId)).toBe(
      true,
    );
  });

  it('keeps a moved group’s ciphertext from anyone else too, and hands it to the owner as it is', async () => {
    const theirs = await pull(moverGuest, mover.household);
    expect(theirs.encryption.state).toBe('encrypted');
    expect(theirs.categories).toHaveLength(STARTER_CATEGORIES.length);
    expect(theirs.categories.some((row) => 'encrypted' in row)).toBe(false);
    expect(JSON.stringify(theirs)).not.toContain(MARKER);
    expect(theirs.categories.find((row) => row.starterKey === 'bakery')?.name).toBe('Bakery');
    const mine = await pull(mover, mover.household);
    const own = mine.categories.find((row) => row.id === movedOwnId) as
      { encrypted?: { name: string } } | undefined;
    expect(own?.encrypted?.name).toContain(MARKER);
    const bakery = mine.categories.find((row) => row.starterKey === 'bakery') as
      { encrypted?: { name: string } } | undefined;
    expect(bakery?.encrypted?.name).toContain(MARKER);
    // The starter categories nobody renamed carry nothing to open.
    expect(
      mine.categories.filter((row) => 'encrypted' in row && row.starterKey === 'dairy-eggs'),
    ).toEqual([]);
  });

  it('is not given, by what an item or a product says, to a list: only a starter category is one they may name', async () => {
    const mutation = (fields: Record<string, string | number | null>): Mutation => ({
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: [
        {
          table: 'product',
          id: crypto.randomUUID(),
          create: true,
          fields: {
            listId: ada.list,
            name: `Thing ${crypto.randomUUID()}`,
            createdAt: 1,
            ...fields,
          },
        },
      ],
    });
    // The owner's own category is in the group, and is still not what a product of a list names: its people could not read it.
    expect(
      await applyMutation(deps(), ada.accountId, mutation({ categoryId: ownId })),
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
    const starters = await dbAll<{ id: string }>(
      database,
      sql`SELECT id FROM ${table()} WHERE household_id = ${ada.household} AND starter_key IS NOT NULL`,
    );
    const starter = starters[0]?.id ?? '';
    expect(
      (await applyMutation(deps(), ada.accountId, mutation({ categoryId: starter }))).status,
    ).toBe('applied');
    // Nor another group's starter category, whatever its key.
    const other = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${table()} WHERE household_id = ${grace.household} AND starter_key IS NOT NULL`,
    );
    expect(
      await applyMutation(deps(), ada.accountId, mutation({ categoryId: other?.id ?? '' })),
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
    // The person's own Inventory may name one of their own categories: it is theirs alone too.
    expect(
      (
        await applyMutation(deps(), ada.accountId, {
          mutationId: crypto.randomUUID(),
          householdId: ada.household,
          changes: [
            {
              table: 'inventory_item',
              id: crypto.randomUUID(),
              create: true,
              fields: {
                createdAt: 1,
                name: 'Claw hammer',
                categoryId: ownId,
                recurring: 0,
                hidden: 0,
              },
            },
          ],
        })
      ).status,
    ).toBe('applied');
  });
});

/** A change to the group's categories, as its device makes it. */
const mutation = (household: string, changes: Mutation['changes'][number][]): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: household,
  changes,
});
const make = (id: string, fields: Record<string, string | number | null>) => ({
  table: 'category' as const,
  id,
  create: true as const,
  fields: { position: 'a5', hidden: 0, ...fields },
});
const edit = (id: string, fields: Record<string, string | number | null>) => ({
  table: 'category' as const,
  id,
  fields,
});
const outcome = async (who: Someone, household: string, changes: Mutation['changes'][number][]) =>
  applyMutation(deps(), who.accountId, mutation(household, changes));
const starterId = async (household: string, key: string) =>
  (
    await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${table()} WHERE household_id = ${household} AND starter_key = ${key}`,
    )
  )?.id ?? '';
const rowOf = (id: string) =>
  dbGet<Record<string, unknown>>(database, sql`SELECT * FROM ${table()} WHERE id = ${id}`);

describe(`a person’s own categories are written by them alone, in a group the server seals (${leg})`, () => {
  it('makes, renames, puts in order, hides and deletes one of their own, and the owner reads the name', async () => {
    const id = crypto.randomUUID();
    expect(
      (await outcome(ada, ada.household, [make(id, { name: `Garden ${MARKER}` })])).status,
    ).toBe('applied');
    expect(String((await rowOf(id))?.sealed)).not.toBe('');
    expect(JSON.stringify(await rowOf(id))).not.toContain(MARKER);
    const mine = (await pull(ada, ada.household)).categories.find((row) => row.id === id);
    expect(mine).toMatchObject({ name: `Garden ${MARKER}`, starterKey: null, hidden: false });
    const edits: Record<string, string | number | null>[] = [
      { name: 'Garden and yard' },
      { position: 'a7' },
      { icon: 'apple' },
      { hidden: 1 },
      { deletedAt: 5 },
      { deletedAt: null, hidden: 0 },
    ];
    for (const fields of edits)
      expect(
        (await outcome(ada, ada.household, [edit(id, fields)])).status,
        JSON.stringify(fields),
      ).toBe('applied');
    expect((await pull(ada, ada.household)).categories.find((row) => row.id === id)).toMatchObject({
      name: 'Garden and yard',
      position: 'a7',
      icon: 'apple',
      hidden: false,
      deletedAt: null,
    });
  });

  it('is refused to anyone else on a list of the group, for every change, as not found', async () => {
    const id = crypto.randomUUID();
    await outcome(ada, ada.household, [make(id, { name: 'Ada only' })]);
    const produce = await starterId(ada.household, 'produce');
    const before = JSON.stringify([await rowOf(id), await rowOf(produce)]);
    for (const changes of [
      [make(crypto.randomUUID(), { name: 'Sneaky' })],
      [edit(id, { name: 'Renamed by Grace' })],
      [edit(id, { hidden: 1 })],
      [edit(id, { position: 'a9' })],
      [edit(id, { deletedAt: 3 })],
      [edit(produce, { name: 'Grace’s name for it' })],
      [edit(produce, { hidden: 1 })],
      [edit(produce, { position: 'a0' })],
    ])
      expect(await outcome(grace, ada.household, changes)).toMatchObject({
        status: 'refused',
        reason: 'not_found',
      });
    expect(JSON.stringify([await rowOf(id), await rowOf(produce)])).toBe(before);
  });

  it('lets a starter category be renamed, hidden and moved, and given the code’s name again, and never deleted; and Other is never hidden', async () => {
    const dairy = await starterId(ada.household, 'dairy-eggs');
    const other = await starterId(ada.household, 'other');
    expect(
      (await outcome(ada, ada.household, [edit(dairy, { name: 'Milk and eggs' })])).status,
    ).toBe('applied');
    expect((await pull(ada, ada.household)).categories.find((row) => row.id === dairy)?.name).toBe(
      'Milk and eggs',
    );
    expect(
      (await outcome(ada, ada.household, [edit(dairy, { hidden: 1, position: 'a3' })])).status,
    ).toBe('applied');
    expect((await outcome(ada, ada.household, [edit(dairy, { name: null })])).status).toBe(
      'applied',
    );
    expect((await pull(ada, ada.household)).categories.find((row) => row.id === dairy)?.name).toBe(
      'Dairy & eggs',
    );
    expect(await outcome(ada, ada.household, [edit(dairy, { deletedAt: 9 })])).toMatchObject({
      status: 'refused',
      reason: 'invalid',
    });
    expect(await outcome(ada, ada.household, [edit(other, { hidden: 1 })])).toMatchObject({
      status: 'refused',
      reason: 'invalid',
    });
    expect(await outcome(ada, ada.household, [edit(other, { deletedAt: 9 })])).toMatchObject({
      status: 'refused',
      reason: 'invalid',
    });
    expect(
      (await outcome(ada, ada.household, [edit(other, { name: 'Anything else' })])).status,
    ).toBe('applied');
  });

  it('has a name for every category of the person’s own, and no key of a starter category to set', async () => {
    const id = crypto.randomUUID();
    expect((await outcome(ada, ada.household, [make(id, { icon: 'apple' })])).status).toBe(
      'refused',
    );
    expect(await rowOf(id)).toBeUndefined();
    await outcome(ada, ada.household, [make(id, { name: 'Named' })]);
    expect(await outcome(ada, ada.household, [edit(id, { name: null })])).toMatchObject({
      status: 'refused',
      reason: 'invalid',
    });
    expect((await rowOf(id))?.starter_key).toBeNull();
    expect(
      await outcome(ada, ada.household, [
        make(crypto.randomUUID(), { name: 'x', starterKey: 'produce' }),
      ]),
    ).toMatchObject({ status: 'refused' });
  });

  it('counts a group’s live categories against its limit, hidden and starter ones included, and a deleted one gives its place back', async () => {
    const owner = await somebody(database, 'Limited');
    const small = { ...LIMITS, householdCategories: STARTER_CATEGORIES.length + 1 };
    const run = (changes: Mutation['changes'][number][]) =>
      applyMutation(
        { database, ring: TEST_RING, limits: small },
        owner.accountId,
        mutation(owner.household, changes),
      );
    const first = crypto.randomUUID();
    expect((await run([make(first, { name: 'One' })])).status).toBe('applied');
    expect(await run([make(crypto.randomUUID(), { name: 'Two' })])).toMatchObject({
      status: 'refused',
      reason: 'limit',
      sentence: expect.stringContaining('at most'),
    });
    expect((await run([edit(first, { deletedAt: 4 })])).status).toBe('applied');
    expect((await run([make(crypto.randomUUID(), { name: 'Two' })])).status).toBe('applied');
  });
});

describe(`a person’s own categories in a group its device encrypts (${leg})`, () => {
  let group: Keyring;
  let inventory: Keyring;
  beforeAll(async () => {
    group = newKeyring();
    inventory = await deriveInventoryKeyring(group, mover.household);
  });
  const cipher = (row: string, text: string, options: { slot?: string; keys?: Keyring } = {}) =>
    sealField(
      options.keys ?? inventory,
      { list: options.slot ?? mover.household, table: 'category', row, field: 'name' },
      text,
    );

  it('keeps a name as its device sent it, for the group, and opens only under the group’s Inventory keys; the guest has none of it', async () => {
    const id = crypto.randomUUID();
    const result = await outcome(mover, mover.household, [
      make(id, { name: await cipher(id, `Garden ${MARKER}`) }),
    ]);
    expect(result.status).toBe('applied');
    const row = await rowOf(id);
    expect(row?.sealed).toBe('');
    expect(JSON.stringify(row)).not.toContain(MARKER);
    const mine = (await pull(mover, mover.household)).categories.find((each) => each.id === id) as
      { encrypted?: { name: string } } | undefined;
    const at = { list: mover.household, table: 'category', row: id, field: 'name' };
    expect(await openField(inventory, at, mine?.encrypted?.name ?? '')).toBe(`Garden ${MARKER}`);
    expect(
      await openField(
        await deriveListKeyring(group, mover.household),
        at,
        mine?.encrypted?.name ?? '',
      ),
    ).toBeUndefined();
    const theirs = await pull(moverGuest, mover.household);
    expect(theirs.categories.some((each) => each.id === id)).toBe(false);
    expect(JSON.stringify(theirs)).not.toContain(MARKER);
    // The guest cannot change it: not found.
    expect(
      await outcome(moverGuest, mover.household, [edit(id, { name: await cipher(id, 'x') })]),
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
  });

  it('refuses a name for a list, for another group, or encrypted under a list’s keys, and holds plain text, which the device sends again encrypted', async () => {
    const id = crypto.randomUUID();
    const list = await dbGet<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'list')} WHERE household_id = ${mover.household}`,
    );
    for (const [what, name] of [
      ['a list', await cipher(id, 'x', { slot: list?.id ?? '' })],
      ['another group', await cipher(id, 'x', { slot: crypto.randomUUID() })],
      [
        'a list’s keys',
        await cipher(id, 'x', { keys: await deriveListKeyring(group, mover.household) }),
      ],
    ] as const) {
      const result = await outcome(mover, mover.household, [make(id, { name })]);
      // Under a list's keys for the group's slot, the server cannot tell (it cannot open it): the binding is what it holds, and the device holds the keys.
      expect(result.status, what).toBe(what === 'a list’s keys' ? 'applied' : 'refused');
      if (what !== 'a list’s keys') expect(result).toMatchObject({ reason: 'not_found' });
    }
    expect(
      (
        await outcome(mover, mover.household, [
          make(crypto.randomUUID(), { name: `Plain ${MARKER}` }),
        ])
      ).status,
    ).toBe('held');
  });

  it('lets a starter category be given a name of the person’s, encrypted, and the code’s again', async () => {
    const pantry = await starterId(mover.household, 'pantry');
    expect(
      (
        await outcome(mover, mover.household, [
          edit(pantry, { name: await cipher(pantry, 'Cupboard') }),
        ])
      ).status,
    ).toBe('applied');
    expect((await outcome(mover, mover.household, [edit(pantry, { name: null })])).status).toBe(
      'applied',
    );
    const row = await rowOf(pantry);
    expect(JSON.parse(String(row?.encrypted ?? '{}')).name).toBeUndefined();
  });
});

describe(`the order of arrival decides for categories too (${leg})`, () => {
  it('leaves the rows the merge says, for any order of the owner’s devices’ changes, flags and places included, with the counter one for each mutation', async () => {
    const owner = await somebody(database, 'Property');
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const [i, id] of ids.entries())
      expect(
        (await outcome(owner, owner.household, [make(id, { name: `Own ${i}`, position: `a${i}` })]))
          .status,
      ).toBe('applied');
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
      fc.record({ hidden: fc.constantFrom(0, 1) }),
      fc.record({ position: fc.constantFrom('a0', 'a4', 'b0', 'zz') }),
      fc.record({ icon: fc.constantFrom('apple', 'milk', null) }),
      fc.record({ deletedAt: fc.constantFrom(7, null) }),
      fc.record({ hidden: fc.constantFrom(0, 1), position: fc.constantFrom('a1', 'a9') }),
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
                icon: (row?.icon as string | null) ?? null,
                position: String(row?.position),
                hidden: row?.hidden ? 1 : 0,
                deletedAt: (row?.deleted_at as number | null) ?? null,
                name: null,
              },
              fseq: JSON.parse(String(row?.fseq)) as Record<string, number>,
            });
          }
          let seq = start;
          for (const [index, fields] of changes) {
            const id = ids[index] ?? '';
            const result = await outcome(owner, owner.household, [edit(id, fields)]);
            if (result.status !== 'applied')
              throw new Error(`expected applied, got ${result.status}`);
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
            const want = model.get(id);
            expect({
              icon: (row?.icon as string | null) ?? null,
              position: String(row?.position),
              hidden: row?.hidden ? 1 : 0,
              deletedAt: (row?.deleted_at as number | null) ?? null,
              fseq: JSON.parse(String(row?.fseq)),
            }).toEqual({
              icon: want?.values.icon ?? null,
              position: want?.values.position,
              hidden: want?.values.hidden,
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
