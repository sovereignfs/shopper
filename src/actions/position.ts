import { generateKeyBetween } from 'fractional-indexing';

/**
 * **A position** (DESIGN.md §9.6): a fractional key, compared as text, that a person changes by dragging an item between two others. `between(before,
 * after)` is a key that sorts after `before` and before `after`; either may be `null` for the start or the end. Two devices moving one item to one
 * place both keep the key, and a tie is broken by the id of the row, so that every device shows one order. Pure.
 */
export function between(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** The key that sorts after every other: where a new item goes at the end of its category. */
export const after = (last: string | null): string => between(last, null);

/** The order rows are shown in: by position as text (not by locale), and by id when two have the same. */
export function byPosition(
  a: { position: string; id: string },
  b: { position: string; id: string },
): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
