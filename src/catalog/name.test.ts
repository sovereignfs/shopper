import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, isName, normaliseName } from './name';

describe('normalising a name', () => {
  it('makes the same product of every way of writing it', () => {
    for (const text of [
      'Oat Milk',
      'oat  milk',
      'OAT MILK',
      '  oat milk\t',
      'oat milk',
      'oat\nmilk',
      'Oat   Milk ',
    ])
      expect(normaliseName(text), JSON.stringify(text)).toBe('oat milk');
  });

  it('makes the compatible forms of a letter the ordinary one, so that they are one product', () => {
    expect(normaliseName('ｏａｔ ｍｉｌｋ')).toBe('oat milk');
    expect(normaliseName('ﬁsh')).toBe('fish');
    // A composed and a decomposed accent are one.
    expect(normaliseName('café')).toBe(normaliseName('café'));
  });

  it('keeps what makes two products different', () => {
    expect(normaliseName('oat milk')).not.toBe(normaliseName('oat milks'));
    expect(normaliseName('2% milk')).toBe('2% milk');
    expect(normaliseName('Jalapeño')).toBe('jalapeño');
  });

  it('does not depend on the machine: it is the root locale’s lower case', () => {
    expect(normaliseName('I')).toBe('i');
    expect(normaliseName('İ')).toBe('i̇');
  });

  it('is idempotent', () => {
    for (const text of ['  Oat   MILK ', 'ﬁsh', 'ＡＢＣ', 'x']) {
      expect(normaliseName(normaliseName(text))).toBe(normaliseName(text));
    }
  });
});

describe('what is a name', () => {
  it('is something, not too long, with no control character', () => {
    expect(isName('milk')).toBe(true);
    expect(isName('  milk ')).toBe(true);
    expect(isName('')).toBe(false);
    expect(isName('   ')).toBe(false);
    expect(isName('a'.repeat(MAX_NAME_LENGTH))).toBe(true);
    expect(isName('a'.repeat(MAX_NAME_LENGTH + 1))).toBe(false);
    expect(isName('mi\u0000lk')).toBe(false);
  });
});
