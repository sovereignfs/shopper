import { describe, expect, it } from 'vitest';
import {
  copyOnList,
  deleteCopy,
  moveCopy,
  putCategoryOnList,
  renameCopies,
  renameCopy,
  setCopyIcon,
} from './list-categories';
import type { Env } from './env';
import type { ListCategoryRow } from './rows';

/** The actions on a list's copies of people's categories (DESIGN.md §8.3): pure, and `null` when they would change nothing. */
let n = 0;
const env = (): Env => ({
  now: 1_900_000_000_000,
  newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
});
const SOURCE = `n3.${'A'.repeat(43)}`;
const row = (over: Partial<ListCategoryRow> = {}): ListCategoryRow => ({
  id: '10000000-0000-4000-8000-000000000001',
  householdId: '20000000-0000-4000-8000-000000000001',
  listId: '30000000-0000-4000-8000-000000000001',
  sourceKey: SOURCE,
  name: 'Garden',
  icon: null,
  position: 'a5',
  deletedAt: null,
  seq: 1,
  ...over,
});

describe('putting a category on a list', () => {
  it('uses the list’s live copy of it, found by its source key, and says nothing', () => {
    const there = row();
    const plan = copyOnList(env(), {
      listId: there.listId,
      sourceKey: SOURCE,
      name: 'Garden',
      copies: [there],
    });
    expect(plan).toEqual({ id: there.id, change: null });
    expect(
      putCategoryOnList(env(), {
        householdId: there.householdId,
        listId: there.listId,
        sourceKey: SOURCE,
        name: 'Garden',
        copies: [there],
      }),
    ).toBeNull();
  });

  it('makes a copy, last in the aisle order, when the list has none, or only a deleted one, which is made again under the same key', () => {
    for (const copies of [
      [],
      [row({ deletedAt: 5 })],
      [row({ sourceKey: `n3.${'B'.repeat(43)}` })],
    ]) {
      const plan = copyOnList(env(), {
        listId: row().listId,
        sourceKey: SOURCE,
        name: 'Garden',
        copies,
        last: 'a7',
        icon: 'apple',
      });
      expect(plan.change).toMatchObject({
        table: 'list_category',
        id: plan.id,
        create: true,
        fields: { listId: row().listId, sourceKey: SOURCE, name: 'Garden', icon: 'apple' },
      });
      expect(String(plan.change?.fields.position) > 'a7').toBe(true);
      expect(copies.some((each) => each.id === plan.id)).toBe(false);
    }
  });
});

describe('changing a copy', () => {
  it('renames, gives an icon, places and deletes, and says nothing when nothing changes', () => {
    expect(renameCopy(env(), row(), 'Garden')).toBeNull();
    expect(renameCopy(env(), row(), 'Yard')?.changes[0]).toEqual({
      table: 'list_category',
      id: row().id,
      fields: { name: 'Yard' },
    });
    expect(setCopyIcon(env(), row(), null)).toBeNull();
    expect(setCopyIcon(env(), row(), 'apple')?.changes[0]?.fields).toEqual({ icon: 'apple' });
    expect(moveCopy(env(), row(), 'a5')).toBeNull();
    expect(moveCopy(env(), row(), 'a7')?.changes[0]?.fields).toEqual({ position: 'a7' });
    expect(deleteCopy(env(), row({ deletedAt: 3 }))).toBeNull();
    expect(deleteCopy(env(), row())?.changes[0]?.fields).toEqual({ deletedAt: env().now });
    // For the group the copy is in.
    expect(renameCopy(env(), row(), 'Yard')?.householdId).toBe(row().householdId);
  });

  it('renames the copies of a category that was renamed, one mutation for each group, and none that has the name already', () => {
    const other = row({
      id: '10000000-0000-4000-8000-000000000002',
      householdId: '20000000-0000-4000-8000-000000000002',
    });
    const same = row({ id: '10000000-0000-4000-8000-000000000003', name: 'Yard' });
    const mutations = renameCopies(env(), [row(), other, same], 'Yard');
    expect(mutations.map((each) => each.householdId).sort()).toEqual(
      [row().householdId, other.householdId].sort(),
    );
    expect(mutations.flatMap((each) => each.changes.map((c) => c.id)).sort()).toEqual(
      [row().id, other.id].sort(),
    );
    expect(renameCopies(env(), [same], 'Yard')).toEqual([]);
  });
});
