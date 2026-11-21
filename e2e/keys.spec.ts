import { expect } from '@playwright/test';
import { PASSWORD, signUp, test } from './helpers';

/**
 * The key in the page (task 18.4, RFC 0001): open after signing up; when this browser no longer holds it, the lists stay and a prompt above them asks
 * for the password, which opens it again; a wrong one does not. Nothing of it is shown as ciphertext.
 */
test('a locked key asks for the password above the lists, opens with it, and not with another', async ({
  page,
}) => {
  await signUp(page);
  await expect(page.getByRole('heading', { name: 'Groceries', level: 1 })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Unlock' })).toHaveCount(0);

  // This browser forgets what it kept of the key (its stores emptied), as one would whose kept key was lost.
  await page.evaluate(async () => {
    for (const database of await indexedDB.databases())
      if (database.name) indexedDB.deleteDatabase(database.name);
  });
  await page.reload();
  const unlock = page.getByRole('form', { name: 'Unlock' });
  await expect(unlock).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Groceries', level: 1 })).toBeVisible();

  await unlock.getByLabel('Your password').fill('not the password');
  await unlock.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('That does not open your lists.')).toBeVisible({ timeout: 15_000 });

  await unlock.getByLabel('Your password').fill(PASSWORD);
  await unlock.getByRole('button', { name: 'Unlock' }).click();
  await expect(unlock).toHaveCount(0, { timeout: 15_000 });
});
