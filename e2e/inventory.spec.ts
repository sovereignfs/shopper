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
  waitMoved,
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
  categoryId: string | null;
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
  // After the group has moved to the device's encryption, so that what follows is written and read in that form and not in a race with the move.
  await waitMoved(page, baseURL ?? '');

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

  // A starter entry the person has not changed has no row: two changes to it made in the same instant (recurring, then hide) are one row that holds both. Two clicks of a
  // person are far enough apart for the first to be written before the second; these are not, which is what the line of writes is for.
  await panel(page, 'Inventory: Zorblax').getByRole('button', { name: 'Close the item' }).click();
  await expect(page).toHaveURL('/inventory');
  await entry(page, 'Banana').click();
  const banana = panel(page, 'Inventory: Banana');
  await expect(banana).toBeVisible();
  await page.evaluate(() => {
    const open = document.querySelector('aside[aria-label="Inventory: Banana"]');
    (open?.querySelector('button[role="switch"][aria-label="Recurring"]') as HTMLElement).click();
    [...(open?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent === 'Hide')
      ?.click();
  });
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

test('deleting an item takes it off with Undo, a field left as it is deleted does not bring it back, and a starter entry’s changes are taken back', async ({
  page,
}) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory');
  await expect(entry(page, 'Banana')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Add item' }).first().click();
  await panel(page, 'New item of Inventory').getByLabel('Name').fill('Quuxle');
  await panel(page, 'New item of Inventory').getByRole('button', { name: 'Add item' }).click();
  const quuxle = panel(page, 'Inventory: Quuxle');
  await expect(quuxle).toBeVisible();

  // The note is typed and not yet left; Delete is pressed, which leaves it first. The write the leaving makes is in the line before the delete, and does not follow it.
  await quuxle.getByLabel('Note').fill('typed last');
  await quuxle.getByRole('button', { name: 'Delete' }).click();
  await expect(entry(page, 'Quuxle')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Deleted Quuxle' })).toBeVisible();
  const names = async () => (await rowsOf(page)).map((row) => row.name);
  await expect.poll(names, { timeout: 10_000 }).toEqual([]);
  await expect
    .poll(async () => (await deviceRows(page, await accountOf(page), 'outbox')).length, {
      timeout: 30_000,
    })
    .toBe(0);
  expect(await names()).toEqual([]);
  await expect(entry(page, 'Quuxle')).toHaveCount(0);

  // Undo brings it back, with what was written.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(entry(page, 'Quuxle')).toBeVisible();
  await expect.poll(names, { timeout: 10_000 }).toEqual(['Quuxle']);
  expect((await rowsOf(page))[0]?.note).toBe('typed last');

  // A starter entry changed can be taken back: it is the starter's again, and the row is gone.
  await entry(page, 'Banana').click();
  const banana = panel(page, 'Inventory: Banana');
  await banana.getByRole('switch', { name: 'Recurring' }).click();
  await expect
    .poll(async () => (await rowsOf(page)).filter((row) => row.starterKey !== null), {
      timeout: 10_000,
    })
    .toHaveLength(1);
  await banana.getByRole('button', { name: 'Take back my changes' }).click();
  await expect(banana).toHaveCount(0);
  await expect
    .poll(async () => (await rowsOf(page)).filter((row) => row.starterKey !== null), {
      timeout: 10_000,
    })
    .toHaveLength(0);
  await expect(entry(page, 'Banana')).toBeVisible();
  await entry(page, 'Banana').click();
  await expect(banana.getByRole('switch', { name: 'Recurring' })).not.toBeChecked();

  // Clearing what the starter fills in is the starter's value again, and makes no row of its own.
  await banana.getByLabel('Quantity').fill('');
  await banana.getByLabel('Quantity').blur();
  await expect(banana.getByLabel('Quantity')).toHaveValue('6');
  expect((await rowsOf(page)).filter((row) => row.starterKey !== null)).toHaveLength(0);
});

interface Placed {
  name: string;
  quantity: string;
  unit: string | null;
  icon: string | null;
  categoryId: string | null;
  deletedAt: number | null;
}
const placed = async (page: Page, name: string): Promise<Placed[]> =>
  (await deviceRows<Placed>(page, await accountOf(page), 'item')).filter(
    (row) => row.name === name && row.deletedAt === null,
  );

test('Add to a list puts an item on the list with its own category, icon, unit and quantity, one more when it is open, and Undo takes off what it added', async ({
  page,
}) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory');
  await expect(entry(page, 'Banana')).toBeVisible({ timeout: 30_000 });
  const account = await accountOf(page);

  // A starter entry the person has put in another category: Banana is Produce, a starter's and a guess's answer, and here it is Snacks and sweets.
  await entry(page, 'Banana').click();
  const banana = panel(page, 'Inventory: Banana');
  await banana.getByLabel('Category').selectOption({ label: 'Snacks & sweets' });
  await expect
    .poll(async () => (await rowsOf(page)).filter((row) => row.starterKey === 'banana').length, {
      timeout: 10_000,
    })
    .toBe(1);
  await banana.getByRole('button', { name: 'Add to list' }).click();
  await expect(banana.getByRole('status')).toContainText('Added Banana to Groceries');
  await expect.poll(async () => (await placed(page, 'Banana')).length, { timeout: 10_000 }).toBe(1);
  const snacks = (
    await deviceRows<{ id: string; starterKey: string | null }>(page, account, 'category')
  ).find((row) => row.starterKey === 'snacks-sweets');
  expect((await placed(page, 'Banana'))[0]).toMatchObject({
    quantity: '6',
    unit: 'pcs',
    icon: 'banana',
    categoryId: snacks?.id,
  });

  // Undo of a fresh add takes the item off the list (the product, which is the catalog learning, stays and remembers Snacks and sweets).
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await placed(page, 'Banana')).length, { timeout: 10_000 }).toBe(0);
  // What the person set in Inventory wins over the product: Banana is moved to Drinks there, and adding it again puts it under Drinks.
  await banana.getByLabel('Category').selectOption({ label: 'Drinks' });
  await expect
    .poll(
      async () =>
        (await rowsOf(page)).find((row) => row.starterKey === 'banana')?.categoryId ?? null,
      { timeout: 10_000 },
    )
    .not.toBe(snacks?.id);
  await banana.getByRole('button', { name: 'Add to list' }).click();
  await expect.poll(async () => (await placed(page, 'Banana')).length, { timeout: 10_000 }).toBe(1);
  const drinks = (
    await deviceRows<{ id: string; starterKey: string | null }>(page, account, 'category')
  ).find((row) => row.starterKey === 'drinks');
  expect((await placed(page, 'Banana'))[0]).toMatchObject({
    quantity: '6',
    unit: 'pcs',
    icon: 'banana',
    categoryId: drinks?.id,
  });

  // The list has it under Drinks, and one more of it is a second Add.
  await banana.getByRole('button', { name: 'Add to list' }).click();
  await expect(banana.getByRole('status')).toContainText('Added one more Banana to Groceries');
  await expect
    .poll(async () => (await placed(page, 'Banana')).map((row) => row.quantity), {
      timeout: 10_000,
    })
    .toEqual(['7']);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => (await placed(page, 'Banana')).map((row) => row.quantity), {
      timeout: 10_000,
    })
    .toEqual(['6']);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 30_000 })
    .toBe(0);
  expect(await deviceRows(page, account, 'failed')).toEqual([]);
  await banana.getByRole('link', { name: 'Open list' }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Drinks' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Banana/ })).toBeVisible();
});

test('Add to a list adds the item as it is on the device when its turn comes: a quantity left as it is pressed, and two presses in one instant', async ({
  page,
}) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory');
  await expect(entry(page, 'Banana')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add item' }).first().click();
  await panel(page, 'New item of Inventory').getByLabel('Name').fill('Zorblax');
  await panel(page, 'New item of Inventory').getByRole('button', { name: 'Add item' }).click();
  const zorblax = panel(page, 'Inventory: Zorblax');
  await expect(zorblax).toBeVisible();

  // The quantity is typed and not yet left; Add to list is pressed, which leaves it first: the item added has what was typed.
  await zorblax.getByLabel('Quantity').fill('3');
  await zorblax.getByRole('button', { name: 'Add to list' }).click();
  await expect(zorblax.getByRole('status')).toContainText('Added Zorblax to Groceries');
  await expect
    .poll(async () => (await placed(page, 'Zorblax')).map((row) => row.quantity), {
      timeout: 10_000,
    })
    .toEqual(['3']);

  // Two presses in the same instant, for an item the list has no product of: the second is planned from the list as the first left it, so it is one more and not a second row.
  await zorblax.getByRole('button', { name: 'Close the item' }).click();
  await page.getByRole('button', { name: 'Add item' }).first().click();
  await panel(page, 'New item of Inventory').getByLabel('Name').fill('Quuxle');
  await panel(page, 'New item of Inventory').getByRole('button', { name: 'Add item' }).click();
  await expect(panel(page, 'Inventory: Quuxle')).toBeVisible();
  await page.evaluate(() => {
    const open = document.querySelector('aside[aria-label="Inventory: Quuxle"]');
    const press = [...(open?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Add to list',
    );
    press?.click();
    press?.click();
  });
  await expect
    .poll(async () => (await placed(page, 'Quuxle')).map((row) => row.quantity), {
      timeout: 10_000,
    })
    .toEqual(['2']);
  await expect
    .poll(async () => (await deviceRows(page, await accountOf(page), 'outbox')).length, {
      timeout: 30_000,
    })
    .toBe(0);
  expect(await deviceRows(page, await accountOf(page), 'failed')).toEqual([]);
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
    await expect(banana.getByRole('button', { name: 'Close the item' })).toBeFocused();
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
