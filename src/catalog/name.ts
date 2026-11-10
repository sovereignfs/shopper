/**
 * **Names** (DESIGN.md §8.7): what makes two names the same product. `normaliseName` is pure and runs in the browser and on the server, and is the one
 * place that says so: Unicode NFKC (so that a full-width or a ligature letter is the ordinary one, and a no-break space is a space), then trimmed with
 * runs of white space made one space, then lower case (`toLowerCase` is the root locale's: it does not change with the machine's). _Oat Milk_,
 * `oat  milk` and _OAT MILK_ are one product. **A trailing plural "s" is stripped only where the starter catalog says so** (task 4.3 gives it that
 * list; until then none is), since "peas" and "hummus" are not plurals.
 *
 * The product is known to the server by its **name key** (`src/crypto/name-key.ts`): an HMAC of this under a key derived from the instance key and
 * the household, so that the server finds "the same product" in a household without reading names in a query.
 */
export function normaliseName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

/** The longest a name may be: a line, as a person writes a thing to buy. */
export const MAX_NAME_LENGTH = 200;

/** Whether a name is one the app takes: something, not too long, with no control character. */
export function isName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH && !/\p{Cc}/u.test(trimmed);
}
