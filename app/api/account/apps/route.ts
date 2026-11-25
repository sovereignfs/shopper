import { accountRoute } from '@/src/access/route';
import { authSettings, sovereignClient } from '@/src/auth/server';
import { getAuthStore } from '@/src/db/boot';
import { tilesOf } from '@/src/frame/launcher-apps';
import { subOfAccount } from '@/src/sovereign/identity';

// The apps the person may open (RFC 0005, DESIGN.md §16.2), for the launcher in the header, in suite mode. Core's `listMyApps` through the SDK, **as the session's own
// person, with their own refresh token**, held to what a page may draw (`tilesOf`). The request names no one. Anything that goes wrong at core, a core that does not
// list `apps`, a person who has no token yet (they signed in before the launcher, and have not since), or core being out, is `{ apps: null }`: the launcher keeps
// what the device had, and nothing else changes (DESIGN.md §15.4). Nothing of it is logged.
export const dynamic = 'force-dynamic';

const reply = (body: { apps: unknown[] | null }): Response =>
  Response.json(body, { headers: { 'cache-control': 'no-store' } });

export const GET = accountRoute(async ({ accountId }) => {
  const settings = authSettings();
  const sovereign = sovereignClient();
  if (!settings?.sovereign || !sovereign) return new Response(null, { status: 404 });
  const sub = await subOfAccount(await getAuthStore(), accountId);
  if (!sub) return reply({ apps: null });
  try {
    const answer = await sovereign.as({ sub }).apps.list();
    return reply({
      apps: tilesOf(answer.apps, settings.sovereign.issuer, settings.sovereign.clientId),
    });
  } catch {
    return reply({ apps: null });
  }
});
