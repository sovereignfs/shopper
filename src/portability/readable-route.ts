import { readCapped } from '../access/body';
import type { Limiter, Rule } from '../limits/rate';
import type { ServedRecords } from './readable';

/**
 * `POST /api/account/export` (RFC 0005, "A readable export"): the person's records as the server holds them, for **their browser to open and write as
 * one file**. **The server never reads a name to make it:** a moved group's content goes out as the ciphertext its devices wrote, with the person's
 * own wrapped keys, and a group the server still seals is given as it already reads it (the same records core's export of a person takes,
 * `personRecords`). Nothing of it is logged.
 *
 * **Confirmed first, as account deletion is.** Running alone: the password again, as the value the browser derives (the server is never sent the password), checked
 * through the package, which counts wrong answers, and tried at most five times in ten minutes; a wrong one serves nothing and says only that it is wrong. **Hosted by
 * a Sovereign instance there is no password to give:** the confirmation is a sign-in at core made in the last few minutes (`@sovereignfs/auth`'s `coreSignedInAt`,
 * core's own claim for the session and never the app's clock or anything the request says); an older one serves nothing and says `SIGN_IN_AGAIN`, and the page sends the
 * person through core with `prompt=login` and back. The records are the session's own account's, never one the request names; the request names nothing. Nothing of it is logged.
 */
/** How recently the person must have signed in at core, in suite mode, for an export: a few minutes, so that it is the person at the keyboard and not a session left open. */
export const RECENT_SIGN_IN_MS = 5 * 60_000;

export interface ReadableExportDeps {
  /** How the person says it is them: `password`, running alone, or `core`, a recent sign-in at core, in suite mode. */
  readonly confirmation: 'password' | 'core';
  readonly limiter: Limiter;
  readonly now: () => number;
  readonly version: string;
  /** Whether this is the password of the account the request is for (`password` confirmation). */
  verify(request: Request, password: string): Promise<boolean>;
  /** When the person last signed in at core on this session, in milliseconds, if core says (`core` confirmation). */
  signedInAt(request: Request): Promise<number | undefined>;
  /** The account's records, as `personRecords` selects them. */
  records(accountId: string): Promise<ServedRecords[]>;
}

const RATE: Rule = { limit: 5, windowMs: 10 * 60_000 };

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

/**
 * `POST { password }` running alone, `POST {}` in suite mode: 200 with `{ head, records }`; 400 for what is not a request; 403 for a password that is not this
 * account's (`WRONG_PASSWORD`) or a sign-in at core that is not recent enough (`SIGN_IN_AGAIN`), with nothing served; 413 for a body that is too large; 429 when
 * tried too often.
 */
export async function readableExport(
  request: Request,
  accountId: string,
  deps: ReadableExportDeps,
): Promise<Response> {
  const body = await readCapped(request, 1024);
  if (body === null) return json(413, { code: 'TOO_LARGE' });
  const taken = await deps.limiter.take(`export-readable:${accountId}`, RATE);
  if (!taken.ok)
    return json(
      429,
      { code: 'RATE_LIMITED' },
      { 'retry-after': String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))) },
    );
  let sent: { password?: unknown } | null;
  try {
    sent = body === '' ? {} : (JSON.parse(body) as { password?: unknown } | null);
  } catch {
    return json(400, { code: 'BAD_REQUEST' });
  }
  if (typeof sent !== 'object' || sent === null || Array.isArray(sent))
    return json(400, { code: 'BAD_REQUEST' });
  if (deps.confirmation === 'core') {
    const at = await deps.signedInAt(request);
    const age = at === undefined ? undefined : deps.now() - at;
    // Not recent, or from the future (a clock that disagrees by more than a minute is not a sign-in to trust).
    if (age === undefined || age > RECENT_SIGN_IN_MS || age < -60_000)
      return json(403, { code: 'SIGN_IN_AGAIN' });
  } else {
    const password = sent.password;
    if (typeof password !== 'string' || password === '' || password.length > 1000)
      return json(400, { code: 'BAD_REQUEST' });
    if (!(await deps.verify(request, password))) return json(403, { code: 'WRONG_PASSWORD' });
  }
  return json(200, {
    head: { version: deps.version, takenAt: new Date(deps.now()).toISOString() },
    records: await deps.records(accountId),
  });
}
