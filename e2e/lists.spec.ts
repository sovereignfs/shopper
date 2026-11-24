import { expect } from '@playwright/test';
import { PHONE, offline, online, recordViolations, signUp, test } from './helpers';

/**
 * The frame's places (tasks 8.1 and 22.11), in a browser: the sidebar is `@sovereignfs/ui`'s, filled from the device; a list is made in a dialog on the device and opened, the
 * one open is marked, the keyboard and a pointer take the same way, and a phone's drawer closes when a list is chosen.
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

test('a list is made in a dialog, on the device, and opened; the one open is marked', async ({
  page,
}) => {
  await signUp(page);
  await sidebar(page).getByRole('button', { name: 'New list' }).click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog', { name: 'New list' });
  const field = dialog.getByRole('textbox', { name: 'Name of the new list' });
  await expect(field).toBeFocused();
  await field.fill('Hardware store');
  await field.press('Enter');

  await expect(page).toHaveURL(/\/l\/[0-9a-f-]{36}$/);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Hardware store' })).toBeVisible();
  const link = sidebar(page).getByRole('link', { name: /Hardware store/ });
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(sidebar(page).getByRole('link', { name: 'Groceries' })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
  // The server takes it, and what said it had not answered for the list goes.
  await expect(link).not.toContainText('Not synced yet', { timeout: 15_000 });
  await expect(sidebar(page).getByRole('button', { name: 'New list' })).toBeVisible();

  // It is still there after a reload, from the device, and the page for it is the same one.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Hardware store' })).toBeVisible();
  await expect(sidebar(page).getByRole('link', { name: /Hardware store/ })).toBeVisible();
});

test('Cancel, Escape and an empty name make nothing', async ({ page }) => {
  await signUp(page);
  const button = sidebar(page).getByRole('button', { name: 'New list' });
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await button.click({ timeout: 15_000 });
  await dialog.getByRole('textbox', { name: 'Name of the new list' }).fill('Never made');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await button.click();
  // Nothing to make: the button says so, and Enter does not.
  await expect(dialog.getByRole('button', { name: 'Make the list' })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Name of the new list' }).press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(sidebar(page).getByRole('link', { name: /Never made/ })).toHaveCount(0);
});

test('archived lists are behind a toggle under the blocks, listed and marked when it is asked to', async ({
  page,
}) => {
  await signUp(page);
  await sidebar(page).getByRole('button', { name: 'New list' }).click({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'Name of the new list' }).fill('Old plans');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Old plans' })).toBeVisible();
  // Archived from its settings, which Back closes.
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitem', { name: 'List settings' }).click();
  await page.getByRole('button', { name: 'Archive and delete' }).click();
  await page.getByRole('button', { name: 'Archive this list' }).click();
  await page.goBack();
  await expect(sidebar(page).getByRole('link', { name: /Old plans/ })).toHaveCount(0);

  const toggle = sidebar(page).getByRole('button', { name: /Archived \(1\)/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  const archived = sidebar(page).getByRole('link', { name: /Old plans \(archived\)/ });
  await expect(archived).toBeVisible();
  await expect(sidebar(page).getByRole('region', { name: 'Archived' })).toBeVisible();
  // It opens the list, which says it is archived.
  await archived.click();
  await expect(page.getByText('This list is archived.')).toBeVisible();
  await sidebar(page).getByRole('button', { name: 'Hide archived' }).click();
  await expect(sidebar(page).getByRole('link', { name: /Old plans/ })).toHaveCount(0);
  await expect(sidebar(page).getByRole('button', { name: /Archived \(1\)/ })).toBeVisible();
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
  // The front address is Home, whose Continue is the list used last.
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Continue/ })).toContainText('Groceries');
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
  // Still drawn, still asking for a name: nothing here waits for the server, and a list is made with the network cut.
  await expect(sidebar(page).getByRole('link', { name: 'Groceries' })).toBeVisible();
  await sidebar(page).getByRole('button', { name: 'New list' }).click();
  const field = page.getByRole('textbox', { name: 'Name of the new list' });
  await expect(field).toBeFocused();
  await field.fill('Made offline');
  await field.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Made offline' })).toBeVisible();
  await online(context);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the drawer holds the lists, and closes when one is chosen', async ({ page }) => {
    await signUp(page);
    await page.getByRole('button', { name: 'Open the navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Shopper' });
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
