import { readCapped } from '@/src/access/body';
import { sameOrigin } from '@/src/access/origin';
import { movePassword } from '@/src/auth/move';
import { authSettings, getAuth } from '@/src/auth/server';
import { getConfig } from '@/src/config/current';
import { getAuthDatabase, getDatabase } from '@/src/db/boot';
import { RateLimiter } from '@/src/limits/rate';

/**
 * Moving a 0.1.0 password across, once (`src/auth/move.ts`). Before sign-in, so with no session: only from a page of this app, and only where local
 * sign-in is on. Always `204`.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const auth = await getAuth();
  const url = getConfig().url;
  if (!auth || !url || !authSettings()?.local) return new Response(null, { status: 404 });
  if (!sameOrigin(request, url)) return new Response(null, { status: 403 });
  const text = await readCapped(request, 2048);
  let body: Record<string, unknown>;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  await movePassword(
    { authDatabase: await getAuthDatabase(), limiter: new RateLimiter(await getDatabase()) },
    { email: body.email, password: body.password, signIn: body.signIn },
  );
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
