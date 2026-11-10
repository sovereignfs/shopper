import type { FieldValue } from '../actions/format';
import { largerQuantity } from '../quantity/decimal';

/**
 * **What the server decides about an item that a device could not** (DESIGN.md §9.3, §12.4), pure, so that it is tested with no database.
 *
 *  - **Two devices adding the same product to one list offline** both send a new item; the second is folded into the first (`foldItemFields`): **one item,
 *    the larger quantity, both notes kept, the earlier adder named.** Only for items in the same unit, since quantities in different units cannot be compared
 *    (two kilos and two pieces are two things).
 *  - **The first tick stands** (`withoutSecondTick`): a tick that arrives for an item that is already bought changes nothing about who bought it and when.
 */
export function foldItemFields(
  existing: { quantity: string; note: string | null; addedBy: string; addedAt: number },
  sent: Readonly<Record<string, FieldValue>>,
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  if (typeof sent.quantity === 'string') {
    const larger = largerQuantity(existing.quantity, sent.quantity);
    if (larger !== existing.quantity) out.quantity = larger;
  }
  const note = typeof sent.note === 'string' && sent.note.trim() !== '' ? sent.note : null;
  if (note !== null && note !== existing.note) {
    out.note = existing.note === null || existing.note === '' ? note : `${existing.note}\n${note}`;
  }
  if (
    typeof sent.addedAt === 'number' &&
    sent.addedAt < existing.addedAt &&
    typeof sent.addedBy === 'string'
  ) {
    out.addedAt = sent.addedAt;
    out.addedBy = sent.addedBy;
  }
  return out;
}

/** The fields of a change to an item with a tick taken out of it when the item is already bought: the first tick stands. An untick is kept. */
export function withoutSecondTick(
  alreadyBoughtAt: number | null,
  fields: Readonly<Record<string, FieldValue>>,
): Readonly<Record<string, FieldValue>> {
  if (alreadyBoughtAt === null || fields.boughtAt === undefined || fields.boughtAt === null)
    return fields;
  const { boughtAt: _at, boughtBy: _by, ...rest } = fields;
  return rest;
}
