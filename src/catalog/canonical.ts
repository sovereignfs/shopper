import { normaliseName } from './name';
import { isStarterSingular } from './starter';

/**
 * **The name a product is known by in a household** (DESIGN.md §8.7): the normalised name (`normaliseName`), with **a trailing plural "s" stripped only
 * where the starter catalog says so** (_apples_ is _apple_ because the entry says its plural is the same product; _peas_ and _hummus_ are left alone).
 * Pure, and the same in the browser and on the server; the name key (`product-key.ts`) is made from it.
 */
export function canonicalName(name: string): string {
  const normalised = normaliseName(name);
  if (normalised.endsWith('s') && isStarterSingular(normalised.slice(0, -1)))
    return normalised.slice(0, -1);
  return normalised;
}
