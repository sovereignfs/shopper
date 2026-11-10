import { isQuantity } from './decimal';

/**
 * **Units** (DESIGN.md §9.3): a fixed list, or none. A unit is **counted** (things: pieces, a bag, a dozen) or **measured** (weight and volume), which is what
 * decides the step of the quantity stepper: a counted unit goes up by one, a measured one by the product's last quantity, since a person who buys 500 g
 * of flour once buys it again. The list is the plugin's, kept (a unit is the product's and the item's own, and merging compares them as text).
 */
export const UNITS = [
  { key: 'pcs', counted: true },
  { key: 'kg', counted: false },
  { key: 'g', counted: false },
  { key: 'lb', counted: false },
  { key: 'oz', counted: false },
  { key: 'L', counted: false },
  { key: 'mL', counted: false },
  { key: 'bag', counted: true },
  { key: 'box', counted: true },
  { key: 'bottle', counted: true },
  { key: 'bunch', counted: true },
  { key: 'can', counted: true },
  { key: 'jar', counted: true },
  { key: 'pack', counted: true },
  { key: 'dozen', counted: true },
] as const;

export type Unit = (typeof UNITS)[number]['key'];

const KEYS: ReadonlySet<string> = new Set(UNITS.map((unit) => unit.key));

/** Whether a string is one of the units. The comparison is exact: `l` is not `L`, and `ml` is not `mL`, since a unit is data and not typed text. */
export function isUnit(text: string): text is Unit {
  return KEYS.has(text);
}

/** Whether a unit is counted (things) and not measured. No unit at all is counted: _2 oat milk_ is two things. */
export function isCounted(unit: Unit | null | undefined): boolean {
  if (unit === null || unit === undefined) return true;
  return UNITS.find((each) => each.key === unit)?.counted ?? true;
}

/**
 * How much one press of _more_ adds (`QuantityStepper`, §9.3): **one for a counted unit, the product's last quantity for a measured one** when it has one,
 * and one when it has not.
 */
export function stepFor(unit: Unit | null | undefined, lastQuantity?: string | null): string {
  if (isCounted(unit)) return '1';
  return lastQuantity !== null && lastQuantity !== undefined && isQuantity(lastQuantity)
    ? lastQuantity
    : '1';
}
