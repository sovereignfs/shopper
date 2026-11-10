import { generateNKeysBetween } from 'fractional-indexing';
import type { GroceryIcon } from './icons';

/**
 * **The starter categories** (DESIGN.md §8.3): the sections of a shop, made for every household when it is made, in the order a shop usually has them,
 * which is the household's **aisle order** until a person changes it (phase 2, task 4.7). Each is a row of the household's own, keyed by `starter_key`
 * until it is renamed (its name is not sealed until a person gives it one: a starter name is the code's). _Other_ is where an item with no better place
 * goes: it can be neither deleted nor hidden, so that every item has a category to show under.
 *
 * Icons are the design system's grocery set as it is (`icons.ts`): a section with no icon of its own takes the one that is nearest, and the larger set
 * of task 16.4 gives each its own.
 */
export interface StarterCategory {
  readonly key: string;
  readonly name: string;
  readonly icon: GroceryIcon;
}

export const OTHER = 'other';

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  { key: 'produce', name: 'Produce', icon: 'apple' },
  { key: 'bakery', name: 'Bakery', icon: 'croissant' },
  { key: 'dairy-eggs', name: 'Dairy & eggs', icon: 'milk' },
  { key: 'meat-fish', name: 'Meat & fish', icon: 'beef' },
  { key: 'deli', name: 'Deli', icon: 'drumstick' },
  { key: 'frozen', name: 'Frozen', icon: 'snowflake' },
  { key: 'pantry', name: 'Pantry', icon: 'package' },
  { key: 'breakfast', name: 'Breakfast', icon: 'egg' },
  { key: 'snacks-sweets', name: 'Snacks & sweets', icon: 'cookie' },
  { key: 'drinks', name: 'Drinks', icon: 'cup-soda' },
  { key: 'household', name: 'Household', icon: 'spray-can' },
  { key: 'personal-care', name: 'Personal care', icon: 'package' },
  { key: 'baby', name: 'Baby', icon: 'package' },
  { key: 'pets', name: 'Pets', icon: 'package' },
  { key: OTHER, name: 'Other', icon: 'shopping-basket' },
];

/**
 * Their positions, as the fractional keys the design uses for every order (§9.6): the same ones in every household, so that two households' starter
 * categories sort alike and an edit to the order can insert between any two.
 */
export const STARTER_POSITIONS: readonly string[] = generateNKeysBetween(
  null,
  null,
  STARTER_CATEGORIES.length,
);

/** The starter category with a key, or `undefined`. */
export function starterCategory(key: string): StarterCategory | undefined {
  return STARTER_CATEGORIES.find((each) => each.key === key);
}

/** A starter category's position in the aisle order. */
export function starterPosition(key: string): string | undefined {
  const index = STARTER_CATEGORIES.findIndex((each) => each.key === key);
  return index < 0 ? undefined : STARTER_POSITIONS[index];
}
