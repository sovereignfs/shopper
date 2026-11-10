/**
 * **Every page, route and operation, with who may use it** (DESIGN.md §5.2): the one list, and `routes.test.ts` holds it to the files in `app/` and to the
 * operations in `src/households/ops.ts`, so that nothing is added without saying who may use it. A second-person test calls each operation as someone who
 * is not in the household and expects not found.
 *
 * - `public`: anyone, signed in or not.
 * - `signed-in`: any signed-in account; what it touches is the account's own, or decided by the operation it carries.
 * - `member`, `admin`: an active member, or an active Admin, of the household the request names. Anyone else gets not found.
 */
export type Who = 'public' | 'signed-in' | 'member' | 'admin';

export interface Access {
  readonly kind: 'page' | 'route' | 'operation';
  /** A page's or route's address as the files of `app/` make it (a route group is not part of it), or an operation's name. */
  readonly address: string;
  readonly who: Who;
  readonly note: string;
}

export const ACCESS: readonly Access[] = [
  {
    kind: 'page',
    address: '/',
    who: 'public',
    note: 'The landing page for a visitor; for someone with a session cookie the proxy answers it with /home.',
  },
  {
    kind: 'page',
    address: '/home',
    who: 'signed-in',
    note: 'The signed-in area: a visitor is sent to sign in. Reached as / by someone with a session cookie; /home itself goes to /.',
  },
  {
    kind: 'page',
    address: '/shell',
    who: 'public',
    note: 'The frame the service worker keeps: it holds nothing of a person (task 1.12).',
  },
  {
    kind: 'page',
    address: '/sign-in',
    who: 'public',
    note: 'Not there when no way of signing in is on.',
  },
  { kind: 'page', address: '/sign-up', who: 'public', note: 'Not there without local sign-in.' },
  {
    kind: 'page',
    address: '/forgot-password',
    who: 'public',
    note: 'Not there without local sign-in; works only with mail.',
  },
  {
    kind: 'page',
    address: '/reset-password',
    who: 'public',
    note: 'Not there without local sign-in; works only with mail.',
  },
  {
    kind: 'route',
    address: '/api/health',
    who: 'public',
    note: 'Says whether the database answers, and which dialect; nothing else.',
  },
  {
    kind: 'route',
    address: '/api/auth/[...all]',
    who: 'public',
    note: 'better-auth, which checks its own sessions; 404 without sign-in, and the mail routes 404 without mail.',
  },
  {
    kind: 'route',
    address: '/api/account/delete',
    who: 'signed-in',
    note: "The session's own account only: what deleting it would do, and doing it, after the password.",
  },
  {
    kind: 'route',
    address: '/api/ops',
    who: 'signed-in',
    note: 'The online operations: each says who may do it, and an outsider gets not found.',
  },
];
