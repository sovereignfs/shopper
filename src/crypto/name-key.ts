import { createHmac, hkdfSync } from 'node:crypto';
import type { KeyEntry, KeyRing } from './keys';

/**
 * **The name key** (DESIGN.md §13.2): how the server finds "the same product" in a household without reading names in a query.
 * `HMAC-SHA-256(K_name, household_id ‖ normalised name)`, where `K_name` is derived from the instance key by HKDF under a label of its own, so that it
 * is not a key anything else uses. It is unique per household (the index on `product`), and it reveals, to someone with the database and not the key,
 * only that two products of one household have the same name, which the unique index already implies. Two households' keys for one name differ.
 *
 * **It depends on the key,** so rotating the instance key changes every name key; the rotation (`src/crypto/rotate.ts`) recomputes them with the rows
 * it re-wraps. The name is normalised by `src/catalog/name.ts` (task 4.1) before it comes here; this module does not normalise.
 */
const LABEL = 'shopper:name-key:v1';

const derived = new Map<string, Buffer>();

/** `K_name` for a key: derived once and kept for the life of the process, keyed by the key's fingerprint (never by the key). */
function nameSecret(entry: KeyEntry): Buffer {
  let secret = derived.get(entry.fingerprint);
  if (!secret) {
    secret = Buffer.from(hkdfSync('sha256', entry.key, Buffer.alloc(0), LABEL, 32));
    derived.set(entry.fingerprint, secret);
  }
  return secret;
}

/** The name key of a normalised name in a household, under one key of the ring, as base64url text. */
export function nameKeyUnder(entry: KeyEntry, householdId: string, normalisedName: string): string {
  // A NUL cannot be in an id or a normalised name, so the two parts cannot be shifted into each other.
  return createHmac('sha256', nameSecret(entry))
    .update(householdId)
    .update('\0')
    .update(normalisedName)
    .digest('base64url');
}

/** The name key under the current key: the one stored and compared. */
export function nameKeyOf(ring: KeyRing, householdId: string, normalisedName: string): string {
  return nameKeyUnder(ring.current, householdId, normalisedName);
}
