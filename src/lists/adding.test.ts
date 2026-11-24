import { describe, expect, it } from 'vitest';
import type { Change, Mutation } from '../actions/format';
import { suggest } from '../catalog/suggest';
import type { InventoryRow, ProductRow } from '../actions/rows';
import { layerInventory } from '../catalog/inventory';
import type { CategoryRow } from '../local/rows';
import { HOUSEHOLD, PERSON, env, item, list, product } from '../actions/test-support';
import {
  type Adding,
  type Planned,
  inBasket,
  planAdd,
  planAddFromInventory,
  productNamed,
  routeOf,
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

  it('never guesses a name into a hidden category: it takes Other, which cannot be hidden', () => {
    const cheese = product({ name: 'Goat cheese', categoryId: DAIRY });
    const hidden = categories.map((each) => (each.id === DAIRY ? { ...each, hidden: true } : each));
    // A product in the hidden category lends it to a similar name, and a starter entry of that category (Milk) is its own: neither is offered.
    const similar = planned(
      planAdd(env(), context({ products: [cheese], categories: hidden }), typed('Sheep cheese')),
    );
    expect(changesOf(similar.mutation, 'item')[0]?.fields.categoryId).toBe(OTHER);
    const starter = planned(
      planAdd(env(), context({ categories: hidden }), {
        ...typed('Milk'),
        kind: 'starter' as never,
      }),
    );
    expect(changesOf(starter.mutation, 'item')[0]?.fields.categoryId).toBe(OTHER);
    // Shown again, it is guessed as before.
    const shown = planned(planAdd(env(), context({ products: [cheese] }), typed('Sheep cheese')));
    expect(changesOf(shown.mutation, 'item')[0]?.fields.categoryId).toBe(DAIRY);
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

  it('is one more of what is open on the list, by name, with nothing of the item’s applied to it', () => {
    const own = product({
      name: 'zorblax',
      categoryId: PRODUCE,
      defaultQuantity: '9',
      defaultUnit: 'pcs',
    });
    const open = item({
      productId: own.id,
      name: 'zorblax',
      quantity: '2',
      unit: 'pcs',
      categoryId: PRODUCE,
    });
    const bumped = done(
      planAddFromInventory(env(), context({ products: [own], items: [open] }), entry, here),
    );
    expect(bumped.message).toBe('Added one more zorblax');
    expect(changesOf(bumped.mutation, 'item')).toHaveLength(1);
    expect(changesOf(bumped.mutation, 'item')[0]).toMatchObject({
      id: open.id,
      fields: { quantity: '3' },
    });
    expect(changesOf(bumped.mutation, 'item')[0]?.create).toBeUndefined();
    expect(changesOf(bumped.mutation, 'item')[0]?.fields.categoryId).toBeUndefined();
  });

  it('takes what the person set in Inventory over what the list’s product remembers, and leaves the product as it is', () => {
    // A name typed on the list made the product, which remembers Produce, 9 kg; Inventory has since been given another category, unit and quantity.
    const own = product({
      name: 'zorblax',
      categoryId: PRODUCE,
      defaultQuantity: '9',
      defaultUnit: 'kg',
      icon: 'apple',
    });
    const { mutation, message, also } = done(
      planAddFromInventory(env(), context({ products: [own] }), entry, here),
    );
    expect(message).toBe('Added zorblax');
    expect(also).toBeUndefined();
    expect(changesOf(mutation, 'item')[0]).toMatchObject({
      create: true,
      fields: {
        productId: own.id,
        name: 'zorblax',
        categoryId: DAIRY,
        quantity: '3',
        unit: 'pack',
        icon: 'cookie',
      },
    });
    // The product is only touched to say it was added: no field of what it remembers is written, and no second one is made.
    const touched = changesOf(mutation, 'product');
    expect(touched).toHaveLength(1);
    expect(touched[0]?.create).toBeUndefined();
    expect(Object.keys(touched[0]?.fields ?? {})).toEqual(['lastAddedAt']);
  });

  it('leaves to the product what Inventory has no value for: an empty field, and a category it only had the guess for', () => {
    const own = product({
      name: 'Zorblax',
      categoryId: PRODUCE,
      defaultQuantity: '9',
      defaultUnit: 'kg',
      icon: 'apple',
    });
    const { mutation } = done(
      planAddFromInventory(
        env(),
        context({ products: [own] }),
        { name: 'Zorblax', quantity: null, unit: null, icon: null },
        { id: OTHER, copy: null, guessed: true },
      ),
    );
    expect(changesOf(mutation, 'item')[0]?.fields).toMatchObject({
      categoryId: PRODUCE,
      quantity: '9',
      unit: 'kg',
      icon: 'apple',
    });
    // With no product the guess is the category, as for any new name.
    const fresh = done(
      planAddFromInventory(
        env(),
        context(),
        { name: 'Zorblax', quantity: null, unit: null, icon: null },
        { id: OTHER, copy: null, guessed: true },
      ),
    );
    expect(changesOf(fresh.mutation, 'item')[0]?.fields.categoryId).toBe(OTHER);
  });

  it('puts the copy first when it takes Inventory’s category over the product’s', () => {
    const own = product({ name: 'Zorblax', categoryId: PRODUCE });
    const copy: Change = {
      table: 'list_category',
      id: '70000000-0000-4000-8000-000000000002',
      create: true,
      fields: { listId: list().id, sourceKey: 'k', name: 'Nails', position: 'a3' },
    };
    const { mutation } = done(
      planAddFromInventory(env(), context({ products: [own] }), entry, { id: copy.id, copy }),
    );
    expect(mutation.changes.map((each) => each.table)).toEqual([
      'list_category',
      'product',
      'item',
    ]);
    expect(changesOf(mutation, 'item')[0]?.fields.categoryId).toBe(copy.id);
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

describe('adding a name Inventory has, from the add field (DESIGN.md §8.5, RFC 0006)', () => {
  const OWN = '50000000-0000-4000-8000-0000000000bb';
  const inventoryRow = (over: Partial<InventoryRow>): InventoryRow => ({
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
  const withInventory = (rows: InventoryRow[], over: Partial<Adding> = {}) =>
    context({ inventory: { household: OWN, rows }, ...over });
  const inventorySuggestion = (rows: InventoryRow[], text: string) =>
    only(
      suggest({
        text,
        products: [],
        items: [],
        listId: list().id,
        inventory: layerInventory(rows),
      }).find((each) => each.kind === 'inventory'),
    );
  const bags = inventoryRow({
    name: 'Good bin bags',
    quantity: '2',
    unit: 'pack',
    icon: 'trash-2',
  });

  it('makes the list’s product from the Inventory item, whichever way it was chosen: the suggestion, and the text typed', () => {
    for (const how of [inventorySuggestion([bags], 'good'), typed('good BIN bags')]) {
      const done = planned(planAdd(env(), withInventory([bags]), how));
      expect(done.message).toBe('Added Good bin bags');
      expect(changesOf(done.mutation, 'product')[0]).toMatchObject({
        create: true,
        fields: {
          name: 'Good bin bags',
          defaultQuantity: '2',
          defaultUnit: 'pack',
          icon: 'trash-2',
        },
      });
      expect(changesOf(done.mutation, 'item')[0]?.fields).toMatchObject({
        name: 'Good bin bags',
        quantity: '2',
        unit: 'pack',
        icon: 'trash-2',
      });
      // It is in Inventory already: nothing more is made there.
      expect(done.also).toBeUndefined();
    }
  });

  it('takes the category the caller worked out for this list, with the copy first, and the guess without one', () => {
    const copy: Change = {
      table: 'list_category',
      id: '90000000-0000-4000-8000-000000000001',
      create: true,
      fields: { listId: list().id, name: 'Garden', sourceKey: 'k', position: 'a5' },
    };
    const suggestion = inventorySuggestion([bags], 'good');
    const done = planned(
      planAdd(env(), withInventory([bags]), suggestion, {
        category: { id: copy.id, copy, guessed: false },
      }),
    );
    expect(done.mutation.changes.map((each) => each.table)).toEqual([
      'list_category',
      'product',
      'item',
    ]);
    expect(changesOf(done.mutation, 'item')[0]?.fields.categoryId).toBe(copy.id);
    // No category given (a keyed list whose keys are not open): the guess, and no copy.
    const guessed = planned(planAdd(env(), withInventory([bags]), suggestion));
    expect(guessed.mutation.changes.map((each) => each.table)).toEqual(['product', 'item']);
    expect(changesOf(guessed.mutation, 'item')[0]?.fields.categoryId).toBe(OTHER);
  });

  it('is decided by name when the add’s turn comes: a product made since the suggestion was drawn is the one used, with what it remembers', () => {
    const suggestion = inventorySuggestion([bags], 'good');
    const made = product({
      name: 'Good bin bags',
      categoryId: DAIRY,
      defaultQuantity: '5',
      defaultUnit: 'pcs',
      icon: 'milk',
    });
    expect(routeOf(withInventory([bags], { products: [made] }), suggestion)).toMatchObject({
      via: 'product',
    });
    const done = planned(planAdd(env(), withInventory([bags], { products: [made] }), suggestion));
    // No product is made: the one there is is used (and only touched to say it was added).
    expect(changesOf(done.mutation, 'product').filter((each) => each.create)).toEqual([]);
    expect(changesOf(done.mutation, 'item')[0]?.fields).toMatchObject({
      quantity: '5',
      unit: 'pcs',
      icon: 'milk',
      categoryId: DAIRY,
    });
  });

  it('is this list’s product, then Inventory, then another list’s product, then the starter, then the guess', () => {
    const elsewhere = product({ listId: 'another-list', name: 'Good bin bags', categoryId: DAIRY });
    const route = (
      rows: InventoryRow[],
      products: ProductRow[],
      suggestion = typed('good bin bags'),
    ) => routeOf(withInventory(rows, { products }), suggestion)?.via;
    expect(route([bags], [elsewhere])).toBe('inventory');
    expect(route([], [elsewhere])).toBe('template');
    expect(route([], [])).toBe('new');
    expect(route([bags], [])).toBe('inventory');
    // A starter entry nobody has touched is the starter's, not Inventory's.
    expect(route([], [], typed('bread'))).toBe('new');
    // And one they changed is Inventory's.
    expect(route([inventoryRow({ starterKey: 'bread', icon: 'cookie' })], [], typed('bread'))).toBe(
      'inventory',
    );
    // Typed in full, a hidden item is still the person's: it was hidden from the suggestions, not taken away.
    expect(route([{ ...bags, hidden: true }], [])).toBe('inventory');
    expect(routeOf(context(), typed('  '))).toBeNull();
  });

  it('takes a starter entry the person changed as they changed it, and not as the catalog has it', () => {
    const bread = inventoryRow({
      starterKey: 'bread',
      name: 'Sourdough loaf',
      icon: 'cookie',
      unit: 'pack',
      quantity: '3',
    });
    const done = planned(
      planAdd(env(), withInventory([bread]), inventorySuggestion([bread], 'sourdough l')),
    );
    expect(changesOf(done.mutation, 'product')[0]?.fields).toMatchObject({
      name: 'Sourdough loaf',
      icon: 'cookie',
      defaultUnit: 'pack',
      defaultQuantity: '3',
    });
    // By the name it still has, not the one the catalog gave it: that is a new name, which Inventory knows as the old one.
    expect(routeOf(withInventory([bread]), typed('Bread'))?.via).toBe('new');
  });

  it('takes from another list’s product what Inventory has no value for, and nothing it has', () => {
    const elsewhere = product({
      listId: 'another-list',
      name: 'Hemp milk',
      categoryId: DAIRY,
      defaultQuantity: '4',
      defaultUnit: 'L',
      icon: 'milk',
    });
    const bare = inventoryRow({ name: 'Hemp milk' });
    const lent = planned(
      planAdd(env(), withInventory([bare], { products: [elsewhere] }), typed('Hemp milk')),
    );
    expect(changesOf(lent.mutation, 'item')[0]?.fields).toMatchObject({
      quantity: '4',
      unit: 'L',
      icon: 'milk',
      categoryId: DAIRY,
    });
    const own = inventoryRow({ name: 'Hemp milk', quantity: '1', unit: 'pack', icon: 'cookie' });
    const kept = planned(
      planAdd(env(), withInventory([own], { products: [elsewhere] }), typed('Hemp milk'), {
        category: { id: PRODUCE, copy: null, guessed: false },
      }),
    );
    expect(changesOf(kept.mutation, 'item')[0]?.fields).toMatchObject({
      quantity: '1',
      unit: 'pack',
      icon: 'cookie',
      categoryId: PRODUCE,
    });
    // A category that is another list's copy is not this list's, and is never lent.
    const copied = product({ ...elsewhere, categoryId: '99999999-0000-4000-8000-000000000009' });
    const guessedFor = planned(
      planAdd(env(), withInventory([bare], { products: [copied] }), typed('Hemp milk')),
    );
    expect(changesOf(guessedFor.mutation, 'item')[0]?.fields.categoryId).not.toBe(
      copied.categoryId,
    );
  });

  it('is one more of what is open on the list, as before, and the chips of an empty field add what they name', () => {
    const milk = product({ name: 'Oat milk', categoryId: DAIRY });
    const open = item({ productId: milk.id, quantity: '2' });
    const done = planned(
      planAdd(
        env(),
        withInventory([inventoryRow({ name: 'Oat milk' })], { products: [milk], items: [open] }),
        typed('oat milk'),
      ),
    );
    expect(done.message).toBe('Added one more Oat milk');
    const staple = inventoryRow({ name: 'Bin bags', recurring: true });
    const [chip] = suggest({
      text: '',
      products: [],
      items: [],
      listId: list().id,
      inventory: layerInventory([staple]),
    });
    expect(chip).toMatchObject({ kind: 'inventory', name: 'Bin bags' });
    expect(planned(planAdd(env(), withInventory([staple]), only(chip))).message).toBe(
      'Added Bin bags',
    );
  });
});
