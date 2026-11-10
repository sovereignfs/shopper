import { expect, type Page } from '@playwright/test';
import { offline, online, signUp, test } from './helpers';

/**
 * The app as an installed one (task 1.12): a manifest a browser accepts, icons of each size, a service worker that takes control, **a cache that holds only
 * the allow-list after a signed-in tour**, and a page that says so when there is no network. Whether the app installs is asked of Chromium itself.
 */
const ALLOWED =
  /^\/(shell|_next\/static\/.+|icon\.svg|favicon\.ico|manifest\.webmanifest|icons\/[a-z0-9._-]+)$/;

/** Waits until the worker is active, then reloads so that the page is controlled by it (a first worker does not take over the page that registered it). */
async function controlled(page: Page): Promise<void> {
  await page.evaluate(async () => void (await navigator.serviceWorker.ready));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

/** What the worker's caches hold, as `cache name` and path. */
const kept = (page: Page) =>
  page.evaluate(async () => {
    const out: { cache: string; path: string }[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        out.push({ cache: name, path: new URL(request.url).pathname });
    return out;
  });

const pngSize = (bytes: Buffer) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

test('the manifest names the app, opens it as an app, and has an icon of each size, one that can be cut to a shape', async ({
  page,
  request,
}) => {
  await page.goto('/sign-in');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    name: string;
    display: string;
    start_url: string;
    scope: string;
    theme_color: string;
    icons: { src: string; sizes: string; type: string; purpose: string }[];
  };
  expect(manifest).toMatchObject({
    name: 'Shopper',
    display: 'standalone',
    start_url: '/',
    scope: '/',
  });
  expect(manifest.icons.map((icon) => icon.purpose).sort()).toEqual(['any', 'any', 'maskable']);
  for (const icon of manifest.icons) {
    const reply = await request.get(icon.src);
    expect(reply.status(), icon.src).toBe(200);
    expect(reply.headers()['content-type']).toBe('image/png');
    const [side] = icon.sizes.split('x').map(Number);
    expect(pngSize(await reply.body()), icon.src).toEqual({ width: side, height: side });
  }
  const touch = await request.get(
    (await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')) ?? '',
  );
  expect(pngSize(await touch.body())).toEqual({ width: 180, height: 180 });
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    'content',
    '#18181b',
  );
});

test('Chromium finds nothing in the way of installing it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'asks Chromium’s own installability check');
  await page.goto('/sign-in');
  await controlled(page);
  const session = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await session.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(installabilityErrors).toEqual([]);
});

test('the worker serves the same text to everyone, with the build’s files and no one’s data', async ({
  request,
}) => {
  const reply = await request.get('/sw.js');
  expect(reply.status()).toBe(200);
  expect(reply.headers()['content-type']).toContain('javascript');
  expect(reply.headers()['cache-control']).toContain('no-cache');
  const text = await reply.text();
  expect(text).toContain('/_next/static/');
  expect(text).toContain('shopper-shell-');
  expect(text).not.toMatch(/@example\.com/);
});

test('after a signed-in tour the cache holds the shell, the build’s files and the icons, and nothing else', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/home');
  await controlled(page);
  // Ending on a page that stays where it is: `/sign-in` sends a signed-in person on, and a question asked of a page that is leaving has no answer.
  for (const path of ['/', '/settings?section=device', '/settings']) await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.evaluate(() => fetch('/api/auth/get-session'));
  await page.evaluate(() =>
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  const held = await kept(page);
  expect(held.length).toBeGreaterThan(2);
  expect(held.every((entry) => entry.cache.startsWith('shopper-shell-'))).toBe(true);
  expect(held.map((entry) => entry.path).filter((path) => !ALLOWED.test(path))).toEqual([]);
  expect(held.map((entry) => entry.path)).toContain('/shell');
});

test('with no network a page says that it needs one, and shows nothing of the person', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'offline emulation with a worker is Chromium’s');
  const email = await signUp(page);
  await page.goto('/home');
  await controlled(page);
  await offline(context);
  await page.goto('/settings').catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'This needs a connection' })).toBeVisible();
  await expect(page.getByText(email)).toHaveCount(0);
  await online(context);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});
