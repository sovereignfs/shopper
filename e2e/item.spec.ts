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
 * An item's dialog, in a browser (task 8.4): the pencil is a target of its own (a tick is the row), the dialog is at `?item=<id>`, every field saves on the
 * device with the network cut and reaches the server, "Remember for next time" changes the next add, Delete has Undo, and on a phone it is the whole screen
 * and the keyboard reaches everything.
 */
const dialog = (page: Page) => page.getByRole('dialog');
const synced = async (page: Page) => {
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 15_000 })
    .toBe(0);
};

async function signedUpWith(
  page: Page,
  baseURL: string | undefined,
  items: Parameters<typeof seedItems>[1],
) {
  await signUp(page);
  const ids = await seedItems(page, items, baseURL ?? '');
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  return ids;
}

test('the pencil opens the item at its address and does not tick it; every field saves, and the server has them', async ({
  page,
  baseURL,
}) => {
  const violations = await recordViolations(page);
  const [milk] = await signedUpWith(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs', quantity: '1', unit: 'L' },
  ]);
  await page.getByRole('button', { name: 'Edit Milk' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?item=${milk}$`));
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Milk/ })).not.toBeChecked();

  await dialog(page).getByLabel('Name').fill('Oat milk');
  await dialog(page)
    .getByRole('button', { name: /increase|more|\+/i })
    .click();
  await dialog(page).getByLabel('Unit').selectOption('bottle');
  await dialog(page).getByLabel('Category').selectOption({ label: 'Pantry' });
  await dialog(page).getByLabel('Note').fill('barista edition\nnot the sweet one');
  await dialog(page).getByRole('button', { name: 'Save' }).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/^[^?]*$/);
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('checkbox', { name: /Oat milk/ }) });
  await expect(row).toContainText('2 bottle');
  await expect(row).toContainText('barista edition');
  await synced(page);
  const saved = (await serverItems(page, baseURL ?? '')).find((item) => item.id === milk);
  expect(saved).toMatchObject({
    name: 'Oat milk',
    quantity: '2',
    unit: 'bottle',
    note: 'barista edition\nnot the sweet one',
  });
  expect(saved?.categoryId).not.toBeNull();
  expect(await violations()).toEqual([]);
});

test('saving with the network cut changes the device at once, and the server has it when it is back', async ({
  page,
  context,
  baseURL,
}) => {
  const [rice] = await signedUpWith(page, baseURL, [{ name: 'Rice', category: 'pantry' }]);
  await offline(context);
  await page.getByRole('button', { name: 'Edit Rice' }).click();
  await dialog(page).getByLabel('Note').fill('basmati');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('basmati')).toBeVisible();
  await online(context);
  await expect
    .poll(
      async () => (await serverItems(page, baseURL ?? '')).find((item) => item.id === rice)?.note,
      { timeout: 30_000 },
    )
    .toBe('basmati');
});

test('"Remember for next time" teaches the product, so that the next add comes right', async ({
  page,
  baseURL,
}) => {
  await signedUpWith(page, baseURL, [{ name: 'Zorblax' }]);
  await page.getByRole('button', { name: 'Edit Zorblax' }).click();
  await dialog(page).getByLabel('Category').selectOption({ label: 'Pantry' });
  await dialog(page).getByLabel('Unit').selectOption('jar');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await synced(page);
  // Delete it, then add it again: it comes back in Pantry, in jars.
  await page.getByRole('button', { name: 'Edit Zorblax' }).click();
  await dialog(page).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('checkbox', { name: /Zorblax/ })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Add an item' }).focus();
  await page.keyboard.type('zorblax');
  await page.keyboard.press('Enter');
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('checkbox', { name: /Zorblax/ }) });
  await expect(row).toContainText('jar');
  await expect(page.getByRole('region', { name: 'Pantry' })).toContainText('Zorblax');
});

test('Delete takes the item off at once, and Undo brings it back', async ({ page, baseURL }) => {
  await signedUpWith(page, baseURL, [{ name: 'Bread', category: 'bakery' }]);
  await page.getByRole('button', { name: 'Edit Bread' }).click();
  await dialog(page).getByRole('button', { name: 'Delete' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Bread/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('checkbox', { name: /Bread/ })).toBeVisible();
});

test('an item of another list or one that is gone closes the dialog, and Escape closes it', async ({
  page,
  baseURL,
}) => {
  await signedUpWith(page, baseURL, [{ name: 'Tea', category: 'drinks' }]);
  await page.goto(`${page.url().split('?')[0]}?item=00000000-0000-4000-8000-000000000000`);
  await expect(page.getByRole('checkbox', { name: /Tea/ })).toBeVisible({ timeout: 15_000 });
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/^[^?]*$/);
  await page.getByRole('button', { name: 'Edit Tea' }).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the dialog is the whole screen, nothing scrolls sideways, and the keyboard reaches Save', async ({
    page,
    baseURL,
  }) => {
    await signedUpWith(page, baseURL, [{ name: 'Milk', category: 'dairy-eggs' }]);
    await page.getByRole('button', { name: 'Edit Milk' }).click();
    const box = await dialog(page).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(PHONE.width - 1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await dialog(page).getByLabel('Name').focus();
    await dialog(page).getByLabel('Name').fill('Whole milk');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /Whole milk/ })).toBeVisible();
  });
});
