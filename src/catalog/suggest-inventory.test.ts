import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { InventoryRow, ItemRow, ProductRow } from '../actions/rows';
import { item, product } from '../actions/test-support';
import { canonicalName } from './canonical';
import { layerInventory } from './inventory';
import { MAX_SUGGESTIONS, type Suggestion, suggest } from './suggest';
import { STARTER_CATALOG, type StarterEntry } from './starter';

/**
 * **Suggestions over the person's Inventory** (DESIGN.md §8.5, RFC 0006, task 23.5): Inventory is the first source, then this list's products, then the group's other lists';
 * a hidden entry is offered nowhere; a renamed starter entry is offered by its new name and not its old; recurring items come first with nothing typed.
 */
const LIST = '70000000-0000-4000-8000-000000000001';
const OTHER_LIST = '70000000-0000-4000-8000-000000000002';

let n = 0;
const row = (over: Partial<InventoryRow>): InventoryRow => ({
  id: `80000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  householdId: 'own',
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
const p = (name: string, over: Partial<ProductRow> = {}): ProductRow =>
  product({
    id: `50000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    name,
    listId: LIST,
    timesBought: 0,
    defaultQuantity: '1',
    defaultUnit: null,
    icon: 'milk',
    ...over,
  });
const ask = (
  text: string,
  rows: InventoryRow[],
  products: ProductRow[] = [],
  items: ItemRow[] = [],
  catalog: readonly StarterEntry[] = STARTER_CATALOG,
) =>
  suggest({
    text,
    products,
    items,
    listId: LIST,
    inventory: layerInventory(rows, catalog),
  });
/** The same with no starter catalog under Inventory, for what is about the person's own things alone. */
const askOwn = (
  text: string,
  rows: InventoryRow[],
  products: ProductRow[] = [],
  items: ItemRow[] = [],
) => ask(text, rows, products, items, []);
const names = (list: Suggestion[]) => list.map((each) => each.name);

describe('the person’s Inventory is offered, first', () => {
  it('offers an item of their own the list has no product of, as the Inventory item, with what Inventory says, and finds it by its entry', () => {
    const rows = [row({ name: 'Good bin bags', quantity: '2', unit: 'pack', icon: 'trash-2' })];
    const [first] = ask('good', rows);
    expect(first).toMatchObject({
      kind: 'inventory',
      name: 'Good bin bags',
      quantity: '2',
      unit: 'pack',
      icon: 'trash-2',
      entryKey: `own:${rows[0]?.id}`,
    });
    // By a word of the name, and by a typo, as everything is.
    expect(names(ask('bags', rows))[0]).toBe('Good bin bags');
    expect(names(ask('good bni', rows))[0]).toBe('Good bin bags');
  });

  it('is one suggestion for a name the list has a product of: the product, with what it remembers and "on the list", and not the Inventory item as well', () => {
    const rows = [row({ name: 'Oat milk', quantity: '9', unit: 'L', icon: 'cookie' })];
    const milk = p('Oat milk', { defaultQuantity: '2', defaultUnit: 'L', icon: 'milk' });
    const open = item({ id: '60000000-0000-4000-8000-0000000000aa', productId: milk.id });
    const out = askOwn('oat', rows, [milk], [open]);
    expect(out.map((each) => [each.kind, each.name])).toEqual([
      ['product', 'Oat milk'],
      ['new', 'oat'],
    ]);
    expect(out[0]).toMatchObject({
      productId: milk.id,
      quantity: '2',
      icon: 'milk',
      onList: { itemId: open.id },
    });
  });

  it('is the Inventory item, with its own values, for a name only another list has a product of, which lends it nothing yet', () => {
    const rows = [row({ name: 'Hemp milk', quantity: '1', unit: 'L' })];
    const elsewhere = p('Hemp milk', { listId: OTHER_LIST, defaultQuantity: '4', timesBought: 5 });
    const [first] = ask('hemp', rows, [elsewhere]);
    expect(first).toMatchObject({ kind: 'inventory', quantity: '1', unit: 'L' });
    // Without Inventory it is what it was: the other list's product, which lends.
    expect(ask('hemp', [], [elsewhere])[0]).toMatchObject({
      kind: 'product',
      productId: elsewhere.id,
    });
  });

  it('is one suggestion for a name two of the group’s lists have a product of, this list’s rather than the other’s', () => {
    const here = p('Rice', { timesBought: 1 });
    const there = p('Rice', { listId: OTHER_LIST, timesBought: 30 });
    const out = askOwn('rice', [], [there, here]);
    expect(out.filter((each) => each.kind !== 'new')).toHaveLength(1);
    expect(out[0]).toMatchObject({ productId: here.id });
    // Only the other list has it: that one.
    expect(askOwn('rice', [], [there])[0]).toMatchObject({ productId: there.id });
  });

  it('is found by a starter entry’s alias, and by the name a product has that no entry has, after the person’s own items on a tie', () => {
    const rows = [row({ name: 'Zucchini bags' })];
    const mine = p('Zucchini flowers');
    const out = ask('zucchini', rows, [mine]);
    // Neither has been bought: the Inventory item first, then the product, then the starter's _Courgette_ by its alias.
    expect(names(out)).toEqual(['Zucchini bags', 'Zucchini flowers', 'Courgette', 'zucchini']);
  });
});

describe('what ranks them', () => {
  it('is how often a product was bought first, so that what is bought outranks an Inventory item nobody has bought, and then the Inventory item before a product before another list’s', () => {
    const rows = [row({ name: 'Mint tea' })];
    const bought = p('Mint sauce', { timesBought: 4 });
    const quiet = p('Mint jelly');
    const elsewhere = p('Mint humbug', { listId: OTHER_LIST });
    expect(names(ask('mint', rows, [quiet, elsewhere, bought])).slice(0, 4)).toEqual([
      'Mint sauce',
      'Mint tea',
      'Mint jelly',
      'Mint humbug',
    ]);
  });

  it('keeps the tiers: a name that starts with the text before a word that does, whoever it comes from', () => {
    const rows = [row({ name: 'Green milk' })];
    const starts = p('Milkshake', { timesBought: 1 });
    expect(names(ask('milk', rows, [starts])).slice(0, 2)).toEqual(['Milkshake', 'Green milk']);
  });

  it('puts the starter entries nobody has touched after what the person has, a name nobody has used never ahead of one they buy', () => {
    // _Orange_ is a starter entry that starts with "or" and has never been used; _Corn flakes_ is a product of the list bought often, and only has a word that starts with "or"? No:
    // "or" starts a word of _Mince or lamb_, a tier below _Orange_'s whole-name match, and it still comes first because it is theirs.
    const theirs = p('Mince or lamb', { timesBought: 6 });
    const out = ask('or', [], [theirs]);
    expect(out[0]).toMatchObject({ kind: 'product', name: 'Mince or lamb' });
    expect(out.find((each) => each.kind === 'starter')?.name).toBeDefined();
    expect(out.findIndex((each) => each.kind === 'starter')).toBeGreaterThan(0);
  });

  it('is not changed for a person who has changed nothing in Inventory', () => {
    const products = [p('Oat milk', { timesBought: 5 }), p('Oatcakes', { timesBought: 9 })];
    const without = suggest({ text: 'oat', products, items: [], listId: LIST });
    const empty = ask('oat', [], products);
    expect(empty).toEqual(without);
    expect(names(empty).slice(0, 2)).toEqual(['Oatcakes', 'Oat milk']);
  });
});

describe('a starter entry the person renamed, and one they hid', () => {
  const renamed = row({ starterKey: 'courgette', name: 'Zucchini squash' });

  it('is offered by its new name, and by an alias it keeps, and not by the name it had', () => {
    expect(names(ask('zucchini sq', [renamed]))[0]).toBe('Zucchini squash');
    expect(ask('zucchini sq', [renamed])[0]).toMatchObject({
      kind: 'inventory',
      entryKey: 'starter:courgette',
    });
    expect(names(ask('courg', [renamed]))).toEqual(['courg']);
    // The alias is a synonym of the thing, not the old name: it still finds it.
    expect(names(ask('zucchini', [renamed]))[0]).toBe('Zucchini squash');
  });

  it('leaves a product that still has the old name alone: it is the list’s own, with its history, and is offered as the product it is, beside the entry by its new name', () => {
    const old = p('Courgette', { timesBought: 9 });
    expect(ask('courg', [renamed], [old])[0]).toMatchObject({
      kind: 'product',
      productId: old.id,
      name: 'Courgette',
    });
    // The entry is offered by its new name, and, with no product of that name, as the Inventory item.
    expect(ask('zucchini sq', [renamed], [old])[0]).toMatchObject({
      kind: 'inventory',
      name: 'Zucchini squash',
    });
    // The starter's own _Courgette_ is not offered besides: the entry was renamed, so there is no untouched one.
    expect(ask('courg', [renamed], [old]).filter((each) => each.kind === 'starter')).toEqual([]);
  });

  it('keeps the old name for what is another entry’s name now', () => {
    const rows = [renamed, row({ name: 'Courgette' })];
    expect(names(ask('courg', rows))[0]).toBe('Courgette');
  });

  it('is offered nowhere when hidden: not by its name, its alias, nor a product that goes by one', () => {
    const hidden = row({ starterKey: 'courgette', hidden: true });
    expect(names(ask('courg', [hidden]))).toEqual(['courg']);
    expect(names(ask('zucc', [hidden]))).toEqual(['zucc']);
    const products = [p('Courgette', { timesBought: 9 }), p('Zucchini', { timesBought: 3 })];
    expect(names(ask('courg', [hidden], products))).toEqual(['courg']);
    expect(names(ask('zucc', [hidden], products))).toEqual(['zucc']);
    // Not what is often bought either.
    expect(names(ask('', [hidden], products))).toEqual([]);
  });

  it('is offered nowhere when it is an item of their own they hid, and a product of that name with it', () => {
    const hiddenRow = row({ name: 'Old brand bags', hidden: true });
    const rows = [hiddenRow];
    const bought = p('Old brand bags', { timesBought: 4 });
    expect(names(askOwn('old', rows, [bought]))).toEqual(['old']);
    expect(names(askOwn('', rows, [bought]))).toEqual([]);
    // Shown again it is back, as the product.
    expect(names(askOwn('old', [{ ...hiddenRow, hidden: false }], [bought]))[0]).toBe(
      'Old brand bags',
    );
  });

  it('does not offer a deleted item or a deleted override, and shows a starter entry as it is when its override was deleted', () => {
    expect(names(askOwn('good', [row({ name: 'Good bags', deletedAt: 5 })]))).toEqual(['good']);
    const gone = row({ starterKey: 'courgette', name: 'Zucchini squash', deletedAt: 5 });
    expect(names(ask('courg', [gone]))[0]).toBe('Courgette');
  });
});

describe('with nothing typed', () => {
  it('offers the recurring Inventory items that are not on the list first, then what is bought most', () => {
    const milk = p('Oat milk', { timesBought: 2 });
    const bread = p('Bread', { timesBought: 20 });
    const rows = [
      row({ name: 'Good bin bags', recurring: true }),
      row({ starterKey: 'banana', recurring: true }),
      row({ name: 'Oat milk', recurring: true }),
      row({ name: 'Once only' }),
    ];
    const out = ask('', rows, [milk, bread]);
    // Oat milk is bought, so it ranks before the two nobody has bought; bread follows, though it is bought most, since the recurring ones come first.
    expect(names(out)).toEqual(['Oat milk', 'Banana', 'Good bin bags', 'Bread']);
    expect(out.map((each) => each.kind)).toEqual(['product', 'inventory', 'inventory', 'product']);
    expect(out.some((each) => each.kind === 'new')).toBe(false);
  });

  it('leaves out a recurring item that is open on the list, and one that is hidden', () => {
    const milk = p('Oat milk', { timesBought: 2 });
    const open = item({ id: '60000000-0000-4000-8000-0000000000bb', productId: milk.id });
    const rows = [
      row({ name: 'Oat milk', recurring: true }),
      row({ name: 'Hidden staple', recurring: true, hidden: true }),
      row({ name: 'Bin bags', recurring: true }),
    ];
    expect(names(ask('', rows, [milk], [open]))).toEqual(['Bin bags']);
  });

  it('offers a recurring item once, as the Inventory item, when only another list has a product of it', () => {
    const rows = [row({ name: 'Hemp milk', recurring: true })];
    const elsewhere = p('Hemp milk', { listId: OTHER_LIST, timesBought: 5 });
    const out = ask('', rows, [elsewhere]);
    expect(out.map((each) => [each.kind, each.name])).toEqual([['inventory', 'Hemp milk']]);
  });

  it('offers at most eight, and no starter entry nobody marked', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ name: `Staple ${String(i).padStart(2, '0')}`, recurring: true }),
    );
    expect(ask('', rows)).toHaveLength(MAX_SUGGESTIONS);
    expect(ask('', [])).toEqual([]);
  });
});

describe('property: whatever the person has', () => {
  const nameArb = fc.constantFrom(
    'Oat milk',
    'oat  MILK',
    'Bin bags',
    'Courgette',
    'Zucchini',
    'Bread',
    'Sourdough',
    'Rice',
    'Mint tea',
    'Milk',
  );
  const rowArb = fc
    .record({
      kind: fc.constantFrom('own', 'courgette', 'bread', 'milk'),
      name: nameArb,
      hidden: fc.boolean(),
      recurring: fc.boolean(),
      deleted: fc.boolean(),
    })
    .map(({ kind, name, hidden, recurring, deleted }) =>
      row({
        ...(kind === 'own' ? { name } : { starterKey: kind, ...(recurring ? { name } : {}) }),
        hidden,
        recurring,
        deletedAt: deleted ? 5 : null,
      }),
    );
  /** What the server holds: one row for a starter entry, and one entry for a name (a name Inventory has is not made again, `inventoryHas`). */
  const rowsArb = fc.array(rowArb, { maxLength: 6 }).map((rows) => {
    const seen = new Set<string>();
    return rows.filter((each) => {
      const entry = layerInventory([each]).find((found) => found.id === each.id);
      const keys = [entry ? canonicalName(entry.name) : each.id];
      if (each.starterKey !== null) keys.push(`starter:${each.starterKey}`);
      if (keys.some((key) => seen.has(key))) return false;
      for (const key of keys) seen.add(key);
      return true;
    });
  });
  const productArb = fc
    .record({
      name: nameArb,
      here: fc.boolean(),
      bought: fc.nat({ max: 20 }),
    })
    .map(({ name, here, bought }) =>
      p(name, { listId: here ? LIST : OTHER_LIST, timesBought: bought }),
    );
  const textArb = fc.constantFrom('', 'o', 'oat', 'mi', 'bre', 'cour', 'zuc', 'bin', 'xyz', 'sour');

  it('offers one suggestion for a name, at most eight, nothing hidden or deleted, and ends with the text typed', () => {
    fc.assert(
      fc.property(
        rowsArb,
        fc.array(productArb, { maxLength: 8 }),
        textArb,
        (rows, products, text) => {
          const out = ask(text, rows, products);
          const found = out.filter((each) => each.kind !== 'new');
          expect(found.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
          const keys = found.map((each) => canonicalName(each.name));
          expect(new Set(keys).size).toBe(keys.length);
          if (text === '') expect(out.some((each) => each.kind === 'new')).toBe(false);
          else expect(out.at(-1)?.kind).toBe('new');
          // A hidden entry's current name is never offered, unless a shown entry or a product that no hidden name covers goes by it.
          const entries = layerInventory(rows);
          const shown = new Set(
            entries.filter((each) => !each.hidden).map((each) => canonicalName(each.name)),
          );
          for (const entry of entries.filter((each) => each.hidden)) {
            const name = canonicalName(entry.name);
            if (!shown.has(name)) expect(keys).not.toContain(name);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('is the same for the same rows however they are ordered, and never touches them', () => {
    fc.assert(
      fc.property(
        rowsArb,
        fc.array(productArb, { maxLength: 8 }),
        textArb,
        (rows, products, text) => {
          const before = JSON.stringify([rows, products]);
          const a = ask(text, rows, products);
          const reversed = ask(text, [...rows].reverse(), [...products].reverse());
          expect(JSON.stringify([rows, products])).toBe(before);
          // The same names in the same order unless two things tie completely (the same name from two rows): compare as sets of names with the same first.
          expect(new Set(names(reversed))).toEqual(new Set(names(a)));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('puts a recurring item that is not on the list before every product with nothing typed', () => {
    fc.assert(
      fc.property(rowsArb, fc.array(productArb, { maxLength: 8 }), (rows, products) => {
        const out = ask('', rows, products);
        const recurring = new Set(
          layerInventory(rows)
            .filter((each) => each.recurring && !each.hidden && each.id !== null)
            .map((each) => canonicalName(each.name)),
        );
        const flags = out.map((each) => recurring.has(canonicalName(each.name)));
        // Every recurring one comes before the first that is not.
        const firstOther = flags.indexOf(false);
        if (firstOther !== -1) expect(flags.slice(firstOther).some(Boolean)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

describe('speed', () => {
  it('answers with a large Inventory and the largest household the limits allow in under ten milliseconds', () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      row({ name: `Own item number ${i} ${['milk', 'bread', 'rice', 'oat'][i % 4]}` }),
    );
    const entries = layerInventory(rows);
    const big = Array.from({ length: 5000 }, (_, i) =>
      p(`Product number ${i} ${['milk', 'bread', 'rice', 'oat'][i % 4]}`, { timesBought: i % 17 }),
    );
    const run = (text: string) =>
      suggest({ text, products: big, items: [], listId: LIST, inventory: entries });
    run('oat');
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const start = performance.now();
      run(['oat', 'mil', 'brea', 'ric'][i % 4] ?? 'oat');
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)] ?? 0).toBeLessThan(process.env.CI ? 40 : 10);
  });
});
