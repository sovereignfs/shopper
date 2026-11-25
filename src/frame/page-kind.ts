/**
 * The kind of page an address is, which the sidebar is remembered by (RFC 0005, DESIGN.md §16.2): the front address (`/`, which opens the last list) and every
 * other page. `@sovereignfs/ui`'s `useAppSidebar` keeps a person's choice of full, a rail or hidden per kind, on this device; both kinds open full.
 */
export type PageKind = 'home' | 'page';

/**
 * The address a person sees, from what `usePathname()` says. **At the front address it says `/home`:** the proxy rewrites `/` to the page `app/(app)/home`, and a
 * client reads the rewritten path (Next's docs, "Avoid hydration mismatch with rewrites"). `/home` is never an address a person is on (the proxy sends a request for
 * it to `/`), so it means the front address, which is Home (RFC 0006), and is said so here once, for everything that asks which page this is.
 */
export const addressOf = (pathname: string): string =>
  pathname === '/home' || pathname === '' ? '/' : pathname;

export const pageKind = (pathname: string): PageKind =>
  addressOf(pathname) === '/' ? 'home' : 'page';
