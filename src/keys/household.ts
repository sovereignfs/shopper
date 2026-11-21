import { decryptBytes, encryptBytes, importDocumentKey } from '@sovereignfs/sdk/keys';

/**
 * A household's keys in the browser (RFC 0001, amendments 1 and 2; DESIGN.md §13). Pure functions over WebCrypto and the SDK: nothing here talks to a
 * server, and nothing leaves the browser but what these return.
 *
 * - **The keyring** is every epoch's key, 32 random bytes each. A member keeps it **wrapped under their own app key** (`wrapKeyring`), the AES-GCM key
 *   that core's `appKeys().open()` or the vault's `localVault().open()` gives, bound to the person and the household, so that only that member's browser
 *   opens it. The SDK has no call for this yet (16.15): it is WebCrypto's AES-GCM with a random nonce, and nothing more.
 * - **A field** is `encryptBytes` (the SDK's) under the epoch's content key, bound to household, table, row and field, with the epoch as the version, and
 *   stored as `e1.<epoch>.<row>.<ciphertext>`, so that a value says what it was encrypted for: a fold moves a row's later changes to another row (§12.4),
 *   and `openField` takes a value bound to the row or to one of its aliases, and nothing else.
 * - **The name key** is an HMAC of the household and the normalised name under a key made from the **first** epoch's key (HKDF, `shopper:name-key:v2`),
 *   so that folding holds whatever epoch a device is on (§13.3).
 */

export type Keyring = Readonly<Record<number, Uint8Array<ArrayBuffer>>>;

const KEY_BYTES = 32;
const RECORD = 'hk1';
const VALUE = 'e1';
const ID = /^[0-9a-f-]{36}$/;
const B64 = /^[A-Za-z0-9_-]+$/;

const utf8 = (text: string) => new TextEncoder().encode(text);
const fromUtf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

export function toBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  if (!B64.test(text)) throw new TypeError('not base64url');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** A household's first keyring: one epoch, its key fresh. */
export function newKeyring(epoch = 1): Keyring {
  return { [epoch]: crypto.getRandomValues(new Uint8Array(KEY_BYTES)) };
}

/** The keyring's latest epoch. */
export function latestEpoch(keyring: Keyring): number {
  return Math.max(...Object.keys(keyring).map(Number));
}

const keyringData = (person: string, household: string) =>
  utf8(`shopper/keyring/v1|${person}|${household}`);

/** The keyring wrapped under the member's own app key: `hk1.<nonce>.<ciphertext>`. */
export async function wrapKeyring(
  appKey: CryptoKey,
  keyring: Keyring,
  bound: { person: string; household: string },
): Promise<string> {
  const plain: Record<string, string> = {};
  for (const [epoch, key] of Object.entries(keyring)) plain[epoch] = toBase64url(key);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: keyringData(bound.person, bound.household) },
      appKey,
      utf8(JSON.stringify(plain)),
    ),
  );
  return `${RECORD}.${toBase64url(nonce)}.${toBase64url(sealed)}`;
}

/** The keyring a record holds, or `undefined` for one this app key does not open, or that was made for another person or household. */
export async function unwrapKeyring(
  appKey: CryptoKey,
  record: string,
  bound: { person: string; household: string },
): Promise<Keyring | undefined> {
  const [kind, nonce, sealed, rest] = record.split('.');
  if (kind !== RECORD || !nonce || !sealed || rest !== undefined) return undefined;
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64url(nonce),
        additionalData: keyringData(bound.person, bound.household),
      },
      appKey,
      fromBase64url(sealed),
    );
    const parsed = JSON.parse(fromUtf8(new Uint8Array(plain))) as Record<string, unknown>;
    const out: Record<number, Uint8Array<ArrayBuffer>> = {};
    for (const [epoch, key] of Object.entries(parsed)) {
      const bytes = typeof key === 'string' ? fromBase64url(key) : undefined;
      if (!/^\d+$/.test(epoch) || bytes?.length !== KEY_BYTES) return undefined;
      out[Number(epoch)] = bytes;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/** What a field is encrypted for. */
export interface FieldTarget {
  readonly household: string;
  readonly table: string;
  readonly row: string;
  readonly field: string;
}

const documentOf = (target: FieldTarget) =>
  `shopper/${target.household}/${target.table}/${target.row}/${target.field}`;

/** A field's text, encrypted under the keyring's latest epoch: `e1.<epoch>.<row>.<ciphertext>`. */
export async function sealField(
  keyring: Keyring,
  target: FieldTarget,
  text: string,
): Promise<string> {
  if (!ID.test(target.row)) throw new TypeError('a row id is a UUID');
  const epoch = latestEpoch(keyring);
  const key = keyring[epoch];
  if (!key) throw new TypeError('no key for the epoch');
  const bytes = await encryptBytes(
    await importDocumentKey(key),
    { documentId: documentOf(target), version: epoch },
    utf8(text),
  );
  return `${VALUE}.${epoch}.${target.row}.${toBase64url(bytes)}`;
}

/** Whether a value has the shape of an encrypted field (what the server checks: it cannot open one). */
export const FIELD_VALUE = /^e1\.\d{1,6}\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{16,16384}$/;

/**
 * A field's text, opened, if `value` was encrypted for `target`'s household, table and field, and for its row or one of `aliases` (rows folded into
 * it). `undefined` for anything else: another row's value, a value that was changed, an epoch this keyring does not hold.
 */
export async function openField(
  keyring: Keyring,
  target: FieldTarget,
  value: string,
  aliases: readonly string[] = [],
): Promise<string | undefined> {
  if (!FIELD_VALUE.test(value)) return undefined;
  const [, epochText, row, body] = value.split('.');
  if (!epochText || !row || !body) return undefined;
  if (row !== target.row && !aliases.includes(row)) return undefined;
  const epoch = Number(epochText);
  const key = keyring[epoch];
  if (!key) return undefined;
  try {
    const bytes = await decryptBytes(
      await importDocumentKey(key),
      { documentId: documentOf({ ...target, row }), version: epoch },
      fromBase64url(body),
    );
    return fromUtf8(bytes);
  } catch {
    return undefined;
  }
}

/** A product's name key (§13.3): base64url of `HMAC-SHA-256(K_name, household ‖ normalised name)`, with `K_name` from the first epoch's key. */
export async function householdNameKey(
  keyring: Keyring,
  household: string,
  normalised: string,
): Promise<string> {
  const first = keyring[Math.min(...Object.keys(keyring).map(Number))];
  if (!first) throw new TypeError('an empty keyring');
  const base = await crypto.subtle.importKey('raw', first, 'HKDF', false, ['deriveKey']);
  const mac = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: utf8('shopper:name-key:v2') },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', mac, utf8(`${household}\u0000${normalised}`));
  return `n2.${toBase64url(new Uint8Array(signed))}`;
}

/** Whether a value has the shape of a name key made by a device (`n2.` and 43 characters). */
export const NAME_KEY_V2 = /^n2\.[A-Za-z0-9_-]{43}$/;
