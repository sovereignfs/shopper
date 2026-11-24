import { expect, type Page } from '@playwright/test';
import { PHONE, accountOf, deviceRows, signUp, test } from './helpers';

/**
 * The frame (task 22.11, RFC 0005): `@sovereignfs/ui`'s `AppFrame` with Shopper's wordmark, blocks and menu. The sidebar is full, a rail of list icons or hidden, as the
 * person left it **for that kind of page** on this device; a choice kept before the frame was the design system's is carried across; a page for no one in particular has the
 * header and the page; the footer on a phone is not drawn in shopping mode. Lists, the drawer and the footer's places are in `lists.spec.ts` and `phone.spec.ts`.
 */
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Shopper' });
const listId = async (page: Page): Promise<string> => {
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'list')).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  return ((await deviceRows<{ id: string }>(page, account, 'list'))[0] ?? { id: '' }).id;
};
const widthOf = async (page: Page) => (await sidebar(page).boundingBox())?.width ?? 0;

test('the sidebar is full, a rail of list icons or hidden, and each choice is kept for the kind of page it was made on', async ({
  page,
}) => {
  await signUp(page);
  const list = await listId(page);
  await expect(sidebar(page).getByRole('link', { name: /Groceries/ })).toBeVisible({
    timeout: 15_000,
  });
  const full = await widthOf(page);
  expect(full).toBeGreaterThan(200);

  // A rail: the icons alone, each named by its list, and narrow.
  await page.getByRole('button', { name: 'Narrow the sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Widen the sidebar' })).toBeVisible();
  await expect(sidebar(page).getByRole('link', { name: 'Groceries' })).toBeVisible();
  expect(await widthOf(page)).toBeLessThan(100);
  await expect(sidebar(page).getByRole('link', { name: 'Groceries' }).locator('svg')).toBeVisible();

  // Kept for the front address, on a reload, and not for another kind of page.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Widen the sidebar' })).toBeVisible();
  await page.goto(`/l/${list}`);
  await expect(page.getByRole('button', { name: 'Narrow the sidebar' })).toBeVisible();
  expect(await widthOf(page)).toBeGreaterThan(200);

  // Hidden from the header's button, and shown again as it was.
  await page.getByRole('button', { name: 'Hide the sidebar' }).click();
  await expect(sidebar(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show the sidebar' })).toBeVisible();
  await expect(sidebar(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the sidebar' }).click();
  await expect(sidebar(page).getByRole('link', { name: /Groceries/ })).toBeVisible();
  expect(await widthOf(page)).toBeGreaterThan(200);
});

test('what the sidebar was kept as before the frame was the design system’s is carried across, once', async ({
  page,
}) => {
  await signUp(page);
  const list = await listId(page);
  await page.evaluate(() => {
    window.localStorage.removeItem('sv.sidebar.shopper');
    window.localStorage.setItem(
      'shopper.sidebar',
      JSON.stringify({ page: { state: 'hidden', shown: 'rail' } }),
    );
  });
  await page.goto(`/l/${list}`);
  await expect(page.getByRole('button', { name: 'Show the sidebar' })).toBeVisible();
  await expect(sidebar(page)).toHaveCount(0);
  const kept = await page.evaluate(() => [
    window.localStorage.getItem('shopper.sidebar'),
    window.localStorage.getItem('sv.sidebar.shopper'),
  ]);
  expect(kept[0]).toBeNull();
  expect(kept[1]).toContain('"hidden"');
});

test('a page for no one in particular has the header with the wordmark and the page, and no sidebar', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Shopper' })).toBeVisible();
  await expect(sidebar(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hide the sidebar' })).toHaveCount(0);
  await page.goto('/there-is-no-such-page');
  await expect(page.getByRole('heading', { name: 'That is not here' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Shopper' })).toBeVisible();
});

test('running alone there is no launcher, and no route to ask core for one', async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apps' })).toHaveCount(0);
  // The route is not there without a core, for a person who is signed in; for no one it is a refusal.
  expect((await page.request.get('/api/account/apps')).status()).toBe(404);
});

test('the wordmark goes home without leaving the page', async ({ page }) => {
  await signUp(page);
  const list = await listId(page);
  await page.goto(`/l/${list}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));
  await page.getByRole('banner').getByRole('link', { name: 'Shopper' }).click();
  await expect(page).toHaveURL(/\/$/);
  // A client navigation: the page was not loaded again.
  expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('there is no sidebar button, the header opens the drawer, and shopping mode has no footer', async ({
    page,
  }) => {
    await signUp(page);
    const list = await listId(page);
    await expect(page.getByRole('button', { name: 'Hide the sidebar' })).toHaveCount(0);
    await expect(sidebar(page)).toHaveCount(0);
    await page.goto(`/l/${list}`);
    await expect(page.getByRole('navigation', { name: 'App navigation' })).toBeVisible();
    await page.goto(`/shop?h=x&l=${list}`);
    await expect(page.getByRole('navigation', { name: 'App navigation' })).toHaveCount(0);
  });
});
