/**
 * **A quantity** (DESIGN.md §9.3): a positive decimal with up to three places, stored and sent as its **canonical decimal string**, `"1.5"`, never a
 * binary float. Canonical means no leading zero (but `0.5`), no trailing zero after the point, no trailing point, no sign, no exponent: so two equal
 * quantities are two equal strings, and a string can be compared, stored and merged without being read as a number. Arithmetic is done on **scaled
 * integers** (thousandths, as `bigint`), so adding is exact and nothing is rounded: there is no float anywhere in here.
 *
 * Pure, and shared by the browser, the server and the tests, so that a figure has one implementation (AGENTS.md).
 */
export const PLACES = 3;
/** The most a quantity may be: a thousand thousand less a thousandth. Far above any shopping list, and well inside what a decimal string says exactly. */
export const MAX_QUANTITY = '999999.999';

const SCALE = 10n ** BigInt(PLACES);
const MAX_SCALED = 999_999_999n;
const CANONICAL = /^(?:0|[1-9]\d{0,5})(?:\.\d{0,2}[1-9])?$/;

/** Whether the text is a canonical quantity: positive, at most `MAX_QUANTITY`, up to three places, no trailing zero. */
export function isQuantity(text: string): boolean {
  return CANONICAL.test(text) && toScaled(text) > 0n;
}

/** A canonical quantity as thousandths. The text must be a canonical decimal; a caller checks `isQuantity` first. */
export function toScaled(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(PLACES, '0'));
}

/** Thousandths as a canonical decimal string. Zero and a negative are not quantities, but the string for them is still the plain one. */
export function fromScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const magnitude = negative ? -scaled : scaled;
  const whole = (magnitude / SCALE).toString();
  const fraction = (magnitude % SCALE).toString().padStart(PLACES, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction === '' ? '' : `.${fraction}`}`;
}

/** The sum of two canonical quantities, exactly, or `undefined` if it would pass `MAX_QUANTITY`. */
export function addQuantity(a: string, b: string): string | undefined {
  const sum = toScaled(a) + toScaled(b);
  return sum > MAX_SCALED ? undefined : fromScaled(sum);
}

/** The difference of two canonical quantities, exactly, or `undefined` if it would not be positive. */
export function subtractQuantity(a: string, b: string): string | undefined {
  const difference = toScaled(a) - toScaled(b);
  return difference > 0n ? fromScaled(difference) : undefined;
}

/** Negative, zero or positive as `a` is less than, equal to or greater than `b`. Two equal quantities are one string, so `a === b` also says so. */
export function compareQuantity(a: string, b: string): -1 | 0 | 1 {
  const x = toScaled(a);
  const y = toScaled(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** The larger of two canonical quantities: what two devices adding the same item offline are folded to (DESIGN.md §9.3). */
export function largerQuantity(a: string, b: string): string {
  return compareQuantity(a, b) >= 0 ? a : b;
}

/**
 * What a person typed, as a canonical quantity, or `undefined` if it is not one. A decimal comma and a decimal point both mean the point (`1,5` and
 * `1.5`), a digit group separator is not understood (`1,500` is one and a half hundred thousandths, which has too many places, and is refused: it is
 * not guessed at), and anything with a sign, an exponent, words or more than three places is refused. Leading and trailing zeros are tidied.
 */
export function parseQuantity(text: string): string | undefined {
  const typed = text.trim().replace(',', '.');
  if (!/^\d+(?:\.\d*)?$|^\.\d+$/.test(typed)) return undefined;
  const [whole = '', fraction = ''] = typed.split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  if (trimmedFraction.length > PLACES) return undefined;
  const canonical = `${whole.replace(/^0+(?=\d)/, '') || '0'}${trimmedFraction === '' ? '' : `.${trimmedFraction}`}`;
  return isQuantity(canonical) ? canonical : undefined;
}

/**
 * The decimal separator the reader's locale writes: a comma where it writes one, and a point otherwise. A locale with a separator of its own (Arabic's
 * `٫`) is shown the point, since the digits stay the ones `parseQuantity` reads, and what is shown must be what can be typed back.
 */
export function decimalSeparator(locale?: string): '.' | ',' {
  const part = new Intl.NumberFormat(locale)
    .formatToParts(1.1)
    .find((each) => each.type === 'decimal');
  return part?.value === ',' ? ',' : '.';
}

/**
 * A canonical quantity for the reader's locale: the same digits with the locale's decimal separator. No grouping and no float: it is a string
 * operation, so what is shown is exactly what is stored. `parseQuantity` reads it back.
 */
export function formatQuantity(canonical: string, locale?: string): string {
  return canonical.replace('.', decimalSeparator(locale));
}
