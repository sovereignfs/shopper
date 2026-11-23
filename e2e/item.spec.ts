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
 * An item beside its list, in a browser (tasks 8.4 and 22.6): a tap on the row or the pencil opens it at `?item=<id>` in the right column and a tick is the
 * checkbox alone, every field saves as it is left, on the device with the network cut, and reaches the server, "Remember for next time" changes the next add,
 * Delete has Undo, one item replaces another in the column, and on a phone it is a page of its own and the keyboard reaches everything.
 */
const panel = (page: Page) => page.getByRole('complementary', { name: /^Item:/ });
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

test('a tap on the row opens the item beside the list and does not tick it; every field saves as it is left, and the server has them', async ({
  page,
  baseURL,
}) => {
  const violations = await recordViolations(page);
  const [milk] = await signedUpWith(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs', quantity: '1', unit: 'L' },
    { name: 'Bread', category: 'bakery' },
  ]);
  await page.getByText('Milk', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`\\?item=${milk}$`));
  await expect(panel(page)).toBeVisible();
  // The list is still there beside it, narrower, and nothing was ticked.
  await expect(page.getByRole('checkbox', { name: /Bread/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Milk/ })).not.toBeChecked();
  await expect(panel(page).getByRole('button', { name: 'Save' })).toHaveCount(0);

  // Each is written as it is left: the name and the note when focus moves on, the rest at once.
  await panel(page).getByLabel('Name').fill('Oat milk');
  await panel(page).getByLabel('Name').press('Tab');
  await panel(page)
    .getByRole('button', { name: /increase|more|\+/i })
    .click();
  await panel(page).getByLabel('Unit').selectOption('bottle');
  await panel(page).getByLabel('Category').selectOption({ label: 'Pantry' });
  await panel(page).getByLabel('Note').fill('barista edition\nnot the sweet one');
  await panel(page).getByLabel('Note').blur();

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

  // Close puts the address back, and the list has the width again.
  await panel(page).getByRole('button', { name: 'Close the item' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page).toHaveURL(/^[^?]*$/);
  expect(await violations()).toEqual([]);
});

test('two items opened one after the other replace each other in the column', async ({
  page,
  baseURL,
}) => {
  const [milk, bread] = await signedUpWith(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs' },
    { name: 'Bread', category: 'bakery' },
  ]);
  await page.getByText('Milk', { exact: true }).click();
  await expect(panel(page)).toHaveAccessibleName('Item: Milk');
  const wide = await page.getByRole('checkbox', { name: /Bread/ }).boundingBox();
  await page.getByText('Bread', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`\\?item=${bread}$`));
  await expect(panel(page)).toHaveCount(1);
  await expect(panel(page)).toHaveAccessibleName('Item: Bread');
  await expect(panel(page).getByLabel('Name')).toHaveValue('Bread');
  expect(milk).not.toBe(bread);
  // The column is beside the list, which stays: the same row is not moved by opening another item.
  expect((await page.getByRole('checkbox', { name: /Bread/ }).boundingBox())?.y).toBe(wide?.y);
});

test('the pencil opens it for a keyboard, and closing it gives focus back to the pencil', async ({
  page,
  baseURL,
}) => {
  await signedUpWith(page, baseURL, [{ name: 'Milk', category: 'dairy-eggs' }]);
  const pencil = page.getByRole('button', { name: 'Edit Milk' });
  await pencil.focus();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Milk/ })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(pencil).toBeFocused();
});

test('saving with the network cut changes the device at once, and the server has it when it is back', async ({
  page,
  context,
  baseURL,
}) => {
  const [rice] = await signedUpWith(page, baseURL, [{ name: 'Rice', category: 'pantry' }]);
  await offline(context);
  await page.getByText('Rice', { exact: true }).click();
  await panel(page).getByLabel('Note').fill('basmati');
  await panel(page).getByLabel('Note').blur();
  await expect(page.getByText('basmati', { exact: true }).first()).toBeVisible();
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
  await panel(page).getByLabel('Category').selectOption({ label: 'Pantry' });
  await panel(page).getByLabel('Unit').selectOption('jar');
  await synced(page);
  // Delete it, then add it again: it comes back in Pantry, in jars.
  await panel(page).getByRole('button', { name: 'Delete' }).click();
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
  await panel(page).getByRole('button', { name: 'Delete' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Bread/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('checkbox', { name: /Bread/ })).toBeVisible();
});

test('an item of another list or one that is gone closes the column, and Escape closes it', async ({
  page,
  baseURL,
}) => {
  await signedUpWith(page, baseURL, [{ name: 'Tea', category: 'drinks' }]);
  await page.goto(`${page.url().split('?')[0]}?item=00000000-0000-4000-8000-000000000000`);
  await expect(page.getByRole('checkbox', { name: /Tea/ })).toBeVisible({ timeout: 15_000 });
  await expect(panel(page)).toHaveCount(0);
  await expect(page).toHaveURL(/^[^?]*$/);
  await page.getByRole('button', { name: 'Edit Tea' }).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the item is a page of its own in place of the list, nothing scrolls sideways, and a field is saved as it is left', async ({
    page,
    baseURL,
  }) => {
    await signedUpWith(page, baseURL, [{ name: 'Milk', category: 'dairy-eggs' }]);
    await page.getByText('Milk', { exact: true }).click();
    const box = await panel(page).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(PHONE.width - 1);
    // In place of the list: its heading and rows are not on the page.
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await panel(page).getByLabel('Name').fill('Whole milk');
    await panel(page).getByLabel('Name').press('Enter');
    // A back arrow at the left, in place of the column's X.
    await expect(panel(page).getByRole('button', { name: 'Close the item' })).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Back to the list' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /Whole milk/ })).toBeVisible();
  });
});
