import { expect, type Page } from '@playwright/test';
import { PHONE, seedItems, signUp, test } from './helpers';

/**
 * Settings, the dialog (task 22.7, RFC 0005), running alone: it is over the page it was opened from, by Next's intercepting route, and over Home when its address
 * is loaded directly; each of its four sections has an address and a title; the old addresses go to the section that took their place; and Preferences keeps
 * how a list shows its items and how Shopper looks on this device. Profile, Security and Data are covered by `auth.spec.ts`, `export.spec.ts` and `security.spec.ts`.
 */
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const openFromMenu = async (page: Page) => {
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
};

test('opened from a page it is over that page, which stays, and Back closes it', async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  const before = page.url();
  await openFromMenu(page);
  // No section is named by `/settings`: on a wide screen the first is shown.
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('textbox', { name: /^Name/ })).toBeVisible();
  await expect(page).toHaveTitle('Settings · Shopper');
  // The page it was opened from is still there under it, and nothing of it was reloaded.
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeAttached();
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(before);
  await expect(page).toHaveTitle('Groceries · Shopper');
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeVisible();
});

test('each section is an address and a title, chosen in place, and loaded directly it is over Home', async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  await openFromMenu(page);
  for (const [name, section] of [
    ['Security', 'security'],
    ['Preferences', 'preferences'],
    ['Data', 'data'],
    ['Profile', 'profile'],
  ] as const) {
    await dialog(page).getByRole('button', { name }).click();
    await expect(page).toHaveURL(new RegExp(`/settings/${section}$`));
    await expect(page).toHaveTitle(`${name} · Settings · Shopper`);
  }
  // Chosen in place: one Back from any section leaves Settings.
  await dialog(page).getByRole('button', { name: 'Security' }).click();
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);

  // A link, a reload or a new tab: Home, with the dialog open on that section, which closes to Home.
  await page.goto('/settings/security');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('form', { name: 'Change password' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeAttached({ timeout: 15_000 });
  await dialog(page).getByRole('button', { name: /close/i }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test('the old addresses go to the section that took their place, and a name that is not a section is not found', async ({
  page,
}) => {
  await signUp(page);
  for (const [from, to] of [
    ['/settings?section=sign-in', 'security'],
    ['/settings?section=encryption', 'security'],
    ['/settings?section=device', 'preferences'],
    ['/settings?section=notifications', 'preferences'],
    ['/settings?section=data', 'data'],
    ['/settings?section=__proto__', 'profile'],
  ] as const) {
    await page.goto(from);
    await expect(page, from).toHaveURL(new RegExp(`/settings/${to}$`));
    await expect(dialog(page), from).toBeVisible();
  }
  // Bare, it is the dialog with no section named, and stays so.
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dialog(page)).toBeVisible();
  await page.goto('/settings/sign-in');
  await expect(page.getByRole('heading', { name: 'That is not here' })).toBeVisible();
});

test('Preferences: how a list shows its items and how Shopper looks are kept on this device', async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(
    page,
    [
      { name: 'Milk', category: 'dairy-eggs' },
      { name: 'Bread', category: 'bakery' },
    ],
    baseURL ?? '',
  );
  await page.goto('/settings/preferences');
  const prefs = dialog(page);
  // By aisle until it is chosen otherwise.
  await expect(prefs.getByRole('radio', { name: 'By aisle' })).toBeChecked();
  await prefs.getByRole('radio', { name: 'In the order added' }).click();
  await page.reload();
  await expect(dialog(page).getByRole('radio', { name: 'In the order added' })).toBeChecked();
  await dialog(page).getByRole('button', { name: /close/i }).click();
  await expect(page.getByRole('list', { name: 'Items in the order added' })).toBeVisible({
    timeout: 15_000,
  });

  // Appearance is applied at once and kept.
  await page.goto('/settings/preferences');
  await dialog(page).getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await dialog(page).getByRole('radio', { name: 'System' }).click();
});

test('Preferences: a time zone and a language are kept on the account and change how dates are written', async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  // An item says when it was added: the browser's own until something is chosen.
  const added = async () => {
    await page.getByRole('button', { name: 'Edit Milk' }).click();
    const text = (await page.getByText(/^Added by/).textContent()) ?? '';
    await page.keyboard.press('Escape');
    return text;
  };
  const before = await added();

  await page.goto('/settings/preferences');
  const prefs = dialog(page);
  await prefs.getByLabel('Language and region').selectOption('de-DE');
  await expect(prefs.getByText('Saved.')).toBeVisible();
  await prefs.getByLabel('Time zone').selectOption('Pacific/Auckland');
  await expect(prefs.getByText('Saved.')).toBeVisible();
  // Kept on the account: a reload has them.
  await page.reload();
  await expect(dialog(page).getByLabel('Language and region')).toHaveValue('de-DE');
  await expect(dialog(page).getByLabel('Time zone')).toHaveValue('Pacific/Auckland');
  await dialog(page).getByRole('button', { name: /close/i }).click();

  // The date is written in German, and in Auckland's time.
  await expect.poll(added, { timeout: 15_000 }).toMatch(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/);
  expect(before).not.toMatch(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/);

  // Back to the browser's own.
  await page.goto('/settings/preferences');
  await dialog(page).getByLabel('Language and region').selectOption('');
  await expect(dialog(page).getByText('Saved.')).toBeVisible();
  await dialog(page).getByLabel('Time zone').selectOption('');
  await expect(dialog(page).getByText('Saved.')).toBeVisible();
});

test('loaded directly, the dialog is the page’s title over the list under it, once the list has opened its name', async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  await page.goto('/settings/security');
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeAttached({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeAttached();
  // The list under it has named itself by now, and Settings is still the title.
  await expect(page).toHaveTitle('Security · Settings · Shopper');
  await dialog(page).getByRole('button', { name: /close/i }).click();
  await expect(page).toHaveTitle('Groceries · Shopper');
});

test('opened from a page, a section is chosen and a setting changed in place: one dialog, the same section, the page beneath; Back and Forward follow the address', async ({
  page,
  baseURL,
}) => {
  await signUp(page);
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
  await openFromMenu(page);
  await dialog(page).getByRole('button', { name: 'Preferences' }).click();
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  // A setting that refreshes the route (the time zone is kept on the account) does not move the dialog.
  await dialog(page).getByLabel('Time zone').selectOption('Europe/Berlin');
  await expect(dialog(page).getByText('Saved.')).toBeVisible();
  await expect(dialog(page)).toHaveCount(1);
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  await expect(dialog(page).getByLabel('Time zone')).toHaveValue('Europe/Berlin');
  await expect(page.getByRole('checkbox', { name: /Milk/ })).toBeAttached();

  // Back leaves Settings; Forward comes back to the section the address names.
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel('Time zone')).toBeVisible();
  await dialog(page).getByLabel('Time zone').selectOption('');
  await expect(dialog(page).getByText('Saved.')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('Settings from the footer is the sections, and reaching a list from the drawer closes it', async ({
    page,
    baseURL,
  }) => {
    await signUp(page);
    await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
    await page.locator('footer').getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(dialog(page).getByRole('button', { name: 'Preferences' })).toBeVisible();
    await expect(dialog(page).getByRole('textbox', { name: /^Name/ })).toHaveCount(0);
    // To a list through the drawer, which a dialog is over: the dialog does not stay open over the next page.
    await dialog(page).getByRole('button', { name: /close/i }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.locator('footer').getByRole('link', { name: 'Settings' }).click();
    await expect(dialog(page)).toBeVisible();
    await page.goBack();
    await expect(dialog(page)).toHaveCount(0);
    await page.locator('footer').getByRole('button', { name: 'Lists' }).click();
    await page
      .getByRole('dialog', { name: 'Navigation' })
      .getByRole('link', { name: /Groceries/ })
      .click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  });

  test('left open, Settings is not over the list reached by the drawer', async ({
    page,
    baseURL,
  }) => {
    await signUp(page);
    await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
    await page.locator('footer').getByRole('link', { name: 'Settings' }).click();
    await expect(dialog(page)).toBeVisible();
    // The drawer is under the dialog, so the way to a list is the browser's: Home by a link in the header's wordmark.
    await page.getByRole('link', { name: 'Shopper' }).first().click({ force: true });
    await expect(dialog(page)).toHaveCount(0, { timeout: 10_000 });
  });
});
