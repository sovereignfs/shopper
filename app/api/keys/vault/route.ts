import { vaultRoute } from '@sovereignfs/sdk/vault';
import { accountRoute } from '@/src/access/route';
import { getConfig } from '@/src/config/current';
import { getVault } from '@/src/keys/server/vault';

/**
 * Shopper's vault (RFC 0001, sdk §9.5), for the page's `localVault`: `GET` the signed-in account's own wrapped keys, `POST` one change to them. The
 * account is the session's, never the request's, and nothing here opens anything.
 */
export const dynamic = 'force-dynamic';

const handle = accountRoute(async ({ request, accountId }) => {
  const origin = getConfig().url;
  if (!origin) return new Response(null, { status: 404 });
  return vaultRoute(await getVault(), { origin })(request, accountId);
});

export const GET = handle;
export const POST = handle;
