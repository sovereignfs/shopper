/**
 * **A card linked to a list** (DESIGN.md §7.7, RFC 0007, task 24.6): the row's `id` is made from the two ids it names, so that **the same pair is one row on every device and on the server**: a link made twice
 * (two devices offline, a person who links, unlinks and links again) is the same link, which a change restores and does not fold into another (a fold is told to the people of a list, and a link's existence
 * is for the people on both the list and the card). Pure, and the one implementation of it: the browser makes the id, the server holds a row to it, and the tests use it.
 *
 * The id is the two UUIDs combined bit by bit and given the version and variant bits a UUID has. Both are random and the group's own account is the only one that makes either, so two different pairs
 * meeting at one id is not something anyone can do to anyone else; the server refuses a row whose id is not its pair's, and the pair is unique in the table besides.
 */
const HEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bytesOf(id: string): number[] {
  if (!HEX.test(id)) throw new TypeError('an id is a UUID');
  const hex = id.replaceAll('-', '');
  return Array.from({ length: 16 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

export function listCardId(list: string, card: string): string {
  const a = bytesOf(list);
  const b = bytesOf(card);
  const out = a.map((byte, i) => byte ^ (b[i] ?? 0));
  // A version 4 and an RFC 4122 variant, which is what `isId` and the database's columns take.
  out[6] = ((out[6] ?? 0) & 0x0f) | 0x40;
  out[8] = ((out[8] ?? 0) & 0x3f) | 0x80;
  const hex = out.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
