import { describe, expect, it } from 'vitest';
import { MAX_CHANGES, MAX_NOTE_LENGTH, isId, isPosition } from './format';
import { validateMutation } from './validate';
import { HOUSEHOLD, PERSON } from './test-support';

const ID = '70000000-0000-4000-8000-000000000001';
const ID2 = '70000000-0000-4000-8000-000000000002';
const LIST = '40000000-0000-4000-8000-000000000001';

const make = (changes: unknown[], over: Record<string, unknown> = {}) => ({
  mutationId: ID2,
  householdId: HOUSEHOLD,
  changes,
  ...over,
});
const item = (fields: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  table: 'item',
  id: ID,
  fields,
  ...over,
});
const newItem = (over: Record<string, unknown> = {}) =>
  item(
    {
      listId: LIST,
      productId: ID2,
      name: 'Oat milk',
      quantity: '2',
      position: 'a0',
      addedBy: PERSON,
      addedAt: 1,
      ...over,
    },
    { create: true },
  );

const problem = (input: unknown): string => {
  const verdict = validateMutation(input);
  if (verdict.ok) throw new Error('expected the mutation to be refused');
  return verdict.problem;
};

describe('a well-formed mutation', () => {
  it('is accepted, and handed back with only what it said', () => {
    const verdict = validateMutation(
      make([newItem({ note: 'the green one', unit: 'L', icon: 'milk', categoryId: null })]),
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok)
      expect(verdict.mutation.changes[0]?.fields).toMatchObject({
        note: 'the green one',
        unit: 'L',
        icon: 'milk',
        categoryId: null,
      });
  });

  it('may change one field of a row that exists, and may say nothing is bought by setting it to nothing', () => {
    expect(validateMutation(make([item({ boughtAt: 5, boughtBy: PERSON })])).ok).toBe(true);
    expect(validateMutation(make([item({ boughtAt: null, boughtBy: null })])).ok).toBe(true);
  });

  it('strips what it does not know of the envelope: only the three fields come back', () => {
    const verdict = validateMutation({ ...make([item({ boughtAt: 5 })]), seq: 99, extra: 'x' });
    expect(verdict.ok && Object.keys(verdict.mutation).sort()).toEqual([
      'changes',
      'householdId',
      'mutationId',
    ]);
  });
});

describe('a mutation that is refused', () => {
  const cases: [string, unknown, RegExp][] = [
    ['not an object', 'text', /mutation/],
    ['null', null, /mutation/],
    ['an array', [], /mutation/],
    [
      'a mutation id that is not an id',
      make([item({ boughtAt: 5 })], { mutationId: 'abc' }),
      /mutationId/,
    ],
    [
      'a household id that is not an id',
      make([item({ boughtAt: 5 })], { householdId: '../../etc' }),
      /householdId/,
    ],
    ['no changes', make([]), /changes/],
    [
      'too many changes',
      make(
        Array.from({ length: MAX_CHANGES + 1 }, (_, i) =>
          item(
            { boughtAt: 1 },
            { id: `70000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}` },
          ),
        ),
      ),
      /changes/,
    ],
    ['a change that is not an object', make(['x']), /change 1/],
    [
      'a table that is not synced',
      make([{ table: 'member', id: ID, fields: { role: 'admin' } }]),
      /table/,
    ],
    [
      'a category, which is fixed in 0.1.0',
      make([{ table: 'category', id: ID, fields: { hidden: true } }]),
      /table/,
    ],
    ['a row id that is not an id', make([item({ boughtAt: 5 }, { id: 'x' })]), /change 1/],
    ['a change that says nothing', make([item({})]), /says nothing/],
    ['a field the table does not have', make([item({ seq: 9 })]), /no field seq/],
    [
      'a field only the server may set',
      make([{ table: 'product', id: ID, fields: { nameKey: 'abc' } }]),
      /no field nameKey/,
    ],
    [
      'a product’s times bought',
      make([{ table: 'product', id: ID, fields: { timesBought: 99 } }]),
      /no field timesBought/,
    ],
    ['a name that is empty', make([newItem({ name: '' })]), /name/],
    ['a name of spaces', make([newItem({ name: '   ' })]), /name/],
    ['a name that is too long', make([newItem({ name: 'x'.repeat(201) })]), /name/],
    ['a name with a control character', make([newItem({ name: 'a\u0000b' })]), /name/],
    ['a name that is a number', make([newItem({ name: 5 })]), /name/],
    ['a note that is too long', make([item({ note: 'x'.repeat(MAX_NOTE_LENGTH + 1) })]), /note/],
    ['a note with a control character', make([item({ note: 'a\u0007b' })]), /note/],
    ['a quantity that is not canonical', make([item({ quantity: '2.50' })]), /quantity/],
    ['a quantity of zero', make([item({ quantity: '0' })]), /quantity/],
    ['a negative quantity', make([item({ quantity: '-1' })]), /quantity/],
    ['a quantity as a float', make([item({ quantity: 2.5 })]), /quantity/],
    ['a unit that is not on the list', make([item({ unit: 'litre' })]), /unit/],
    ['an icon that is not a grocery icon', make([item({ icon: 'settings' })]), /icon/],
    ['a position that is not one', make([item({ position: 'a b' })]), /position/],
    ['a position that is too long', make([item({ position: 'a'.repeat(65) })]), /position/],
    ['a time that is a fraction', make([item({ boughtAt: 1.5 })]), /boughtAt/],
    ['a time that is negative', make([item({ boughtAt: -1 })]), /boughtAt/],
    ['a time that is text', make([item({ boughtAt: 'now' })]), /boughtAt/],
    ['a reference that is not an id', make([item({ listId: 'x' })]), /listId/],
    [
      'a list a clearing rule that does not exist',
      make([{ table: 'list', id: ID, fields: { clearing: 'sometimes' } }]),
      /clearing/,
    ],
    [
      'a new item without what it needs',
      make([item({ listId: LIST, name: 'x' }, { create: true })]),
      /needs/,
    ],
    [
      'a new list without a position',
      make([{ table: 'list', id: ID, create: true, fields: { name: 'x', createdAt: 1 } }]),
      /needs position/,
    ],
    ['the same row twice', make([item({ boughtAt: 1 }), item({ boughtAt: 2 })]), /earlier one/],
    [
      'create as something else than true',
      make([item({ boughtAt: 1 }, { create: false })]),
      /change 1/,
    ],
  ];
  for (const [label, input, says] of cases) {
    it(`${label}`, () => {
      expect(problem(input)).toMatch(says);
    });
  }

  it('never says what was sent: a problem names the field and not its value', () => {
    const secret = 'PLANTED-should-not-appear';
    expect(problem(make([newItem({ unit: secret })]))).not.toContain(secret);
    expect(problem(make([item({ position: secret + ' ' })]))).not.toContain(secret);
  });
});

describe('ids and positions', () => {
  it('are ids of the UUID forms and positions of letters and digits', () => {
    expect(isId('70000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isId('70000000-0000-7000-8000-000000000001')).toBe(true);
    for (const bad of [
      '',
      'abc',
      '70000000000040008000000000000001',
      '70000000-0000-4000-8000-00000000000g',
      "'; DROP TABLE item; --",
    ])
      expect(isId(bad), bad).toBe(false);
    expect(isPosition('a0')).toBe(true);
    expect(isPosition('aZz9')).toBe(true);
    for (const bad of ['', 'a-0', 'a 0', 'é', 'a'.repeat(65)])
      expect(isPosition(bad), bad).toBe(false);
  });
});
