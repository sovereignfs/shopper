import type { KeyRing } from '../crypto/keys';
import { nameKeyOf } from '../crypto/name-key';
import { normaliseName } from './name';

/**
 * **The key a product is known by in a household** (DESIGN.md §8.7, §13.2): the name key of its normalised name. _Oat Milk_, `oat  milk` and _OAT MILK_
 * give one key; two households' keys for one name differ; it changes under a rotated instance key, and the rotation (`src/crypto/rotate.ts`) recomputes it.
 */
export function productNameKey(ring: KeyRing, householdId: string, name: string): string {
  return nameKeyOf(ring, householdId, normaliseName(name));
}
