import type { IconName } from '@sovereignfs/ui';
import { isListColor } from '../lists/appearance';

/**
 * **A card's icon and colour** (DESIGN.md §7.7, RFC 0007): what a card looks like in the grid, chosen by the person and **encrypted** with the rest of the card, as a list's are (RFC 0005): no
 * shop's logo, since nothing is loaded from a third party. The colour is any `#rrggbb` (the same `isListColor`), drawn as the icon's colour on the ordinary surface and never as a background; the
 * icon is one of the design system's from the set below. What is read back, which no server can check, is held to the same sets, and anything else is drawn as the default.
 */
export const CARD_ICONS = [
  'wallet-cards',
  'scan-barcode',
  'shopping-cart',
  'shopping-basket',
  'store',
  'gift',
  'shirt',
  'pill',
  'coffee',
  'hammer',
  'baby',
  'dog',
  'house',
  'briefcase',
] as const satisfies readonly IconName[];

export type CardIcon = (typeof CARD_ICONS)[number];

/** What a card with no icon of its own shows. */
export const DEFAULT_CARD_ICON: CardIcon = 'wallet-cards';
export const DEFAULT_CARD_COLOR = '#2563eb';

const ICONS: ReadonlySet<string> = new Set(CARD_ICONS);
export const isCardIcon = (value: unknown): value is CardIcon =>
  typeof value === 'string' && ICONS.has(value);

export const cardIconOf = (value: unknown): CardIcon =>
  isCardIcon(value) ? value : DEFAULT_CARD_ICON;
export const cardColorOf = (value: unknown): string =>
  isListColor(value) ? value : DEFAULT_CARD_COLOR;
