import { expect } from '@playwright/test';
import { PHONE, offline, online, recordViolations, signUp, test } from './helpers';

/**
 * Home (task 23.2, RFC 0006), in a browser: `/` opens it for someone signed in, with Continue for the list used last, a tile for every list and what can be said
 * at a glance, all read from the device, so that it is there with the network cut.
 */
const sidebar = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Shopper' });
// The signed-in frame has no `main` landmark of its own (a gap in the design system's `AppFrame`, to raise in `sovereign`), so Home's content is what holds its heading:
// the sidebar has regions of the same names ("My lists", "Shared with me") that this must not be mistaken for.
const home = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1, name: 'Home' }).locator('..');

test('a new account opens on Home: Continue is its Groceries with a line, its lists are tiles, and nothing is at a glance yet', async ({
  page,
}) => {
  const violations = await recordViolations(page);
  await signUp(page, { home: true });
  const main = home(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveTitle('Home · Shopper');
  const cont = main.getByRole('link', { name: /^Continue/ });
  await expect(cont).toContainText('Groceries');
  await expect(cont).toContainText('Nothing open');
  await expect(
    main.getByText('Add what you need. To shop with others, press Share.'),
  ).toBeVisible();
  await expect(
    main.getByRole('region', { name: 'My lists' }).getByRole('link', { name: /Groceries/ }),
  ).toBeVisible();
  const glance = main.getByRole('region', { name: 'At a glance' });
  await expect(glance.getByText('Open items').locator('xpath=following-sibling::dd')).toHaveText(
    '0',
  );
  await expect(glance.getByText('Bought most').locator('xpath=following-sibling::dd')).toHaveText(
    'Nothing yet',
  );
  // The address is the front address, and Home is marked in the sidebar.
  await expect(page).toHaveURL('/');
  await expect(sidebar(page).getByRole('link', { name: 'Home' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(await violations()).toEqual([]);

  // Continue opens the list.
  await cont.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
});

test('what is open is counted on the tile, on Continue and at a glance, and Continue follows the list used last', async ({
  page,
}) => {
  await signUp(page);
  const add = page.getByRole('combobox', { name: 'Add an item' });
  await add.fill('Oat milk');
  await add.press('Enter');
  await expect(page.getByText('Oat milk', { exact: true })).toBeVisible();

  await sidebar(page).getByRole('link', { name: 'Home' }).click();
  const main = home(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Continue/ })).toContainText('1 open');
  // It has had an item, so the line a new account is given is gone.
  await expect(main.getByText('Add what you need.')).toHaveCount(0);
  await expect(
    main.getByRole('region', { name: 'My lists' }).getByRole('link', { name: /Groceries/ }),
  ).toBeVisible();
  const glance = main.getByRole('region', { name: 'At a glance' });
  await expect(glance.getByText('Open items').locator('xpath=following-sibling::dd')).toHaveText(
    '1',
  );

  // A second list, opened, is what Home continues on.
  await sidebar(page).getByRole('button', { name: 'New list' }).click();
  await page.getByRole('textbox', { name: 'Name of the new list' }).fill('Hardware');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Hardware' })).toBeVisible();
  await sidebar(page).getByRole('link', { name: 'Home' }).click();
  await expect(main.getByRole('link', { name: /^Continue/ })).toContainText('Hardware');
  await expect(main.getByRole('region', { name: 'My lists' }).getByRole('link')).toHaveCount(2);
});

test('an archived list is behind a toggle on Home, and opens from it', async ({ page }) => {
  await signUp(page);
  await sidebar(page).getByRole('button', { name: 'New list' }).click({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'Name of the new list' }).fill('Old plans');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Old plans' })).toBeVisible();
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitem', { name: 'List settings' }).click();
  await page.getByRole('button', { name: 'Archive and delete' }).click();
  await page.getByRole('button', { name: 'Archive this list' }).click();
  await page.goBack();

  await sidebar(page).getByRole('link', { name: 'Home' }).click();
  const main = home(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  // Continue is not the archived list, and it is not among the tiles until it is asked for.
  await expect(main.getByRole('link', { name: /^Continue/ })).toContainText('Groceries');
  await expect(main.getByRole('link', { name: /Old plans/ })).toHaveCount(0);
  const toggle = main.getByRole('button', { name: /Archived \(1\)/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  const archived = main.getByRole('link', { name: /Old plans/ });
  await expect(archived).toContainText('(archived)');
  await archived.click();
  await expect(page.getByText('This list is archived.')).toBeVisible();
});

test('Home is read from the device, so it is there with the network cut', async ({
  page,
  context,
}) => {
  await signUp(page);
  await offline(context);
  await sidebar(page).getByRole('link', { name: 'Home' }).click();
  const main = home(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Continue/ })).toContainText('Groceries');
  await expect(
    main.getByRole('region', { name: 'My lists' }).getByRole('link', { name: /Groceries/ }),
  ).toBeVisible();
  await online(context);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('Home is the footer’s left icon, and a tile opens its list', async ({ page }) => {
    await signUp(page);
    await page
      .getByRole('navigation', { name: 'App navigation' })
      .getByRole('link', { name: 'Home' })
      .click();
    const main = home(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await main
      .getByRole('region', { name: 'My lists' })
      .getByRole('link', { name: /Groceries/ })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
    await expect(page).toHaveURL(/\/l\/[0-9a-f-]{36}$/);
  });
});
