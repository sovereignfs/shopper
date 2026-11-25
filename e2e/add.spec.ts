import { expect, type Page } from '@playwright/test';
import {
  accountOf,
  deviceRows,
  offline,
  online,
  recordViolations,
  serverItems,
  signUp,
  test,
} from './helpers';

/**
 * Adding, in a browser (task 8.3): the add field at the top of a list, typed with the keyboard alone, suggestions from the device, an open product bumped
 * and not doubled, the field kept focused and empty, and the whole of it with the network cut.
 */
const field = (page: Page) => page.getByRole('combobox', { name: 'Add an item' });
const names = (page: Page) =>
  page
    .getByRole('checkbox')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label') ?? ''));

async function typeAndEnter(page: Page, text: string) {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('a list of ten is typed with the keyboard alone, the field staying focused and empty', async ({
  page,
}) => {
  const violations = await recordViolations(page);
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await field(page).focus({ timeout: 15_000 });
  const typed = [
    'milk',
    'bread',
    'eggs',
    'bananas',
    'butter',
    'rice',
    'pasta',
    'tomatoes',
    'cheese',
    'Zorblax',
  ];
  for (const text of typed) {
    await typeAndEnter(page, text);
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue('');
  }
  await expect(page.getByRole('checkbox')).toHaveCount(10);
  const shown = (await names(page)).join(' ').toLowerCase();
  for (const text of ['milk', 'bread', 'zorblax']) expect(shown).toContain(text);
  expect(await violations()).toEqual([]);
});

test('an open product is bumped, not doubled, and says so while typing', async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await field(page).focus({ timeout: 15_000 });
  await typeAndEnter(page, 'Oat milk');
  await expect(page.getByRole('checkbox', { name: /Oat milk/ })).toBeVisible();
  await page.keyboard.type('oat');
  await expect(page.getByRole('option', { name: /Oat milk/ })).toContainText('On the list');
  await page.keyboard.press('Enter');
  // The same name typed in other capitals is the same product.
  await typeAndEnter(page, 'OAT MILK');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await expect(
    page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: /Oat milk/ }) }),
  ).toContainText('3');
});

test('adding works with the network cut and everything reaches the server when it is back', async ({
  page,
  context,
  baseURL,
}) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await offline(context);
  await field(page).focus({ timeout: 15_000 });
  await typeAndEnter(page, 'milk');
  await typeAndEnter(page, 'Quince jam');
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await online(context);
  await expect
    .poll(async () => (await serverItems(page, baseURL ?? '')).length, { timeout: 30_000 })
    .toBe(2);
});

test('a new name typed makes an Inventory item, marked once, that reaches the server, and a name the person has makes none', async ({
  page,
}) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  const account = await accountOf(page);
  const inventory = async () =>
    (
      await deviceRows<{ name: string | null; recurring: boolean; starterKey: string | null }>(
        page,
        account,
        'inventory_item',
      )
    ).filter((row) => row.starterKey === null);
  await field(page).focus({ timeout: 15_000 });
  // A name nobody has typed is a new one: Inventory learns it, marked once.
  await typeAndEnter(page, 'Zorblax');
  await expect(page.getByRole('checkbox', { name: /Zorblax/ })).toBeVisible();
  await expect
    .poll(async () => (await inventory()).map((row) => row.name), { timeout: 15_000 })
    .toEqual(['Zorblax']);
  expect((await inventory())[0]?.recurring).toBe(false);
  // The same name again bumps the item on the list; a starter entry's name is in Inventory already. Neither makes one: another new name after them is the last, and when it
  // is there the two before it have had their turn (each write follows the list's).
  await typeAndEnter(page, 'zorblax');
  await typeAndEnter(page, 'bananas');
  await typeAndEnter(page, 'Quuxle');
  await expect
    .poll(async () => (await inventory()).map((row) => row.name).sort(), { timeout: 15_000 })
    .toEqual(['Quuxle', 'Zorblax']);
  // Both writes reach the server: the outbox empties, and nothing was refused (the Inventory item is written beside the list's, in two mutations).
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 15_000 })
    .toBe(0);
  expect(await deviceRows(page, account, 'failed')).toEqual([]);
  // Gone and back from the server: a reload shows Inventory as the server has it.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await expect
    .poll(async () => (await inventory()).map((row) => row.name).sort(), { timeout: 15_000 })
    .toEqual(['Quuxle', 'Zorblax']);
});
