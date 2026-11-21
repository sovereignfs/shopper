import {
  type Keyring,
  fromBase64url,
  toBase64url,
  unwrapListKeyring,
  wrapListKeyring,
} from './household';

/**
 * **A list's keys in an invitation link** (RFC 0001, §13.5; RFC 0004): a secret of 32 random bytes goes in the link's fragment, which a browser never
 * sends, and **the list's keyring, and no other**, is wrapped under it (`lk2.`), so that the server keeps only what it cannot open, and only until the
 * link is used or revoked. The SDK has no call for a key by link yet (16.9); this is the same AES-GCM wrap as a person's own copy, bound to the list.
 */
const LINK_PERSON = 'link';

async function linkKey(secret: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', secret, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function newLinkSecret(): string {
  return toBase64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function wrapForLink(ring: Keyring, secret: string, list: string): Promise<string> {
  const wrapped = await wrapListKeyring(await linkKey(fromBase64url(secret)), ring, {
    person: LINK_PERSON,
    list,
  });
  return `lk2.${wrapped.slice('lr1.'.length)}`;
}

export async function openFromLink(
  wrapped: string,
  secret: string,
  list: string,
): Promise<Keyring | undefined> {
  if (!wrapped.startsWith('lk2.')) return undefined;
  try {
    return await unwrapListKeyring(
      await linkKey(fromBase64url(secret)),
      `lr1.${wrapped.slice('lk2.'.length)}`,
      { person: LINK_PERSON, list },
    );
  } catch {
    return undefined;
  }
}

/** Where a link's secret waits in the tab, from opening the link to accepting it, across signing up or in: never sent, removed once used. */
export const linkSecretKey = (token: string) => `shopper.invite.${token}`;
