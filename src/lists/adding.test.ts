import { describe, expect, it } from 'vitest';
import type { Change, Mutation } from '../actions/format';
import { suggest } from '../catalog/suggest';
import type { InventoryRow } from '../actions/rows';
import type { CategoryRow } from '../local/rows';
import { HOUSEHOLD, PERSON, env, item, list, product } from '../actions/test-support';
import {
  type Adding,
  type Planned,
  inBasket,
  planAdd,
  planAddFromInventory,
  productNamed,
  suggestionMeta,
} from './adding';

const category = (id: string, starterKey: string | null, position: string): CategoryRow => ({
  id,
  householdId: HOUSEHOLD,
  starterKey,
  name: starterKey ?? id,
  icon: null,
  position,
  hidden: false,
  deletedAt: null,
  seq: 1,
});
const DAIRY = '40000000-0000-4000-8000-000000000001';
const PRODUCE = '40000000-0000-4000-8000-000000000002';
const OTHER = '40000000-0000-4000-8000-000000000003';
const categories = [
  category(PRODUCE, 'produce', 'a0'),
  category(DAIRY, 'dairy-eggs', 'a1'),
  category(OTHER, 'other', 'a2'),
];

const context = (over: Partial<Adding> = {}): Adding => ({
  list: list(),
  products: [],
  items: [],
  categories,
  me: PERSON,
  ...over,
});
const planned = (value: ReturnType<typeof planAdd>): Planned => {
  if (!value || 'refused' in value) throw new Error('expected a mutation');
  return value;
};
const changesOf = (mutation: Mutation, table: Change['table']) =>
  mutation.changes.filter((each) => each.table === table);
const only = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('expected a value');
  return value;
};
const typed = (name: string) =>
  ({ kind: 'new', name, icon: null, quantity: null, unit: null }) as const;

describe('adding from a suggestion', () => {
  it('adds an item of a product the household has, with what the product remembers', () => {
    const milk = product({
      name: 'Oat milk',
      categoryId: DAIRY,
      defaultQuantity: '2',
      defaultUnit: 'L',
      icon: 'milk',
    });
    const [suggestion] = suggest({ text: 'oat', products: [milk], items: [], starter: [] });
    const { mutation, message } = planned(
      planAdd(env(), context({ products: [milk] }), only(suggestion)),
    );
    expect(message).toBe('Added Oat milk');
    expect(changesOf(mutation, 'product')).toHaveLength(1);
    expect(changesOf(mutation, 'product')[0]).toMatchObject({ id: milk.id });
    expect(changesOf(mutation, 'item')[0]?.fields).toMatchObject({
      productId: milk.id,
      quantity: '2',
      unit: 'L',
      categoryId: DAIRY,
    });
  });

  it('never uses another list’s product: it lends what it comes with to a new product of this list (RFC 0004, 21.3)', () => {
    const elsewhere = product({
      listId: 'another-list',
      name: 'Oat milk',
      categoryId: DAIRY,
      defaultQuantity: '2',
      defaultUnit: 'L',
      icon: 'milk',
    });
    for (const suggestion of [
      only(suggest({ text: 'oat', products: [elsewhere], items: [], starter: [] })[0]),
      typed('Oat milk'),
    ]) {
      const { mutation } = planned(planAdd(env(), context({ products: [elsewhere] }), suggestion));
      const made = only(changesOf(mutation, 'product')[0]);
      expect(made.id).not.toBe(elsewhere.id);
      expect(made.create).toBe(true);
      expect(made.fields.listId).toBe(list().id);
      expect(changesOf(mutation, 'item')[0]?.fields).toMatchObject({
        productId: made.id,
        quantity: '2',
        unit: 'L',
        categoryId: DAIRY,
        icon: 'milk',
      });
    }
  });

  it('lends another list’s category only if it is one of this list’s: a copy of a person’s category on another list is not, and the new item takes the guess (§8.3)', () => {
    const COPY_ELSEWHERE = '40000000-0000-4000-8000-0000000000c1';
    const COPY_HERE = '40000000-0000-4000-8000-0000000000c2';
    const elsewhere = (categoryId: string) =>
      product({ listId: 'another-list', name: 'Oat milk', categoryId, icon: 'milk' });
    const copyHere = {
      ...category(COPY_HERE, null, 'a3'),
      name: 'Plant milks',
    };
    const added = (categoryId: string, over: Partial<Adding> = {}) => {
      const { mutation } = planned(
        planAdd(env(), context({ products: [elsewhere(categoryId)], ...over }), typed('Oat milk')),
      );
      return only(changesOf(mutation, 'item')[0]).fields.categoryId;
    };
    // A starter category is every list's, and a copy of this list is this list's: lent.
    expect(added(DAIRY)).toBe(DAIRY);
    expect(added(COPY_HERE, { categories: [...categories, copyHere] })).toBe(COPY_HERE);
    // A copy made on another list is not this list's, and the server would refuse an item naming it: the category the name guesses.
    expect(added(COPY_ELSEWHERE)).not.toBe(COPY_ELSEWHERE);
    expect(categories.map((each) => each.id)).toContain(added(COPY_ELSEWHERE));
  });

  it('bumps what is already open instead of making a second row', () => {
    const milk = product({ name: 'Oat milk', categoryId: DAIRY, defaultQuantity: '1' });
    const open = item({ productId: milk.id, name: 'Oat milk', quantity: '2', categoryId: DAIRY });
    const [suggestion] = suggest({ text: 'oat', products: [milk], items: [open], starter: [] });
    expect(suggestion?.onList).toBeDefined();
    const { mutation, message } = planned(
      planAdd(env(), context({ products: [milk], items: [open] }), only(suggestion)),
    );
    expect(message).toBe('Added one more Oat milk');
    expect(changesOf(mutation, 'item')).toHaveLength(1);
    expect(changesOf(mutation, 'item')[0]).toMatchObject({
      id: open.id,
      fields: { quantity: '3' },
    });
    expect(changesOf(mutation, 'item')[0]?.create).toBeUndefined();
  });

  it('finds the product by its name, so a typed name over an existing one is bumped, not doubled', () => {
    const milk = product({ name: 'Oat milk', categoryId: DAIRY });
    const open = item({ productId: milk.id, name: 'Oat milk', quantity: '1' });
    expect(productNamed([milk], '  OAT   Milk ')).toBe(milk);
    const { mutation } = planned(
      planAdd(env(), context({ products: [milk], items: [open] }), typed('  OAT   Milk ')),
    );
    expect(changesOf(mutation, 'item')[0]).toMatchObject({ id: open.id });
    expect(changesOf(mutation, 'product')).toHaveLength(0);
  });

  it('makes a product from a starter entry, in the household’s own category', () => {
    const [suggestion] = suggest({ text: 'banan', products: [], items: [] });
    expect(suggestion?.kind).toBe('starter');
    const { mutation } = planned(planAdd(env(), context(), only(suggestion)));
    expect(changesOf(mutation, 'product')[0]?.create).toBe(true);
    const fields = changesOf(mutation, 'item')[0]?.fields;
    expect(fields).toMatchObject({ name: expect.stringMatching(/banana/i), categoryId: PRODUCE });
  });

  it('keeps text as typed and gives it a category by guess, else Other', () => {
    const cheese = product({ name: 'Goat cheese', categoryId: DAIRY });
    const guessed = planned(planAdd(env(), context({ products: [cheese] }), typed('Sheep cheese')));
    expect(changesOf(guessed.mutation, 'item')[0]?.fields).toMatchObject({
      name: 'Sheep cheese',
      categoryId: DAIRY,
    });
    const unknown = planned(planAdd(env(), context(), typed('Zorblax')));
    expect(changesOf(unknown.mutation, 'item')[0]?.fields).toMatchObject({
      name: 'Zorblax',
      categoryId: OTHER,
    });
  });

  it('puts a new item after the last of its category', () => {
    const first = item({ categoryId: DAIRY, position: 'a5' });
    const { mutation } = planned(
      planAdd(env(), context({ items: [first] }), typed('Sheep cheese')),
    );
    const position = changesOf(mutation, 'item')[0]?.fields?.position;
    expect(String(position) > 'a5').toBe(true);
  });

  it('adds nothing for nothing typed, and says so when a count is full', () => {
    expect(planAdd(env(), context(), typed('   '))).toBeNull();
    const milk = product({ name: 'Oat milk' });
    const full = item({ productId: milk.id, name: 'Oat milk', quantity: '999999999' });
    const result = planAdd(env(), context({ products: [milk], items: [full] }), typed('oat milk'));
    expect(result && 'refused' in result).toBe(true);
  });

  it('says what is beside a suggestion', () => {
    expect(suggestionMeta({ ...typed('x'), quantity: '2', unit: 'L' })).toBe('2 L');
    expect(suggestionMeta({ ...typed('x'), onList: { itemId: 'i', quantity: '3' } })).toBe(
      'On the list · 3',
    );
    expect(suggestionMeta(typed('x'))).toBeUndefined();
  });

  it('can put what is added straight into the basket, in the same mutation', () => {
    const { mutation } = planned(planAdd(env(), context(), typed('Sheep cheese')));
    const ticked = inBasket(mutation, PERSON, 1234);
    expect(ticked.changes).toHaveLength(mutation.changes.length);
    expect(changesOf(ticked, 'item')[0]?.fields).toMatchObject({
      boughtAt: 1234,
      boughtBy: PERSON,
      name: 'Sheep cheese',
    });
    expect(changesOf(mutation, 'item')[0]?.fields).not.toHaveProperty('boughtAt');
  });
});

describe('a new name makes an Inventory item (DESIGN.md §8.8)', () => {
  const OWN = '50000000-0000-4000-8000-0000000000aa';
  const row = (over: Partial<InventoryRow> = {}): InventoryRow => ({
    id: crypto.randomUUID(),
    householdId: OWN,
    starterKey: null,
    name: null,
    note: null,
    categoryId: null,
    icon: null,
    unit: null,
    quantity: null,
    recurring: false,
    hidden: false,
    deletedAt: null,
    createdAt: 1,
    seq: 1,
    ...over,
  });
  const withInventory = (rows: InventoryRow[] = [], over: Partial<Adding> = {}) =>
    context({ inventory: { household: OWN, rows }, ...over });

  it('is a separate mutation to the reader’s own group, marked once, after the list’s and apart from it, for a name typed that Inventory does not have', () => {
    const done = planned(planAdd(env(), withInventory(), typed('Zucchini bags')));
    expect(done.mutation.householdId).toBe(HOUSEHOLD);
    expect(done.also?.householdId).toBe(OWN);
    expect(done.also?.householdId).not.toBe(done.mutation.householdId);
    expect(done.also?.mutationId).not.toBe(done.mutation.mutationId);
    expect(done.also?.changes).toHaveLength(1);
    expect(done.also?.changes[0]).toMatchObject({
      table: 'inventory_item',
      create: true,
      fields: { name: 'Zucchini bags', recurring: 0, hidden: 0 },
    });
  });

  it('makes none for a name it has, by canonical name: an item of their own (capitals, spaces, a starter’s plural), a starter entry, a hidden one, and one renamed', () => {
    const has = (rows: InventoryRow[], name: string) =>
      planned(planAdd(env(), withInventory(rows), typed(name))).also;
    expect(has([row({ name: 'Oat milk' })], 'oat  MILK')).toBeUndefined();
    expect(has([], 'Bananas')).toBeUndefined();
    expect(has([], 'bread')).toBeUndefined();
    expect(has([row({ name: 'Good bin bags', hidden: true })], 'good bin bags')).toBeUndefined();
    expect(has([row({ starterKey: 'bread', name: 'Sourdough' })], 'Sourdough')).toBeUndefined();
    // A starter entry they renamed is still that entry: the name it had is not a new name either.
    expect(has([row({ starterKey: 'bread', name: 'Sourdough' })], 'Bread')).toBeUndefined();
    // A name they deleted is new again: the server folds it into the deleted row and brings it back.
    expect(has([row({ name: 'Old thing', deletedAt: 5 })], 'Old thing')).toBeDefined();
    // And a name that is neither.
    expect(has([row({ name: 'Oat milk' })], 'Hemp milk')).toBeDefined();
  });

  it('makes none for a starter suggestion, for what the list has a product of already, nor where the device has no group of the reader’s own', () => {
    const [starter] = suggest({ text: 'banan', products: [], items: [] });
    expect(planned(planAdd(env(), withInventory(), only(starter))).also).toBeUndefined();
    const milk = product({ name: 'Oat milk', categoryId: DAIRY });
    expect(
      planned(planAdd(env(), withInventory([], { products: [milk] }), typed('Oat milk'))).also,
    ).toBeUndefined();
    expect(planned(planAdd(env(), context(), typed('Zucchini bags'))).also).toBeUndefined();
  });

  it('carries what another list’s product it came from remembers, and still asks whether Inventory has the name', () => {
    const elsewhere = product({
      listId: 'another-list',
      name: 'Hemp milk',
      categoryId: DAIRY,
      defaultQuantity: '2',
      defaultUnit: 'L',
      icon: 'milk',
    });
    const done = planned(
      planAdd(env(), withInventory([], { products: [elsewhere] }), typed('Hemp milk')),
    );
    expect(done.also?.changes[0]?.fields).toMatchObject({
      name: 'Hemp milk',
      icon: 'milk',
      unit: 'L',
      quantity: '2',
    });
    expect(
      planned(
        planAdd(
          env(),
          withInventory([row({ name: 'Hemp milk' })], { products: [elsewhere] }),
          typed('Hemp milk'),
        ),
      ).also,
    ).toBeUndefined();
  });
});

describe('an Inventory item added to a list (DESIGN.md §16.8)', () => {
  const entry = {
    name: 'Zorblax',
    quantity: '3',
    unit: 'pack' as const,
    icon: 'cookie',
  };
  const here = { id: DAIRY, copy: null };
  const done = (value: ReturnType<typeof planAddFromInventory>): Planned => {
    if (!value || 'refused' in value) throw new Error('expected a mutation');
    return value;
  };

  it('makes the product and the item from the item’s own fields, with the category it has on this list, and makes no Inventory item', () => {
    const { mutation, message, also } = done(planAddFromInventory(env(), context(), entry, here));
    expect(message).toBe('Added Zorblax');
    expect(also).toBeUndefined();
    expect(changesOf(mutation, 'product')[0]).toMatchObject({
      create: true,
      fields: {
        name: 'Zorblax',
        defaultQuantity: '3',
        defaultUnit: 'pack',
        icon: 'cookie',
        categoryId: DAIRY,
      },
    });
    expect(changesOf(mutation, 'item')[0]).toMatchObject({
      create: true,
      fields: { name: 'Zorblax', quantity: '3', unit: 'pack', icon: 'cookie', categoryId: DAIRY },
    });
    // The product joins this list's catalog, and the item names it.
    expect(changesOf(mutation, 'product')[0]?.fields.listId).toBe(list().id);
    expect(changesOf(mutation, 'item')[0]?.fields.productId).toBe(
      changesOf(mutation, 'product')[0]?.id,
    );
  });

  it('puts the copy of a category first, and names it on the product and the item', () => {
    const copy: Change = {
      table: 'list_category',
      id: '70000000-0000-4000-8000-000000000001',
      create: true,
      fields: { listId: list().id, sourceKey: 'k', name: 'Nails', position: 'a3' },
    };
    const { mutation } = done(planAddFromInventory(env(), context(), entry, { id: copy.id, copy }));
    expect(mutation.changes.map((each) => each.table)).toEqual([
      'list_category',
      'product',
      'item',
    ]);
    expect(changesOf(mutation, 'product')[0]?.fields.categoryId).toBe(copy.id);
    expect(changesOf(mutation, 'item')[0]?.fields.categoryId).toBe(copy.id);
  });

  it('carries no note, and an item with no quantity comes as one', () => {
    const { mutation } = done(
      planAddFromInventory(
        env(),
        context(),
        { name: 'Zorblax', quantity: null, unit: null, icon: null },
        here,
      ),
    );
    expect(changesOf(mutation, 'item')[0]?.fields).toMatchObject({
      quantity: '1',
      unit: null,
      icon: null,
      note: null,
    });
  });

  it('is one more of what is open on the list, by name, and the list’s product wins over the item’s fields', () => {
    const own = product({
      name: 'zorblax',
      categoryId: PRODUCE,
      defaultQuantity: '9',
      defaultUnit: 'kg',
    });
    const open = item({
      productId: own.id,
      name: 'zorblax',
      quantity: '2',
      unit: 'kg',
      categoryId: PRODUCE,
    });
    const bumped = done(
      planAddFromInventory(env(), context({ products: [own], items: [open] }), entry, here),
    );
    expect(bumped.message).toBe('Added one more zorblax');
    expect(changesOf(bumped.mutation, 'item')[0]).toMatchObject({ id: open.id });
    expect(changesOf(bumped.mutation, 'item')[0]?.create).toBeUndefined();
    // Not open: an item of that product, with what the product remembers, and no second product.
    const again = done(planAddFromInventory(env(), context({ products: [own] }), entry, here));
    expect(changesOf(again.mutation, 'product')[0]?.create).toBeUndefined();
    expect(changesOf(again.mutation, 'item')[0]?.fields).toMatchObject({
      productId: own.id,
      categoryId: PRODUCE,
      quantity: '9',
      unit: 'kg',
    });
  });

  it('never uses another list’s product, and adds nothing for no name', () => {
    const elsewhere = product({ listId: 'another-list', name: 'Zorblax', categoryId: PRODUCE });
    const { mutation } = done(
      planAddFromInventory(env(), context({ products: [elsewhere] }), entry, here),
    );
    expect(changesOf(mutation, 'product')[0]?.create).toBe(true);
    expect(changesOf(mutation, 'item')[0]?.fields.categoryId).toBe(DAIRY);
    expect(planAddFromInventory(env(), context(), { ...entry, name: '  ' }, here)).toBeNull();
  });
});
