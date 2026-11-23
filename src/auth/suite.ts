import { safeNext } from './next';

/**
 * Suite mode's sign-in (RFC 0005, "Sign-in"): Shopper's `/sign-in` and `/sign-up` render nothing of their own and send the browser to core at once,
 * through `@sovereignfs/auth`'s `/api/auth/sign-in/sovereign`, keeping where the person was going. Pure, so the three outcomes are tested with no server.
 */

/** Where a person is going once signed in: an invitation's page, from Shopper's own `next` or from the `returnTo` the package sends back with. */
export function destination(query: {
  next?: string | string[] | undefined;
  returnTo?: string | string[] | undefined;
}): string | null {
  return safeNext(query.next) ?? safeNext(query.returnTo);
}

/** The address that starts a sign-in at core, coming back to `next` (or the front address). */
export const toCore = (next: string | null): string =>
  `/api/auth/sign-in/sovereign?returnTo=${encodeURIComponent(next ?? '/')}`;

export type SuiteStep =
  | { readonly kind: 'go'; readonly to: string }
  | { readonly kind: 'show'; readonly error: string; readonly retry: string };

/**
 * What `/sign-in` or `/sign-up` does in suite mode. Someone with a session goes where they were going; a return from core with `?error=` is shown once,
 * with a way to try again, and is never sent back to core by itself, so a failure at core cannot loop; anyone else is sent to core.
 */
export function suiteStep(
  signedIn: boolean,
  error: string | undefined,
  next: string | null,
): SuiteStep {
  if (signedIn) return { kind: 'go', to: next ?? '/' };
  if (error) return { kind: 'show', error, retry: toCore(next) };
  return { kind: 'go', to: toCore(next) };
}
