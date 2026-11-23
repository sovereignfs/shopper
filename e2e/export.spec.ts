import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { PASSWORD, serverItems, signUp, test } from './helpers';

/**
 * A readable export (task 22.8, RFC 0005), standalone: Settings › Data › Download my data. The browser makes the file, so these read what it downloads: every
 * list and item the person has, in plain text, and nothing of the keys; and a wrong password downloads nothing.
 */
const field = (page: Page) => page.getByRole('combobox', { name: 'Add an item' });

async function openDownload(page: Page) {
  await page.goto('/settings?section=data');
  await page.getByRole('button', { name: 'Download my data…' }).click();
  return page.getByRole('form', { name: 'Download my data' });
}

test('a person downloads their lists and items as one readable file, and a wrong password downloads nothing', async ({
  page,
  baseURL,
}) => {
  const email = await signUp(page, { name: 'Ada Lovelace' });
  await field(page).focus({ timeout: 15_000 });
  for (const text of ['oat milk', 'zorblax bread']) {
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  // What the server holds is sent when the device syncs: wait for both.
  await expect.poll(async () => (await serverItems(page, baseURL ?? '')).length).toBe(2);

  const form = await openDownload(page);
  // A wrong password: no file, and the page says so.
  let downloaded = false;
  page.on('download', () => (downloaded = true));
  await form.getByLabel('Your password').fill('not the password at all');
  await form.getByRole('button', { name: 'Download' }).click();
  await expect(page.getByText('That is not your password.')).toBeVisible();
  expect(downloaded).toBe(false);

  // The right one: one file, readable.
  await form.getByLabel('Your password').fill(PASSWORD);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    form.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^shopper-export-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  const file = JSON.parse(text) as {
    export: { format: number; kind: string; readable: boolean };
    unopened: number;
    records: Record<string, Record<string, unknown>[]>;
  };
  expect(file.export).toMatchObject({ format: 1, kind: 'person', readable: true });
  expect(file.unopened).toBe(0);
  expect(file.records.item?.map((row) => row.name).sort()).toEqual(['Oat milk', 'zorblax bread']);
  expect(file.records.list?.length).toBeGreaterThan(0);
  expect(file.records.person?.[0]).toMatchObject({ email, name: 'Ada Lovelace' });
  // Readable, and with nothing that opens the person's lists: no key, wrapped or not, and no ciphertext.
  expect(text).not.toMatch(/hk1\.|lr1\.|"e2\.\d/);
  await expect(page.getByText('Your data was downloaded.')).toBeVisible();
});
