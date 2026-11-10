import type { IconName } from '@sovereignfs/ui';

/**
 * **The icons a product, a category and an item may have** (DESIGN.md §8.4): the grocery icons the design system already has, which `IconPicker` offers
 * in this order. `satisfies` holds each to `IconName`, so a name the design system does not have fails to compile. A key is validated against this list
 * and not against the design system's whole set, so that a product cannot be given an icon that has nothing to do with shopping. The larger set of
 * about eighty (task 16.4) joins in phase 2, with the larger starter catalog (4.8).
 */
export const GROCERY_ICONS = [
  'shopping-basket',
  'apple',
  'banana',
  'carrot',
  'salad',
  'croissant',
  'pizza',
  'egg',
  'milk',
  'beef',
  'drumstick',
  'fish',
  'snowflake',
  'cookie',
  'candy',
  'coffee',
  'cup-soda',
  'wine',
  'beer',
  'spray-can',
  'package',
] as const satisfies readonly IconName[];

export type GroceryIcon = (typeof GROCERY_ICONS)[number];

const KEYS: ReadonlySet<string> = new Set(GROCERY_ICONS);

/** Whether a string is one of the grocery icons, compared exactly. */
export function isGroceryIcon(key: string): key is GroceryIcon {
  return KEYS.has(key);
}
