import { pushSubscriptionHandlers } from '@sovereignfs/push';
import { readSession } from '@sovereignfs/auth/server';
import { getAuth } from '@/src/auth/server';
import { getConfig } from '@/src/config/current';
import { getDatabase } from '@/src/db/boot';
import { pushStore } from '@/src/push/store';

/**
 * This device's push subscription (RFC 0002): `GET` whether Shopper sends pushes and its public key, `POST` a subscription, `DELETE` one, for the
 * signed-in account only and, for a change, only from Shopper's own pages. The package's handlers; with no push key there is nothing to subscribe to.
 */
export const dynamic = 'force-dynamic';

async function handlers() {
  const config = getConfig();
  return pushSubscriptionHandlers({
    store: pushStore(await getDatabase(), config.encryption),
    settings: config.push,
    account: async (request: Request) => {
      const auth = await getAuth();
      return auth ? (await readSession(auth, request.headers))?.user.id : undefined;
    },
    origin: config.url ?? '',
  });
}

export const GET = async (request: Request) => (await handlers()).GET(request);
export const POST = async (request: Request) => (await handlers()).POST(request);
export const DELETE = async (request: Request) => (await handlers()).DELETE(request);
