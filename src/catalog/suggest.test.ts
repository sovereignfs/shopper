import { describe, expect, it } from 'vitest';
import type { ItemRow, ProductRow } from '../actions/rows';
import { item, product } from '../actions/test-support';
import { MAX_SUGGESTIONS, suggest } from './suggest';
import type { StarterEntry } from './starter';

let n = 0;
const p = (name: string, over: Partial<ProductRow> = {}): ProductRow =>
  product({
    id: `50000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    name,
    timesBought: 0,
    defaultQuantity: '1',
    defaultUnit: null,
    icon: 'milk',
    ...over,
  });
const names = (list: ReturnType<typeof suggest>) => list.map((s) => s.name);
const entry = (name: string, category = 'pantry'): StarterEntry => ({
  key: name.toLowerCase(),
  name,
  aliases: [],
  category,
  icon: 'package',
  unit: 'pack',
  quantity: '1',
  plural: false,
});

describe('what is typed', () => {
  const products = [
    p('Oat milk', { timesBought: 5, lastBoughtAt: 100 }),
    p('Oatcakes', { timesBought: 9 }),
    p('Almond milk', { timesBought: 7 }),
    p('Soy milk', { timesBought: 1 }),
    p('Bread', { timesBought: 3 }),
    p('Milkshake mix', { timesBought: 2 }),
  ];

  it('matches by prefix first, then by the start of a word, ranked by how often it was bought', () => {
    expect(names(suggest({ text: 'oat', products, items: [], starter: [] })).slice(0, 2)).toEqual([
      'Oatcakes',
      'Oat milk',
    ]);
    // "milk": the product starting with it first, then the words that do, the most bought first.
    expect(names(suggest({ text: 'milk', products, items: [], starter: [] }))).toEqual([
      'Milkshake mix',
      'Almond milk',
      'Oat milk',
      'Soy milk',
      'milk',
    ]);
  });

  it('finds a typo within one edit, for three letters or more, after the exact matches', () => {
    expect(names(suggest({ text: 'brad', products, items: [], starter: [] }))).toEqual([
      'Bread',
      'brad',
    ]);
    expect(names(suggest({ text: 'oat mlik', products, items: [], starter: [] }))[0]).toBe(
      'Oat milk',
    );
    // Two letters is too short to be forgiven.
    expect(names(suggest({ text: 'ob', products, items: [], starter: [] }))).toEqual(['ob']);
  });

  it('breaks a tie by when it was last bought, then last added, then by name', () => {
    const tied = [
      p('Rice b', { timesBought: 2, lastBoughtAt: 5 }),
      p('Rice a', { timesBought: 2, lastBoughtAt: 5 }),
      p('Rice c', { timesBought: 2, lastBoughtAt: 9 }),
      p('Rice d', { timesBought: 2, lastBoughtAt: 5, lastAddedAt: 50 }),
    ];
    expect(
      names(suggest({ text: 'rice', products: tied, items: [], starter: [] })).slice(0, 4),
    ).toEqual(['Rice c', 'Rice d', 'Rice a', 'Rice b']);
  });

  it('ignores case, spacing and deleted products', () => {
    const list = [p('Oat Milk'), p('Oat bar', { deletedAt: 5 })];
    expect(names(suggest({ text: '  OAT  ', products: list, items: [], starter: [] }))).toEqual([
      'Oat Milk',
      'OAT',
    ]);
  });

  it('ends with the text as typed, to add as it is, and says what it is', () => {
    const out = suggest({ text: '  something odd ', products, items: [], starter: [] });
    expect(out).toEqual([
      { kind: 'new', name: 'something odd', icon: null, quantity: null, unit: null },
    ]);
  });

  it('offers at most eight matches, and then the text', () => {
    const many = Array.from({ length: 30 }, (_, i) => p(`Pasta ${i}`, { timesBought: i }));
    const out = suggest({ text: 'pasta', products: many, items: [], starter: [] });
    expect(out).toHaveLength(MAX_SUGGESTIONS + 1);
    expect(out[0]?.name).toBe('Pasta 29');
    expect(out.at(-1)?.kind).toBe('new');
  });
});

describe('the starter catalog’s entries', () => {
  it('come after the household’s products, and not for a product the household has', () => {
    const starter = [entry('Oat milk'), entry('Oatmeal'), entry('Oats')];
    const out = suggest({
      text: 'oat',
      products: [p('Oat milk', { timesBought: 1 })],
      items: [],
      starter,
    });
    expect(out.map((s) => [s.kind, s.name])).toEqual([
      ['product', 'Oat milk'],
      ['starter', 'Oatmeal'],
      ['starter', 'Oats'],
      ['new', 'oat'],
    ]);
    expect(out[1]).toMatchObject({
      starterKey: 'oatmeal',
      unit: 'pack',
      quantity: '1',
      icon: 'package',
    });
  });

  it('are matched by alias, by word and by a typo, in the same tiers', () => {
    const starter = [
      { ...entry('Courgette'), aliases: ['Zucchini'] },
      entry('Goat cheese'),
      entry('Cheddar'),
    ];
    expect(names(suggest({ text: 'zuc', products: [], items: [], starter }))).toEqual([
      'Courgette',
      'zuc',
    ]);
    // "chee" starts a word of _Goat cheese_ (tier two) and is one edit from the start of _Cheddar_ (tier three).
    expect(names(suggest({ text: 'chee', products: [], items: [], starter }))).toEqual([
      'Goat cheese',
      'Cheddar',
      'chee',
    ]);
    expect(names(suggest({ text: 'chedar', products: [], items: [], starter }))).toEqual([
      'Cheddar',
      'chedar',
    ]);
  });

  it('use the real catalog when none is given', () => {
    const out = suggest({ text: 'oat m', products: [], items: [] });
    expect(out[0]).toMatchObject({ kind: 'starter', name: 'Oat milk' });
  });
});

describe('what is already on the list', () => {
  it('says so, with the open item, so that choosing it adds one and not a second row; bought, cleared and deleted items are not on it', () => {
    const milk = p('Oat milk', { timesBought: 2 });
    const open = item({
      id: '60000000-0000-4000-8000-0000000000aa',
      productId: milk.id,
      quantity: '2',
    });
    const bought = item({
      id: '60000000-0000-4000-8000-0000000000bb',
      productId: milk.id,
      boughtAt: 1,
    });
    expect(suggest({ text: 'oat', products: [milk], items: [open], starter: [] })[0]).toMatchObject(
      { onList: { itemId: open.id, quantity: '2' } },
    );
    expect(
      suggest({ text: 'oat', products: [milk], items: [bought], starter: [] })[0]?.onList,
    ).toBeUndefined();
    for (const gone of [{ clearedAt: 1 }, { deletedAt: 1 }] as Partial<ItemRow>[])
      expect(
        suggest({
          text: 'oat',
          products: [milk],
          items: [item({ productId: milk.id, ...gone })],
          starter: [],
        })[0]?.onList,
      ).toBeUndefined();
  });
});

describe('with nothing typed: often bought', () => {
  it('offers the products bought most that are not on the list, up to eight, and never a new item', () => {
    const products = [
      p('A', { timesBought: 9 }),
      p('B', { timesBought: 7 }),
      p('C', { timesBought: 0 }),
      p('D', { timesBought: 8, deletedAt: 1 }),
      p('E', { timesBought: 6 }),
    ];
    const onList = item({
      productId: products[0]?.id ?? '',
      id: '60000000-0000-4000-8000-0000000000cc',
    });
    expect(names(suggest({ text: '', products, items: [onList] }))).toEqual(['B', 'E']);
    expect(names(suggest({ text: '   ', products, items: [] }))).toEqual(['A', 'B', 'E']);
    const many = Array.from({ length: 20 }, (_, i) => p(`P${i}`, { timesBought: i + 1 }));
    expect(suggest({ text: '', products: many, items: [] })).toHaveLength(MAX_SUGGESTIONS);
  });
});

describe('speed', () => {
  it('answers for the largest household the limits allow in under ten milliseconds, once the names are known', () => {
    const big = Array.from({ length: 5000 }, (_, i) =>
      p(`Product number ${i} ${['milk', 'bread', 'rice', 'oat'][i % 4]}`, { timesBought: i % 17 }),
    );
    suggest({ text: 'oat', products: big, items: [] });
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const start = performance.now();
      suggest({ text: ['oat', 'mil', 'brea', 'ric'][i % 4] ?? 'oat', products: big, items: [] });
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)] ?? 0).toBeLessThan(10);
  });
});
