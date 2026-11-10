import { describe, expect, it } from 'vitest';
import { item, list, product } from '../actions/test-support';
import { applyChange, reversal } from './rows';

const HOUSEHOLD = '10000000-0000-4000-8000-000000000001';

describe('what a change does to a row on the device', () => {
  it('makes a row that is new with what the server would give it', () => {
    const row = applyChange(
      'item',
      undefined,
      {
        table: 'item',
        id: '60000000-0000-4000-8000-000000000009',
        create: true,
        fields: {
          listId: 'l',
          productId: 'p',
          name: 'Eggs',
          quantity: '12',
          position: 'a0',
          addedBy: 'x',
          addedAt: 5,
        },
      },
      HOUSEHOLD,
      9,
    );
    expect(row).toMatchObject({
      householdId: HOUSEHOLD,
      seq: 0,
      name: 'Eggs',
      boughtAt: null,
      clearedAt: null,
      deletedAt: null,
      note: null,
    });
    const made = applyChange(
      'product',
      undefined,
      { table: 'product', id: 'p', create: true, fields: { name: 'Eggs', createdAt: 3 } },
      HOUSEHOLD,
      9,
    );
    expect(made).toMatchObject({ timesBought: 0, lastBoughtAt: null, createdAt: 3 });
  });

  it('sets the fields it says and leaves the rest, and an edit restores a deleted row', () => {
    const base = item({ deletedAt: 7, note: 'ripe' });
    const edited = applyChange(
      'item',
      base,
      { table: 'item', id: base.id, fields: { quantity: '3' } },
      HOUSEHOLD,
      9,
    );
    expect(edited).toMatchObject({ quantity: '3', note: 'ripe', deletedAt: null });
    const deleted = applyChange(
      'item',
      item(),
      { table: 'item', id: base.id, fields: { deletedAt: 9 } },
      HOUSEHOLD,
      9,
    );
    expect(deleted.deletedAt).toBe(9);
  });

  it('keeps the first tick', () => {
    const bought = item({ boughtAt: 5, boughtBy: 'first' });
    const again = applyChange(
      'item',
      bought,
      { table: 'item', id: bought.id, fields: { boughtAt: 8, boughtBy: 'second', note: 'x' } },
      HOUSEHOLD,
      9,
    );
    expect(again).toMatchObject({ boughtAt: 5, boughtBy: 'first', note: 'x' });
    const untick = applyChange(
      'item',
      bought,
      { table: 'item', id: bought.id, fields: { boughtAt: null, boughtBy: null } },
      HOUSEHOLD,
      9,
    );
    expect(untick).toMatchObject({ boughtAt: null, boughtBy: null });
  });
});

describe('the change that reverses one', () => {
  const values = (row: object) => row as Record<string, string | number | null>;
  it('puts back the fields that changed, and only those', () => {
    const before = item({ quantity: '2' });
    const change = { table: 'item' as const, id: before.id, fields: { quantity: '5', note: null } };
    const after = applyChange('item', before, change, HOUSEHOLD, 1);
    expect(reversal('item', values(before), values(after), change, 1)).toEqual({
      table: 'item',
      id: before.id,
      fields: { quantity: '2' },
    });
  });

  it('deletes what was made, except a product, and deletes again what an edit restored', () => {
    const made = { table: 'item' as const, id: 'i', create: true as const, fields: { name: 'x' } };
    expect(reversal('item', undefined, { id: 'i' }, made, 4)).toEqual({
      table: 'item',
      id: 'i',
      fields: { deletedAt: 4 },
    });
    expect(
      reversal('product', undefined, { id: 'p' }, { ...made, table: 'product' }, 4),
    ).toBeNull();
    const gone = item({ deletedAt: 7 });
    const edit = { table: 'item' as const, id: gone.id, fields: { quantity: '9' } };
    const after = applyChange('item', gone, edit, HOUSEHOLD, 1);
    expect(reversal('item', values(gone), values(after), edit, 5)?.fields).toEqual({
      quantity: gone.quantity,
      deletedAt: 7,
    });
  });

  it('is nothing when nothing changed', () => {
    const row = list();
    expect(
      reversal(
        'list',
        values(row),
        values(row),
        { table: 'list', id: row.id, fields: { name: row.name } },
        1,
      ),
    ).toBeNull();
    expect(product().id).toBeTruthy();
  });
});
