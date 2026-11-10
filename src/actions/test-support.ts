import type { Env } from './env';
import type { ItemRow, ListRow, ProductRow } from './rows';

/** A time, and ids that count: what a test gives an action in place of the clock and the random source. */
export function env(now = 1_800_000_000_000): Env & { made: string[] } {
  let n = 0;
  const made: string[] = [];
  return {
    now,
    made,
    newId: () => {
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      made.push(id);
      return id;
    },
  };
}

export const HOUSEHOLD = '10000000-0000-4000-8000-000000000001';
export const PERSON = '20000000-0000-4000-8000-000000000001';
export const OTHER_PERSON = '20000000-0000-4000-8000-000000000002';
export const CATEGORY = '30000000-0000-4000-8000-000000000001';

export const list = (over: Partial<ListRow> = {}): ListRow => ({
  id: '40000000-0000-4000-8000-000000000001',
  householdId: HOUSEHOLD,
  name: 'Groceries',
  position: 'a0',
  clearing: 'manual',
  archivedAt: null,
  deletedAt: null,
  createdAt: 1,
  seq: 1,
  ...over,
});

export const product = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: '50000000-0000-4000-8000-000000000001',
  householdId: HOUSEHOLD,
  name: 'Oat milk',
  note: null,
  categoryId: CATEGORY,
  icon: 'milk',
  defaultQuantity: '1',
  defaultUnit: 'L',
  timesBought: 0,
  lastBoughtAt: null,
  lastAddedAt: null,
  deletedAt: null,
  createdAt: 1,
  seq: 1,
  ...over,
});

export const item = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: '60000000-0000-4000-8000-000000000001',
  householdId: HOUSEHOLD,
  listId: '40000000-0000-4000-8000-000000000001',
  productId: '50000000-0000-4000-8000-000000000001',
  name: 'Oat milk',
  note: null,
  quantity: '2',
  unit: 'L',
  categoryId: CATEGORY,
  icon: 'milk',
  position: 'a0',
  addedBy: PERSON,
  addedAt: 1,
  boughtAt: null,
  boughtBy: null,
  clearedAt: null,
  deletedAt: null,
  seq: 1,
  ...over,
});
