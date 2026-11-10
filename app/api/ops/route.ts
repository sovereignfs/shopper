import { headers } from 'next/headers';
import { sameOrigin } from '@/src/access/origin';
import { getAuth } from '@/src/auth/server';
import { getConfig } from '@/src/config/current';
import { getDatabase } from '@/src/db/boot';
import { dispatch } from '@/src/households/ops';

export const dynamic = 'force-dynamic';

/** The most a request may be: an operation is a few fields. */
const MAX_BYTES = 16 * 1024;

const answer = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * **The one door for the online operations** (DESIGN.md §12.8): `POST { op, household, … }`. The session is found first, `Origin` is checked, and the
 * operation is run for the account by `dispatch`, which answers an outsider exactly as it answers an operation that is not there. With no sign-in at all
 * the route is not there either.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await getAuth();
  if (!auth) return new Response(null, { status: 404 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return answer(401, { ok: false, error: 'signed_out' });
  const config = getConfig();
  if (!config.url || !sameOrigin(request, config.url))
    return answer(403, { ok: false, error: 'origin' });

  const text = await request.text();
  if (text.length > MAX_BYTES) return answer(413, { ok: false, error: 'too_large' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return answer(400, { ok: false, error: 'invalid' });
  }
  const reply = await dispatch(
    { database: await getDatabase(), ring: config.encryption },
    session.user.id,
    body,
  );
  return answer(reply.status, reply.body);
}
