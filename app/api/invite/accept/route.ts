import { accountRoute } from '@/src/access/route';
import { readCapped } from '@/src/access/body';
import { getConfig } from '@/src/config/current';
import { getDatabase } from '@/src/db/boot';
import { acceptInvitation } from '@/src/households/invitations';
import { RateLimiter } from '@/src/limits/rate';

export const dynamic = 'force-dynamic';

/** A person accepts a link or two; this is far above that and far below guessing. */
const RATE = { limit: 20, windowMs: 10 * 60_000 };

const reply = (
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) => Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });

/**
 * **Accepting an invitation** (DESIGN.md §7.3): `POST { token }` as the session's account. The door (`accountRoute`) finds the session and checks `Origin`;
 * the acceptance is one transaction (`acceptInvitation`) that claims the link, checks both limits and adds a Member. A link that does not work, for any
 * reason, is one answer; a limit is a sentence. Counted per account, so that guessing tokens is slow as well as hopeless.
 */
export const POST = accountRoute(async ({ request, accountId }) => {
  const database = await getDatabase();
  const taken = await new RateLimiter(database).take(`invite-accept:${accountId}`, RATE);
  if (!taken.ok)
    return reply(
      429,
      { ok: false, error: 'rate_limited' },
      { 'retry-after': String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))) },
    );
  const text = await readCapped(request, 1024);
  let token: unknown;
  try {
    token = text === null ? undefined : (JSON.parse(text) as { token?: unknown }).token;
  } catch {
    token = undefined;
  }
  if (typeof token !== 'string') return reply(400, { ok: false, error: 'invalid' });
  const config = getConfig();
  const accepted = await acceptInvitation(database, config.encryption, {
    token,
    accountId,
    limits: config.limits,
    now: Date.now(),
  });
  switch (accepted.status) {
    case 'joined':
    case 'already':
      return reply(200, { ok: true, status: accepted.status, household: accepted.household });
    case 'refused':
      return reply(409, { ok: false, error: 'refused', message: accepted.message });
    case 'invalid':
      return reply(404, { ok: false, error: 'invalid' });
  }
});
