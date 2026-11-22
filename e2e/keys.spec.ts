import { expect } from '@playwright/test';
import { PASSWORD, anotherDevice, signUp, test } from './helpers';

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
  // Its household has moved, so with its store emptied and its key locked there is nothing it can open: the prompt says what to do.
  const unlock = page.getByRole('form', { name: 'Unlock' });
  await expect(unlock).toBeVisible({ timeout: 15_000 });

  await unlock.getByLabel('Your password').fill('not the password');
  await unlock.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('That does not open your lists.')).toBeVisible({ timeout: 15_000 });

  await unlock.getByLabel('Your password').fill(PASSWORD);
  await unlock.getByRole('button', { name: 'Unlock' }).click();
  await expect(unlock).toHaveCount(0, { timeout: 15_000 });
  // Open, the device pulls the household again, and opens it.
  await expect(
    page.getByRole('navigation', { name: 'Shopper' }).getByText('Groceries'),
  ).toBeVisible({
    timeout: 15_000,
  });
});

test('a new account’s household moves to its device’s encryption: what is typed into it reaches the server only as ciphertext, and the page reads it', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  const MARKER = `Oatmilk${Date.now().toString(36)}`;
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  const field = page.getByRole('combobox', { name: 'Add an item' });
  await field.focus({ timeout: 15_000 });
  await field.pressSequentially(MARKER);
  await field.press('Enter');
  await expect(field).toHaveValue('');
  await expect(page.getByText(MARKER).first()).toBeVisible();
  // The server holds it, and nowhere in what it answers is what was typed.
  await expect
    .poll(
      async () => {
        const reply = await page.request.post(`${base}/api/sync`, {
          headers: { origin: base, 'content-type': 'application/json' },
          data: { version: 2, outbox: [], cursors: {} },
        });
        const text = await reply.text();
        const body = JSON.parse(text) as {
          households: { encryption: { state: string }; items: unknown[] }[];
        };
        const [own] = body.households;
        return (
          own?.encryption.state === 'encrypted' && own.items.length > 0 && !text.includes(MARKER)
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  // After a reload the page opens it from the server's ciphertext.
  await page.reload();
  await expect(page.getByText(MARKER).first()).toBeVisible({ timeout: 15_000 });

  // Someone else cannot ask for its rows, nor move it.
  const other = await anotherDevice(browser, base);
  await signUp(other.page, { name: 'Eve' });
  const [own] = (
    (await (
      await page.request.post(`${base}/api/sync`, {
        headers: { origin: base, 'content-type': 'application/json' },
        data: { version: 2, outbox: [], cursors: {} },
      })
    ).json()) as { households: { household: string }[] }
  ).households;
  expect(
    (await other.page.request.get(`${base}/api/keys/move?household=${own?.household}`)).status(),
  ).toBe(404);
  await other.context.close();
});
