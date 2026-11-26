import { serviceWorkerSource } from '@sovereignfs/pwa';
import { SYNC_MESSAGE, SYNC_TAG } from './shared';

export { SYNC_MESSAGE, SYNC_TAG };

/**
 * The service worker (DESIGN.md §16.11), as the text served at `/sw.js`: **`@sovereignfs/pwa`'s**, the one every app of the suite runs (task 17.2). It is
 * a string and not a module because a worker is its own script, with no bundler between it and the browser, so that a test evaluates the very text that
 * is served.
 *
 * **What it keeps, and nothing else** (the package's allow-list): the build's own files under `/_next/static/`, the icons and the manifest, and **the one
 * shell page, `/shell`**, which holds nothing of a person. Only plain answers of this origin with no query, no `Authorization` and no cookie. Every API
 * answer, every list and every page with a person's data goes to the network and is never stored: **no data is ever in a cache**, it is in IndexedDB,
 * named for the account and deleted at sign-out.
 *
 * **With no network,** every navigation is answered with the kept shell page, which carries the policy and the nonce it was sent with. The shell
 * chooses the screen from the address and says that anything else needs a connection (`answersOffline`, `OfflineApp`). Without a kept shell, the
 * package's own page says so. A new version waits until a page asks it to take over, which Shopper's never does, so what is in flight and the outbox
 * are not disturbed.
 *
 * **Background Sync** (DESIGN.md §12.3), the package's: where the browser has it, it wakes the worker when a connection is back after a write made without
 * one, and the worker tells the pages that are open to sync, which they do through their own loop. A worker has none of the working copy's code, so with
 * every page closed the changes wait for the next time Shopper is opened.
 */
export const CACHE_PREFIX = 'shopper-shell-';

/** The worker of a production build, for `version` (Next's build id), keeping `files` (the build's static files) at install. */
export function workerSource(
  version: string,
  files: readonly string[] = [],
  /** Whether Shopper sends pushes (RFC 0002): only then does the worker show them. A push says what happened and who did it, never a name. */
  push = false,
): string {
  return serviceWorkerSource({
    version,
    cachePrefix: CACHE_PREFIX,
    precache: files,
    shell: '/shell',
    sync: { tags: [SYNC_TAG], message: SYNC_MESSAGE },
    ...(push ? { push: { name: 'Shopper', icon: '/icons/icon-192.png' } } : {}),
  });
}

/**
 * The worker for a server that is not a production build (\`next dev\`): it keeps nothing, and removes itself and the caches of any other. A worker that kept
 * files there would show yesterday's code, since a development server's files do not change their names when they change.
 */
export function inertWorkerSource(): string {
  return `'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(${JSON.stringify(CACHE_PREFIX)})).map((name) => caches.delete(name))))
      .then(() => self.registration.unregister()),
  );
});
`;
}
