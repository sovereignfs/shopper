import { getAuth } from '../auth/server';
import { getConfig } from '../config/current';
import { sameOrigin } from './origin';

/**
 * **A route for a signed-in account** (DESIGN.md §5.2, §21): the session is found first, a request that changes something is accepted only from a page of
 * this app (`Origin`, `src/access/origin.ts`), and the handler is given the account id and nothing it could use to act for another. With no sign-in at all
 * the route is not there. The handler's statements carry the permission themselves; this is the door, not the permission.
 */
export interface AccountRequest {
  readonly request: Request;
  readonly accountId: string;
}

const refuse = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: { 'cache-control': 'no-store' } });

export function accountRoute(handler: (context: AccountRequest) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const auth = await getAuth();
    if (!auth) return new Response(null, { status: 404 });
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return refuse(401, 'signed_out');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const url = getConfig().url;
      if (!url || !sameOrigin(request, url)) return refuse(403, 'origin');
    }
    return handler({ request, accountId: session.user.id });
  };
}
