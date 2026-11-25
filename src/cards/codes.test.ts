import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeBarcode } from '@sovereignfs/ui';
import { KINDS_IN_ORDER, checkCard, drawn, guessKind, qrModules, startOf } from './codes';
import { CODE_KINDS, MAX_CARD_CODE_LENGTH, MAX_CARD_NUMBER_LENGTH } from './kinds';

/**
 * What a card holds, checked and drawn (task 24.3, DESIGN.md §7.7, §16.14): a typed number made into a code of its kind, with its check digit and refused when it cannot be that kind, and a
 * code drawn from it that a scanner reads. **Each linear barcode is read back by an independent decoder written here from the specifications**, so that the bars drawn are the bars of the
 * value and not only of what the encoder believes; the QR code and Code 128 and Code 39 are read by the real decoders in 24.4's tests, which read an image of each kind.
 */
const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const R = L.map((code) => [...code].map((bit) => (bit === '0' ? '1' : '0')).join(''));
const G = R.map((code) => [...code].reverse().join(''));
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];
const bits = (modules: readonly boolean[]) => modules.map((on) => (on ? '1' : '0')).join('');

/** Reads an EAN-13, a UPC-A (an EAN-13 with a leading zero) or an EAN-8 from its bars, as a scanner does, or `null` if they are not one. */
function readEan(modules: readonly boolean[]): string | null {
  const text = bits(modules);
  const digit = (table: string[], chunk: string) => {
    const at = table.indexOf(chunk);
    return at < 0 ? null : at;
  };
  if (
    text.length === 95 &&
    text.startsWith('101') &&
    text.slice(45, 50) === '01010' &&
    text.endsWith('101')
  ) {
    const left = [0, 1, 2, 3, 4, 5].map((i) => text.slice(3 + i * 7, 10 + i * 7));
    const right = [0, 1, 2, 3, 4, 5].map((i) => text.slice(50 + i * 7, 57 + i * 7));
    const parity = [...Array(10).keys()].find((first) =>
      left.every((chunk, i) => (PARITY[first]?.[i] === 'L' ? L : G).includes(chunk)),
    );
    if (parity === undefined) return null;
    const digits = [parity];
    for (const [i, chunk] of left.entries())
      digits.push(digit(PARITY[parity]?.[i] === 'L' ? L : G, chunk) ?? -1);
    for (const chunk of right) digits.push(digit(R, chunk) ?? -1);
    return digits.includes(-1) ? null : digits.join('');
  }
  if (
    text.length === 67 &&
    text.startsWith('101') &&
    text.slice(31, 36) === '01010' &&
    text.endsWith('101')
  ) {
    const left = [0, 1, 2, 3].map((i) => digit(L, text.slice(3 + i * 7, 10 + i * 7)));
    const right = [0, 1, 2, 3].map((i) => digit(R, text.slice(36 + i * 7, 43 + i * 7)));
    return [...left, ...right].includes(null) ? null : [...left, ...right].join('');
  }
  return null;
}
const modulesOf = (format: 'ean13' | 'ean8' | 'upca', value: string) =>
  encodeBarcode(format, value)?.modules ?? [];

describe('a typed card', () => {
  it('has its check digit added when it lacks one, and is refused with a wrong one, for each kind that has one', () => {
    expect(checkCard({ kind: 'ean13', number: '590123412345' })).toEqual({
      ok: true,
      number: '5901234123457',
      code: '5901234123457',
    });
    expect(checkCard({ kind: 'ean13', number: ' 5901234123457 ' })).toMatchObject({
      ok: true,
      code: '5901234123457',
    });
    expect(checkCard({ kind: 'ean13', number: '5901234123450' })).toMatchObject({ ok: false });
    expect(checkCard({ kind: 'ean13', number: '59012341234' })).toMatchObject({ ok: false });
    expect(checkCard({ kind: 'ean8', number: '9638507' })).toMatchObject({
      ok: true,
      code: '96385074',
    });
    expect(checkCard({ kind: 'ean8', number: '96385075' })).toMatchObject({ ok: false });
    expect(checkCard({ kind: 'upca', number: '03600029145' })).toMatchObject({
      ok: true,
      code: '036000291452',
    });
    expect(checkCard({ kind: 'upca', number: '036000291453' })).toMatchObject({ ok: false });
    // The sentence says what the kind needs.
    const refused = checkCard({ kind: 'ean13', number: '5901234123450' });
    expect(refused.ok ? '' : refused.problem).toContain('13 digits');
  });

  it('takes what Code 128 and Code 39 can hold and no more', () => {
    expect(checkCard({ kind: 'code128', number: 'Card 4321-9' })).toEqual({
      ok: true,
      number: 'Card 4321-9',
      code: 'Card 4321-9',
    });
    expect(checkCard({ kind: 'code128', number: 'Café' })).toMatchObject({ ok: false });
    expect(checkCard({ kind: 'code39', number: 'ABC-12 $/+%' })).toMatchObject({ ok: true });
    expect(checkCard({ kind: 'code39', number: 'abc' })).toMatchObject({ ok: false });
  });

  it('is a QR code of whatever was typed, which is its number unless a code is given, and is refused when it will not fit one', () => {
    expect(checkCard({ kind: 'qr', number: 'MEMBER 77' })).toEqual({
      ok: true,
      number: 'MEMBER 77',
      code: 'MEMBER 77',
    });
    expect(
      checkCard({ kind: 'qr', number: 'MEMBER 77', code: 'https://example.com/m/77' }),
    ).toEqual({ ok: true, number: 'MEMBER 77', code: 'https://example.com/m/77' });
    expect(
      checkCard({ kind: 'qr', number: '77', code: 'x'.repeat(MAX_CARD_CODE_LENGTH + 1) }),
    ).toMatchObject({ ok: false });
    // Longer than a QR code can hold (but within a card's limit) is refused with a sentence, not an error.
    const long = checkCard({ kind: 'qr', number: '77', code: 'é'.repeat(900) });
    expect(long.ok === false || qrModules('é'.repeat(900)) !== null).toBe(true);
  });

  it('needs a number and a kind, and no control character, and a number no longer than a card has', () => {
    expect(checkCard({ kind: 'ean13', number: '   ' })).toMatchObject({ ok: false });
    expect(checkCard({ kind: 'nonsense', number: '5901234123457' })).toMatchObject({ ok: false });
    expect(checkCard({ kind: '', number: '5901234123457' })).toMatchObject({ ok: false });
    expect(checkCard({ kind: 'code128', number: 'a\u0007b' })).toMatchObject({ ok: false });
    expect(
      checkCard({ kind: 'code128', number: 'x'.repeat(MAX_CARD_NUMBER_LENGTH + 1) }),
    ).toMatchObject({ ok: false });
    expect(
      checkCard({ kind: 'code128', number: 'x'.repeat(MAX_CARD_NUMBER_LENGTH) }),
    ).toMatchObject({ ok: true });
  });

  it('starts from the kind a number most likely is', () => {
    expect(guessKind('5901234123457')).toBe('ean13');
    expect(guessKind('036000291452')).toBe('upca');
    expect(guessKind('96385074')).toBe('ean8');
    expect(guessKind('https://example.com/card')).toBe('qr');
    expect(guessKind('6034 0402 4001 2345 67')).toBe('code128');
    expect(guessKind('')).toBe('code128');
    expect([...KINDS_IN_ORDER].sort()).toEqual([...CODE_KINDS].sort());
  });
});

describe('a card drawn', () => {
  it('has bars a scanner reads back as the value, for each kind with a decoder here', () => {
    for (const [format, value] of [
      ['ean13', '5901234123457'],
      ['ean13', '4006381333931'],
      ['upca', '036000291452'],
      ['ean8', '96385074'],
    ] as const) {
      const read = readEan(modulesOf(format, value));
      expect(read, `${format} ${value}`).toBe(format === 'upca' ? `0${value}` : value);
    }
  });

  it('reads back as the same value for every EAN-13, EAN-8 and UPC-A a person could type (property)', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{12}$/), (digits) => {
        const made = checkCard({ kind: 'ean13', number: digits });
        expect(made.ok).toBe(true);
        if (made.ok) expect(readEan(modulesOf('ean13', made.code))).toBe(made.code);
      }),
      { numRuns: 200 },
    );
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{7}$/), (digits) => {
        const made = checkCard({ kind: 'ean8', number: digits });
        expect(made.ok).toBe(true);
        if (made.ok) expect(readEan(modulesOf('ean8', made.code))).toBe(made.code);
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{11}$/), (digits) => {
        const made = checkCard({ kind: 'upca', number: digits });
        expect(made.ok).toBe(true);
        if (made.ok) expect(readEan(modulesOf('upca', made.code))).toBe(`0${made.code}`);
      }),
      { numRuns: 100 },
    );
  });

  it('is a QR code that is square, with its three finders, for any text that fits, and nothing for what does not', () => {
    const squares = qrModules('https://example.com');
    expect(squares).not.toBeNull();
    expect(squares?.length).toBe(squares?.[0]?.length);
    // The finder pattern: a 7 by 7 ring around a 3 by 3 block, in three corners.
    const size = squares?.length ?? 0;
    for (const [row, column] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ] as const)
      for (let r = 0; r < 7; r += 1)
        for (let c = 0; c < 7; c += 1) {
          const ring = r === 0 || r === 6 || c === 0 || c === 6;
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          expect(squares?.[row + r]?.[column + c]).toBe(ring || core);
        }
    expect(qrModules('x'.repeat(4000))).toBeNull();
    expect(drawn('qr', 'x'.repeat(4000))).toBeNull();
  });

  it('is drawn from a code of its kind and not from one that is not, so that a card changed or from a newer build draws nothing', () => {
    expect(drawn('ean13', '5901234123457')).toEqual({
      kind: 'bars',
      format: 'ean13',
      value: '5901234123457',
    });
    expect(drawn('ean13', '5901234123450')).toBeNull();
    expect(drawn('code39', 'abc')).toBeNull();
    expect(drawn('qr', 'hello')).toMatchObject({ kind: 'qr' });
  });
});

describe('what a scan starts the form from', () => {
  it('is the kind and the value as the number, and for a QR code what it holds too', () => {
    expect(startOf({ kind: 'ean13', value: '5901234123457' })).toEqual({
      kind: 'ean13',
      number: '5901234123457',
    });
    expect(startOf({ kind: 'qr', value: 'MEMBER 77' })).toEqual({
      kind: 'qr',
      number: 'MEMBER 77',
      code: 'MEMBER 77',
    });
  });

  it('leaves the number to be typed for a QR code whose payload is longer than a number may be, and holds the payload', () => {
    const address = `https://example.com/${'x'.repeat(100)}`;
    expect(startOf({ kind: 'qr', value: address })).toEqual({
      kind: 'qr',
      number: '',
      code: address,
    });
    // What it makes is what the form checks: the payload is a code, the number is typed.
    expect(checkCard({ kind: 'qr', number: '', code: address })).toMatchObject({ ok: false });
    expect(checkCard({ kind: 'qr', number: 'MEMBER 77', code: address })).toMatchObject({
      ok: true,
    });
  });

  it('is a card of the kind that checks, for what a decoder reads of each kind', () => {
    for (const [kind, value] of [
      ['ean13', '5901234123457'],
      ['ean8', '96385074'],
      ['upca', '036000291452'],
      ['code128', 'CARD 4321-9'],
      ['code39', 'ABC-12'],
    ] as const) {
      const start = startOf({ kind, value });
      expect(checkCard({ kind: start.kind, number: start.number })).toMatchObject({
        ok: true,
        code: value,
      });
    }
  });
});
