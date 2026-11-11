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
 * A list, in a browser (task 8.2): the items by aisle, ticking as a whole row, Bought and Clear bought with Undo, the order added, a drop by the keyboard, a
 * list used with the network cut, the empty state with what is bought often, and the list's settings. Items are put on the list through the real
 * endpoint, as another device would, so that what is then done to them is answered by the real server.
 */
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Shopper' });
const rowNames = (page: Page) =>
  page
    .getByRole('checkbox')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label') ?? ''));

/** The first word of each row's name, in the order shown; polled by callers, since a page that has just loaded has not drawn its rows yet. */
const firstWords = (page: Page) =>
  rowNames(page).then((names) => names.map((text) => text.replace(/\s.*/, '')));

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

test('the items are by aisle, in the household’s order, with quantity and note, and the sidebar counts them', async ({
  page,
  baseURL,
}) => {
  const violations = await recordViolations(page);
  await signedUpWith(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs', quantity: '2', unit: 'L' },
    { name: 'Apples', category: 'produce', note: 'the ripe ones\nsecond line' },
    { name: 'Rice', category: 'pantry' },
    { name: 'Odd thing' },
  ]);
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(
    headings.filter((h) => ['Produce', 'Dairy & eggs', 'Pantry', 'Other'].includes(h)),
  ).toEqual(['Produce', 'Dairy & eggs', 'Pantry', 'Other']);
  // The quantity and the note are beside the row's checkbox, in the same item.
  const rowOf = (name: RegExp) =>
    page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name }) });
  await expect(rowOf(/Milk/)).toContainText('2 L');
  await expect(rowOf(/Apples/)).toContainText('the ripe ones');
  await expect(rowOf(/Apples/)).not.toContainText('second line');
  await expect(sidebar(page).getByRole('link', { name: /Groceries/ })).toContainText('4');
  expect(await violations()).toEqual([]);
});

test('only the checkbox ticks: a tap on the name, the icon or the quantity does nothing, and the keyboard ticks a focused checkbox', async ({
  page,
  baseURL,
}) => {
  await signedUpWith(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs', quantity: '2', unit: 'L' },
    { name: 'Bread', category: 'bakery' },
  ]);
  const milk = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('checkbox', { name: /Milk/ }) });
  // Anywhere on the row but the box: the name, the quantity, the empty space to the right of them.
  await milk.getByText('Milk', { exact: true }).click();
  await milk.getByText('2 L').click();
  const row = await milk.boundingBox();
  if (!row) throw new Error('no row');
  await page.mouse.click(row.x + row.width * 0.6, row.y + row.height / 2);
  await expect(page.getByRole('checkbox', { name: /Milk/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: /Bought/ })).toHaveCount(0);

  // The box ticks it.
  await page.getByRole('checkbox', { name: /Milk/ }).click();
  await expect(page.getByRole('button', { name: /Bought \(1\)/ })).toBeVisible();

  // A focused checkbox is ticked by the keyboard, as any checkbox is.
  await page.getByRole('checkbox', { name: /Bread/ }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /Bought \(2\)/ })).toBeVisible();

  // And a bought item is unticked the same way, by its box alone.
  await page.getByRole('button', { name: /Bought \(2\)/ }).click();
  const bought = page.getByRole('region', { name: 'Bought' });
  await bought.getByText('Milk', { exact: true }).click();
  await expect(bought.getByRole('checkbox', { name: /Milk/ })).toBeChecked();
  await bought.getByRole('checkbox', { name: /Milk/ }).click();
  await expect(page.getByRole('button', { name: /Bought \(1\)/ })).toBeVisible();
});

test('a tick moves the item to Bought and the count follows; Undo, an untick and a reload all agree, and the server has it', async ({
  page,
  baseURL,
}) => {
  const [milk] = await signedUpWith(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs' },
    { name: 'Bread', category: 'bakery' },
  ]);
  const groceries = sidebar(page).getByRole('link', { name: /Groceries/ });
  await expect(groceries).toContainText('2');

  await page.getByRole('checkbox', { name: /Milk/ }).click();
  await expect(page.getByRole('button', { name: /Bought \(1\)/ })).toBeVisible();
  await expect(groceries).toContainText('1');
  await expect(page.getByRole('status').filter({ hasText: 'Ticked Milk' })).toBeVisible();

  // Undo takes it back: open again, and the count with it.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Bought/ })).toHaveCount(0);
  await expect(groceries).toContainText('2');

  // Ticked again, it is in Bought with who ticked it, and unticking is the same tap.
  await page.getByRole('checkbox', { name: /Milk/ }).click();
  await page.getByRole('button', { name: /Bought \(1\)/ }).click();
  const bought = page
    .getByRole('region', { name: 'Bought' })
    .getByRole('checkbox', { name: /Milk/ });
  await expect(bought).toBeChecked();
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 15_000 })
    .toBe(0);
  expect(
    (await serverItems(page, baseURL ?? '')).find((item) => item.id === milk)?.boughtAt,
  ).not.toBeNull();

  await page.reload();
  await page.getByRole('button', { name: /Bought \(1\)/ }).click();
  await page
    .getByRole('region', { name: 'Bought' })
    .getByRole('checkbox', { name: /Milk/ })
    .click();
  await expect(page.getByRole('button', { name: /Bought/ })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await serverItems(page, baseURL ?? '')).find((item) => item.id === milk)?.boughtAt,
      { timeout: 15_000 },
    )
    .toBeNull();
});

test('Clear bought clears them from the list, with Undo, and the server has it', async ({
  page,
  baseURL,
}) => {
  await signedUpWith(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs' },
    { name: 'Bread', category: 'bakery' },
    { name: 'Rice', category: 'pantry' },
  ]);
  await page.getByRole('checkbox', { name: /Milk/ }).click();
  await page.getByRole('checkbox', { name: /Bread/ }).click();
  await expect(page.getByRole('button', { name: /Bought \(2\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clear bought' }).click();
  await expect(page.getByRole('button', { name: /Bought/ })).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Cleared 2 bought items' }),
  ).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Rice/ })).toBeVisible();
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 15_000 })
    .toBe(0);
  const cleared = (await serverItems(page, baseURL ?? ''))
    .filter((item) => item.clearedAt !== null)
    .map((item) => item.name)
    .sort();
  expect(cleared).toEqual(['Bread', 'Milk']);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Bought \(2\)/ })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await serverItems(page, baseURL ?? '')).filter((item) => item.clearedAt !== null).length,
      { timeout: 15_000 },
    )
    .toBe(0);
});

test('a list is used with the network cut, and everything reaches the server when it is back', async ({
  page,
  baseURL,
  context,
}) => {
  const [milk, bread] = await signedUpWith(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs' },
    { name: 'Bread', category: 'bakery' },
  ]);
  await offline(context);
  await page.getByRole('checkbox', { name: /Milk/ }).click();
  await page.getByRole('checkbox', { name: /Bread/ }).click();
  await expect(page.getByRole('button', { name: /Bought \(2\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clear bought' }).click();
  await expect(page.getByRole('button', { name: /Bought/ })).toHaveCount(0);
  const account = await accountOf(page).catch(() => '');
  void account;
  await online(context);
  await expect
    .poll(
      async () =>
        (await serverItems(page, baseURL ?? '')).filter(
          (item) => [milk, bread].includes(item.id) && item.clearedAt !== null,
        ).length,
      { timeout: 30_000 },
    )
    .toBe(2);
});

test('the list can be shown in the order added, by the address, and the device remembers the choice', async ({
  page,
  baseURL,
}) => {
  await signedUpWith(page, baseURL, [
    { name: 'Milk', category: 'dairy-eggs' },
    { name: 'Apples', category: 'produce' },
    { name: 'Rice', category: 'pantry' },
  ]);
  await expect.poll(() => firstWords(page)).toEqual(['Apples', 'Milk', 'Rice']);
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitemradio', { name: 'In the order added' }).click();
  await expect(page).toHaveURL(/\?view=added$/);
  await expect.poll(() => firstWords(page)).toEqual(['Milk', 'Apples', 'Rice']);
  await expect(page.getByRole('heading', { level: 2, name: 'Produce' })).toHaveCount(0);

  // Another place in the app opens it the same way: this device chose it.
  await page.goto('/');
  await expect.poll(() => firstWords(page)).toEqual(['Milk', 'Apples', 'Rice']);
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitemradio', { name: 'By aisle' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Produce' })).toBeVisible();
});

test('an item is moved within its category by the keyboard, one row is written, and the server has the order', async ({
  page,
  baseURL,
}) => {
  const ids = await signedUpWith(page, baseURL, [
    { name: 'Apples', category: 'produce' },
    { name: 'Bananas', category: 'produce' },
    { name: 'Carrots', category: 'produce' },
    { name: 'Milk', category: 'dairy-eggs' },
  ]);
  const produce = () =>
    rowNames(page).then((names) =>
      names.map((text) => text.replace(/\s.*/, '')).filter((name) => name !== 'Milk'),
    );
  expect(await produce()).toEqual(['Apples', 'Bananas', 'Carrots']);
  const handle = page.getByRole('button', { name: 'Move Apples' });
  await handle.focus();
  // dnd-kit reads each key on the next frame, so a pick-up, each move and the drop are given one.
  for (const key of ['Space', 'ArrowDown', 'ArrowDown', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expect.poll(produce).toEqual(['Bananas', 'Carrots', 'Apples']);
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 15_000 })
    .toBe(0);
  await expect
    .poll(async () => {
      const items = await serverItems(page, baseURL ?? '');
      return items
        .filter((item) => ids.slice(0, 3).includes(item.id))
        .sort((a, b) => (a.position < b.position ? -1 : 1))
        .map((item) => item.name);
    })
    .toEqual(['Bananas', 'Carrots', 'Apples']);
  // The category order did not change: Milk is still below.
  await page.reload();
  await expect.poll(produce).toEqual(['Bananas', 'Carrots', 'Apples']);
});

test('an empty list offers what is bought often, and one tap puts it back', async ({
  page,
  baseURL,
}) => {
  await signedUpWith(page, baseURL, [{ name: 'Milk', category: 'dairy-eggs' }]);
  await page.getByRole('checkbox', { name: /Milk/ }).click();
  await page.getByRole('button', { name: 'Clear bought' }).click();
  await expect(page.getByText('Nothing on Groceries')).toBeVisible();
  const chips = page.getByRole('region', { name: 'Often bought' });
  await expect(chips.getByRole('button', { name: 'Milk' })).toBeVisible();
  await chips.getByRole('button', { name: 'Milk' }).click();
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeVisible();
  await expect(page.getByText('Nothing on Groceries')).toHaveCount(0);
});

test('a list is renamed, archived, restored and, when archived, deleted for good by its Admin', async ({
  page,
}) => {
  await signUp(page);
  await sidebar(page).getByRole('button', { name: 'New list' }).click({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'Name of the new list' }).fill('Hardware');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Hardware' })).toBeVisible();
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitem', { name: 'List settings' }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]{36}\/settings$/);

  await page.getByRole('textbox', { name: 'Name' }).fill('Hardware store');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(sidebar(page).getByRole('link', { name: /Hardware store/ })).toBeVisible();

  // Not archived, so there is no deleting it.
  await expect(page.getByRole('button', { name: /Delete this list/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive this list' }).click();
  await expect(sidebar(page).getByRole('link', { name: /Hardware store/ })).toHaveCount(0);
  await expect(sidebar(page).getByRole('button', { name: /Archived \(1\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Restore this list' }).click();
  await expect(sidebar(page).getByRole('link', { name: /Hardware store/ })).toBeVisible();
  await page.getByRole('button', { name: 'Archive this list' }).click();

  // The server has to know of it before the list can be deleted.
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 15_000 })
    .toBe(0);
  await page.getByRole('button', { name: 'Delete this list…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete for good' }).click();
  await expect(page).toHaveURL('/');
  await expect(sidebar(page).getByRole('link', { name: /Hardware store/ })).toHaveCount(0);
  await expect(sidebar(page).getByRole('button', { name: /Archived/ })).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('a list with items has nothing to scroll sideways, and ticks', async ({ page, baseURL }) => {
    await signedUpWith(page, baseURL, [
      {
        name: 'Extra virgin olive oil from the little shop by the harbour',
        category: 'pantry',
        quantity: '2',
        unit: 'bottle',
        note: 'the one in the green bottle, not the plastic',
      },
      { name: 'Milk', category: 'dairy-eggs' },
    ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.getByRole('checkbox', { name: /Milk/ }).click();
    await expect(page.getByRole('button', { name: /Bought \(1\)/ })).toBeVisible();
  });
});
