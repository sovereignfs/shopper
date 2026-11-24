import { type BarcodeFormat, encodeBarcode } from '@sovereignfs/ui';
import { encode } from 'uqr';
import { type CodeKind, MAX_CARD_CODE_LENGTH, MAX_CARD_NUMBER_LENGTH, isCodeKind } from './kinds';

/**
 * **What a card holds, checked and drawn** (DESIGN.md §7.7, §16.14), pure and on the device: a person types a number and says its kind (or a scan says both, 24.4), and this says whether a code of that
 * kind can be made of it, what it is once it has its check digit, and what is drawn at the till. **Nothing here is sent anywhere**: a code is drawn from its value by `QrCode` (the squares `uqr`
 * makes) and `Barcode` (the bars the design system makes), with no request and no markup injected.
 */
export const KIND_LABELS: Readonly<Record<CodeKind, string>> = {
  qr: 'QR code',
  ean13: 'EAN-13',
  ean8: 'EAN-8',
  upca: 'UPC-A',
  code128: 'Code 128',
  code39: 'Code 39',
};

/** The kinds in the order the form offers them: the barcodes most shops' cards use first. */
export const KINDS_IN_ORDER: readonly CodeKind[] = [
  'ean13',
  'code128',
  'qr',
  'upca',
  'ean8',
  'code39',
];

/** What each kind needs, as a person is told when what they typed is not one. */
const NEEDS: Readonly<Record<CodeKind, string>> = {
  qr: 'A QR code can hold any text, up to a few hundred characters.',
  ean13:
    'An EAN-13 is 13 digits, the last of them a check digit (or 12 digits, which have it added).',
  ean8: 'An EAN-8 is 8 digits, the last of them a check digit (or 7 digits, which have it added).',
  upca: 'A UPC-A is 12 digits, the last of them a check digit (or 11 digits, which have it added).',
  code128: 'A Code 128 holds letters, digits and the usual signs, with no accents.',
  code39: 'A Code 39 holds capital letters, digits, and - . space $ / + %.',
};

export type Checked =
  | { readonly ok: true; readonly number: string; readonly code: string }
  | { readonly ok: false; readonly problem: string };

const hasControl = (text: string) =>
  // eslint-disable-next-line no-control-regex -- a control character in what a person typed is exactly what this looks for
  /[\u0000-\u001f\u007f]/.test(text);

/**
 * **What a person typed, made into what a card holds.** A barcode's value is the number as typed with its check digit if it lacked one (a wrong check digit is refused, and so is a character the
 * kind has not), and **the number shown under the code is that value**. A QR code holds what is typed in `code`, which defaults to the number; its number is what is shown beneath it.
 * `problem` is a sentence a person can act on.
 */
export function checkCard(input: {
  kind: string;
  number: string;
  code?: string | undefined;
}): Checked {
  const kind = input.kind;
  if (!isCodeKind(kind)) return { ok: false, problem: 'Choose the kind of code the card has.' };
  const number = input.number.trim();
  if (number === '') return { ok: false, problem: 'Type the number on the card.' };
  if (hasControl(number))
    return { ok: false, problem: 'That number has a character a card cannot.' };
  if (kind === 'qr') {
    const code = (input.code?.trim() ?? '') === '' ? number : (input.code ?? '').trim();
    if (code.length > MAX_CARD_CODE_LENGTH || hasControl(code.replace(/[\n\r\t]/g, '')))
      return { ok: false, problem: NEEDS.qr };
    if (number.length > MAX_CARD_NUMBER_LENGTH)
      return {
        ok: false,
        problem: `A number can have at most ${MAX_CARD_NUMBER_LENGTH} characters.`,
      };
    return qrModules(code) ? { ok: true, number, code } : { ok: false, problem: NEEDS.qr };
  }
  if (number.length > MAX_CARD_NUMBER_LENGTH)
    return {
      ok: false,
      problem: `A number can have at most ${MAX_CARD_NUMBER_LENGTH} characters.`,
    };
  const made = encodeBarcode(kind as BarcodeFormat, number);
  if (!made) return { ok: false, problem: NEEDS[kind] };
  return { ok: true, number: made.text, code: made.text };
}

/**
 * **The kind a typed number most likely is**, for the form to start from (a person changes it): 13 digits an EAN-13, 12 a UPC-A, 8 an EAN-8, a web address a QR code, anything else a Code 128, which
 * holds most of what a card's number is.
 */
export function guessKind(text: string): CodeKind {
  const value = text.trim();
  if (/^https?:\/\//i.test(value)) return 'qr';
  if (/^\d{13}$/.test(value)) return 'ean13';
  if (/^\d{12}$/.test(value)) return 'upca';
  if (/^\d{8}$/.test(value)) return 'ean8';
  return 'code128';
}

/** The squares of a QR code of some text, or `null` if it will not fit one. */
export function qrModules(text: string): boolean[][] | null {
  try {
    return encode(text, { ecc: 'M', border: 0 }).data;
  } catch {
    return null;
  }
}

/** What to draw for a card: a QR code's squares, or a barcode's kind and value; `null` when the value cannot be that kind (a card from an older or newer build, or one that was changed). */
export type Drawn =
  | { readonly kind: 'qr'; readonly modules: boolean[][] }
  | { readonly kind: 'bars'; readonly format: BarcodeFormat; readonly value: string };

export function drawn(kind: CodeKind, code: string): Drawn | null {
  if (kind === 'qr') {
    const modules = qrModules(code);
    return modules ? { kind: 'qr', modules } : null;
  }
  return encodeBarcode(kind, code) ? { kind: 'bars', format: kind, value: code } : null;
}
