import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { item } from '../actions/test-support';
import type { CategoryRow } from '../local/rows';
import {
  boughtItems,
  firstLine,
  groupByAisle,
  inOrderAdded,
  openItems,
  quantityLabel,
  reorderedPosition,
} from './view';

const category = (key: string, position: string, over: Partial<CategoryRow> = {}): CategoryRow => ({
  id: `c-${key}`,
  householdId: 'h',
  starterKey: key,
  name: key,
  icon: null,
  position,
  hidden: false,
  deletedAt: null,
  seq: 1,
  ...over,
});
const CATEGORIES = [
  category('produce', 'a0'),
  category('dairy', 'a1'),
  category('pantry', 'a2'),
  category('other', 'a9'),
];
const row = (id: string, over: Parameters<typeof item>[0] = {}) =>
  item({ id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`, ...over });

describe('what is open and what is bought', () => {
  it('splits by state, leaves out the cleared and the deleted, and puts the latest tick first', () => {
    const items = [
      row('1'),
      row('2', { boughtAt: 5, boughtBy: 'x' }),
      row('3', { boughtAt: 9, boughtBy: 'x' }),
      row('4', { boughtAt: 5, clearedAt: 6 }),
      row('5', { deletedAt: 1 }),
    ];
    expect(openItems(items).map((i) => i.id.slice(-1))).toEqual(['1']);
    expect(boughtItems(items).map((i) => i.id.slice(-1))).toEqual(['3', '2']);
  });
});

describe('grouping by aisle', () => {
  it('puts each category in the household’s aisle order, and within it by position, ties by id', () => {
    const items = [
      row('1', { categoryId: 'c-dairy', position: 'a0' }),
      row('2', { categoryId: 'c-produce', position: 'a1' }),
      row('3', { categoryId: 'c-produce', position: 'a0' }),
      row('5', { categoryId: 'c-produce', position: 'a1' }),
      row('4', { categoryId: 'c-pantry', position: 'a0' }),
    ];
    const groups = groupByAisle(items, CATEGORIES);
    expect(groups.map((g) => g.category?.starterKey)).toEqual(['produce', 'dairy', 'pantry']);
    expect(groups[0]?.items.map((i) => i.id.slice(-1))).toEqual(['3', '2', '5']);
  });

  it('shows an item with no category, or one that is hidden or gone, under Other, and drops no one', () => {
    const hidden = [
      ...CATEGORIES.slice(0, 3),
      category('other', 'a9'),
      category('snacks', 'a5', { hidden: true }),
    ];
    const items = [
      row('1', { categoryId: null }),
      row('2', { categoryId: 'c-snacks' }),
      row('3', { categoryId: 'c-unknown' }),
      row('4', { categoryId: 'c-produce' }),
    ];
    const groups = groupByAisle(items, hidden);
    expect(groups.map((g) => g.category?.starterKey)).toEqual(['produce', 'other']);
    expect(groups[1]?.items).toHaveLength(3);
    expect(groups.flatMap((g) => g.items)).toHaveLength(4);
  });

  it('keeps items when the device has no categories at all yet, in one group', () => {
    const groups = groupByAisle([row('1'), row('2')], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);
  });

  it('leaves out a category with nothing in it', () => {
    expect(groupByAisle([], CATEGORIES)).toEqual([]);
  });
});

describe('the order added', () => {
  it('is oldest first, ties by id', () => {
    const items = [row('2', { addedAt: 5 }), row('1', { addedAt: 9 }), row('3', { addedAt: 5 })];
    expect(inOrderAdded(items).map((i) => i.id.slice(-1))).toEqual(['2', '3', '1']);
  });
});

describe('reordering by a drop', () => {
  const group = [
    row('1', { position: 'a0' }),
    row('2', { position: 'a1' }),
    row('3', { position: 'a2' }),
    row('4', { position: 'a3' }),
  ];
  const id = (n: string) => row(n).id;

  it('is the key between the neighbours it is dropped between, and nothing for a drop where it was', () => {
    const down = reorderedPosition(group, id('1'), id('3'));
    expect(down && down > 'a2' && down < 'a3').toBe(true);
    const up = reorderedPosition(group, id('4'), id('1'));
    expect(up && up < 'a0').toBe(true);
    const middle = reorderedPosition(group, id('4'), id('2'));
    expect(middle && middle > 'a0' && middle < 'a1').toBe(true);
    expect(reorderedPosition(group, id('2'), id('2'))).toBeNull();
    expect(reorderedPosition(group, id('2'), 'nobody')).toBeNull();
  });

  it('never throws when the neighbours’ keys are equal: it goes after them', () => {
    const ties = [
      row('1', { position: 'a1' }),
      row('2', { position: 'a1' }),
      row('3', { position: 'a1' }),
    ];
    const key = reorderedPosition(ties, id('3'), id('2'));
    expect(typeof key).toBe('string');
    expect((key ?? '') > 'a1').toBe(true);
  });

  it('property: a drop puts the item where it was dropped in the order the screen then shows', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), fc.nat(), fc.nat(), (n, a, b) => {
        const rows = Array.from({ length: n }, (_, i) => row(String(i + 1), { position: `a${i}` }));
        const from = a % n;
        const to = b % n;
        const key = reorderedPosition(rows, rows[from]?.id ?? '', rows[to]?.id ?? '');
        if (from === to) return key === null;
        const after = rows.map((r) =>
          r.id === rows[from]?.id ? { ...r, position: key ?? '' } : r,
        );
        const shown = [...after].sort((x, y) =>
          x.position !== y.position ? (x.position < y.position ? -1 : 1) : x.id < y.id ? -1 : 1,
        );
        const expected = [...rows];
        const [moved] = expected.splice(from, 1);
        if (moved) expected.splice(to, 0, moved);
        return shown.map((r) => r.id).join() === expected.map((r) => r.id).join();
      }),
    );
  });
});

describe('what a row says beside the name', () => {
  it('says a quantity with its unit, and nothing for one of something with no unit', () => {
    expect(quantityLabel({ quantity: '1', unit: null })).toBeNull();
    expect(quantityLabel({ quantity: '12', unit: null })).toBe('12');
    expect(quantityLabel({ quantity: '1.5', unit: 'kg' })).toBe('1.5 kg');
    expect(quantityLabel({ quantity: '1', unit: 'L' })).toBe('1 L');
  });

  it('shows the first line of a note that has text', () => {
    expect(firstLine(null)).toBeNull();
    expect(firstLine('')).toBeNull();
    expect(firstLine('\n\n  the green one \nsecond')).toBe('the green one');
  });
});
