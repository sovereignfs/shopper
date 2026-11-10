import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_QUANTITY,
  addQuantity,
  compareQuantity,
  decimalSeparator,
  formatQuantity,
  fromScaled,
  isQuantity,
  largerQuantity,
  parseQuantity,
  subtractQuantity,
  toScaled,
} from './decimal';
import { UNITS, isCounted, isUnit, stepFor } from './units';

/** A canonical quantity, made from thousandths, so that every one the property tests meet is one. */
const quantity = fc.integer({ min: 1, max: 999_999_999 }).map((n) => fromScaled(BigInt(n)));

describe('what a canonical quantity is', () => {
  it('is positive, has no leading or trailing zero, and has up to three places', () => {
    for (const ok of ['1', '0.5', '0.001', '1.5', '12', '999999.999', '10', '100.25'])
      expect(isQuantity(ok), ok).toBe(true);
    for (const bad of [
      '',
      '0',
      '0.0',
      '00.5',
      '01',
      '1.50',
      '1.',
      '.5',
      '-1',
      '+1',
      '1e3',
      '1.0005',
      '1,5',
      ' 1',
      '1 ',
      '1000000',
      'abc',
      '0.000',
      '1.2.3',
      'NaN',
    ])
      expect(isQuantity(bad), JSON.stringify(bad)).toBe(false);
    expect(MAX_QUANTITY).toBe('999999.999');
  });
});

describe('arithmetic is exact', () => {
  it('adds without a float: 0.1 and 0.2 make 0.3, and the same for every pair', () => {
    expect(addQuantity('0.1', '0.2')).toBe('0.3');
    expect(addQuantity('1.5', '2.5')).toBe('4');
    expect(addQuantity('999999.999', '0.001')).toBeUndefined();
    fc.assert(
      fc.property(quantity, quantity, (a, b) => {
        const sum = addQuantity(a, b);
        const wanted = toScaled(a) + toScaled(b);
        if (wanted > 999_999_999n) expect(sum).toBeUndefined();
        else {
          expect(sum).toBeDefined();
          expect(isQuantity(sum ?? '')).toBe(true);
          expect(toScaled(sum ?? '0')).toBe(wanted);
        }
      }),
    );
  });

  it('adds in either order, and subtracting what was added gives back the first', () => {
    fc.assert(
      fc.property(quantity, quantity, (a, b) => {
        expect(addQuantity(a, b)).toBe(addQuantity(b, a));
        const sum = addQuantity(a, b);
        if (sum !== undefined) expect(subtractQuantity(sum, b)).toBe(a);
      }),
    );
    expect(subtractQuantity('1', '1')).toBeUndefined();
    expect(subtractQuantity('1', '2')).toBeUndefined();
  });

  it('compares as numbers and not as text, and equal quantities are equal strings', () => {
    expect(compareQuantity('9', '10')).toBe(-1);
    expect(compareQuantity('0.5', '0.25')).toBe(1);
    expect(compareQuantity('1.5', '1.5')).toBe(0);
    expect(largerQuantity('9', '10')).toBe('10');
    fc.assert(
      fc.property(quantity, quantity, (a, b) => {
        expect(compareQuantity(a, b)).toBe(-compareQuantity(b, a));
        expect(compareQuantity(a, b) === 0).toBe(a === b);
        expect(largerQuantity(a, b)).toBe(compareQuantity(a, b) >= 0 ? a : b);
      }),
    );
  });

  it('turns thousandths into the one string for them, and back', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999_999_999 }), (n) => {
        expect(toScaled(fromScaled(BigInt(n)))).toBe(BigInt(n));
        expect(isQuantity(fromScaled(BigInt(n)))).toBe(true);
      }),
    );
  });
});

describe('what a person types', () => {
  it('is a canonical quantity with a decimal point or a decimal comma, tidied', () => {
    expect(parseQuantity('1.5')).toBe('1.5');
    expect(parseQuantity('1,5')).toBe('1.5');
    expect(parseQuantity(' 2 ')).toBe('2');
    expect(parseQuantity('2.50')).toBe('2.5');
    expect(parseQuantity('007')).toBe('7');
    expect(parseQuantity('.5')).toBe('0.5');
    expect(parseQuantity('5.')).toBe('5');
    expect(parseQuantity('0.250')).toBe('0.25');
    // A comma is a decimal comma and is never a group separator: `1,500` is one and a half, not fifteen hundred.
    expect(parseQuantity('1,500')).toBe('1.5');
  });

  it('is nothing when it is not one: no sign, no words, no exponent, no zero, too many places, too large', () => {
    for (const bad of [
      '',
      ' ',
      '0',
      '0.0',
      '-1',
      '+1',
      '1e3',
      'two',
      '1.0005',
      '1.2.3',
      '1000000',
      '1 kg',
      '١',
    ])
      expect(parseQuantity(bad), JSON.stringify(bad)).toBeUndefined();
  });

  it('reads back what was shown, in every locale, for every quantity', () => {
    for (const locale of ['en-US', 'de-DE', 'fr-FR', 'si-LK', 'ar-EG', 'sv-SE'])
      fc.assert(
        fc.property(quantity, (q) => {
          const shown = formatQuantity(q, locale);
          // A locale that writes its own digits is not typed back by this parser: only the separator is localised, and the digits are ours.
          expect(/^[0-9.,]+$/.test(shown), `${locale} ${shown}`).toBe(true);
          expect(parseQuantity(shown)).toBe(q);
        }),
        { numRuns: 100 },
      );
    expect(decimalSeparator('en-US')).toBe('.');
    expect(decimalSeparator('de-DE')).toBe(',');
    expect(formatQuantity('1.5', 'de-DE')).toBe('1,5');
    expect(formatQuantity('1.5', 'en-US')).toBe('1.5');
    expect(formatQuantity('12', 'de-DE')).toBe('12');
    // A locale whose separator is neither is shown with the point, which `parseQuantity` reads.
    expect(formatQuantity('1.5', 'ar-EG')).toBe('1.5');
  });

  it('parses every canonical quantity to itself', () => {
    fc.assert(
      fc.property(quantity, (q) => {
        expect(parseQuantity(q)).toBe(q);
      }),
    );
  });
});

describe('units', () => {
  it('are the fixed list, compared exactly', () => {
    expect(UNITS.map((u) => u.key)).toEqual([
      'pcs',
      'kg',
      'g',
      'lb',
      'oz',
      'L',
      'mL',
      'bag',
      'box',
      'bottle',
      'bunch',
      'can',
      'jar',
      'pack',
      'dozen',
    ]);
    for (const key of UNITS.map((u) => u.key)) expect(isUnit(key)).toBe(true);
    for (const bad of ['l', 'ml', 'KG', 'litre', '', 'pc']) expect(isUnit(bad), bad).toBe(false);
  });

  it('are counted or measured, and no unit is counted', () => {
    expect(isCounted('pcs')).toBe(true);
    expect(isCounted('dozen')).toBe(true);
    expect(isCounted('kg')).toBe(false);
    expect(isCounted('mL')).toBe(false);
    expect(isCounted(null)).toBe(true);
    expect(isCounted(undefined)).toBe(true);
  });

  it('step by one for a counted unit and by the last quantity for a measured one', () => {
    expect(stepFor('pcs', '3')).toBe('1');
    expect(stepFor(null, '3')).toBe('1');
    expect(stepFor('g', '500')).toBe('500');
    expect(stepFor('L', '1.5')).toBe('1.5');
    expect(stepFor('g')).toBe('1');
    expect(stepFor('g', null)).toBe('1');
    expect(stepFor('g', 'not a quantity')).toBe('1');
  });
});
