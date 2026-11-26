import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { TAKE_OVER_MESSAGE } from '@sovereignfs/pwa';
import { answersOffline } from './shared';
import { CACHE_PREFIX, SYNC_MESSAGE, SYNC_TAG, inertWorkerSource, workerSource } from './source';

/**
 * The service worker (DESIGN.md §16.11): **what it keeps is an allow-list, and nothing else gets in.** This evaluates the very text that is served, with a
 * cache and a network that the test controls, and looks at what is in the cache after everything a signed-in person does: no page with a person's data, no
 * answer from an API, no list.
 */
const ORIGIN = 'https://shopper.test';
const FILES = [
  '/_next/static/chunks/a.js',
  '/_next/static/chunks/b.css',
  '/_next/static/media/font.woff2',
];
const SHELL_HEADERS = {
  'content-type': 'text/html',
  'content-security-policy': "script-src 'nonce-ABC'",
};

interface Listener {
  (event: Record<string, unknown>): void;
}

function load(version = 'v1', files: readonly string[] = FILES) {
  const stores = new Map<string, Map<string, Response>>();
  const requested: string[] = [];
  const state = { online: true };
  /** What the network says: the shell for `/shell`, files for the build and the icons, a person's data for an API, and a page of a person for anything else. */
  /** As a browser gives it: an answer of the page's own origin is `basic`, the only kind the worker keeps (Node's say `default`). */
  const basic = (response: Response) => Object.defineProperty(response, 'type', { value: 'basic' });
  const network = async (input: Request | string): Promise<Response> => basic(await answer(input));
  const answer = async (input: Request | string): Promise<Response> => {
    const request =
      typeof input === 'string'
        ? new Request(input.startsWith('http') ? input : `${ORIGIN}${input}`)
        : input;
    const path = new URL(request.url).pathname;
    requested.push(path);
    if (!state.online) throw new TypeError('no network');
    if (path === '/shell')
      return new Response('<html>the shell, for everyone</html>', { headers: SHELL_HEADERS });
    if (/^\/(icons\/|manifest\.webmanifest|icon\.svg|favicon\.ico)/.test(path))
      return new Response('an icon', { headers: { 'content-type': 'image/png' } });
    if (path.startsWith('/_next/static/'))
      return new Response('file', { headers: { 'content-type': 'text/javascript' } });
    if (path.startsWith('/api/'))
      return new Response('{"name":"Ada","email":"ada@example.com"}', {
        headers: { 'content-type': 'application/json' },
      });
    return new Response(`<html>Ada Lovelace, ada@example.com ${path}</html>`, {
      headers: { 'content-type': 'text/html' },
    });
  };
  const cacheOf = (name: string) => {
    let store = stores.get(name);
    if (!store) stores.set(name, (store = new Map()));
    const keyOf = (r: Request | string) =>
      (typeof r === 'string' ? new Request(r.startsWith('http') ? r : `${ORIGIN}${r}`) : r).url;
    return {
      match: async (r: Request | string) => store.get(keyOf(r))?.clone(),
      put: async (r: Request | string, response: Response) => void store.set(keyOf(r), response),
      add: async (r: Request | string) => {
        const request = typeof r === 'string' ? new Request(`${ORIGIN}${r}`) : r;
        const response = await network(request);
        if (!response.ok) throw new TypeError('not ok');
        store.set(keyOf(request), response);
      },
    };
  };
  const listeners: Record<string, Listener> = {};
  const woken: unknown[] = [];
  const clients = {
    matchAll: async () => [
      { url: `${ORIGIN}/`, postMessage: (message: unknown) => void woken.push(message) },
    ],
  };
  const took = { over: false };
  const self = {
    location: { origin: ORIGIN },
    clients: { ...clients, claim: async () => undefined },
    skipWaiting: () => void (took.over = true),
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
  };
  const context = vm.createContext({
    self,
    caches: {
      open: async (name: string) => cacheOf(name),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
    fetch: network,
    Request,
    Response,
    URL,
    RegExp,
    TypeError,
    Promise,
    JSON,
    Math,
    Array,
    Object,
    String,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(workerSource(version, files), context);

  /** Fires an event and settles what it asked to wait for. */
  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    listeners[type]?.({
      ...extra,
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
      respondWith: (p: Promise<Response>) => void (answer = p),
    });
    // What it answers first, and then what it asked to wait for, which it may only ask once it has the answer.
    const response = answer ? await answer : undefined;
    await Promise.all(waits);
    return response;
  }
  const fetchEvent = (
    path: string,
    init: { mode?: string; method?: string; origin?: string } = {},
  ) => {
    const request = new Request(`${init.origin ?? ORIGIN}${path}`, {
      method: init.method ?? 'GET',
    });
    Object.defineProperty(request, 'mode', { value: init.mode ?? 'cors' });
    return dispatch('fetch', { request });
  };
  const kept = () =>
    [...stores.entries()].flatMap(([name, store]) =>
      [...store.keys()].map((url) => `${name} ${new URL(url).pathname}`),
    );
  return { dispatch, fetchEvent, kept, stores, state, requested, listeners, woken, took };
}

const allowed = (path: string) =>
  path === '/shell' ||
  path.startsWith('/_next/static/') ||
  /^\/(icon\.svg|favicon\.ico|manifest\.webmanifest|icons\/[a-z0-9._-]+)$/.test(path);

describe('the worker’s cache', () => {
  it('holds, once installed, the shell and the build’s files, in a cache named for the version', async () => {
    const w = load('v7');
    await w.dispatch('install');
    expect([...w.stores.keys()]).toEqual([`${CACHE_PREFIX}v7`]);
    expect(
      w
        .kept()
        .map((entry) => entry.split(' ')[1])
        .sort(),
    ).toEqual(['/shell', ...FILES].sort());
  });

  it('keeps nothing of a person after a signed-in tour of lists, shopping, Settings and the APIs', async () => {
    const w = load();
    await w.dispatch('install');
    const tour: [string, { mode?: string }][] = [
      ['/', { mode: 'navigate' }],
      ['/l/11111111-1111-4111-8111-111111111111?view=added', { mode: 'navigate' }],
      ['/shop/11111111-1111-4111-8111-111111111111', { mode: 'navigate' }],
      ['/lists', { mode: 'navigate' }],
      ['/catalog', { mode: 'navigate' }],
      ['/settings?section=device', { mode: 'navigate' }],
      ['/sign-in', { mode: 'navigate' }],
      ['/join/' + 'A'.repeat(43), { mode: 'navigate' }],
      ['/l/11111111-1111-4111-8111-111111111111?_rsc=abc', {}],
      ['/l/11111111-1111-4111-8111-111111111111', {}],
      ['/lists', {}],
      ['/api/sync', {}],
      ['/api/ops', {}],
      ['/api/auth/get-session', {}],
      ['/_next/static/chunks/other.js', {}],
      ['/icons/icon-192.png', {}],
      ['/manifest.webmanifest', {}],
    ];
    for (const [path, init] of tour) await w.fetchEvent(path, init);
    // Offline too: what is answered then is not stored either.
    w.state.online = false;
    for (const [path, init] of tour) await w.fetchEvent(path, init);
    const paths = w.kept().map((entry) => entry.split(' ')[1] ?? '');
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((path) => !allowed(path))).toEqual([]);
    for (const [, store] of w.stores)
      for (const response of store.values())
        expect(await response.clone().text()).not.toMatch(/Ada|ada@example/);
  });

  it('keeps a built file or an icon the first time it is fetched, and serves it from the cache after', async () => {
    const w = load();
    await w.dispatch('install');
    await w.fetchEvent('/icons/icon-192.png');
    expect(w.kept().some((entry) => entry.endsWith('/icons/icon-192.png'))).toBe(true);
    w.requested.length = 0;
    w.state.online = false;
    const offline = await w.fetchEvent('/icons/icon-192.png');
    expect(await offline?.text()).toBe('an icon');
    expect(w.requested).toEqual([]);
  });

  it('answers the file of a build it was not made for from the network and keeps it', async () => {
    const w = load('v1', []);
    await w.dispatch('install');
    expect(w.kept().map((entry) => entry.split(' ')[1])).toEqual(['/shell']);
    await w.fetchEvent('/_next/static/chunks/late.js');
    expect(w.kept().map((entry) => entry.split(' ')[1])).toContain('/_next/static/chunks/late.js');
  });

  it('removes the caches of other versions of itself when it takes over, and no one else’s', async () => {
    const w = load('v2');
    w.stores.set(`${CACHE_PREFIX}v1`, new Map());
    w.stores.set('another-app', new Map());
    await w.dispatch('install');
    await w.dispatch('activate');
    expect([...w.stores.keys()].sort()).toEqual(['another-app', `${CACHE_PREFIX}v2`]);
  });
});

describe('the worker with no network', () => {
  it('answers a page, before it has a shell, with the one it builds itself: no script, a policy that allows none, and not stored', async () => {
    const w = load();
    w.state.online = false;
    const page = await w.fetchEvent('/l/11111111-1111-4111-8111-111111111111', {
      mode: 'navigate',
    });
    const html = (await page?.text()) ?? '';
    expect(page?.status).toBe(503);
    expect(page?.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html).toContain('offline');
    expect(html).not.toMatch(/<script/i);
    expect(w.kept()).toEqual([]);
  });

  it('answers every page with the kept shell, as it was sent, and nothing that is not a page', async () => {
    const w = load();
    await w.dispatch('install');
    w.state.online = false;
    const list = '11111111-1111-4111-8111-111111111111';
    for (const path of [
      '/',
      '/home',
      `/l/${list}`,
      `/l/${list}/settings`,
      '/shop',
      '/inventory',
      '/cards',
      `/cards/${list}`,
      '/settings',
      '/sign-in',
    ]) {
      const page = await w.fetchEvent(path, { mode: 'navigate' });
      expect(await page?.text(), path).toContain('the shell, for everyone');
      expect(page?.headers.get('content-security-policy'), path).toBe("script-src 'nonce-ABC'");
    }
    expect((await (await w.fetchEvent('/api/sync'))?.text()) ?? '').toBe('');
  });

  it('is not asked about anything it does not keep: a write, another site, an API, a page request while online', async () => {
    const w = load();
    await w.dispatch('install');
    expect(await w.fetchEvent('/api/sync', { method: 'POST' })).toBeUndefined();
    expect(await w.fetchEvent('/x.js', { origin: 'https://elsewhere.test' })).toBeUndefined();
    expect(await w.fetchEvent('/api/sync')).toBeUndefined();
    const page = await w.fetchEvent('/lists', { mode: 'navigate' });
    expect(await page?.text()).toContain('/lists');
  });
});

describe('the shell with no network', () => {
  it('has a screen for every signed-in address, and says that any other needs a connection', () => {
    const list = '11111111-1111-4111-8111-111111111111';
    for (const path of [
      '/',
      '/home',
      `/l/${list}`,
      `/l/${list}/settings`,
      '/shop',
      '/inventory',
      '/cards',
      `/cards/${list}`,
    ])
      expect(answersOffline(path), path).toBe(true);
    for (const path of [
      '/settings',
      '/sign-in',
      '/sign-up',
      '/l/not-an-id',
      '/cards/not-an-id',
      '/cards/extra/segments',
      `/l/${list}/other`,
      '/shell',
      '/shell/x',
    ])
      expect(answersOffline(path), path).toBe(false);
  });
});

describe('the worker’s wake-up and its handover', () => {
  it('tells the pages that are open to sync when the browser wakes it for Background Sync, and ignores any other tag', async () => {
    const w = load();
    await w.dispatch('sync', { tag: 'something-else' });
    expect(w.woken).toEqual([]);
    await w.dispatch('sync', { tag: SYNC_TAG });
    // The package names the tag beside the type, which is what the page listens for (`src/local/background.ts`).
    expect(w.woken).toEqual([{ type: SYNC_MESSAGE, tag: SYNC_TAG }]);
  });

  it('waits for the pages using the old version to close: it takes over only when a page asks, which Shopper’s never do', async () => {
    const w = load();
    await w.dispatch('install');
    await w.dispatch('activate');
    expect(w.took.over).toBe(false);
    await w.dispatch('message', { data: 'something else' });
    expect(w.took.over).toBe(false);
    await w.dispatch('message', { data: TAKE_OVER_MESSAGE });
    expect(w.took.over).toBe(true);
  });

  it('is, for a server that is not a production build, one that keeps nothing and removes itself and its caches', async () => {
    const stores = new Map<string, boolean>([
      [`${CACHE_PREFIX}old`, true],
      ['another-app', true],
    ]);
    const listeners: Record<string, Listener> = {};
    let unregistered = false;
    let skipped = false;
    const context = vm.createContext({
      self: {
        skipWaiting: () => void (skipped = true),
        registration: { unregister: async () => void (unregistered = true) },
        addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
      },
      caches: {
        keys: async () => [...stores.keys()],
        delete: async (name: string) => stores.delete(name),
      },
      Promise,
    });
    vm.runInContext(inertWorkerSource(), context);
    listeners.install?.({});
    const waits: Promise<unknown>[] = [];
    listeners.activate?.({ waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    await Promise.all(waits);
    expect(skipped).toBe(true);
    expect(unregistered).toBe(true);
    expect([...stores.keys()]).toEqual(['another-app']);
    expect(inertWorkerSource()).not.toContain("'/shell'");
  });
});
