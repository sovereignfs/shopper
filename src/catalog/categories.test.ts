import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, somebody } from '../access/test-support';
import type { Database } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { ensureStarterCategories } from '../households/households';
import { makeAccountRecords } from '../people/account-records';
import {
  OTHER,
  STARTER_CATEGORIES,
  STARTER_POSITIONS,
  starterCategory,
  starterPosition,
} from './categories';
import { guessCategory } from './guess';
import { GROCERY_ICONS, isGroceryIcon } from './icons';

const { leg } = testTarget();

describe('the starter categories', () => {
  it('are the fifteen of the design, in its order, ending with Other', () => {
    expect(STARTER_CATEGORIES.map((c) => c.name)).toEqual([
      'Produce',
      'Bakery',
      'Dairy & eggs',
      'Meat & fish',
      'Deli',
      'Frozen',
      'Pantry',
      'Breakfast',
      'Snacks & sweets',
      'Drinks',
      'Household',
      'Personal care',
      'Baby',
      'Pets',
      'Other',
    ]);
    expect(STARTER_CATEGORIES.at(-1)?.key).toBe(OTHER);
  });

  it('have a key, a position and an icon each, and none twice', () => {
    expect(new Set(STARTER_CATEGORIES.map((c) => c.key)).size).toBe(STARTER_CATEGORIES.length);
    expect(new Set(STARTER_POSITIONS).size).toBe(STARTER_CATEGORIES.length);
    expect([...STARTER_POSITIONS]).toEqual([...STARTER_POSITIONS].sort());
    for (const category of STARTER_CATEGORIES)
      expect(isGroceryIcon(category.icon), category.key).toBe(true);
    expect(starterCategory('dairy-eggs')?.name).toBe('Dairy & eggs');
    expect(starterPosition('produce')).toBe(STARTER_POSITIONS[0]);
    expect(starterPosition('nowhere')).toBeUndefined();
  });

  it('use icons that are the design system’s own, which the compiler holds, and that are all different in the list', () => {
    expect(new Set(GROCERY_ICONS).size).toBe(GROCERY_ICONS.length);
    expect(isGroceryIcon('settings')).toBe(false);
    expect(isGroceryIcon('apple')).toBe(true);
    expect(isGroceryIcon('')).toBe(false);
  });
});

describe('the category a new product is given', () => {
  const aisle = STARTER_CATEGORIES.map((c) => c.key);
  const base = { starter: () => undefined, products: [], aisle };

  it('is the starter catalog’s when it has one, whatever the household has bought', () => {
    expect(
      guessCategory({
        ...base,
        name: 'Goat cheese',
        starter: () => 'dairy-eggs',
        products: [{ name: 'goat soap', category: 'household' }],
      }),
    ).toBe('dairy-eggs');
  });

  it('is otherwise the category most used by this household’s products that share a word, a tie going to the earlier in the aisle', () => {
    const products = [
      { name: 'Goat milk', category: 'dairy-eggs' },
      { name: 'Goat meat', category: 'meat-fish' },
      { name: 'Goat soap', category: 'household' },
      { name: 'Goat cheese', category: 'dairy-eggs' },
    ];
    expect(guessCategory({ ...base, name: 'goat yoghurt', products })).toBe('dairy-eggs');
    // One each: the tie is the earlier in the aisle.
    expect(guessCategory({ ...base, name: 'goat soap bar', products: products.slice(1, 3) })).toBe(
      'meat-fish',
    );
  });

  it('does not link on a word of one letter, or on a word that is not shared', () => {
    expect(
      guessCategory({
        ...base,
        name: 'a lemon',
        products: [{ name: 'a pear', category: 'produce' }],
      }),
    ).toBe(OTHER);
    expect(
      guessCategory({ ...base, name: 'x', products: [{ name: 'x', category: 'produce' }] }),
    ).toBe(OTHER);
    expect(
      guessCategory({
        ...base,
        name: 'flour',
        products: [{ name: 'oat milk', category: 'dairy-eggs' }],
      }),
    ).toBe(OTHER);
  });

  it('is Other with nothing to go on, and ignores case, accents’ forms and spacing', () => {
    expect(guessCategory({ ...base, name: 'something odd' })).toBe(OTHER);
    expect(
      guessCategory({
        ...base,
        name: 'OAT   MILK',
        products: [{ name: 'oat Milk', category: 'dairy-eggs' }],
      }),
    ).toBe('dairy-eggs');
  });
});

describe(`a household's categories (${leg})`, () => {
  let database: Database;
  beforeAll(async () => {
    ({ database } = await freshDatabase('app'));
    await runMigrations(database);
  });
  afterAll(async () => database.close());

  const rows = (household: string) =>
    dbAll<{
      starter_key: string;
      icon: string;
      position: string;
      hidden: number | boolean;
      seq: number | string;
      sealed: string | null;
    }>(
      database,
      sql`SELECT starter_key, icon, position, hidden, seq, sealed FROM ${appTable(database, 'category')} WHERE household_id = ${household} ORDER BY position`,
    );

  it('are made with the household, in the starter order, none hidden and none sealed, at its first counter', async () => {
    const ada = await somebody(database, 'Ada');
    const mine = await rows(ada.household);
    expect(mine.map((r) => r.starter_key)).toEqual(STARTER_CATEGORIES.map((c) => c.key));
    expect(mine.map((r) => r.icon)).toEqual(STARTER_CATEGORIES.map((c) => c.icon));
    for (const row of mine) {
      expect(Boolean(row.hidden)).toBe(false);
      expect(row.sealed).toBeNull();
      expect(Number(row.seq)).toBe(1);
    }
  });

  it('are given to a household that predates them, once, and the household’s counter steps only when some were made', async () => {
    const old = await somebody(database, 'Old');
    await dbRun(
      database,
      sql`DELETE FROM ${appTable(database, 'category')} WHERE household_id = ${old.household} AND starter_key IN ('baby', 'pets')`,
    );
    expect((await rows(old.household)).length).toBe(13);
    const seq = async () =>
      Number(
        (
          await dbAll<{ seq: number | string }>(
            database,
            sql`SELECT seq FROM ${appTable(database, 'household')} WHERE id = ${old.household}`,
          )
        )[0]?.seq,
      );
    expect(await seq()).toBe(1);
    expect(await ensureStarterCategories(database, old.household)).toBe(2);
    expect((await rows(old.household)).length).toBe(15);
    expect(await seq()).toBe(2);
    expect(
      (await rows(old.household)).filter((r) => Number(r.seq) === 2).map((r) => r.starter_key),
    ).toEqual(['baby', 'pets']);
    expect(await ensureStarterCategories(database, old.household)).toBe(0);
    expect(await seq()).toBe(2);
  });

  it('are made once when several make the household at once', async () => {
    const account = { id: `acct-${crypto.randomUUID()}`, name: 'Race', email: 'race@example.com' };
    const made = await Promise.all(
      [1, 2, 3, 4].map(() => makeAccountRecords(database, TEST_RING, account)),
    );
    const household = made[0]?.householdId ?? '';
    expect((await rows(household)).length).toBe(STARTER_CATEGORIES.length);
  });

  it('are a household’s own: another household’s are other rows, not shared', async () => {
    const a = await somebody(database, 'A');
    const b = await somebody(database, 'B');
    const ids = async (h: string) =>
      (
        await dbAll<{ id: string }>(
          database,
          sql`SELECT id FROM ${appTable(database, 'category')} WHERE household_id = ${h}`,
        )
      ).map((r) => r.id);
    const [mine, theirs] = [await ids(a.household), await ids(b.household)];
    expect(mine.filter((id) => theirs.includes(id))).toEqual([]);
  });
});
