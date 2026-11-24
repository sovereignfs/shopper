import { sql } from 'drizzle-orm';
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
import type { Limits } from '../limits/config';
import { applyMutation } from './apply';
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
