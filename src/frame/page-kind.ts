/**
 * The kind of page an address is, which the sidebar is remembered by (RFC 0005, DESIGN.md §16.2): the front address (`/`, which opens the last list) and every
 * other page. `@sovereignfs/ui`'s `useAppSidebar` keeps a person's choice of full, a rail or hidden per kind, on this device; both kinds open full.
 */
export type PageKind = 'home' | 'page';

export const pageKind = (pathname: string): PageKind =>
  pathname === '/' || pathname === '' ? 'home' : 'page';
