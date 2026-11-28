import { expect, type Locator, type Page } from '@playwright/test';
import { PASSWORD, forgetStores, sessionOf, signUp, test } from './helpers';

/**
 * A password manager can fill a box without telling the page (AutoFill on iOS, until a box is focused). **Shopper's own password forms send what is in
 * their boxes,** not a copy of it kept by the page, and a button does not wait for a box the page never heard of. The forms of sign-in, sign-up and
 * reset are `@sovereignfs/ui`'s, and are its to test.
 */

/** Fills a box as a password manager can: the value is there to see, and no event says so. The prototype's setter is used because React watches the element's own. */
async function fillUnannounced(box: Locator, value: string): Promise<void> {
  await box.evaluate((element, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, text);
  }, value);
}

/** Counts the requests the page makes to an address, from now on. */
function requestsTo(page: Page, path: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === path) count += 1;
  });
  return () => count;
}

test('a filled password unlocks the lists of a browser that lost its key', async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole('heading', { name: 'Groceries', level: 1 })).toBeVisible();
  await forgetStores(page);
  const unlock = page.getByRole('form', { name: 'Unlock' });
  await expect(unlock).toBeVisible({ timeout: 15_000 });

  await fillUnannounced(unlock.getByLabel('Your password'), PASSWORD);
  await unlock.getByRole('button', { name: 'Unlock' }).click();
  await expect(unlock).toHaveCount(0, { timeout: 15_000 });
});

test('a filled password downloads a person’s data, and an empty box asks for it and sends nothing', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/settings/data');
  await page.getByRole('button', { name: 'Download my data…' }).click();
  const form = page.getByRole('form', { name: 'Download my data' });
  const box = form.getByLabel('Your password');
  const sent = requestsTo(page, '/api/account/export');

  await form.getByRole('button', { name: 'Download' }).click({ timeout: 5_000 });
  expect(await box.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(
    true,
  );
  expect(sent()).toBe(0);

  await fillUnannounced(box, PASSWORD);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    form.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^shopper-export-/);
});

test('filled passwords change the password, and what the page refuses it does not send', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/settings/security');
  const form = page.getByRole('form', { name: 'Change password' });
  const current = form.getByLabel('Current password');
  const next = form.getByLabel(/^New password(?! again)/);
  const again = form.getByLabel('New password again');
  const button = form.getByRole('button', { name: 'Change password' });
  const sent = requestsTo(page, '/api/auth/change-password');
  // Off until the page runs, so that waiting for it is waiting for the page.
  await expect(button).toBeEnabled();

  await fillUnannounced(current, PASSWORD);
  await fillUnannounced(next, 'short');
  await fillUnannounced(again, 'short');
  await button.click({ timeout: 5_000 });
  await expect(form.getByText(/The new password needs at least \d+ characters/)).toBeVisible();

  await fillUnannounced(next, 'another horse battery');
  await fillUnannounced(again, 'another horse batter');
  await button.click();
  await expect(form.getByText('The two are not the same.')).toBeVisible();
  expect(sent()).toBe(0);

  await fillUnannounced(again, 'another horse battery');
  await button.click();
  await expect(page.getByText(/Your password is changed/)).toBeVisible({ timeout: 15_000 });
  await expect(current).toHaveValue('');
  await expect(next).toHaveValue('');
  await expect(again).toHaveValue('');
});

test('a filled password deletes the account', async ({ page }) => {
  await signUp(page);
  await page.goto('/settings/data');
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  const remove = page.getByRole('form', { name: 'Delete account' });
  await expect(remove.getByText(/1 list nobody else is on is deleted/)).toBeVisible();

  await fillUnannounced(remove.getByLabel('Your password'), PASSWORD);
  await remove
    .getByRole('button', { name: 'Delete my account for good' })
    .click({ timeout: 5_000 });
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible({ timeout: 15_000 });
  expect(await sessionOf(page)).toBeNull();
});
