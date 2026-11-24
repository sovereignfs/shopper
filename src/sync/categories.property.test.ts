import { sql } from 'drizzle-orm';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, joinList, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import { canonicalName } from '../catalog/canonical';
import type { Database } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import {
  type Keyring,
  copySourceKey,
  deriveListKeyring,
  listNameKey,
  newKeyring,
  sealField,
} from '../keys/household';
import type { Limits } from '../limits/config';
import { type ApplyResult, applyMutation } from './apply';
import { pullHousehold } from './pull';

/**
 * **The property tests over categories** (task 23.3, DESIGN.md §8.3): whatever order of changes the people of a moved group send, by whoever and for whatever category, **what an
 * item or a product names is a category its own list's people can read**, and **no one is handed a category they cannot read or that is another person's**.
 * The changes are made, moved, re-categorised, copied and deleted at random by the owner, a Member of one list and a Member of another, naming a starter category, a copy on
 * either list, a deleted copy, and a category of the owner's own; each is applied or refused, and after every one two things hold: every row names a starter category or a
 * copy on **its own list**, and everyone's pull holds, for every item and product they are given, the category it names, and none of the owner's own categories but the owner's.
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
const OWN_CATEGORY = '11111111-1111-4111-8111-bbbbbbbbbbbb';
const SOURCES = [
  '21111111-1111-4111-8111-000000000001',
  '21111111-1111-4111-8111-000000000002',
  '21111111-1111-4111-8111-000000000003',
];

let database: Database;
let ada: Someone;
let grace: Someone;
let heidi: Someone;
let group: Keyring;
let lists: [string, string] = ['', ''];
let products: [string, string] = ['', ''];
let starters: string[] = [];
let copies: string[] = [];
const rings = new Map<string, Keyring>();
const deps = () => ({ database, ring: TEST_RING, limits: LIMITS });
const listRing = async (list: string): Promise<Keyring> => {
  const known = rings.get(list);
  if (known) return known;
  const made = await deriveListKeyring(group, list);
  rings.set(list, made);
  return made;
};
const cipher = async (list: string, table: string, row: string, field: string, text: string) =>
  sealField(await listRing(list), { list, table, row, field }, text);
const send = (who: Someone, changes: Mutation['changes'][number][]): Promise<ApplyResult> =>
  applyMutation(deps(), who.accountId, {
    mutationId: crypto.randomUUID(),
    householdId: ada.household,
    changes,
  });
const applied = (result: ApplyResult) => {
  if (result.status !== 'applied')
    throw new Error(`expected applied, got ${JSON.stringify(result)}`);
};
const copyChange = async (list: string, source: string, id = crypto.randomUUID()) => ({
  table: 'list_category' as const,
  id,
  create: true as const,
  fields: {
    listId: list,
    sourceKey: await copySourceKey(await listRing(list), list, source),
    name: await cipher(list, 'list_category', id, 'name', 'Garden'),
    position: 'a5',
  } as Record<string, string | number | null>,
});

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  heidi = await somebody(database, 'Heidi');
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
  );
  group = newKeyring();
  const second = crypto.randomUUID();
  lists = [ada.list, second];
  applied(
    await send(ada, [
      {
        table: 'list',
        id: second,
        create: true,
        fields: {
          name: await cipher(second, 'list', second, 'name', 'Hardware'),
          position: 'a5',
          createdAt: 1,
          clearing: 'manual',
        },
      },
    ]),
  );
  await joinList(database, ada.household, lists[0], grace);
  await joinList(database, ada.household, lists[1], heidi);
  // A product on each list, and a category of Ada's own (theirs alone).
  const made: string[] = [];
  for (const list of lists) {
    const id = crypto.randomUUID();
    made.push(id);
    applied(
      await send(ada, [
        {
          table: 'product',
          id,
          create: true,
          fields: {
            listId: list,
            name: await cipher(list, 'product', id, 'name', `Thing ${list}`),
            nameKey: await listNameKey(await listRing(list), list, canonicalName(`thing ${list}`)),
            createdAt: 1,
          },
        },
      ]),
    );
  }
  products = [made[0] ?? '', made[1] ?? ''];
  await dbRun(
    database,
    sql`INSERT INTO ${appTable(database, 'category')} (id, household_id, starter_key, position, hidden, seq) VALUES (${OWN_CATEGORY}, ${ada.household}, ${null}, ${'zz'}, ${false}, ${1})`,
  );
  starters = (
    await dbAll<{ id: string }>(
      database,
      sql`SELECT id FROM ${appTable(database, 'category')} WHERE household_id = ${ada.household} AND starter_key IS NOT NULL ORDER BY position`,
    )
  ).map((row) => row.id);
  // A copy on each list, and one deleted.
  const c1 = await copyChange(lists[0], SOURCES[0] ?? '');
  const c2 = await copyChange(lists[1], SOURCES[0] ?? '');
  const gone = await copyChange(lists[0], SOURCES[1] ?? '');
  applied(await send(ada, [c1, c2, gone]));
  applied(await send(ada, [{ table: 'list_category', id: gone.id, fields: { deletedAt: 5 } }]));
  copies = [c1.id, c2.id, gone.id];
});
afterAll(async () => database.close());

/** The categories an item or product may name, in the order the generator indexes them: nothing, two starters, the copies, the deleted one and the owner's own. */
const named = (index: number): string | null =>
  [
    null,
    starters[0] ?? '',
    starters.at(-1) ?? '',
    copies[0] ?? '',
    copies[1] ?? '',
    copies[2] ?? '',
    OWN_CATEGORY,
  ][index] ?? null;

type Op =
  | { kind: 'item'; list: 0 | 1; category: number; actor: 0 | 1 | 2 }
  | { kind: 'move'; item: number; to: 0 | 1; category: number; actor: 0 | 1 | 2 }
  | { kind: 'recategorise'; item: number; category: number; actor: 0 | 1 | 2 }
  | { kind: 'product'; product: 0 | 1; category: number; actor: 0 | 1 | 2 }
  | { kind: 'copy'; list: 0 | 1; source: 0 | 1 | 2; actor: 0 | 1 | 2 }
  | { kind: 'delete'; copy: number };
const actor = fc.constantFrom(0, 1, 2) as fc.Arbitrary<0 | 1 | 2>;
const side = fc.constantFrom(0, 1) as fc.Arbitrary<0 | 1>;
const category = fc.integer({ min: 0, max: 6 });
const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant('item' as const), list: side, category, actor }),
  fc.record({ kind: fc.constant('move' as const), item: fc.nat(20), to: side, category, actor }),
  fc.record({ kind: fc.constant('recategorise' as const), item: fc.nat(20), category, actor }),
  fc.record({ kind: fc.constant('product' as const), product: side, category, actor }),
  fc.record({
    kind: fc.constant('copy' as const),
    list: side,
    source: fc.constantFrom(0, 1, 2) as fc.Arbitrary<0 | 1 | 2>,
    actor,
  }),
  fc.record({ kind: fc.constant('delete' as const), copy: fc.nat(20) }),
);

describe(`categories, whatever the order of changes (${leg})`, () => {
  it('every item and product names a starter category or a copy on its own list, and every reader holds what they are given the name of, and none of the owner’s own but the owner', async () => {
    const people = [ada, grace, heidi];
    const items: { id: string; list: 0 | 1 }[] = [];
    const lookups = async () => {
      const rows = await dbAll<{ id: string; list_id: string }>(
        database,
        sql`SELECT id, list_id FROM ${appTable(database, 'list_category')} WHERE household_id = ${ada.household}`,
      );
      return new Map(rows.map((row) => [row.id, row.list_id]));
    };

    const check = async () => {
      const copyList = await lookups();
      const known = new Set(starters);
      for (const table of ['item', 'product'] as const)
        for (const row of await dbAll<{
          id: string;
          list_id: string | null;
          category_id: string | null;
        }>(
          database,
          sql`SELECT id, list_id, category_id FROM ${appTable(database, table)} WHERE household_id = ${ada.household}`,
        )) {
          if (row.category_id === null) continue;
          const ok = known.has(row.category_id) || copyList.get(row.category_id) === row.list_id;
          expect(ok, `${table} ${row.id} names ${row.category_id}, which is not its list's`).toBe(
            true,
          );
        }
      // Each reader: the name of every category an item or a product they are given carries is in what they are given; and no own category but the owner's.
      const lists = [new Set(lists_(0)), new Set(lists_(1)), new Set(lists_(2))];
      for (const [index, who] of people.entries()) {
        const pulled = await pullHousehold(database, TEST_RING, who.accountId, ada.household, 0);
        if (!pulled) throw new Error('no pull');
        const readable = new Set([
          ...pulled.categories.map((each) => String(each.id)),
          ...(pulled.listCategories ?? []).map((each) => String(each.id)),
        ]);
        for (const row of [...pulled.items, ...pulled.products]) {
          const id = row.categoryId;
          if (typeof id === 'string')
            expect(readable.has(id), `a reader is given ${id} and cannot read it`).toBe(true);
        }
        for (const each of pulled.listCategories ?? [])
          expect(
            lists[index]?.has(String(each.listId)),
            'a copy of a list the reader is not on',
          ).toBe(true);
        const own = pulled.categories.filter((each) => each.starterKey === null);
        expect(
          own.length === 0 || index === 0,
          'the owner’s own category reached someone else',
        ).toBe(true);
      }
    };
    const lists_ = (who: number): string[] =>
      who === 0 ? [...lists] : who === 1 ? [lists[0]] : [lists[1]];

    await check();
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 8 }), async (ops) => {
        for (const each of ops) {
          const who = people[each.kind === 'delete' ? 0 : each.actor] ?? ada;
          if (each.kind === 'item') {
            const id = crypto.randomUUID();
            const categoryId = named(each.category);
            const list = lists[each.list];
            const result = await send(who, [
              {
                table: 'item',
                id,
                create: true,
                fields: {
                  listId: list,
                  productId: products[each.list],
                  name: await cipher(list, 'item', id, 'name', 'thing'),
                  quantity: '1',
                  position: 'a0',
                  addedBy: who.personId,
                  addedAt: 1,
                  ...(categoryId ? { categoryId } : {}),
                },
              },
            ]);
            if (result.status === 'applied') items.push({ id, list: each.list });
          } else if (each.kind === 'move' && items.length > 0) {
            const target = items[each.item % items.length];
            if (!target) continue;
            const to = lists[each.to];
            const categoryId = named(each.category);
            const result = await send(who, [
              {
                table: 'item',
                id: target.id,
                fields: {
                  listId: to,
                  productId: products[each.to],
                  name: await cipher(to, 'item', target.id, 'name', 'thing'),
                  note: null,
                  ...(each.category > 0 && categoryId ? { categoryId } : {}),
                },
              },
            ]);
            if (result.status === 'applied') target.list = each.to;
          } else if (each.kind === 'recategorise' && items.length > 0) {
            const target = items[each.item % items.length];
            if (!target) continue;
            await send(who, [
              { table: 'item', id: target.id, fields: { categoryId: named(each.category) } },
            ]);
          } else if (each.kind === 'product') {
            await send(who, [
              {
                table: 'product',
                id: products[each.product],
                fields: { categoryId: named(each.category) },
              },
            ]);
          } else if (each.kind === 'copy') {
            const made = await copyChange(lists[each.list], SOURCES[each.source] ?? '');
            const result = await send(who, [made]);
            if (result.status === 'applied') copies.push(made.id);
          } else if (each.kind === 'delete') {
            const target = copies[each.copy % copies.length];
            if (target)
              await send(who, [{ table: 'list_category', id: target, fields: { deletedAt: 9 } }]);
          }
          await check();
        }
      }),
      {
        numRuns: 15,
        // The cases a random run seldom reaches, said outright: an item that names a copy of its list is moved to the other list naming nothing, and one naming the deleted copy.
        examples: [
          [
            [
              { kind: 'item', list: 0, category: 3, actor: 0 },
              { kind: 'move', item: 0, to: 1, category: 0, actor: 0 },
            ],
          ],
          [
            [
              { kind: 'item', list: 0, category: 5, actor: 1 },
              { kind: 'move', item: 0, to: 1, category: 4, actor: 0 },
              { kind: 'recategorise', item: 0, category: 6, actor: 0 },
              { kind: 'product', product: 1, category: 3, actor: 0 },
            ],
          ],
        ],
      },
    );
  });
});
