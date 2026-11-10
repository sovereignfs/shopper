import { expect, type Page } from '@playwright/test';
import { forgetSession, signUp, sessionOf, test } from './helpers';

/**
 * The working copy on the device (task 6.2), in a browser: after signing up the page opens an IndexedDB database of its own for the account and the sync
 * loop fills it, and signing out takes it away. Writing on two devices and converging is shown with the screens that write (8.3), since the working copy
 * is written through them.
 */
const accountId = async (page: Page) => {
  const session = (await sessionOf(page)) as { user: { id: string } } | null;
  return session?.user.id ?? '';
};

/** Reads a store of the account's database as the page sees it. */
const read = (page: Page, account: string, store: string) =>
  page.evaluate(
    ([name, storeName]) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open(name as string);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction(storeName as string)
            .objectStore(storeName as string)
            .getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
        };
      }),
    [`shopper-${account}`, store],
  );

const databases = (page: Page) =>
  page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));

test('a signed-in page holds the account’s household on the device, filled by the sync loop', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/home');
  const account = await accountId(page);
  await expect
    .poll(async () => (await read(page, account, 'household')).length, { timeout: 15_000 })
    .toBe(1);
  const lists = (await read(page, account, 'list')) as { name: string }[];
  expect(lists.map((list) => list.name)).toEqual(['Groceries']);
  expect((await read(page, account, 'category')).length).toBeGreaterThan(5);
  const meta = await page.evaluate(
    (name) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const open = indexedDB.open(name);
        open.onsuccess = () => {
          const store = open.result.transaction('meta').objectStore('meta');
          const out: Record<string, unknown> = {};
          const keys = store.getAllKeys();
          keys.onsuccess = () => {
            let pending = keys.result.length;
            if (pending === 0) return resolve(out);
            for (const key of keys.result) {
              const value = store.get(key);
              value.onsuccess = () => {
                out[String(key)] = value.result;
                if (--pending === 0) {
                  open.result.close();
                  resolve(out);
                }
              };
            }
          };
        };
      }),
    `shopper-${account}`,
  );
  expect(typeof meta.lastSyncedAt).toBe('number');
  expect(typeof meta.intervalSeconds).toBe('number');
});

test('signing out ends the session and deletes the account’s working copy from the device', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/home');
  const account = await accountId(page);
  await expect
    .poll(async () => (await read(page, account, 'household')).length, { timeout: 15_000 })
    .toBe(1);
  expect(await databases(page)).toContain(`shopper-${account}`);

  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');
  await expect.poll(async () => (await sessionOf(page)) === null).toBe(true);
  await expect.poll(async () => await databases(page)).not.toContain(`shopper-${account}`);
});

test('another account on the same browser has a database of its own', async ({ page, context }) => {
  await signUp(page);
  await page.goto('/home');
  const first = await accountId(page);
  await expect
    .poll(async () => (await read(page, first, 'household')).length, { timeout: 15_000 })
    .toBe(1);
  await forgetSession(page);
  const other = await context.newPage();
  await signUp(other, { name: 'Grace' });
  await other.goto('/home');
  const second = await accountId(other);
  expect(second).not.toBe(first);
  await expect
    .poll(async () => (await read(other, second, 'household')).length, { timeout: 15_000 })
    .toBe(1);
  // The second account never saw the first's household.
  const mine = (await read(other, second, 'household')) as { id: string }[];
  const theirs = (await read(other, first, 'household').catch(() => [])) as { id: string }[];
  expect(theirs.map((h) => h.id).filter((id) => mine.some((m) => m.id === id))).toEqual([]);
});
