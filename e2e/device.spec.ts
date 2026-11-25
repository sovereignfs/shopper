import { expect, type Page } from '@playwright/test';
import { forgetSession, signOutFromMenu, signUp, sessionOf, test, waitMoved } from './helpers';

/**
 * The working copy on the device (task 6.2), in a browser: after signing up the page opens an IndexedDB database of its own for the account and the sync
 * loop fills it, and signing out takes it away. Writing on two devices and converging is shown with the screens that write (8.3), since the working copy
 * is written through them.
 */
const accountId = async (page: Page) => {
  const session = (await sessionOf(page)) as { user: { id: string } } | null;
  return session?.user.id ?? '';
};

/**
 * A page that is navigating while it is asked a question has no answer, and a poll asks again: the page reloads on its own (a reset, a sign-out), and a
 * question that lands in the middle of it is not a failure.
 */
async function whileNavigating<T>(ask: Promise<T>, otherwise: T): Promise<T> {
  try {
    return await ask;
  } catch (error) {
    if (/context was destroyed|navigat|closed/i.test(String(error))) return otherwise;
    throw error;
  }
}

/** Reads a store of the account's database as the page sees it. */
const read = (page: Page, account: string, store: string) =>
  whileNavigating(
    page.evaluate(
      ([name, storeName]) =>
        new Promise<unknown[]>((resolve, reject) => {
          const open = indexedDB.open(name as string);
          // **Never make the database**: opening one that does not exist yet creates it empty, at version 1, and the app's own open (which makes the stores when it upgrades
          // from nothing) would then find version 1, make none of them, and wait on this very connection. The app has not opened it yet, so there is nothing to read.
          open.onupgradeneeded = () => open.transaction?.abort();
          open.onerror = () =>
            open.error?.name === 'AbortError' ? resolve([]) : reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            try {
              const request = db
                .transaction(storeName as string)
                .objectStore(storeName as string)
                .getAll();
              request.onsuccess = () => {
                db.close();
                resolve(request.result);
              };
              request.onerror = () => reject(request.error);
            } catch {
              db.close();
              resolve([]);
            }
          };
        }),
      [`shopper-${account}`, store],
    ),
    [],
  );

const databases = (page: Page) =>
  whileNavigating(
    page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)),
    [] as (string | undefined)[],
  );

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

  await signOutFromMenu(page);
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

/** Puts a mutation in the device's outbox as a screen that wrote it would have: the loop then sends it, and the server decides. */
const queue = (page: Page, account: string, mutation: unknown) =>
  page.evaluate(
    ([name, value]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name as string);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('outbox', 'readwrite');
          tx.objectStore('outbox').add({ mutation: value, queuedAt: Date.now() });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [`shopper-${account}`, mutation],
  );

test('a change the server refuses is kept in Couldn’t sync with its sentence, and can be moved or discarded', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/home');
  const account = await accountId(page);
  await expect
    .poll(async () => (await read(page, account, 'household')).length, { timeout: 15_000 })
    .toBe(1);
  const [household] = (await read(page, account, 'household')) as { id: string }[];
  const [groceries] = (await read(page, account, 'list')) as { id: string }[];
  const person = ((await read(page, account, 'member')) as { personId: string }[])[0]?.personId;
  // After its household has moved (RFC 0001), so that the change goes, and is refused, on the page the test is looking at.
  await waitMoved(page, new URL(page.url()).origin);
  const uuid = () => crypto.randomUUID();
  const deletedList = uuid();
  const product = uuid();
  const item = uuid();
  const mutation = (listId: string) => ({
    mutationId: uuid(),
    householdId: household?.id,
    changes: [
      {
        table: 'product',
        id: product,
        create: true,
        fields: { name: 'Oat milk', createdAt: Date.now() },
      },
      {
        table: 'item',
        id: item,
        create: true,
        fields: {
          listId,
          productId: product,
          name: 'Oat milk',
          quantity: '2',
          position: 'a0',
          addedBy: person,
          addedAt: Date.now(),
        },
      },
    ],
  });
  await queue(page, account, mutation(deletedList));
  await page.reload();

  // The server refuses it; a toast says so, and the device keeps it. The toast is looked for first: in a household that has moved the refusal comes
  // once the key is open, a moment after the page, and the toast does not stay for long.
  await expect(page.getByText(/Couldn.t add that/)).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await read(page, account, 'failed')).length, { timeout: 15_000 })
    .toBe(1);
  await expect(page.getByRole('img', { name: 'Some changes could not be synced' })).toBeVisible();
  expect(await read(page, account, 'outbox')).toHaveLength(0);

  // The avatar menu leads to it, and it is read in words.
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: /Couldn.t sync \(1\)/ }).click();
  await expect(page).toHaveURL(/\/settings\/device$/);
  const entry = page
    .getByRole('list', { name: 'Changes that could not be synced' })
    .getByRole('listitem');
  await expect(entry).toContainText('Added Oat milk');
  await expect(entry).toContainText('That list was deleted.');
  await expect(page.getByText(/Last synced/)).toBeVisible();

  // Moved to Groceries: it is a new change, which the server takes this time.
  await entry.getByRole('combobox').selectOption({ label: 'Groceries' });
  await entry.getByRole('button', { name: 'Move' }).click();
  await expect(page.getByText(/Nothing is waiting here/)).toBeVisible();
  await expect
    .poll(
      async () =>
        ((await read(page, account, 'item')) as { name: string; listId: string; seq: number }[])
          .filter((i) => i.seq > 0)
          .map((i) => [i.name, i.listId]),
      { timeout: 15_000 },
    )
    .toEqual([['Oat milk', groceries?.id]]);
  await expect(page.getByRole('img', { name: 'Some changes could not be synced' })).toHaveCount(0);

  // Another one is discarded, after asking.
  await queue(page, account, {
    ...mutation(deletedList),
    mutationId: uuid(),
    changes: [
      {
        table: 'item',
        id: uuid(),
        create: true,
        fields: {
          listId: deletedList,
          productId: product,
          name: 'Bread',
          quantity: '1',
          position: 'a1',
          addedBy: person,
          addedAt: Date.now(),
        },
      },
    ],
  });
  await page.reload();
  await expect(page.getByRole('list', { name: 'Changes that could not be synced' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Discard' }).click();
  // The confirmation is a dialog over the settings dialog, so it is named.
  await page
    .getByRole('dialog', { name: /Discard this change/ })
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(page.getByText(/Nothing is waiting here/)).toBeVisible();
  expect(await read(page, account, 'failed')).toHaveLength(0);
});

test('resetting the device sends what is waiting, clears it and loads the household again', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/settings/device');
  const account = await accountId(page);
  await expect
    .poll(async () => (await read(page, account, 'household')).length, { timeout: 15_000 })
    .toBe(1);
  const [before] = (await read(page, account, 'household')) as { id: string }[];
  // Nothing was waiting, so it does not ask: the page reloads and the device fills again from the server. **The reload is waited for**, and it is the proof that the reset ran (the page reloads
  // for nothing else here): the household is there the moment the button is pressed, since the device is not cleared yet, so a poll for it alone ends at once and the read after it can land
  // in the middle of the clearing and find none.
  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Reset this device' }).click();
  await reloaded;
  await expect
    .poll(async () => (await read(page, account, 'household')).length, { timeout: 20_000 })
    .toBe(1);
  const [after] = (await read(page, account, 'household')) as { id: string }[];
  expect(after?.id).toBe(before?.id);
  expect(await sessionOf(page)).not.toBeNull();
});
