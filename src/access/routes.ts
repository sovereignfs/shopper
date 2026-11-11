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
    address: '/l/[id]',
    who: 'signed-in',
    note: 'A list. The page holds nothing of it: the device reads it from its own copy, which has only the households the account is in.',
  },
  {
    kind: 'page',
    address: '/l/[id]/settings',
    who: 'signed-in',
    note: 'A list’s settings. The page holds nothing of it; deleting for good is the Admin’s online operation, checked in its statement.',
  },
  {
    kind: 'page',
    address: '/shop',
    who: 'signed-in',
    note: 'Shopping mode for a list. The page holds nothing of it: the device reads the list from its own copy, which has only the households the account is in.',
  },
  {
    kind: 'page',
    address: '/home',
    who: 'signed-in',
    note: 'The signed-in area: a visitor is sent to sign in. Reached as / by someone with a session cookie; /home itself goes to /.',
  },
  {
    kind: 'page',
    address: '/settings',
    who: 'signed-in',
    note: "The signed-in person's own profile, sign-in and data: a visitor is sent to sign in.",
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
    address: '/sw.js',
    who: 'public',
    note: 'The service worker: the same text for everyone, with the names of the build’s own files; it holds nothing of a person.',
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
    address: '/api/account/profile',
    who: 'signed-in',
    note: "The session's own name only: kept in step in better-auth and in person.",
  },
  {
    kind: 'route',
    address: '/api/sync',
    who: 'signed-in',
    note: "The session's own account: its outbox is applied with the permission in each statement, and only the households it is in are pulled.",
  },
  {
    kind: 'route',
    address: '/api/ops',
    who: 'signed-in',
    note: 'The online operations: each says who may do it, and an outsider gets not found.',
  },
  {
    kind: 'operation',
    address: 'list.delete',
    who: 'admin',
    note: 'An Admin deletes an archived list of the household for good; a Member, an outsider and an unknown list read as not found.',
  },
  {
    kind: 'operation',
    address: 'invite.create',
    who: 'member',
    note: 'Any member makes a link for the household; its token is returned once and only its hash is stored. An outsider reads as not found.',
  },
  {
    kind: 'operation',
    address: 'invite.revoke',
    who: 'member',
    note: 'Whoever made a link, or an Admin, revokes it, in the statement; another Member, an outsider and a link that is gone read as not found.',
  },
  {
    kind: 'page',
    address: '/invite/[token]',
    who: 'public',
    note: 'An invitation: the household’s name and who invited, and nothing else; one page for every link that does not work. Opening it is rate limited.',
  },
  {
    kind: 'route',
    address: '/api/invite/accept',
    who: 'signed-in',
    note: 'Accepts a link as the session’s account: one transaction that claims it, checks both limits and adds a Member. Rate limited.',
  },
  {
    kind: 'operation',
    address: 'member.leave',
    who: 'member',
    note: 'A member leaves, in one transaction that steps the household’s counter; the last Admin cannot. An outsider reads as not found.',
  },
  {
    kind: 'operation',
    address: 'member.remove',
    who: 'admin',
    note: 'An Admin removes another member, never an Admin; a Member’s attempt and an outsider’s read as not found.',
  },
  {
    kind: 'operation',
    address: 'invite.list',
    who: 'member',
    note: 'A member reads the household’s live links (who made each, whether they may revoke it), never a link itself. An outsider reads as not found.',
  },
  {
    kind: 'route',
    address: '/api/sovereign/backchannel-logout',
    who: 'public',
    note: 'Core’s notice that a person’s session ended. The signed token is the whole credential (checked by the SDK, a replayed jti refused); a bounded form, rate limited; not found where core is not set.',
  },
  {
    kind: 'route',
    address: '/api/sovereign/account-deleted',
    who: 'public',
    note: 'Core’s notice that a person deleted their account. The signed token is the whole credential; it runs deletePerson and answers 200 only once done; not found where core is not set.',
  },
];
