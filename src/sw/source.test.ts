import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  CACHE_PREFIX,
  SHELL_ADDRESSES,
  SYNC_MESSAGE,
  SYNC_TAG,
  inertWorkerSource,
  workerSource,
} from './source';

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

function load(
  version = 'v1',
  files: readonly string[] = FILES,
  shellAddresses: readonly string[] = [],
) {
  const stores = new Map<string, Map<string, Response>>();
  const requested: string[] = [];
  const state = { online: true };
  /** What the network says: the shell for `/shell`, files for the build and the icons, a person's data for an API, and a page of a person for anything else. */
  const network = async (input: Request | string): Promise<Response> => {
    const request = typeof input === 'string' ? new Request(`${ORIGIN}${input}`) : input;
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
      (typeof r === 'string' ? new Request(`${ORIGIN}${r}`) : r).url;
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
  const self = {
    location: { origin: ORIGIN },
    clients,
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
  });
  vm.runInContext(workerSource(version, files, shellAddresses), context);

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
  return { dispatch, fetchEvent, kept, stores, state, requested, listeners, woken };
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
  it('answers a page with the one it builds itself: no script, a policy that allows none, nothing of a person, and not stored', async () => {
    const w = load();
    await w.dispatch('install');
    const before = w.kept();
    w.state.online = false;
    const page = await w.fetchEvent('/l/11111111-1111-4111-8111-111111111111', {
      mode: 'navigate',
    });
    const html = (await page?.text()) ?? '';
    expect(page?.status).toBe(200);
    expect(page?.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html).toContain('needs a connection');
    expect(html).not.toMatch(/<script/i);
    expect(w.kept()).toEqual(before);
  });

  it('answers the addresses it is given with the kept shell, as it was sent, and every other with the page that says so', async () => {
    const w = load('v1', FILES, ['^/$', '^/l/[0-9a-f-]{36}$']);
    await w.dispatch('install');
    w.state.online = false;
    const shell = await w.fetchEvent('/l/11111111-1111-4111-8111-111111111111', {
      mode: 'navigate',
    });
    expect(await shell?.text()).toContain('the shell, for everyone');
    expect(shell?.headers.get('content-security-policy')).toBe("script-src 'nonce-ABC'");
    expect(await (await w.fetchEvent('/', { mode: 'navigate' }))?.text()).toContain('the shell');
    expect(await (await w.fetchEvent('/settings', { mode: 'navigate' }))?.text()).toContain(
      'needs a connection',
    );
    expect((await (await w.fetchEvent('/api/sync'))?.text()) ?? '').toBe('');
  });

  it('answers every signed-in screen of the app with the shell with no network, and the pages that need the server with the page that says so', async () => {
    const w = load('v1', FILES, SHELL_ADDRESSES);
    await w.dispatch('install');
    w.state.online = false;
    const list = '11111111-1111-4111-8111-111111111111';
    for (const path of ['/', '/home', `/l/${list}`, `/l/${list}/settings`, '/shop'])
      expect(await (await w.fetchEvent(path, { mode: 'navigate' }))?.text(), path).toContain(
        'the shell, for everyone',
      );
    for (const path of [
      '/settings',
      '/sign-in',
      '/sign-up',
      '/l/not-an-id',
      `/l/${list}/other`,
      '/shell/x',
    ])
      expect(await (await w.fetchEvent(path, { mode: 'navigate' }))?.text(), path).toContain(
        'needs a connection',
      );
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

describe('the worker’s wake-up and its handover', () => {
  it('tells the pages that are open to sync when the browser wakes it for Background Sync, and ignores any other tag', async () => {
    const w = load();
    await w.dispatch('sync', { tag: 'something-else' });
    expect(w.woken).toEqual([]);
    await w.dispatch('sync', { tag: SYNC_TAG });
    expect(w.woken).toEqual([{ type: SYNC_MESSAGE }]);
  });

  it('waits for the pages using the old version to close: it never takes over by itself', () => {
    expect(workerSource('v1', FILES)).not.toContain('skipWaiting');
    expect(workerSource('v1', FILES)).not.toContain('clients.claim');
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
