import { accountRoute } from '@/src/access/route';
import { readCapped } from '@/src/access/body';
import { MAX_NAME_LENGTH } from '@/src/account/profile';
import { getAuth } from '@/src/auth/server';
import { getConfig } from '@/src/config/current';
import { getDatabase } from '@/src/db/boot';
import { updatePerson } from '@/src/people/people';

// The signed-in person's own name (DESIGN.md §6.1, §17). The account is the session's, and nobody else's can be named here. The name is kept in step in
// better-auth, which signs the person in, and in `person`, which every shared row points at and which keeps it when the account goes.
export const dynamic = 'force-dynamic';

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export const POST = accountRoute(async ({ request, accountId }) => {
  const text = await readCapped(request, 2048);
  if (text === null) return reply(413, { ok: false, error: 'too_large' });
  let name: unknown;
  try {
    name = (JSON.parse(text) as { name?: unknown } | null)?.name;
  } catch {
    return reply(400, { ok: false, error: 'invalid' });
  }
  if (typeof name !== 'string') return reply(400, { ok: false, error: 'invalid' });
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > MAX_NAME_LENGTH)
    return reply(400, { ok: false, error: 'invalid' });

  const auth = await getAuth();
  if (!auth) return new Response(null, { status: 404 });
  await auth.api.updateUser({ headers: request.headers, body: { name: trimmed } });
  await updatePerson(await getDatabase(), getConfig().encryption, accountId, { name: trimmed });
  return reply(200, { ok: true, name: trimmed });
});
