import { readCapped } from '../access/body';
import type { Limiter, Rule } from '../limits/rate';
import type { ServedRecords } from './readable';

/**
 * `POST /api/account/export` (RFC 0005, "A readable export"): the person's records as the server holds them, for **their browser to open and write as
 * one file**. **The server never reads a name to make it:** a moved group's content goes out as the ciphertext its devices wrote, with the person's
 * own wrapped keys, and a group the server still seals is given as it already reads it (the same records core's export of a person takes,
 * `personRecords`). Nothing of it is logged.
 *
 * **Confirmed first, as account deletion is:** the password again, as the value the browser derives (the server is never sent the password), checked
 * through the package, which counts wrong answers, and tried at most five times in ten minutes. A wrong one serves nothing, and says only that it is
 * wrong. The records are the session's own account's, never one the request names; the request names nothing.
 *
 * Standalone mode only, for now: in suite mode the confirmation is a fresh sign-in at core (`prompt=login`), which waits for
 * `@sovereignfs/auth`'s `coreSignedInAt` to be released and used here. Until then the route is not there and Settings says core's export holds
 * Shopper's part.
 */
export interface ReadableExportDeps {
  /** Whether the instance has its own accounts (standalone mode): in suite mode the route answers 404. */
  readonly local: boolean;
  readonly limiter: Limiter;
  readonly now: () => number;
  readonly version: string;
  /** Whether this is the password of the account the request is for. */
  verify(request: Request, password: string): Promise<boolean>;
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
 * `POST { password }`: 200 with `{ head, records }`; 400 for what is not a request; 403 for a password that is not this account's (`WRONG_PASSWORD`),
 * with nothing served; 413 for a body that is too large; 429 when tried too often; 404 in suite mode.
 */
export async function readableExport(
  request: Request,
  accountId: string,
  deps: ReadableExportDeps,
): Promise<Response> {
  if (!deps.local) return new Response(null, { status: 404 });
  const body = await readCapped(request, 1024);
  if (body === null) return json(413, { code: 'TOO_LARGE' });
  const taken = await deps.limiter.take(`export-readable:${accountId}`, RATE);
  if (!taken.ok)
    return json(
      429,
      { code: 'RATE_LIMITED' },
      { 'retry-after': String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))) },
    );
  let password: unknown;
  try {
    password = (JSON.parse(body) as { password?: unknown } | null)?.password;
  } catch {
    return json(400, { code: 'BAD_REQUEST' });
  }
  if (typeof password !== 'string' || password === '' || password.length > 1000)
    return json(400, { code: 'BAD_REQUEST' });
  if (!(await deps.verify(request, password))) return json(403, { code: 'WRONG_PASSWORD' });
  return json(200, {
    head: { version: deps.version, takenAt: new Date(deps.now()).toISOString() },
    records: await deps.records(accountId),
  });
}
