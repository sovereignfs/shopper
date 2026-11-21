import { decryptBytes, encryptBytes, importDocumentKey } from '@sovereignfs/sdk/keys';

/**
 * The keys in the browser (RFC 0001, amendments 1 and 2; RFC 0004; DESIGN.md §13). Pure functions over WebCrypto and the SDK: nothing here talks to a
 * server, and nothing leaves the browser but what these return.
 *
 * - **The group's keyring** is every epoch's key, 32 random bytes each, made by the account's device when its lists move, and kept by the account alone
 *   **wrapped under its own app key** (`wrapKeyring`), the AES-GCM key core's `appKeys().open()` or the vault's `localVault().open()` gives, bound to the
 *   person and the group. The SDK has no call for this yet (16.15): it is WebCrypto's AES-GCM with a random nonce, and nothing more.
 * - **A list's keyring** (RFC 0004, task 21.4) is derived from the group's, epoch by epoch (`deriveListKeyring`: HKDF, `shopper:list-key:v1`, the list's
 *   id), so that the account's devices hold every list's keys with nothing more stored, and **a list's keyring tells nothing of another list's**. It is
 *   what a link to the list carries, and what someone on the list keeps, wrapped under their own app key (`wrapListKeyring`).
 * - **A field** is `encryptBytes` (the SDK's) under its list's key, bound to list, table, row and field, with the epoch as the version, and stored as
 *   `e2.<epoch>.<list>.<row>.<ciphertext>`, so that a value says what it was encrypted for: a fold moves a row's later changes to another row (§12.4),
 *   and `openField` takes a value bound to its list and to the row or one of its aliases, and nothing else. The server refuses a value whose list is
 *   not its row's.
 * - **The name key** is an HMAC of the list and the normalised name under a key made from the list's **first** epoch's key (HKDF,
 *   `shopper:name-key:v3`), so that folding holds whatever epoch a device is on (§13.3), and an add on one list never finds a product of another.
 */

export type Keyring = Readonly<Record<number, Uint8Array<ArrayBuffer>>>;

const KEY_BYTES = 32;
const RECORD = 'hk1';
const LIST_RECORD = 'lr1';
const VALUE = 'e2';
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
const listKeyringData = (person: string, list: string) =>
  utf8(`shopper/list-keyring/v1|${person}|${list}`);

/** The group's keyring wrapped under the account's own app key: `hk1.<nonce>.<ciphertext>`. */
export function wrapKeyring(
  appKey: CryptoKey,
  keyring: Keyring,
  bound: { person: string; household: string },
): Promise<string> {
  return wrap(RECORD, keyringData(bound.person, bound.household), appKey, keyring);
}

/** The group's keyring a record holds, or `undefined` for one this app key does not open, or that was made for another person or group. */
export function unwrapKeyring(
  appKey: CryptoKey,
  record: string,
  bound: { person: string; household: string },
): Promise<Keyring | undefined> {
  return unwrap(RECORD, keyringData(bound.person, bound.household), appKey, record);
}

/** A list's keyring wrapped under a person's own app key, or a link's key: `lr1.<nonce>.<ciphertext>`, bound to them and the list. */
export function wrapListKeyring(
  key: CryptoKey,
  keyring: Keyring,
  bound: { person: string; list: string },
): Promise<string> {
  return wrap(LIST_RECORD, listKeyringData(bound.person, bound.list), key, keyring);
}

/** A list's keyring a record holds, or `undefined` for one this key does not open, or that was made for another person or list. */
export function unwrapListKeyring(
  key: CryptoKey,
  record: string,
  bound: { person: string; list: string },
): Promise<Keyring | undefined> {
  return unwrap(LIST_RECORD, listKeyringData(bound.person, bound.list), key, record);
}

/**
 * **A list's keyring, from its group's** (RFC 0004): each epoch's key through HKDF with the list's id, so that one list's keys open nothing of another,
 * and nothing of a list's keys gives back the group's.
 */
export async function deriveListKeyring(group: Keyring, list: string): Promise<Keyring> {
  if (!ID.test(list)) throw new TypeError('a list id is a UUID');
  const out: Record<number, Uint8Array<ArrayBuffer>> = {};
  for (const [epoch, key] of Object.entries(group)) {
    const base = await crypto.subtle.importKey('raw', key, 'HKDF', false, ['deriveBits']);
    out[Number(epoch)] = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(),
          info: utf8(`shopper:list-key:v1|${list}`),
        },
        base,
        KEY_BYTES * 8,
      ),
    );
  }
  return out;
}

async function wrap(
  kind: string,
  data: Uint8Array<ArrayBuffer>,
  appKey: CryptoKey,
  keyring: Keyring,
): Promise<string> {
  const plain: Record<string, string> = {};
  for (const [epoch, key] of Object.entries(keyring)) plain[epoch] = toBase64url(key);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: data },
      appKey,
      utf8(JSON.stringify(plain)),
    ),
  );
  return `${kind}.${toBase64url(nonce)}.${toBase64url(sealed)}`;
}

async function unwrap(
  want: string,
  data: Uint8Array<ArrayBuffer>,
  appKey: CryptoKey,
  record: string,
): Promise<Keyring | undefined> {
  const [kind, nonce, sealed, rest] = record.split('.');
  if (kind !== want || !nonce || !sealed || rest !== undefined) return undefined;
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64url(nonce),
        additionalData: data,
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

/** What a field is encrypted for: its list (a list row's own id), table, row and field. */
export interface FieldTarget {
  readonly list: string;
  readonly table: string;
  readonly row: string;
  readonly field: string;
}

const documentOf = (target: FieldTarget) =>
  `shopper/${target.list}/${target.table}/${target.row}/${target.field}`;

/** A field's text, encrypted under the list's keyring's latest epoch: `e2.<epoch>.<list>.<row>.<ciphertext>`. */
export async function sealField(
  keyring: Keyring,
  target: FieldTarget,
  text: string,
): Promise<string> {
  if (!ID.test(target.row) || !ID.test(target.list)) throw new TypeError('a row id is a UUID');
  const epoch = latestEpoch(keyring);
  const key = keyring[epoch];
  if (!key) throw new TypeError('no key for the epoch');
  const bytes = await encryptBytes(
    await importDocumentKey(key),
    { documentId: documentOf(target), version: epoch },
    utf8(text),
  );
  return `${VALUE}.${epoch}.${target.list}.${target.row}.${toBase64url(bytes)}`;
}

/** Whether a value has the shape of an encrypted field (what the server checks: it cannot open one). */
export const FIELD_VALUE = /^e2\.\d{1,6}\.[0-9a-f-]{36}\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{16,16384}$/;

/** The list and row a value says it was encrypted for, which the server holds to the row's own (it cannot open the value). */
export function boundTo(value: string): { list: string; row: string } | undefined {
  if (!FIELD_VALUE.test(value)) return undefined;
  const [, , list, row] = value.split('.');
  return list && row ? { list, row } : undefined;
}

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
  const [, epochText, list, row, body] = value.split('.');
  if (!epochText || !list || !row || !body) return undefined;
  if (list !== target.list) return undefined;
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

/**
 * A product's name key (§13.3): base64url of `HMAC-SHA-256(K_name, list ‖ normalised name)`, with `K_name` from the list keyring's first epoch's key, so
 * that a name is one product on a list and is not the same name key on another (RFC 0004).
 */
export async function listNameKey(
  keyring: Keyring,
  list: string,
  normalised: string,
): Promise<string> {
  const first = keyring[Math.min(...Object.keys(keyring).map(Number))];
  if (!first) throw new TypeError('an empty keyring');
  const base = await crypto.subtle.importKey('raw', first, 'HKDF', false, ['deriveKey']);
  const mac = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: utf8('shopper:name-key:v3') },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', mac, utf8(`${list}\u0000${normalised}`));
  return `n3.${toBase64url(new Uint8Array(signed))}`;
}

/** Whether a value has the shape of a name key made by a device (`n3.` and 43 characters). */
export const NAME_KEY = /^n3\.[A-Za-z0-9_-]{43}$/;
