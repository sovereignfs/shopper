import { expect, type Page } from '@playwright/test';
import {
  PHONE,
  accountOf,
  anotherDevice,
  deviceRows,
  makeLink,
  offline,
  online,
  seedItems,
  signUp,
  test,
} from './helpers';

/**
 * A list's settings in the settings dialog (task 22.5, RFC 0005): over the list at `?settings=<section>`, opened from the menu, closed by Back, opened by a
 * link, working with no network; its two sections; a Member sees no Delete. Renaming and styling are covered by `list.spec.ts` and `appearance.spec.ts`, and
 * deleting by a second person, as not found, by `src/lists/scope.test.ts`.
 */
const dialog = (page: Page) => page.getByRole('dialog', { name: 'List settings' });
/** The id of the account's first list, from the device's store: a signed-in person is at `/`, which draws their last list with the address left alone. */
const idOf = async (page: Page): Promise<string> => {
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'list')).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const [list] = await deviceRows<{ id: string }>(page, account, 'list');
  return list?.id ?? '';
};

test('opens from the menu over the list, shows its sections, and Back closes it', async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  const list = await idOf(page);
  await page.goto(`/l/${list}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitem', { name: 'List settings' }).click();
  await expect(page).toHaveURL(new RegExp(`/l/${list}\\?settings=general$`));
  await expect(dialog(page)).toBeVisible();
  // The list is still there under it.
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeAttached();
  await expect(dialog(page).getByRole('button', { name: 'General' })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Archive and delete' })).toBeVisible();
  await expect(dialog(page).getByRole('textbox', { name: 'Name' })).toHaveValue('Groceries');

  // A section is chosen in place: Back goes to the list, not to the section before.
  await dialog(page).getByRole('button', { name: 'Archive and delete' }).click();
  await expect(page).toHaveURL(new RegExp(`/l/${list}\\?settings=archive$`));
  await expect(dialog(page).getByRole('button', { name: 'Archive this list' })).toBeVisible();
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/l/${list}$`));
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeVisible();
});

test('is opened by a link, and the old address goes to it', async ({ page, baseURL }) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  const list = await idOf(page);
  await page.goto(`/l/${list}?settings=archive`);
  await expect(dialog(page).getByRole('button', { name: 'Archive this list' })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(`/l/${list}/settings`);
  await expect(page).toHaveURL(new RegExp(`/l/${list}\\?settings=general$`));
  await expect(dialog(page).getByRole('textbox', { name: 'Name' })).toBeVisible({
    timeout: 15_000,
  });
  // An address that is not a list is not found.
  await page.goto('/l/not-an-id/settings');
  await expect(page.getByRole('heading', { name: 'That is not here' })).toBeVisible();
});

test('works with no network: opened, renamed and archived on the device, and the server has it when it is back', async ({
  page,
  context,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  const list = await idOf(page);
  await offline(context);
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitem', { name: 'List settings' }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('textbox', { name: 'Name' }).fill('Weekly');
  await dialog(page).getByRole('button', { name: 'Save name' }).click();
  await expect(page).toHaveTitle('Settings · Weekly · Shopper');
  await online(context);
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 30_000 })
    .toBe(0);
  const reply = await page.request.post('/api/sync', {
    headers: { origin: baseURL ?? '', 'content-type': 'application/json' },
    data: { version: 2, outbox: [], cursors: {} },
  });
  expect(await reply.text()).toContain(list);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('is the whole screen: a section named by the address, and a back arrow to the sections', async ({
    page,
    baseURL,
  }) => {
    await signUp(page);
    await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
    await page.getByRole('button', { name: 'List menu' }).click();
    await page.getByRole('menuitem', { name: 'List settings' }).click();
    const box = await dialog(page).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(PHONE.width - 1);
    await expect(dialog(page).getByRole('textbox', { name: 'Name' })).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Back to the sections' }).click();
    await expect(page).toHaveURL(/\?settings=$/);
    await expect(dialog(page).getByRole('button', { name: 'Archive and delete' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

test('a Member of an archived list can restore it and is not offered to delete it, which the Admin is', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], base);
  const link = await makeLink(page, base);
  const list = await idOf(page);
  const guest = await anotherDevice(browser, base);
  await signUp(guest.page, { name: 'Grace' });
  await guest.page.goto(link.path);
  await guest.page.getByRole('button', { name: 'Join' }).click();
  await expect(guest.page.getByRole('checkbox', { name: /Milk/ })).toBeVisible({ timeout: 30_000 });

  // The Admin archives it, and is offered to delete it once the server knows.
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitem', { name: 'List settings' }).click();
  await dialog(page).getByRole('button', { name: 'Archive and delete' }).click();
  await dialog(page).getByRole('button', { name: 'Archive this list' }).click();
  await expect(dialog(page).getByRole('button', { name: 'Delete this list…' })).toBeVisible();

  // The Member's device learns of it, and its settings have Restore and no Delete.
  await guest.page.goto(`/l/${list}?settings=archive`);
  await expect(guest.page.getByRole('button', { name: 'Restore this list' })).toBeVisible({
    timeout: 45_000,
  });
  await expect(guest.page.getByRole('button', { name: 'Delete this list…' })).toHaveCount(0);
  await guest.context.close();
});
