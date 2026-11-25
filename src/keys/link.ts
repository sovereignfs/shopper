import {
  type Keyring,
  fromBase64url,
  toBase64url,
  unwrapCardKeyring,
  unwrapListKeyring,
  wrapCardKeyring,
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

/**
 * **A card's keys in a link** (RFC 0007, DESIGN.md §13.5): the same wrap under the link's secret, of **the card's keyring and no other**, bound to the card (`ck2.`). It is its own prefix, so that a
 * link to a card is never opened as a list's and the other way round, and its binding is the card's id, so that it opens for that card alone.
 */
export async function wrapCardForLink(
  ring: Keyring,
  secret: string,
  card: string,
): Promise<string> {
  const wrapped = await wrapCardKeyring(await linkKey(fromBase64url(secret)), ring, {
    person: LINK_PERSON,
    card,
  });
  return `ck2.${wrapped.slice('cr1.'.length)}`;
}

export async function openCardFromLink(
  wrapped: string,
  secret: string,
  card: string,
): Promise<Keyring | undefined> {
  if (!wrapped.startsWith('ck2.')) return undefined;
  try {
    return await unwrapCardKeyring(
      await linkKey(fromBase64url(secret)),
      `cr1.${wrapped.slice('ck2.'.length)}`,
      { person: LINK_PERSON, card },
    );
  } catch {
    return undefined;
  }
}

/** Where a link's secret waits in the tab, from opening the link to accepting it, across signing up or in: never sent, removed once used. */
export const linkSecretKey = (token: string) => `shopper.invite.${token}`;
