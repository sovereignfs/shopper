import type { IconName } from '@sovereignfs/ui';

/**
 * **A list's icon and colour** (RFC 0005, DESIGN.md §9.1): what a list looks like wherever it is shown, chosen by its people and **encrypted** as its name is,
 * since an icon says what a list is for. Each is a field of its own (`icon`, `color`), merged by field like every other, and a list that has neither is
 * shown with the defaults below: **a default is never written**, so that nothing has to be encrypted for a list that was never given one, and the
 * defaults can change by a release.
 *
 * The colour is any `#rrggbb`, drawn as the icon's colour on the ordinary surface and never as a background or the colour of text, so that light and dark stay
 * readable (Tally's rule, `src/groups/colors.ts`, whose swatches are copied here). The icon is one of the design system's, chosen from the set below: people
 * never upload one. What is read back, which no server can check, is held to the same lists, and anything else (a value a newer build wrote, one that was
 * changed) is shown as the default and never drawn.
 */
export const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** The suggestions `ColorPicker` offers, in order; a list may be any colour at all. Copied from Tally's `src/groups/colors.ts`. */
export const LIST_SWATCHES: readonly { label: string; value: string }[] = [
  { label: 'Grey', value: '#6b7280' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Pink', value: '#db2777' },
];

export const DEFAULT_LIST_COLOR = '#2563eb';

/**
 * The icons a list may have, in the order `IconPicker` offers them: the cart a new list shows, then the groceries, then what a list may be for beyond them
 * (a shop, hardware, electronics, clothing, a gift, the garden, the office, the pharmacy, a baby, a pet, home). `satisfies` holds each to `IconName`, so a
 * name the design system does not have fails to compile. A list's icon is a choice from this set and never an upload; the card icons (`wallet-cards`,
 * `scan-barcode`) are for loyalty cards, not here.
 */
export const LIST_ICONS = [
  'shopping-cart',
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
  'store',
  'hammer',
  'wrench',
  'plug',
  'laptop',
  'headphones',
  'shirt',
  'gift',
  'sprout',
  'flower-2',
  'briefcase',
  'paperclip',
  'pill',
  'baby',
  'dog',
  'sofa',
  'house',
  'luggage',
  'list-todo',
] as const satisfies readonly IconName[];

export type ListIcon = (typeof LIST_ICONS)[number];

/** What a list with no icon of its own shows: the cart (RFC 0005). */
export const DEFAULT_LIST_ICON: ListIcon = 'shopping-cart';

const ICONS: ReadonlySet<string> = new Set(LIST_ICONS);

export const isListIcon = (value: unknown): value is ListIcon =>
  typeof value === 'string' && ICONS.has(value);

export const isListColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR.test(value);

/** The icon to draw for a list's `icon` as the device holds it (`undefined` for a row stored before the field existed). */
export const listIconOf = (value: unknown): ListIcon =>
  isListIcon(value) ? value : DEFAULT_LIST_ICON;

/** The colour to draw for a list's `color`: its own if it is a `#rrggbb`, else the default. */
export const listColorOf = (value: unknown): string =>
  isListColor(value) ? value : DEFAULT_LIST_COLOR;
