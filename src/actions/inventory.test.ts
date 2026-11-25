import { describe, expect, it } from 'vitest';
import {
  changeInventoryItem,
  deleteInventoryItem,
  hideInventoryItem,
  makeInventoryItem,
  overrideStarterEntry,
  restoreInventoryItem,
} from './inventory';
import type { Env } from './env';
import type { InventoryRow } from './rows';
import { validateMutation } from './validate';

const HOUSEHOLD = '10000000-0000-4000-8000-000000000001';
let n = 0;
const env: Env = {
  now: 1_900_000_000_000,
  newId: () => `70000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
};
const row = (over: Partial<InventoryRow> = {}): InventoryRow => ({
  id: '70000000-0000-4000-8000-0000000000aa',
  householdId: HOUSEHOLD,
  starterKey: null,
  name: 'Good bin bags',
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

describe('the actions on a person’s Inventory (23.3)', () => {
  it('make an item of their own, recurring or once, in their own group, which the server will accept as a mutation', () => {
    const made = makeInventoryItem(env, {
      householdId: HOUSEHOLD,
      name: 'Good bin bags',
      recurring: true,
      unit: 'pcs',
      quantity: '1',
    });
    expect(made.householdId).toBe(HOUSEHOLD);
    expect(made.changes[0]).toMatchObject({
      table: 'inventory_item',
      create: true,
      fields: {
        name: 'Good bin bags',
        recurring: 1,
        hidden: 0,
        unit: 'pcs',
        quantity: '1',
        createdAt: env.now,
      },
    });
    expect(validateMutation(made).ok).toBe(true);
  });

  it('override a starter entry by its key, with the starter’s name unless given another', () => {
    const kept = overrideStarterEntry(env, { householdId: HOUSEHOLD, starterKey: 'bread' });
    expect(kept.changes[0]?.fields).not.toHaveProperty('name');
    expect(kept.changes[0]?.fields).toMatchObject({ starterKey: 'bread', hidden: 0 });
    expect(validateMutation(kept).ok).toBe(true);
    const renamed = overrideStarterEntry(env, {
      householdId: HOUSEHOLD,
      starterKey: 'bread',
      name: 'Sourdough',
      hidden: true,
    });
    expect(renamed.changes[0]?.fields).toMatchObject({
      starterKey: 'bread',
      name: 'Sourdough',
      hidden: 1,
    });
    expect(validateMutation(renamed).ok).toBe(true);
  });

  it('change only what differs, flags as 0 and 1, and nothing at all when nothing does', () => {
    expect(changeInventoryItem(env, row(), { name: 'Good bin bags', recurring: false })).toBeNull();
    const changed = changeInventoryItem(env, row(), { name: 'Strong bin bags', recurring: true });
    expect(changed?.changes[0]).toMatchObject({
      table: 'inventory_item',
      id: row().id,
      fields: { name: 'Strong bin bags', recurring: 1 },
    });
    expect(Object.keys(changed?.changes[0]?.fields ?? {}).sort()).toEqual(['name', 'recurring']);
    expect(validateMutation(changed).ok).toBe(true);
  });

  it('hide and restore by the flag, which is a change to nothing when it already is so', () => {
    expect(hideInventoryItem(env, row({ hidden: true }))).toBeNull();
    expect(hideInventoryItem(env, row())?.changes[0]?.fields).toEqual({ hidden: 1 });
    expect(restoreInventoryItem(env, row())).toBeNull();
    expect(restoreInventoryItem(env, row({ hidden: true }))?.changes[0]?.fields).toEqual({
      hidden: 0,
    });
  });

  it('delete with the time, once', () => {
    expect(deleteInventoryItem(env, row())?.changes[0]?.fields).toEqual({ deletedAt: env.now });
    expect(deleteInventoryItem(env, row({ deletedAt: 5 }))).toBeNull();
  });
});
