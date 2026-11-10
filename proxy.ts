import { type NextRequest, NextResponse } from 'next/server';
import { HSTS, contentSecurityPolicy, newNonce } from './src/security/csp';
import { edgeSettings } from './src/config/edge';

/**
 * **Every page is sent with a Content-Security-Policy** with a nonce of its own (`src/security/csp.ts`), so every page is rendered per request, the
 * landing page too. The proxy makes the nonce and puts the policy on the request, where Next reads it and puts the nonce on the scripts and styles
 * it makes, and the layout puts it on the theme script (`x-nonce`); it puts the policy on the response too, where the browser enforces it. An API's
 * answer is data, with no page to protect, so it gets only the headers every response has (`next.config.ts`).
 *
 * It keeps the Edge discipline: no Node built-ins and no database. It only looks at the request, so a session is for the page to check, and a
 * proxy is never the only thing standing in the way (DESIGN.md §5.2). The sign-in pages that are not there when local sign-in is off, and `/` for
 * someone with a session cookie, join with tasks 2.1 and 2.2.
 *
 * The service worker keeps one page, `/shell` (task 1.12), and answers a signed-in address with it when there is no network. It is kept with the
 * headers it was sent with, so the nonce in its policy is the nonce on its scripts: it needs no fresh one. A page the worker builds itself ("needs a
 * connection") carries a policy of its own, which allows no script.
 */
export function proxy(request: NextRequest) {
  const { secure, development } = edgeSettings();
  const page = !request.nextUrl.pathname.startsWith('/api/');
  const nonce = newNonce();
  const policy = contentSecurityPolicy({ nonce, secure, development });

  const requestHeaders = new Headers(request.headers);
  if (page) {
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('content-security-policy', policy);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (page) response.headers.set('content-security-policy', policy);
  if (secure) response.headers.set('strict-transport-security', HSTS);
  return response;
}

/** Everything but the build's own static files, which are not pages and are the same for everyone (and cannot carry a nonce), and prefetches. */
export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|sw.js|manifest.webmanifest).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
