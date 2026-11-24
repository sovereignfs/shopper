import { expect, type Page } from '@playwright/test';
import {
  PASSWORD,
  PHONE,
  accountOf,
  anotherDevice,
  deviceRows,
  offline,
  online,
  recordViolations,
  signUp,
  test,
} from './helpers';

/**
 * Inventory, the screen (task 23.4, RFC 0006, DESIGN.md §16.8), in a browser: `/inventory` is in the sidebar and on Home, shows the starter's entries and the person's own
 * together, grouped by category, searchable and filtered; an entry opens in the right column and is changed field by field as it is left; a new item is made from _+ Add item_;
 * and what is made, changed, hidden and shown again with the network cut reaches a second device of the same person. It is all read from the device, so it opens offline.
 */
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Shopper' });
const screen = (page: Page) => page.getByRole('heading', { level: 1, name: 'Inventory' });
const panel = (page: Page, name: string | RegExp) => page.getByRole('complementary', { name });
const entry = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name}\\b`) });

interface Row {
  name: string | null;
  starterKey: string | null;
  recurring: boolean;
  hidden: boolean;
  note: string | null;
  quantity: string | null;
  deletedAt: number | null;
}
const rowsOf = async (page: Page): Promise<Row[]> =>
  (await deviceRows<Row>(page, await accountOf(page), 'inventory_item')).filter(
    (row) => row.deletedAt === null,
  );

test('Inventory is in the sidebar and on Home, and shows the starter’s entries by category, searchable and filtered', async ({
  page,
}) => {
  const violations = await recordViolations(page);
  await signUp(page, { home: true });
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible({
    timeout: 30_000,
  });
  // Home links to it, and so does the sidebar's first block, which marks it when it is the page.
  await page.getByRole('link', { name: 'Inventory' }).first().click();
  await expect(page).toHaveURL('/inventory');
  await expect(screen(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveTitle('Inventory · Shopper');
  await expect(sidebar(page).getByRole('link', { name: 'Inventory' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // The starter's entries, in sections named for the categories, in the aisle order.
  const sections = page
    .getByRole('region')
    .filter({ has: page.getByRole('heading', { level: 2 }) });
  await expect.poll(() => sections.count(), { timeout: 15_000 }).toBeGreaterThan(5);
  await expect(entry(page, 'Banana')).toBeVisible();

  // A search narrows it, by the name and by an alias, whatever the capitals.
  const search = page.getByRole('searchbox', { name: 'Search Inventory' });
  await search.fill('BANANA');
  await expect(entry(page, 'Banana')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(/^\d+ items?$/);
  await search.fill('zzzz nothing');
  await expect(page.getByText('Nothing matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(search).toHaveValue('');
  await expect(entry(page, 'Banana')).toBeVisible();

  // Filters: nothing is recurring or hidden or the person's own yet.
  await page.getByRole('radio', { name: 'Recurring' }).click();
  await expect(page.getByText('Nothing matches')).toBeVisible();
  await page.getByRole('radio', { name: 'Hidden' }).click();
  await expect(page.getByText('Nothing matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('radio', { name: 'Mine' }).click();
  await expect(page.getByText('Nothing matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(entry(page, 'Banana')).toBeVisible();
  expect(await violations()).toEqual([]);
});

test('an item made, changed, hidden and shown again with no network reaches a second device of the same person', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const email = await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory');
  await expect(screen(page)).toBeVisible({ timeout: 30_000 });
  await expect(entry(page, 'Banana')).toBeVisible({ timeout: 15_000 });
  const account = await accountOf(page);

  await offline(context);

  // _+ Add item_: a name, and it is made and opened to be filled in; the address names it.
  await page.getByRole('button', { name: 'Add item' }).first().click();
  const made = panel(page, 'New item of Inventory');
  await made.getByLabel('Name').fill('Zorblax');
  await made.getByRole('button', { name: 'Add item' }).click();
  const zorblax = panel(page, 'Inventory: Zorblax');
  await expect(zorblax).toBeVisible();
  await expect(page).toHaveURL(/\/inventory\?entry=own%3A[0-9a-f-]{36}$/);
  expect((await rowsOf(page)).map((row) => row.name)).toEqual(['Zorblax']);

  // Each field is written as it is left: no Save. Recurring at once; the note and the quantity when focus moves on.
  await zorblax.getByRole('switch', { name: 'Recurring' }).click();
  await zorblax.getByLabel('Note').fill('The good kind');
  await zorblax.getByLabel('Quantity').fill('2');
  await zorblax.getByLabel('Quantity').blur();
  await expect
    .poll(async () => (await rowsOf(page))[0], { timeout: 10_000 })
    .toMatchObject({ recurring: true, note: 'The good kind', quantity: '2' });

  // A name Inventory has already is not taken: it is said, and nothing is written.
  await zorblax.getByLabel('Name').fill('Banana');
  await zorblax.getByLabel('Name').press('Enter');
  await expect(zorblax.getByRole('alert')).toHaveText('Inventory has that name already.');
  expect((await rowsOf(page)).map((row) => row.name)).toEqual(['Zorblax']);
  await zorblax.getByLabel('Name').fill('Zorblax');
  await zorblax.getByLabel('Name').press('Enter');

  // Hide it: it is marked, and shown again.
  await zorblax.getByRole('button', { name: 'Hide' }).click();
  await expect(zorblax.getByText(/Hidden: it is not offered/)).toBeVisible();
  await zorblax.getByRole('button', { name: 'Show again' }).click();
  await expect(zorblax.getByRole('button', { name: 'Hide' })).toBeVisible();

  // A starter entry the person has not changed has no row: two quick changes to it (recurring, then hide) are one row that holds both.
  await panel(page, 'Inventory: Zorblax').getByRole('button', { name: 'Close the entry' }).click();
  await expect(page).toHaveURL('/inventory');
  await entry(page, 'Banana').click();
  const banana = panel(page, 'Inventory: Banana');
  await banana.getByRole('switch', { name: 'Recurring' }).click();
  await banana.getByRole('button', { name: 'Hide' }).click();
  await expect
    .poll(async () => (await rowsOf(page)).filter((row) => row.starterKey !== null), {
      timeout: 10_000,
    })
    .toHaveLength(1);
  expect((await rowsOf(page)).find((row) => row.starterKey !== null)).toMatchObject({
    recurring: true,
    hidden: true,
  });

  // Back online: the outbox empties and nothing was refused.
  await online(context);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 30_000 })
    .toBe(0);
  expect(await deviceRows(page, account, 'failed')).toEqual([]);

  // A second device of the same person signs in and finds all of it, in Inventory.
  const second = await anotherDevice(browser, baseURL ?? '');
  await second.page.goto('/sign-in');
  await second.page.getByLabel('Email').fill(email);
  await second.page.getByLabel('Password').fill(PASSWORD);
  await second.page.getByRole('button', { name: 'Sign in' }).click();
  await expect(second.page).toHaveURL('/', { timeout: 30_000 });
  await second.page.goto('/inventory');
  await expect(entry(second.page, 'Zorblax')).toBeVisible({ timeout: 30_000 });
  await entry(second.page, 'Zorblax').click();
  const there = panel(second.page, 'Inventory: Zorblax');
  await expect(there.getByLabel('Note')).toHaveValue('The good kind');
  await expect(there.getByRole('switch', { name: 'Recurring' })).toBeChecked();
  await second.page.getByRole('radio', { name: 'Hidden' }).click();
  await expect(entry(second.page, 'Banana')).toBeVisible();
  await expect(entry(second.page, 'Zorblax')).toHaveCount(0);
  await second.context.close();
});

test('a keyboard reaches an entry and its fields, and Escape closes it; Inventory opens with no network', async ({
  page,
  context,
}) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory');
  await expect(entry(page, 'Banana')).toBeVisible({ timeout: 30_000 });
  // Reload with the network cut: the shell has a screen for it, read from the device.
  await offline(context);
  await page.reload();
  await expect(screen(page)).toBeVisible({ timeout: 30_000 });
  await expect(entry(page, 'Banana')).toBeVisible({ timeout: 15_000 });

  await entry(page, 'Banana').focus();
  await page.keyboard.press('Enter');
  const banana = panel(page, 'Inventory: Banana');
  await expect(banana).toBeVisible();
  await expect(banana).toBeFocused();
  // WebKit does not Tab to a button unless the system is set to (Safari's own default), so the order is checked in Chromium, which does.
  if (test.info().project.name === 'chromium') {
    await page.keyboard.press('Tab');
    await expect(banana.getByRole('button', { name: 'Close the entry' })).toBeFocused();
  }
  await page.keyboard.press('Escape');
  await expect(banana).toHaveCount(0);
  await expect(page).toHaveURL('/inventory');
  // Focus is back on the entry that opened it.
  await expect(entry(page, 'Banana')).toBeFocused();
  await online(context);
});

test('on a phone an entry is a page of its own, and the back arrow returns to Inventory', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory');
  await entry(page, 'Banana').click({ timeout: 30_000 });
  await expect(panel(page, 'Inventory: Banana')).toBeVisible();
  await expect(screen(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to Inventory' }).click();
  await expect(screen(page)).toBeVisible();
  await expect(page).toHaveURL('/inventory');
});
