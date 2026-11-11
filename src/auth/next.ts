/**
 * **Where to go after signing in** (DESIGN.md §7.3): an invitation's link is kept through the sign-in or sign-up round trip as `?next=/invite/<token>`.
 * Only that shape is ever followed: any other value is taken for none, so the parameter cannot send a person to another site or another page. Pure.
 */
const INVITE = /^\/invite\/[A-Za-z0-9_-]{43}$/;

export function safeNext(value: string | string[] | undefined | null): string | null {
  return typeof value === 'string' && INVITE.test(value) ? value : null;
}

/** The query that carries a destination to the other of the two pages, or nothing. */
export const nextQuery = (next: string | null): string =>
  next ? `?next=${encodeURIComponent(next)}` : '';
