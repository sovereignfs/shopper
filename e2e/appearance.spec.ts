import { expect, type Page } from '@playwright/test';
import { LIST_ICONS } from '../src/lists/appearance';
import { PASSWORD, anotherDevice, seedItems, signUp, test } from './helpers';

/**
 * A list's icon and colour (task 22.3, RFC 0005), in a real browser: chosen in the list's settings, drawn in the header and the sidebar in the list's
 * colour, kept across a reload, and held by the server only as ciphertext. The marker is the colour and the icon's name, which must be in nothing the
 * server answers once the household's content is encrypted.
 */
// Tall enough that the picker's popover does not move while it is scrolled into view, which a click waits on.
test.use({ viewport: { width: 1280, height: 1000 } });

const VIOLET = '#7c3aed';
const ICON = 'luggage';
const colorOf = (page: Page, link: RegExp) =>
  page
    .getByRole('link', { name: link })
    .first()
    .locator('svg')
    .first()
    .evaluate((svg) => getComputedStyle(svg).color);

test('a list has the defaults until it is given an icon and a colour, and then the sidebar and the header show them, a second device has them, and the server holds only ciphertext', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  const email = await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], base);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();

  // A new list is drawn in the default blue, and nothing has been written for it.
  await expect.poll(() => colorOf(page, /Groceries/)).toBe('rgb(37, 99, 235)');

  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitem', { name: 'List settings' }).click();
  await expect(page).toHaveURL(/\?settings=general$/);

  await page.getByRole('button', { name: 'Icon' }).click();
  // The design system's picker names its options by nothing yet (an icon alone), so the choice is by its place in the set.
  await page
    .getByRole('listbox', { name: 'Icon' })
    .getByRole('option')
    .nth(LIST_ICONS.indexOf(ICON))
    .click();
  await page.getByRole('radio', { name: 'Violet' }).click();
  await expect
    .poll(() => colorOf(page, /Groceries/), { timeout: 10_000 })
    .toBe('rgb(124, 58, 237)');

  // Held by the server as ciphertext: the list has both fields and what was chosen is nowhere in the answer.
  await expect
    .poll(
      async () => {
        const reply = await page.request.post(`${base}/api/sync`, {
          headers: { origin: base, 'content-type': 'application/json' },
          data: { version: 2, outbox: [], cursors: {} },
        });
        const text = await reply.text();
        const body = JSON.parse(text) as {
          households: {
            encryption: { state: string };
            lists: { encrypted?: Record<string, string> }[];
          }[];
        };
        const [own] = body.households;
        const [list] = own?.lists ?? [];
        return (
          own?.encryption.state === 'encrypted' &&
          typeof list?.encrypted?.icon === 'string' &&
          typeof list.encrypted.color === 'string' &&
          !text.includes(VIOLET) &&
          !text.includes(ICON)
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  // Back to the list, as the dialog is closed: the header has the icon, and a reload (the device opening the server's ciphertext again) keeps the colour.
  await page.goBack();
  await expect(page).toHaveURL(/^[^?]*$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  // The list's header draws its icon in the same colour.
  const headerGlyph = page
    .locator('header', { has: page.getByRole('heading', { level: 1, name: 'Groceries' }) })
    .locator('svg')
    .first();
  await expect(headerGlyph).toHaveCSS('color', 'rgb(124, 58, 237)');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await expect
    .poll(() => colorOf(page, /Groceries/), { timeout: 15_000 })
    .toBe('rgb(124, 58, 237)');

  // A second device of the same account signs in, opens the list's content from the server's ciphertext, and draws it in the same colour.
  const second = await anotherDevice(browser, base);
  await second.page.goto('/sign-in');
  await second.page.getByLabel('Email').fill(email);
  await second.page.getByLabel('Password').fill(PASSWORD);
  await second.page.getByRole('button', { name: 'Sign in' }).click();
  await expect(second.page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => colorOf(second.page, /Groceries/), { timeout: 15_000 })
    .toBe('rgb(124, 58, 237)');
  await second.context.close();

  // The default colour again.
  await page.getByRole('button', { name: 'List menu' }).click();
  await page.getByRole('menuitem', { name: 'List settings' }).click();
  await page.getByRole('radio', { name: 'Default colour' }).click();
  await expect.poll(() => colorOf(page, /Groceries/), { timeout: 10_000 }).toBe('rgb(37, 99, 235)');
});
