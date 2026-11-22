import { accountRoute } from '@/src/access/route';
import { getAuth } from '@/src/auth/server';
import { getAuthDatabase } from '@/src/db/boot';
import { sessionKeySecret } from '@/src/keys/server/secret';
import { keySourceOf } from '@/src/keys/server/source';

/**
 * This session's key secret (RFC 0001, sdk §9.3 and §9.5), for the page's keys: what they are kept wrapped by in this browser, so that they open nothing once
 * the session has ended. Only the session's own pages ask, with its cookie; it is never cached.
 */
export const dynamic = 'force-dynamic';

export const GET = accountRoute(async ({ request, accountId }) => {
  const auth = await getAuth();
  const session = await auth?.api.getSession({ headers: request.headers });
  if (!session) return new Response(null, { status: 401 });
  const secret = await sessionKeySecret(await getAuthDatabase(), session.session.id, accountId);
  // The person the keys are bound to: the account in Shopper's vault, or core's `sub` for a key core releases (sdk §9.3).
  const source = await keySourceOf(accountId);
  if (!secret || !source) return new Response(null, { status: 401 });
  return Response.json({ sub: source.sub, secret }, { headers: { 'cache-control': 'no-store' } });
});
