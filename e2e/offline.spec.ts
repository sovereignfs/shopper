import { expect, type Page } from '@playwright/test';
import {
  accountOf,
  deviceRows,
  offline,
  online,
  recordViolations,
  seedItems,
  serverItems,
  signUp,
  test,
} from './helpers';

/**
 * Opening offline, in a browser (task 6.5): after a first visit, with the network gone, Shopper still opens at a list, at its settings and in shopping mode
 * from the address, shows the items, accepts changes that reach the server when the network is back, says so for a page that needs the server, and opens for
 * no one once the person has signed out. Chromium's: offline emulation with a service worker is its own.
 */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'offline emulation with a worker is Chromium’s',
);

/** Waits until the worker is active and has the page, which a first worker does not take until the page is loaded again. */
async function controlled(page: Page): Promise<void> {
  await page.evaluate(async () => void (await navigator.serviceWorker.ready));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

async function listIdOf(page: Page): Promise<string> {
  const account = await accountOf(page);
  const [list] = await deviceRows<{ id: string }>(page, account, 'list');
  if (!list) throw new Error('no list on the device');
  return list.id;
}

async function ready(page: Page, baseURL: string | undefined) {
  await signUp(page);
  const ids = await seedItems(
    page,
    [
      { name: 'Milk', category: 'dairy-eggs' },
      { name: 'Spinach', category: 'produce' },
    ],
    baseURL ?? '',
  );
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeVisible();
  // Every screen is visited once online, as a first visit is.
  const list = await listIdOf(page);
  await page.goto(`/l/${list}`);
  await controlled(page);
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeVisible();
  return { ids, list };
}

test('a list opened from its address with no network shows its items and takes changes, which reach the server when it is back', async ({
  page,
  context,
  baseURL,
}) => {
  const violations = await recordViolations(page);
  const { ids, list } = await ready(page, baseURL);
  await offline(context);
  await page.goto(`/l/${list}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Spinach/ })).toBeVisible();

  await page.getByRole('checkbox', { name: /Milk/ }).click();
  await expect(page.getByRole('button', { name: /Bought \(1\)/ })).toBeVisible();
  const field = page.getByRole('combobox', { name: 'Add an item' });
  await field.focus();
  await page.keyboard.type('coffee');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: /Coffee/i })).toBeVisible();

  await online(context);
  await expect
    .poll(
      async () => {
        const items = await serverItems(page, baseURL ?? '');
        return [
          items.find((item) => item.id === ids[0])?.boughtAt != null,
          items.some((item) => item.name.toLowerCase().includes('coffee')),
        ];
      },
      { timeout: 30_000 },
    )
    .toEqual([true, true]);
  expect(await violations()).toEqual([]);
});

test('the front address, a list’s settings and shopping mode open with no network', async ({
  page,
  context,
  baseURL,
}) => {
  const { list } = await ready(page, baseURL);
  await offline(context);

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('checkbox', { name: /Spinach/ })).toBeVisible();

  await page.goto(`/l/${list}/settings`);
  await expect(page.getByRole('textbox', { name: /name/i }).first()).toHaveValue('Groceries', {
    timeout: 15_000,
  });

  await page.goto(`/shop?h=00000000-0000-4000-8000-000000000000&l=${list}`);
  await expect(page.getByRole('status').filter({ hasText: 'to get' })).toHaveText(
    '2 to get · 0 in basket',
    { timeout: 15_000 },
  );
  await page.getByRole('checkbox', { name: /Spinach/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'to get' })).toHaveText(
    '1 to get · 1 in basket',
  );
  await online(context);
  await expect
    .poll(async () => (await serverItems(page, baseURL ?? '')).filter((i) => i.boughtAt).length, {
      timeout: 30_000,
    })
    .toBe(1);
});

test('a page that needs the server says so, with no network', async ({
  page,
  context,
  baseURL,
}) => {
  await ready(page, baseURL);
  await offline(context);
  await page.goto('/settings').catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'This needs a connection' })).toBeVisible();
});

test('after signing out the shell opens for no one', async ({ page, context, baseURL }) => {
  const { list } = await ready(page, baseURL);
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => window.localStorage.getItem('shopper.me'))).toBeNull();
  await offline(context);
  await page.goto(`/l/${list}`);
  await expect(page.getByText('Sign in to use Shopper')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Milk')).toHaveCount(0);
});
