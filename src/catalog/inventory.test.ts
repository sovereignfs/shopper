import { describe, expect, it } from 'vitest';
import type { InventoryRow } from '../actions/rows';
import { layerInventory, offered } from './inventory';
import { STARTER_CATALOG, starterEntryByKey } from './starter';

const row = (over: Partial<InventoryRow>): InventoryRow => ({
  id: crypto.randomUUID(),
  householdId: 'h',
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
const entryFor = (key: string) => {
  const found = starterEntryByKey(key);
  if (!found) throw new Error(`no starter entry ${key}`);
  return found;
};

describe('Inventory, the starter catalog layered under a person’s own rows (RFC 0006)', () => {
  it('is the whole starter catalog as it is, for a person who has changed nothing, none of it copied into an account', () => {
    const entries = layerInventory([]);
    expect(entries).toHaveLength(STARTER_CATALOG.length);
    expect(entries.every((entry) => entry.id === null && !entry.mine && !entry.overridden)).toBe(
      true,
    );
    const bread = entries.find((entry) => entry.starterKey === 'bread');
    expect(bread).toMatchObject({
      key: 'starter:bread',
      name: entryFor('bread').name,
      categoryKey: entryFor('bread').category,
      recurring: false,
      hidden: false,
    });
  });

  it('shows a renamed starter entry by its new name and keeps the entry’s key, so that the old name is not offered', () => {
    const renamed = row({ starterKey: 'bread', name: 'Sourdough' });
    const entries = layerInventory([renamed]);
    const bread = entries.find((entry) => entry.starterKey === 'bread');
    expect(bread).toMatchObject({
      key: 'starter:bread',
      id: renamed.id,
      name: 'Sourdough',
      overridden: true,
    });
    // One entry for it, under the new name: the starter's name is gone from what is shown.
    expect(entries.filter((entry) => entry.starterKey === 'bread')).toHaveLength(1);
    expect(entries.some((entry) => entry.name === entryFor('bread').name)).toBe(false);
  });

  it('lays only what a person changed over the entry: an override with no name keeps the starter’s, a field it leaves empty is the starter’s', () => {
    const entries = layerInventory([row({ starterKey: 'bread', recurring: true, quantity: '3' })]);
    const bread = entries.find((entry) => entry.starterKey === 'bread');
    expect(bread).toMatchObject({
      name: entryFor('bread').name,
      icon: entryFor('bread').icon,
      unit: entryFor('bread').unit,
      quantity: '3',
      recurring: true,
    });
  });

  it('offers nowhere a hidden entry, starter or the person’s own, and shows it again when it is restored', () => {
    const hiddenStarter = row({ starterKey: 'bread', hidden: true });
    const hiddenOwn = row({ name: 'Secret bin bags', hidden: true });
    const shownOwn = row({ name: 'Good bin bags' });
    const entries = layerInventory([hiddenStarter, hiddenOwn, shownOwn]);
    // Shown on the screen, so that it can be restored...
    expect(entries.find((entry) => entry.starterKey === 'bread')?.hidden).toBe(true);
    // ...and offered nowhere.
    const names = offered(entries).map((entry) => entry.name);
    expect(names).not.toContain(entryFor('bread').name);
    expect(names).not.toContain('Secret bin bags');
    expect(names).toContain('Good bin bags');
    const restored = layerInventory([{ ...hiddenStarter, hidden: false }]);
    expect(offered(restored).some((entry) => entry.starterKey === 'bread')).toBe(true);
  });

  it('leaves out a deleted row: a deleted override shows the starter entry as it is, a deleted item of their own is gone', () => {
    const entries = layerInventory([
      row({ starterKey: 'bread', name: 'Sourdough', deletedAt: 9 }),
      row({ name: 'Gone for good', deletedAt: 9 }),
    ]);
    expect(entries.find((entry) => entry.starterKey === 'bread')).toMatchObject({
      name: entryFor('bread').name,
      overridden: false,
    });
    expect(entries.some((entry) => entry.name === 'Gone for good')).toBe(false);
  });

  it('lists the person’s own items after the starter’s, in name order, as theirs', () => {
    const entries = layerInventory([row({ name: 'Zinc cream' }), row({ name: 'Axe grease' })]);
    const own = entries.filter((entry) => entry.mine);
    expect(own.map((entry) => entry.name)).toEqual(['Axe grease', 'Zinc cream']);
    expect(entries.slice(-2).every((entry) => entry.mine)).toBe(true);
  });
});
