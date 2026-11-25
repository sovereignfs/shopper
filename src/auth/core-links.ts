/**
 * What Shopper takes from core's address (RFC 0005, DESIGN.md §17): where its own pages are, which Settings links to in suite mode (Shopper copies none
 * of core's profile, security or preferences), and a picture of the person that core names, which is the one image that comes from beyond this app's own origin.
 */

/** An address on core: `core` is its origin (`SHOPPER_CORE_URL`, no path), `path` one of its pages (`/profile`, `/security`, `/keys`, `/preferences`, `/delete-account`). */
export const coreLink = (core: string, path: string): string => new URL(path, core).href;

/**
 * The person's picture as core names it, **only if it is an address on core's own origin over http(s)**: the page's policy allows an image from this app and from
 * core and nowhere else (`src/security/csp.ts`), so any other address would be a broken image, and a `data:` or `javascript:` one is never put in a page.
 * Without one the avatar is the person's initials.
 */
export function pictureOf(picture: string | null | undefined, core: string): string | undefined {
  if (typeof picture !== 'string' || picture === '') return undefined;
  let parsed: URL;
  try {
    parsed = new URL(picture);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
  if (parsed.username !== '' || parsed.password !== '') return undefined;
  return parsed.origin === new URL(core).origin ? parsed.href : undefined;
}
