/**
 * **The kinds of code a loyalty card has** (DESIGN.md §7.7, RFC 0007): QR, EAN-13, EAN-8, UPC-A, Code 128 and Code 39, which most shops' cards use. A card names its kind and the value the
 * code carries; which kind is right is the person's to say (a scan says it), and what each kind may hold is checked where a card is made (`24.3`), not by the server, which never sees it.
 */
export const CODE_KINDS = ['qr', 'ean13', 'ean8', 'upca', 'code128', 'code39'] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

export const isCodeKind = (text: string): text is CodeKind =>
  (CODE_KINDS as readonly string[]).includes(text);

/** The longest a card's number may be, and the longest the value its code carries (a QR code holds a web address). */
export const MAX_CARD_NUMBER_LENGTH = 64;
export const MAX_CARD_CODE_LENGTH = 1000;
