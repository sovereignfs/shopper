import type { KeyRing } from '../crypto/keys';
import { inventoryNameKeyUnder } from '../crypto/name-key';
import { canonicalName } from './canonical';

/**
 * **The key an Inventory item is known by in its group** (DESIGN.md §8.7, §13.3): the name key of its canonical name, under a label of its own, so that it is
 * never the key a list's product of the same name has. _Oat Milk_ and `oat  milk` give one key; two groups' keys for one name differ; it changes under a rotated
 * instance key, and the rotation (`src/crypto/rotate.ts`) recomputes it. For a group still sealed by the server; in one that has moved the device makes it.
 */
export function inventoryNameKey(ring: KeyRing, householdId: string, name: string): string {
  return inventoryNameKeyUnder(ring.current, householdId, canonicalName(name));
}
