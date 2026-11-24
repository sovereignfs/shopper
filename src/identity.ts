/**
 * Who is signed in on this device, kept **on the device** so that the offline shell can open Shopper with no server to ask (DESIGN.md §16.11). It is the
 * person's id, name and address: what the account menu shows and which working copy to open. It is written by every signed-in page, read only by the
 * shell, and **removed when the person signs out** (`leaveDevice`), as the working copy is. It is never in the service worker's cache, nor in any page
 * the worker keeps: those hold nothing of a person.
 */
export const IDENTITY_KEY = 'shopper.me';

export interface Identity {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

/** Reads what a stored value says, or nothing for anything that is not exactly an identity. */
export function parseIdentity(text: string | null): Identity | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const { id, name, email } = value as Record<string, unknown>;
    if (
      typeof id !== 'string' ||
      id === '' ||
      typeof name !== 'string' ||
      typeof email !== 'string'
    )
      return null;
    return { id, name, email };
  } catch {
    return null;
  }
}

export function rememberIdentity(identity: Identity): void {
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Storage that is full or blocked: the shell then has no one to open for, and says to sign in.
  }
}

export function readIdentity(): Identity | null {
  try {
    return parseIdentity(window.localStorage.getItem(IDENTITY_KEY));
  } catch {
    return null;
  }
}

export function forgetIdentity(): void {
  try {
    const who = readIdentity();
    window.localStorage.removeItem(IDENTITY_KEY);
    window.localStorage.removeItem(KEY_SOURCE_KEY);
    // Which of the account's households have moved (RFC 0001, `src/keys/transport.ts`).
    if (who) window.localStorage.removeItem(`shopper.encrypted.${who.id}`);
    // The apps core listed for the account, for the launcher (`src/frame/launcher-apps.ts`).
    if (who) window.localStorage.removeItem(`shopper.apps.${who.id}`);
  } catch {
    // Nothing to remove from.
  }
}

/**
 * Where the account's key comes from (RFC 0001, `PageKeySource`), kept beside who is signed in so that the offline shell can open the key once there is
 * a network again. It names a way to the key, never the key: core's address and the app's client id, or the vault's id and the address the password is
 * derived with. Removed at sign-out with the rest.
 */
export const KEY_SOURCE_KEY = 'shopper.keys';

export function rememberKeySource(source: unknown): void {
  try {
    if (source === undefined) window.localStorage.removeItem(KEY_SOURCE_KEY);
    else window.localStorage.setItem(KEY_SOURCE_KEY, JSON.stringify(source));
  } catch {
    // Storage that is full or blocked: the shell then holds the sync until a signed-in page has opened the key.
  }
}

export function readKeySource(): unknown {
  try {
    const text = window.localStorage.getItem(KEY_SOURCE_KEY);
    return text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    return undefined;
  }
}
