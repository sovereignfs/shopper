import { accountRoute } from '@/src/access/route';
import { readCapped } from '@/src/access/body';
import { getConfig } from '@/src/config/current';
import { getDatabase } from '@/src/db/boot';
import { RateLimiter } from '@/src/limits/rate';
import { handleSync } from '@/src/sync/endpoint';
import { MAX_BODY } from '@/src/sync/protocol';

export const dynamic = 'force-dynamic';

/** A device syncs after a write, on load, on focus and on an interval: far under this, and enough for a busy shop. */
const RATE = { limit: 240, windowMs: 60_000 };

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });

/**
 * **The sync endpoint** (DESIGN.md §12.3): the session is found and `Origin` checked by `accountRoute`, the body is bounded, requests are counted per
 * account, and everything else is `handleSync`.
 */
export const POST = accountRoute(async ({ request, accountId }) => {
  const database = await getDatabase();
  const taken = await new RateLimiter(database).take(`sync:${accountId}`, RATE);
  if (!taken.ok)
    return reply(
      429,
      { error: 'rate_limited' },
      { 'retry-after': String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))) },
    );
  const text = await readCapped(request, MAX_BODY);
  if (text === null) return reply(413, { error: 'too_large' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: 'invalid' });
  }
  const config = getConfig();
  const answer = await handleSync(
    {
      database,
      ring: config.encryption,
      limits: config.limits,
      intervalSeconds: config.syncIntervalSeconds,
    },
    accountId,
    body,
  );
  return reply(answer.status, answer.body);
});
