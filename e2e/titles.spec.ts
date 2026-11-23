import { expect } from '@playwright/test';
import { seedItems, signUp, test } from './helpers';

/**
 * Page titles (task 22.10, RFC 0005): a list's name is encrypted, so the server's title is the app's name and the browser sets the title once the name is
 * opened. Read from a real browser, since the title is the one place a name is shown outside the page's own text; each step also checks that a name does not
 * stay in the title when the person leaves for a page that has none.
 */
test('a page is titled by the name the browser opened, and a name does not outlast its page', async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await expect(page).toHaveTitle('Groceries · Shopper');

  // Shopping mode says so, and going back to the list puts the list's title back.
  await page.getByRole('button', { name: 'Shop' }).click();
  await expect(page).toHaveTitle('Shopping Groceries · Shopper');
  await page.getByRole('button', { name: 'Back to Groceries' }).click();
  await expect(page).toHaveTitle('Groceries · Shopper');

  // The list's settings.
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitem', { name: 'List settings' }).click();
  await expect(page).toHaveURL(/\?settings=general$/);
  await expect(page).toHaveTitle('Settings · Groceries · Shopper');

  // Closed by Back, the list is titled again; then Settings, reached from the avatar's menu: the section is in the title, and the list's name is gone from it.
  await page.goBack();
  await expect(page).toHaveTitle('Groceries · Shopper');
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page).toHaveTitle('Profile · Settings · Shopper');
  await page.getByRole('button', { name: 'Data' }).click();
  await expect(page).toHaveTitle('Data · Settings · Shopper');
});

test("a list loaded afresh is titled again once the device's store has opened it", async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  await expect(page).toHaveTitle('Groceries · Shopper');
  // A page loaded fresh from the server is the app's name until the device's store has opened the list.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await expect(page).toHaveTitle('Groceries · Shopper');
});
