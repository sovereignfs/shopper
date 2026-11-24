'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppsLauncher, appsLauncherItems } from '@sovereignfs/ui';
import { type AppTile, readApps, rememberApps, tilesOf } from './launcher-apps';

/**
 * **The launcher** (RFC 0005, DESIGN.md §16.2), in the header, **in suite mode only**: the apps the person may open on the instance, as the design system's
 * `AppsLauncher` draws them. It opens at once from what this device kept of them (`launcher-apps.ts`, per account, so it opens with no network), asks the server
 * for the list again each time a page opens (`GET /api/account/apps`, which asks core as the person), and keeps the answer. **A call that fails changes nothing but
 * that call:** core being out, a core that lists no apps, or no token for the person yet (they signed in before the launcher) leaves what the device had, and with
 * nothing, no launcher is drawn. Never on a phone: the frame draws none there. Icons are core's own addresses, the one image that comes from beyond this app.
 */
export function ShopperLauncher({ accountId, core }: { accountId: string; core: string }) {
  // Not known until the page is in the browser: the server renders nothing of what this device kept.
  const [tiles, setTiles] = useState<AppTile[] | undefined>(undefined);
  useEffect(() => {
    setTiles(readApps(window.localStorage, accountId, core));
    const controller = new AbortController();
    void fetch('/api/account/apps', { cache: 'no-store', signal: controller.signal })
      .then(async (reply) => (reply.ok ? ((await reply.json()) as { apps?: unknown }) : null))
      .then((body) => {
        if (!body || !Array.isArray(body.apps)) return;
        const fresh = tilesOf(body.apps, core);
        rememberApps(window.localStorage, accountId, fresh);
        setTiles(fresh);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [accountId, core]);
  const items = useMemo(() => appsLauncherItems(tiles ?? []), [tiles]);
  if (items.length === 0) return null;
  return <AppsLauncher items={items} aria-label="Apps" align="right" />;
}
