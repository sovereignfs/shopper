import { expect } from '@playwright/test';
import { PHONE, offline, online, recordViolations, signUp, test } from './helpers';

/**
 * The shell's places (task 8.1), in a browser: the sidebar is filled from the device, a list is made where the button was and opened, the one open is marked,
 * the keyboard and a pointer take the same way, and a phone's drawer closes when a list is chosen.
 */
const sidebar = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Shopper' });

test('the sidebar shows the person’s own lists once the device has them, with no policy violation', async ({
  page,
}) => {
  const violations = await recordViolations(page);
  await signUp(page);
  await expect(sidebar(page).getByRole('heading', { name: 'My lists' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(sidebar(page).getByRole('link', { name: 'Groceries' })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: 'New list' })).toBeVisible();
  expect(await violations()).toEqual([]);
});

test('a list is made where the button was, on the device, and opened; the one open is marked', async ({
  page,
}) => {
  await signUp(page);
  await sidebar(page).getByRole('button', { name: 'New list' }).click({ timeout: 15_000 });
  const field = page.getByRole('textbox', { name: 'Name of the new list' });
  await expect(field).toBeFocused();
  await field.fill('Hardware store');
  await field.press('Enter');

  await expect(page).toHaveURL(/\/l\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hardware store' })).toBeVisible();
  const link = sidebar(page).getByRole('link', { name: /Hardware store/ });
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(sidebar(page).getByRole('link', { name: 'Groceries' })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
  // The server takes it, and the mark of a list it has not answered for goes.
  await expect(link.getByRole('img', { name: 'Not synced yet' })).toHaveCount(0, {
    timeout: 15_000,
  });
  // The field is gone and the button is back.
  await expect(sidebar(page).getByRole('button', { name: 'New list' })).toBeVisible();

  // It is still there after a reload, from the device, and the page for it is the same one.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Hardware store' })).toBeVisible();
  await expect(sidebar(page).getByRole('link', { name: /Hardware store/ })).toBeVisible();
});

test('Escape and an empty name put the button back and make nothing', async ({ page }) => {
  await signUp(page);
  const button = sidebar(page).getByRole('button', { name: 'New list' });
  await button.click({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'Name of the new list' }).fill('Never made');
  await page.keyboard.press('Escape');
  await expect(button).toBeVisible();
  await button.click();
  await page.getByRole('textbox', { name: 'Name of the new list' }).blur();
  await expect(button).toBeVisible();
  await expect(sidebar(page).getByRole('link')).toHaveCount(1);
});

test('the lists are reached by the keyboard as by a pointer, and a list that is not there says so', async ({
  page,
}) => {
  await signUp(page);
  const groceries = sidebar(page).getByRole('link', { name: 'Groceries' });
  await groceries.focus({ timeout: 15_000 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();

  await page.goto('/l/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText('That list is not here')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Back to your lists' }).click();
  await expect(page).toHaveURL('/');
  // The front address is the list used last, drawn there (8.2), no longer a page of links.
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  // An address that is not an id is a page that is not there, not a list that is missing.
  await page.goto('/l/not-an-id');
  await expect(page.getByRole('heading', { name: 'That is not here' })).toBeVisible();
});

test('the sidebar is read from the device, so it is there with the network cut', async ({
  page,
  context,
}) => {
  await signUp(page);
  await expect(sidebar(page).getByRole('link', { name: 'Groceries' })).toBeVisible({
    timeout: 15_000,
  });
  await offline(context);
  // Still drawn, still asking for a name: nothing here waits for the server.
  await expect(sidebar(page).getByRole('link', { name: 'Groceries' })).toBeVisible();
  await sidebar(page).getByRole('button', { name: 'New list' }).click();
  await expect(page.getByRole('textbox', { name: 'Name of the new list' })).toBeFocused();
  await page.keyboard.press('Escape');
  await online(context);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the drawer holds the lists, and closes when one is chosen', async ({ page }) => {
    await signUp(page);
    await page.getByRole('button', { name: 'Open the navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await drawer.getByRole('link', { name: 'Groceries' }).click({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/l\/[0-9a-f-]{36}$/);
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
});
