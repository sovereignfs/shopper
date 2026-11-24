import { describe, expect, it } from 'vitest';
import type { InventoryRow } from '../actions/rows';
import { inventoryHas, layerInventory, offered } from './inventory';
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

  it('passes over an override of an entry this version does not have, and a row with no name at all, whatever they hold, and shows everything else as before', () => {
    // In a group its device encrypts the server cannot tell a newer version's override from any other, so an older shell pulls it: it must be there, unseen, and
    // break nothing.
    const entries = layerInventory([
      row({ starterKey: 'an-entry-of-a-later-version', name: null, hidden: true }),
      row({ starterKey: 'another-of-a-later-version', name: 'Seen by no one', note: 'x' }),
      row({ name: null }),
      row({ name: 'Zinc cream' }),
    ]);
    expect(entries).toHaveLength(STARTER_CATALOG.length + 1);
    expect(entries.filter((entry) => entry.mine).map((entry) => entry.name)).toEqual([
      'Zinc cream',
    ]);
    expect(entries.some((entry) => entry.overridden)).toBe(false);
    expect(offered(entries)).toHaveLength(entries.length);
  });
});

describe('whether Inventory has a name (§8.8)', () => {
  it('is yes for an item of their own, a starter entry by its name or an alias, a renamed entry by its new name, and a hidden one, whatever the capitals, spaces or plural', () => {
    const withAlias = STARTER_CATALOG.find((entry) => entry.aliases.length > 0);
    if (!withAlias) throw new Error('the starter catalog has no entry with an alias');
    expect(inventoryHas([], withAlias.name)).toBe(true);
    expect(inventoryHas([], `  ${withAlias.aliases[0]?.toUpperCase()}  `)).toBe(true);
    expect(inventoryHas([row({ name: 'Good bin bags' })], 'good   BIN bags')).toBe(true);
    expect(inventoryHas([row({ starterKey: 'bread', name: 'Sourdough' })], 'sourdough')).toBe(true);
    // A starter entry that was renamed is still that entry: the name it had is the name too.
    expect(inventoryHas([row({ starterKey: 'bread', name: 'Sourdough' })], 'Bread')).toBe(true);
    expect(inventoryHas([row({ starterKey: 'bread', hidden: true })], 'bread')).toBe(true);
    expect(inventoryHas([row({ name: 'Old gloves', hidden: true })], 'Old gloves')).toBe(true);
  });

  it('is no for a name it does not have, and for one whose row was deleted', () => {
    expect(inventoryHas([row({ name: 'Good bin bags' })], 'Bad bin bags')).toBe(false);
    expect(inventoryHas([row({ name: 'Old gloves', deletedAt: 4 })], 'Old gloves')).toBe(false);
    expect(inventoryHas([], 'Zorblax')).toBe(false);
  });
});
