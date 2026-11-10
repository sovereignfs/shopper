import { OTHER } from './categories';
import { normaliseName } from './name';

/**
 * **The category a new product is given** (DESIGN.md §8.3), by one pure function, in this order:
 *
 *  1. the starter catalog's entry for the name, if it has one (`starter`, which returns the entry's category key);
 *  2. otherwise **the category most used by this household's products that share a word with it** (a word is a run of letters and digits of the
 *     normalised name, at least two long, so that "of" and "a" do not link _bag of rice_ to _a lemon_); a tie goes to the earlier in the aisle order;
 *  3. otherwise _Other_.
 *
 * Categories are given and returned by key (`starter_key`, or the household's own category id), whichever the caller has. It runs on the device, offline,
 * from the household's own rows, and is the same on the server.
 */
export interface GuessInput {
  /** The name as typed. */
  readonly name: string;
  /** The starter catalog's category key for a name or a word of it, or `undefined`. Task 4.3 gives the real one. */
  readonly starter: (normalisedName: string) => string | undefined;
  /** The household's products, with the category each has. */
  readonly products: readonly { readonly name: string; readonly category: string }[];
  /** The household's categories in aisle order, to break a tie. */
  readonly aisle: readonly string[];
}

const words = (name: string): string[] =>
  normaliseName(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);

export function guessCategory(input: GuessInput): string {
  const normalised = normaliseName(input.name);
  const starter = input.starter(normalised);
  if (starter !== undefined) return starter;

  const mine = new Set(words(input.name));
  const counts = new Map<string, number>();
  for (const product of input.products) {
    if (words(product.name).some((word) => mine.has(word)))
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [category, count] of counts) {
    const better =
      best === undefined ||
      count > (counts.get(best) ?? 0) ||
      (count === (counts.get(best) ?? 0) &&
        input.aisle.indexOf(category) < input.aisle.indexOf(best));
    if (better) best = category;
  }
  return best ?? OTHER;
}
