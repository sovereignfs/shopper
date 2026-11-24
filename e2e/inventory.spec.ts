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

const tab = (page: Page, name: string) => page.getByRole('tab', { name });
const categoryNames = (page: Page) =>
  page
    .getByRole('textbox', { name: /^Name of / })
    .evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));
interface Aisle {
  id: string;
  starterKey: string | null;
  name: string;
  position: string;
  hidden: boolean;
  deletedAt: number | null;
}
const aisleOf = async (page: Page): Promise<Aisle[]> =>
  (await deviceRows<Aisle>(page, await accountOf(page), 'category')).filter(
    (row) => row.deletedAt === null,
  );
interface Copy {
  id: string;
  name: string;
  position: string;
}
const copiesOf = (page: Page) =>
  accountOf(page).then((account) => deviceRows<Copy>(page, account, 'list_category'));

test('a category of the person’s own is made, put on a list as a copy that follows its name and its place, and a name they have is refused', async ({
  page,
  baseURL,
}) => {
  // Two drags to the top by the keyboard, each arrow waited for by what is said aloud, and an item put on a list: longer than the rest.
  test.slow();
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory');
  // A copy is made in a group that has moved to the device's encryption, which a new account's does at its first load.
  await waitMoved(page, baseURL ?? '');
  await tab(page, 'Categories').click();
  await expect(tab(page, 'Categories')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/inventory\?tab=categories$/);
  await expect.poll(async () => (await categoryNames(page)).length, { timeout: 15_000 }).toBe(15);

  // Add category: last in the aisle order; the same name again, by what a person would call the same, is refused and writes nothing.
  await page.getByLabel('New category').fill('Garden');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('textbox', { name: 'Name of Garden' })).toBeVisible();
  expect((await categoryNames(page)).at(-1)).toBe('Garden');
  await page.getByLabel('New category').fill(' garden ');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText('You have a category with that name already.')).toBeVisible();
  expect((await aisleOf(page)).filter((row) => row.name === 'Garden')).toHaveLength(1);

  // An item of Inventory in that category, added to Groceries: the list has a copy of the category, named Garden, and the item names the copy.
  await tab(page, 'Items').click();
  await expect(page).toHaveURL(/\/inventory$/);
  await page.getByRole('button', { name: 'Add item' }).first().click();
  await panel(page, 'New item of Inventory').getByLabel('Name').fill('Spade');
  await panel(page, 'New item of Inventory').getByRole('button', { name: 'Add item' }).click();
  const spade = panel(page, 'Inventory: Spade');
  await spade.getByLabel('Category').selectOption({ label: 'Garden' });
  await expect
    .poll(async () => (await rowsOf(page)).find((row) => row.name === 'Spade')?.categoryId, {
      timeout: 10_000,
    })
    .toBeTruthy();
  await spade.getByRole('button', { name: 'Add to list' }).click();
  await expect(spade.getByRole('status')).toContainText('Added Spade to Groceries');
  await expect.poll(async () => (await copiesOf(page)).length, { timeout: 10_000 }).toBe(1);
  const garden = (await aisleOf(page)).find((row) => row.name === 'Garden');
  const placedSpade = (await placed(page, 'Spade'))[0];
  expect(placedSpade?.categoryId).toBe((await copiesOf(page))[0]?.id);
  expect(placedSpade?.categoryId).not.toBe(garden?.id);
  await spade.getByRole('link', { name: 'Open list' }).click();
  await expect(page.getByRole('heading', { name: 'Garden' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Spade/ })).toBeVisible();

  // Renamed in Inventory, the copy on the list is renamed with it, and the list's heading follows.
  await page.goto('/inventory?tab=categories');
  const name = page.getByRole('textbox', { name: 'Name of Garden' });
  await name.fill('Yard');
  await name.press('Enter');
  await expect.poll(async () => (await copiesOf(page))[0]?.name, { timeout: 10_000 }).toBe('Yard');
  expect((await aisleOf(page)).find((row) => row.id === garden?.id)?.name).toBe('Yard');
  await page.getByRole('link', { name: 'Groceries' }).first().click();
  await expect(page.getByRole('heading', { name: 'Yard' })).toBeVisible();

  // Put first by the keyboard: Space lifts the row, the arrows move it, Space puts it down. The copy on the list takes the place, which the list groups by.
  await page.goto('/inventory?tab=categories');
  await expect
    .poll(async () => (await categoryNames(page)).at(-1), { timeout: 15_000 })
    .toBe('Yard');
  await page.getByRole('button', { name: 'Move Yard' }).focus();
  await page.keyboard.press('Space');
  // Each arrow is waited for by what is said aloud (the position it is over), which is also what a person using a screen reader hears.
  const said = page.locator('[id^="DndLiveRegion"]');
  for (let at = 15; at >= 1; at -= 1) {
    await page.keyboard.press('ArrowUp');
    await expect(said).toHaveText(new RegExp(`Yard is over position ${at} of 16`));
  }
  await page.keyboard.press('Space');
  await expect(said).toHaveText(/Dropped category Yard at position 1 of 16/);
  await expect.poll(async () => (await categoryNames(page))[0], { timeout: 10_000 }).toBe('Yard');
  const now = (await aisleOf(page)).find((row) => row.id === garden?.id);
  await expect
    .poll(async () => (await copiesOf(page))[0]?.position, { timeout: 10_000 })
    .toBe(now?.position);
  // It survives a reload and reaches the server.
  await expect
    .poll(async () => (await deviceRows(page, await accountOf(page), 'outbox')).length, {
      timeout: 30_000,
    })
    .toBe(0);
  expect(await deviceRows(page, await accountOf(page), 'failed')).toEqual([]);
  await page.reload();
  await expect.poll(async () => (await categoryNames(page))[0], { timeout: 15_000 }).toBe('Yard');

  // The other order: a category made and put first before any list has a copy of it. The copy a list gets afterwards is where the category is, and not last.
  await page.getByLabel('New category').fill('Fence');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('textbox', { name: 'Name of Fence' })).toBeVisible();
  await page.getByRole('button', { name: 'Move Fence' }).focus();
  await page.keyboard.press('Space');
  for (let at = 16; at >= 1; at -= 1) {
    await page.keyboard.press('ArrowUp');
    await expect(said).toHaveText(new RegExp(`Fence is over position ${at} of 17`));
  }
  await page.keyboard.press('Space');
  await expect(said).toHaveText(/Dropped category Fence at position 1 of 17/);
  await expect.poll(async () => (await categoryNames(page))[0], { timeout: 10_000 }).toBe('Fence');
  // The click that ends a drag is swallowed for a moment (`useDragClickGuard`), so that dropping a row does not press what is under it: a click straight after is tried again.
  await expect(async () => {
    await tab(page, 'Items').click();
    await expect(tab(page, 'Items')).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Add item' }).first().click();
  await panel(page, 'New item of Inventory').getByLabel('Name').fill('Post');
  await panel(page, 'New item of Inventory').getByRole('button', { name: 'Add item' }).click();
  const post = panel(page, 'Inventory: Post');
  await post.getByLabel('Category').selectOption({ label: 'Fence' });
  await expect
    .poll(async () => (await rowsOf(page)).find((row) => row.name === 'Post')?.categoryId, {
      timeout: 10_000,
    })
    .toBeTruthy();
  await post.getByRole('button', { name: 'Add to list' }).click();
  await expect.poll(async () => (await copiesOf(page)).length, { timeout: 10_000 }).toBe(2);
  const fence = (await aisleOf(page)).find((row) => row.name === 'Fence');
  const copies = await copiesOf(page);
  const fenceCopy = copies.find((copy) => copy.name === 'Fence');
  const yardCopy = copies.find((copy) => copy.name === 'Yard');
  expect(fenceCopy?.position).toBe(fence?.position);
  expect(String(fenceCopy?.position) < String(yardCopy?.position)).toBe(true);
  await post.getByRole('link', { name: 'Open list' }).click();
  const headings = page.getByRole('heading', { level: 2 });
  await expect(headings.filter({ hasText: /^(Fence|Yard)$/ })).toHaveText(['Fence', 'Yard']);
});

test('a category is hidden and shown, a starter one has a name of the person’s and the usual one back, and a delete has Undo', async ({
  page,
}) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory?tab=categories');
  await expect.poll(async () => (await categoryNames(page)).length, { timeout: 30_000 }).toBe(15);

  // Other is never hidden, and a starter category is never deleted.
  await expect(page.getByRole('button', { name: 'Hide Other' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hide Bakery' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);

  // Hidden: marked, still there to be shown again, and an item of Inventory in it is under Other; a hidden category is not offered for an item.
  await page.getByRole('button', { name: 'Hide Bakery' }).click();
  await expect(page.getByRole('button', { name: 'Show Bakery' })).toBeVisible();
  await expect(page.getByText('Hidden', { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await aisleOf(page)).find((row) => row.starterKey === 'bakery')?.hidden, {
      timeout: 10_000,
    })
    .toBe(true);
  await tab(page, 'Items').click();
  await entry(page, 'Banana').click();
  const choices = panel(page, 'Inventory: Banana').getByLabel('Category');
  await expect(choices.locator('option', { hasText: 'Produce' })).toHaveCount(1);
  const options = await choices.locator('option').allTextContents();
  expect(options).not.toContain('Bakery');
  expect(options).toContain('Produce');
  await tab(page, 'Categories').click();
  await page.getByRole('button', { name: 'Show Bakery' }).click();
  await expect(page.getByRole('button', { name: 'Hide Bakery' })).toBeVisible();

  // A starter category given a name of the person's, and the usual one again: by the button, and by emptying the field.
  const produce = page.getByRole('textbox', { name: 'Name of Produce' });
  await produce.fill('Fruit and veg');
  await produce.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Name of Fruit and veg' })).toBeVisible();
  await page.getByRole('button', { name: 'Use the usual name for Fruit and veg' }).click();
  await expect(page.getByRole('textbox', { name: 'Name of Produce' })).toBeVisible();
  const again = page.getByRole('textbox', { name: 'Name of Produce' });
  await again.fill('Greens');
  await again.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Name of Greens' })).toBeVisible();
  const emptied = page.getByRole('textbox', { name: 'Name of Greens' });
  await emptied.fill('');
  await emptied.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Name of Produce' })).toBeVisible();

  // A name typed and not yet left, and Delete pressed, which leaves it first: the rename is written before the delete and does not follow it, which would make the row again.
  await page.getByLabel('New category').fill('Scratch');
  await page.getByRole('button', { name: 'Add category' }).click();
  const scratch = page.getByRole('textbox', { name: 'Name of Scratch' });
  await expect(scratch).toBeVisible();
  await scratch.fill('Scratch two');
  await page.getByRole('button', { name: 'Delete Scratch' }).click();
  await expect(page.getByRole('textbox', { name: /^Name of Scratch/ })).toHaveCount(0);
  await expect
    .poll(async () => (await deviceRows(page, await accountOf(page), 'outbox')).length, {
      timeout: 30_000,
    })
    .toBe(0);
  expect((await aisleOf(page)).filter((row) => row.name.startsWith('Scratch'))).toEqual([]);
  await expect(page.getByRole('textbox', { name: /^Name of Scratch/ })).toHaveCount(0);

  // One of the person's own is deleted with Undo, which brings it back where it was.
  await page.getByLabel('New category').fill('Garden');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('textbox', { name: 'Name of Garden' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Garden' }).click();
  await expect(page.getByRole('textbox', { name: 'Name of Garden' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('textbox', { name: 'Name of Garden' })).toBeVisible();
  expect((await categoryNames(page)).at(-1)).toBe('Garden');
  await expect
    .poll(async () => (await deviceRows(page, await accountOf(page), 'outbox')).length, {
      timeout: 30_000,
    })
    .toBe(0);
  expect(await deviceRows(page, await accountOf(page), 'failed')).toEqual([]);
});

test('a category is dragged with a pointer by its handle, and the order is kept', async ({
  page,
}) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory?tab=categories');
  await expect.poll(async () => (await categoryNames(page)).length, { timeout: 30_000 }).toBe(15);
  expect((await categoryNames(page)).slice(0, 2)).toEqual(['Produce', 'Bakery']);
  // The handle shows when the row is under the pointer: lift Bakery, a few pixels first (a click is not a drag), and let it go over Produce.
  const row = page.getByRole('textbox', { name: 'Name of Bakery' });
  await row.hover();
  const handle = await page.getByRole('button', { name: 'Move Bakery' }).boundingBox();
  const over = await page.getByRole('textbox', { name: 'Name of Produce' }).boundingBox();
  if (!handle || !over) throw new Error('nothing to drag');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 12, {
    steps: 4,
  });
  await page.mouse.move(handle.x + handle.width / 2, over.y + 4, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await categoryNames(page)).slice(0, 2), { timeout: 10_000 })
    .toEqual(['Bakery', 'Produce']);
  await expect
    .poll(async () => (await deviceRows(page, await accountOf(page), 'outbox')).length, {
      timeout: 30_000,
    })
    .toBe(0);
  expect(await deviceRows(page, await accountOf(page), 'failed')).toEqual([]);
  await page.reload();
  await expect
    .poll(async () => (await categoryNames(page)).slice(0, 2), { timeout: 15_000 })
    .toEqual(['Bakery', 'Produce']);
});

test('the Categories tab on a phone keeps to the width, opens the icon panel whole, and the tab and the item beside it are in the address', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory');
  await expect(entry(page, 'Banana')).toBeVisible({ timeout: 30_000 });
  // An item open, then the other tab: the address drops the item and keeps the tab; Back from the tab is not a step of its own.
  await entry(page, 'Banana').click();
  await expect(page).toHaveURL(/entry=starter%3Abanana/);
  await page.getByRole('button', { name: 'Back to Inventory' }).click();
  await tab(page, 'Categories').click();
  await expect(page).toHaveURL(/\/inventory\?tab=categories$/);
  await expect.poll(async () => (await categoryNames(page)).length, { timeout: 15_000 }).toBe(15);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // The icon panel of the last row opens inside the screen.
  const last = page.getByRole('button', { name: 'Icon of Other' });
  await last.scrollIntoViewIfNeeded();
  await last.click();
  // The panel is found by the design system's own (hashed) class names, which hold no role to ask for: an upgrade of `@sovereignfs/ui` may need this selector changed.
  const inside = await page.evaluate(() => {
    const open = document.querySelector('[class*="panel"][class*="right"]');
    if (!open) return null;
    const box = open.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  });
  expect(inside).toBe(true);
  await page.keyboard.press('Escape');
  await tab(page, 'Items').click();
  await expect(page).toHaveURL(/\/inventory$/);
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

test('the add field offers Inventory first: a renamed starter entry by its new name, a hidden one nowhere, and a recurring item first when the list is empty', async ({
  page,
  baseURL,
}) => {
  test.slow();
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/inventory');
  await waitMoved(page, baseURL ?? '');
  const plainBread = page.getByRole('button', { name: 'Bread', exact: true });
  await expect(plainBread).toBeVisible({ timeout: 30_000 });

  // Bread is renamed (a starter entry kept, by its key, with a name of the person's), Banana is hidden, and Zorblax paste is an item of their own that comes again.
  await plainBread.click();
  const bread = panel(page, 'Inventory: Bread');
  await bread.getByLabel('Name').fill('Sourdough loaf');
  await bread.getByLabel('Name').press('Enter');
  await expect
    .poll(async () => (await rowsOf(page)).find((row) => row.starterKey === 'bread')?.name, {
      timeout: 10_000,
    })
    .toBe('Sourdough loaf');
  await entry(page, 'Banana').click();
  await panel(page, 'Inventory: Banana').getByRole('button', { name: 'Hide' }).click();
  await expect
    .poll(async () => (await rowsOf(page)).find((row) => row.starterKey === 'banana')?.hidden, {
      timeout: 10_000,
    })
    .toBe(true);
  await page.getByRole('button', { name: 'Add item' }).first().click();
  await panel(page, 'New item of Inventory').getByLabel('Name').fill('Zorblax paste');
  await panel(page, 'New item of Inventory').getByRole('button', { name: 'Add item' }).click();
  const powder = panel(page, 'Inventory: Zorblax paste');
  await powder.getByRole('switch', { name: 'Recurring' }).click();
  await powder.getByLabel('Quantity').fill('2');
  await powder.getByLabel('Quantity').blur();
  await expect
    .poll(async () => (await rowsOf(page)).find((row) => row.name === 'Zorblax paste'), {
      timeout: 10_000,
    })
    .toMatchObject({ recurring: true, quantity: '2' });

  // The list is empty, so it offers what the person has marked as coming again, first, and adding it is one tap.
  await sidebar(page).getByRole('link', { name: 'Groceries' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  const often = page.getByRole('region', { name: 'Often bought' });
  await expect(often.getByRole('button').first()).toHaveText('Zorblax paste', {
    timeout: 15_000,
  });
  await often.getByRole('button', { name: 'Zorblax paste' }).click();
  await expect(page.getByRole('checkbox', { name: /Zorblax paste/ })).toBeVisible();
  await expect.poll(async () => (await placed(page, 'Zorblax paste')).length).toBe(1);
  expect((await placed(page, 'Zorblax paste'))[0]).toMatchObject({ quantity: '2' });

  // Typing: the renamed entry is offered by its new name, first, and not by the name it had; the hidden one is not offered at all, though typing it in full still adds it.
  const field = page.getByRole('combobox', { name: 'Add an item' });
  await field.fill('sour');
  await expect(page.getByRole('option').first()).toContainText('Sourdough loaf');
  await field.fill('brea');
  await expect(page.getByRole('option', { name: /Bread rolls/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /^Bread(?! rolls)/ })).toHaveCount(0);
  await field.fill('banan');
  await expect(page.getByRole('option', { name: /Add “banan”/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /^Banana/ })).toHaveCount(0);
  await field.fill('sour');
  await expect(page.getByRole('option').first()).toContainText('Sourdough loaf');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: /Sourdough loaf/ })).toBeVisible();
  // It was made from the Inventory item: the starter's icon and unit, under its aisle, in this list's own product, and nothing more in Inventory.
  await expect.poll(async () => (await placed(page, 'Sourdough loaf')).length).toBe(1);
  expect((await placed(page, 'Sourdough loaf'))[0]).toMatchObject({
    unit: 'pcs',
    icon: 'croissant',
  });
  expect((await rowsOf(page)).filter((row) => row.name === 'Sourdough loaf')).toHaveLength(1);
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 30_000 })
    .toBe(0);
  expect(await deviceRows(page, account, 'failed')).toEqual([]);
});
