import { expect, type Page } from '@playwright/test';
import {
  PHONE,
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
 * Shopping mode, in a browser (task 7.3): journeys 6 and 7 of DESIGN.md §3 as §2.2 words them for 0.1.0. Opened from a list, the network is then cut for the
 * whole of it: large rows in aisle order, a tick dropping the row into In basket with Undo, adding (and "Already in basket"), a long press for the item,
 * Finish shopping clearing what was bought and going back, and another person's tick arriving when the device syncs. The screen's wake lock is asked for where
 * the browser has it and nothing breaks where it has not.
 */
async function inTheShop(
  page: Page,
  baseURL: string | undefined,
  items: Parameters<typeof seedItems>[1],
) {
  await signUp(page);
  const ids = await seedItems(page, items, baseURL ?? '');
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.getByRole('button', { name: 'Shop' }).click();
  await expect(page).toHaveURL(/\/shop\?h=[0-9a-f-]{36}&l=[0-9a-f-]{36}$/);
  await expect(page.getByRole('status').filter({ hasText: 'to get' })).toBeVisible();
  return ids;
}
const progress = (page: Page) => page.getByRole('status').filter({ hasText: 'to get' });

test('the screen is large rows in aisle order, with progress, and the footer is gone', async ({
  page,
  baseURL,
}) => {
  const violations = await recordViolations(page);
  await inTheShop(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs', quantity: '2', unit: 'L' },
    { name: 'Spinach', category: 'produce' },
    { name: 'Rice', category: 'pantry' },
  ]);
  await expect(progress(page)).toHaveText('3 to get · 0 in basket');
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings.filter((h) => ['Produce', 'Dairy & eggs', 'Pantry'].includes(h))).toEqual([
    'Produce',
    'Dairy & eggs',
    'Pantry',
  ]);
  for (const name of [/Spinach/, /Milk/, /Rice/]) {
    const box = await page.getByRole('checkbox', { name }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(56);
  }
  await expect(page.getByRole('listitem').filter({ hasText: 'Milk' })).toContainText('2 L');
  expect(await violations()).toEqual([]);
});

test('a tick drops the row into In basket with Undo, and the progress follows', async ({
  page,
  baseURL,
}) => {
  await inTheShop(page, baseURL, [
    { name: 'Spinach', category: 'produce' },
    { name: 'Bananas', category: 'produce' },
  ]);
  await page.getByRole('checkbox', { name: /Spinach/ }).click();
  await expect(progress(page)).toHaveText('1 to get · 1 in basket');
  const basket = page.getByRole('region', { name: 'In basket' });
  await expect(basket.getByRole('checkbox', { name: /Spinach/ })).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'In basket: Spinach' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(progress(page)).toHaveText('2 to get · 0 in basket');
  // Tapping a row in the basket puts it back on the list.
  await page.getByRole('checkbox', { name: /Spinach/ }).click();
  await basket.getByRole('checkbox', { name: /Spinach/ }).click();
  await expect(progress(page)).toHaveText('2 to get · 0 in basket');
});

test('with the network cut: tick, add, add straight into the basket, finish by clearing, and the server has it all when it is back', async ({
  page,
  context,
  baseURL,
}) => {
  await inTheShop(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs' },
    { name: 'Bread', category: 'bakery' },
  ]);
  await offline(context);
  await page.getByRole('checkbox', { name: /Milk/ }).click();
  const field = page.getByRole('combobox', { name: 'Add an item' });
  await field.focus();
  await page.keyboard.type('coffee');
  await page.keyboard.press('Enter');
  await expect(progress(page)).toHaveText('2 to get · 1 in basket');
  await page.getByLabel('Already in basket').check();
  await field.focus();
  await page.keyboard.type('apples');
  await page.keyboard.press('Enter');
  await expect(progress(page)).toHaveText('2 to get · 2 in basket');
  await expect(
    page.getByRole('region', { name: 'In basket' }).getByRole('checkbox', { name: /apple/i }),
  ).toBeChecked();

  await page.getByRole('button', { name: 'Finish shopping' }).click();
  await expect(page.getByText('Clear 2 bought items from Groceries?')).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();
  // Back on the list, with the bought items gone from it, and no network yet.
  await expect(page).toHaveURL(/^[^?]*$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Bread/ })).toBeVisible();

  await online(context);
  await expect
    .poll(
      async () =>
        (await serverItems(page, baseURL ?? '')).filter((i) => i.clearedAt !== null).length,
      { timeout: 30_000 },
    )
    .toBe(2);
});

test('Keep leaves what was bought on the list, and leaving without finishing changes nothing', async ({
  page,
  baseURL,
}) => {
  await inTheShop(page, baseURL, [{ name: 'Milk', category: 'dairy-eggs' }]);
  await page.getByRole('checkbox', { name: /Milk/ }).click();
  await page.getByRole('button', { name: 'Back to Groceries' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bought \(1\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Shop' }).click();
  await page.getByRole('button', { name: 'Finish shopping' }).click();
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByRole('button', { name: /Bought \(1\)/ })).toBeVisible();
});

test('a long press opens the item, and another person’s tick shows when the device syncs', async ({
  page,
  baseURL,
}) => {
  const [milk] = await inTheShop(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs' },
    { name: 'Coffee', category: 'pantry' },
  ]);
  const row = page.getByRole('checkbox', { name: /Coffee/ });
  await row.evaluate(async (element) => {
    const init = { bubbles: true, pointerType: 'touch', pointerId: 9, isPrimary: true };
    element.dispatchEvent(new PointerEvent('pointerdown', init));
    await new Promise((resolve) => setTimeout(resolve, 700));
    element.dispatchEvent(new PointerEvent('pointerup', init));
  });
  await expect(page.getByRole('dialog', { name: /Item: Coffee/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // Someone else ticks Milk on the server; this device pulls while the screen is open.
  const account = await accountOf(page);
  const [member] = await deviceRows<{ personId: string }>(page, account, 'member');
  const [household] = await deviceRows<{ id: string }>(page, account, 'household');
  const reply = await page.request.post('/api/sync', {
    headers: { origin: baseURL ?? '', 'content-type': 'application/json' },
    data: {
      version: 1,
      outbox: [
        {
          mutationId: crypto.randomUUID(),
          householdId: household?.id,
          changes: [
            {
              table: 'item',
              id: milk,
              fields: { boughtAt: Date.now(), boughtBy: member?.personId },
            },
          ],
        },
      ],
      cursors: {},
    },
  });
  expect(reply.ok()).toBe(true);
  await expect(progress(page)).toHaveText('1 to get · 1 in basket', { timeout: 30_000 });
});

test('the wake lock is asked for where the browser has it, and nothing breaks where it has not', async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk' }], baseURL ?? '');
  await page.addInitScript(() => {
    (window as unknown as { __locks: number }).__locks = 0;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          (window as unknown as { __locks: number }).__locks += 1;
          return { release: async () => undefined };
        },
      },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Shop' }).click();
  await expect(progress(page)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __locks: number }).__locks))
    .toBeGreaterThan(0);

  // A browser with none.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
  });
  await page.reload();
  await expect(progress(page)).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the footer is hidden, nothing scrolls sideways, and Finish shopping is reachable', async ({
    page,
    baseURL,
  }) => {
    await inTheShop(page, baseURL, [{ name: 'Milk', category: 'dairy-eggs' }]);
    await expect(page.locator('footer').getByRole('button', { name: 'Lists' })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'Finish shopping' })).toBeInViewport();
  });
});
