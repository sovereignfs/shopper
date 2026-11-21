import { readCapped } from '@/src/access/body';
import { accountRoute } from '@/src/access/route';
import { isId } from '@/src/actions/format';
import { getConfig } from '@/src/config/current';
import { getDatabase } from '@/src/db/boot';
import { moveHousehold, moveInput, moveManifest } from '@/src/keys/server/move';
import { MAX_BODY } from '@/src/sync/protocol';

/**
 * Moving a household to content its device encrypts (RFC 0001, amendment 2, `src/keys/server/move.ts`): `GET ?household=` its rows, opened once more for
 * its only member; `POST` them back encrypted. Anyone else, and a household that cannot move, reads as not found.
 */
export const dynamic = 'force-dynamic';

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export const GET = accountRoute(async ({ request, accountId }) => {
  const household = new URL(request.url).searchParams.get('household') ?? '';
  if (!isId(household)) return json(404, { ok: false });
  const manifest = await moveManifest(
    { database: await getDatabase(), ring: getConfig().encryption },
    household,
    accountId,
  );
  return manifest ? json(200, { ok: true, ...manifest }) : json(404, { ok: false });
});

export const POST = accountRoute(async ({ request, accountId }) => {
  const text = await readCapped(request, MAX_BODY);
  if (text === null) return json(413, { ok: false });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { ok: false });
  }
  const household = (body as { household?: unknown } | null)?.household;
  const input = moveInput.safeParse(body);
  if (typeof household !== 'string' || !isId(household) || !input.success)
    return json(400, { ok: false });
  const result = await moveHousehold(
    { database: await getDatabase(), ring: getConfig().encryption },
    household,
    accountId,
    input.data,
  );
  if (result.ok) return json(200, result);
  return json(result.why === 'not-movable' ? 404 : 409, result);
});
