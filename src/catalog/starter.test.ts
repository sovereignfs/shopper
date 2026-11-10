import { describe, expect, it } from 'vitest';
import { ringOf } from '../crypto/keys';
import { isQuantity } from '../quantity/decimal';
import { isUnit } from '../quantity/units';
import { STARTER_CATEGORIES } from './categories';
import { canonicalName } from './canonical';
import { guessCategory } from './guess';
import { isGroceryIcon } from './icons';
import { normaliseName } from './name';
import { productNameKey } from './product-key';
import {
  STARTER_CATALOG,
  STARTER_CATEGORY_KEYS,
  isStarterSingular,
  starterCategoryFor,
  starterEntryFor,
} from './starter';

const ring = ringOf(Buffer.alloc(32, 4));
if (!ring) throw new Error('no ring');

describe('the starter catalog', () => {
  it('has the common groceries: about two hundred, in every category but Other', () => {
    expect(STARTER_CATALOG.length).toBeGreaterThanOrEqual(150);
    expect(STARTER_CATALOG.length).toBeLessThanOrEqual(260);
    const used = new Set(STARTER_CATALOG.map((e) => e.category));
    for (const category of STARTER_CATEGORIES.filter((c) => c.key !== 'other'))
      expect(used.has(category.key), category.key).toBe(true);
    expect(used.has('other')).toBe(false);
  });

  it('is well-formed: every category, icon, unit and quantity exists, and every name is a name', () => {
    for (const entry of STARTER_CATALOG) {
      expect(STARTER_CATEGORY_KEYS.has(entry.category), `${entry.name}: category`).toBe(true);
      expect(isGroceryIcon(entry.icon), `${entry.name}: icon`).toBe(true);
      if (entry.unit !== null) expect(isUnit(entry.unit), `${entry.name}: unit`).toBe(true);
      if (entry.quantity !== null)
        expect(isQuantity(entry.quantity), `${entry.name}: quantity`).toBe(true);
      expect(entry.name.trim()).toBe(entry.name);
      expect(entry.key).toMatch(/^[\p{L}\p{N}]+(-[\p{L}\p{N}]+)*$/u);
    }
  });

  it('has no two entries that share a key, a normalised name or an alias, or a plural of one that is another’s name', () => {
    const keys = STARTER_CATALOG.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const entry of STARTER_CATALOG) {
      const names = [entry.name, ...entry.aliases, ...(entry.plural ? [`${entry.name}s`] : [])].map(
        normaliseName,
      );
      for (const name of names) {
        const other = seen.get(name);
        if (other !== undefined && other !== entry.key)
          clashes.push(`${name}: ${other} and ${entry.key}`);
        seen.set(name, entry.key);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('finds an entry by its name, an alias or its plural, whatever the case and spacing', () => {
    expect(starterEntryFor('OAT  milk')?.key).toBe('oat-milk');
    expect(starterEntryFor('zucchini')?.name).toBe('Courgette');
    expect(starterEntryFor('Courgettes')?.name).toBe('Courgette');
    expect(starterEntryFor('apples')?.name).toBe('Apple');
    expect(starterEntryFor('yogurt')?.name).toBe('Yoghurt');
    expect(starterEntryFor('unobtainium')).toBeUndefined();
  });
});

describe('the plural rule', () => {
  it('strips an s only where the catalog says the plural is the same product', () => {
    expect(canonicalName('Apples')).toBe('apple');
    expect(canonicalName('apple')).toBe('apple');
    expect(canonicalName(' BANANAS ')).toBe('banana');
    expect(canonicalName('peas')).toBe('peas');
    expect(canonicalName('hummus')).toBe('hummus');
    expect(canonicalName('oat milks')).toBe('oat milks');
    expect(canonicalName('Houmous')).toBe('houmous');
    expect(isStarterSingular('apple')).toBe(true);
    expect(isStarterSingular('peas')).toBe(false);
  });

  it('makes Apple and apples one product in a household, and not in two', () => {
    expect(productNameKey(ring, 'h1', 'Apple')).toBe(productNameKey(ring, 'h1', 'apples'));
    expect(productNameKey(ring, 'h1', 'Apple')).not.toBe(productNameKey(ring, 'h2', 'apples'));
    expect(productNameKey(ring, 'h1', 'pea')).not.toBe(productNameKey(ring, 'h1', 'peas'));
  });
});

describe('the category a name is given by the catalog', () => {
  it('is the entry’s for the whole name, and the last word’s failing that', () => {
    expect(starterCategoryFor('oat milk')).toBe('dairy-eggs');
    expect(starterCategoryFor('goat cheese')).toBe('dairy-eggs');
    expect(starterCategoryFor('smoked cheddar')).toBe('dairy-eggs');
    expect(starterCategoryFor('organic bananas')).toBe('produce');
    expect(starterCategoryFor('xylophone')).toBeUndefined();
  });

  it('puts goat cheese in Dairy & eggs with no history, and the household’s own choice once it has one', () => {
    const aisle = STARTER_CATEGORIES.map((c) => c.key);
    const base = { starter: starterCategoryFor, aisle };
    expect(guessCategory({ ...base, name: 'Smoked goat cheese', products: [] })).toBe('dairy-eggs');
    // The catalog is asked first, so a household's own habit decides only what the catalog does not know.
    expect(
      guessCategory({
        ...base,
        name: 'Kefir bits',
        products: [{ name: 'kefir', category: 'drinks' }],
      }),
    ).toBe('drinks');
  });
});
