import { describe, expect, it } from 'vitest';
import type { Change, Mutation } from '../actions/format';
import { suggest } from '../catalog/suggest';
import type { CategoryRow } from '../local/rows';
import { HOUSEHOLD, PERSON, env, item, list, product } from '../actions/test-support';
import {
  type Adding,
  type Planned,
  inBasket,
  planAdd,
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
