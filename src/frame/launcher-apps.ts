import { pictureOf } from '../auth/core-links';

/**
 * **The apps a person may open** (RFC 0005, DESIGN.md §16.2), as the launcher in the header has them, in suite mode: core's `listMyApps` through the SDK
 * (`GET /api/account/apps` asks it, as the person), kept on the device **per account** so that the launcher opens with no network, and gone when the person signs out
 * (`forgetIdentity`). Everything here is **held to what a page may draw**, on the way in from core and again on the way out of the device's storage, since neither is
 * Shopper's: a name is text and is cut to a line; an icon is **only an address on core's own origin** (the page's policy lets an image come from there and nowhere else,
 * `pictureOf`), and an app with none is drawn by its first letter; an address to open is `http` or `https` and nothing else (never `javascript:`); and the app Shopper
 * is, which a person is already in, is left out. Pure, with the storage given, so that it is tested with none.
 */
export interface AppTile {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly launchUrl: string;
}

const MAX_APPS = 40;
const MAX_NAME = 80;
const MAX_ID = 128;

/** The device's key for an account's apps. */
export const appsKey = (accountId: string): string => `shopper.apps.${accountId}`;

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max
    ? value.trim()
    : undefined;

function httpAddress(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === ''
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What core, or the device's copy of it, says as tiles we may draw: anything that is not an app with a name and an address to open is left out, and so is `current`
 * (the app the launcher is in, by its client id). At most forty, in the order given.
 */
export function tilesOf(raw: unknown, core: string, current?: string): AppTile[] {
  if (!Array.isArray(raw)) return [];
  const out: AppTile[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = text(record.id, MAX_ID);
    const name = text(record.name, MAX_NAME);
    const launchUrl = httpAddress(record.launchUrl);
    if (!id || !name || !launchUrl || id === current || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      icon: pictureOf(record.icon as string | null | undefined, core) ?? null,
      launchUrl,
    });
    if (out.length === MAX_APPS) break;
  }
  return out;
}

/** What the device kept for an account, held to the same: nothing for anything that is not what was written. */
export function readApps(
  storage: Pick<Storage, 'getItem'> | undefined,
  accountId: string,
  core: string,
): AppTile[] | undefined {
  try {
    const kept = storage?.getItem(appsKey(accountId));
    return kept ? tilesOf(JSON.parse(kept), core) : undefined;
  } catch {
    return undefined;
  }
}

/** Keeps the apps for an account; where there is no storage (a private window) they last for the page. */
export function rememberApps(
  storage: Pick<Storage, 'setItem'> | undefined,
  accountId: string,
  tiles: readonly AppTile[],
): void {
  try {
    storage?.setItem(appsKey(accountId), JSON.stringify(tiles));
  } catch {
    // Not kept.
  }
}
