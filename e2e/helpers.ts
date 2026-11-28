import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/**
 * What the browser tests share. The helpers are the three things a test of an app that works offline and is shared needs: a phone's width, the
 * network going away and coming back, and a second person, in a context of their own, so that two devices can be driven by one test.
 */

/** A phone's viewport: the width the design says the phone's layout begins below (DESIGN.md §16.11). */
export const PHONE = { width: 375, height: 812 } as const;

/** Takes the network away from a context, and gives it back. Pages already open keep their state, and fetches fail as they would in a basement. */
export async function offline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
}

export async function online(context: BrowserContext): Promise<void> {
  await context.setOffline(false);
}

/** A second person, or a second device: a new context with none of the first one's cookies or storage, and a page in it. */
export async function anotherDevice(
  browser: Browser,
  baseURL: string,
  options: { phone?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    ...(options.phone ? { viewport: PHONE } : {}),
  });
  // An address of its own, so that the sign-up limits, which count by address, do not meet a second person made by the same run of tests.
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`,
  });
  return { context, page: await context.newPage() };
}

export const PASSWORD = 'correct horse battery';

let counter = 0;
/** An address no other test has used, in either browser: the instance is shared, and a person is made once. */
export const newEmail = (label = 'person'): string =>
  `${label}-${process.pid}-${Date.now()}-${++counter}@example.com`;

/**
 * Fills the sign-up form on the page that is open. The page is server-rendered and then hydrated, and React sets a controlled field back to its state
 * when it hydrates: a field filled in before that is emptied, and the form, with a required field empty, does not submit. WebKit on a slow runner meets
 * it. So the fields are filled until they hold what was typed, which they do once the page is hydrated. Every test that fills this form uses it.
 */
export async function fillSignUp(
  page: Page,
  { name, email, password }: { name: string; email: string; password: string },
): Promise<void> {
  const fields = [
    [page.getByLabel('Name'), name],
    [page.getByLabel('Email'), email],
    [page.getByLabel('Password', { exact: true }), password],
    [page.getByLabel('Confirm password'), password],
  ] as const;
  await expect(async () => {
    for (const [field, value] of fields) await field.fill(value);
    for (const [field, value] of fields) await expect(field).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** A value of the shape a page sends for a password (RFC 0001), for a request a test makes itself: the server checks the shape, not the value. */
export const DERIVED_SHAPE = `svp1.${'A'.repeat(43)}`;

/** Makes an account through the sign-up page, as a person would, and waits until they are signed in and on the front address. */
export async function signUp(
  page: Page,
  { name = 'Ada', email = newEmail(), password = PASSWORD, base = '', home = false } = {},
): Promise<string> {
  await page.goto(`${base}/sign-up`);
  await fillSignUp(page, { name, email, password });
  await page.getByRole('button', { name: 'Create account' }).click();
  await keepKit(page);
  await expect(page).toHaveURL(`${base}/`);
  // A new account opens on Home (RFC 0006), whose Continue is its Groceries: most tests want the list, and go on to it. A test of Home itself stays.
  if (!home) await continueToList(page);
  return email;
}

/** From Home to the list it continues on (the one used last, or a new account's Groceries). */
export async function continueToList(page: Page): Promise<void> {
  await page.getByRole('link', { name: /^Continue/ }).click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]{36}$/);
}

/**
 * A new password account is shown its recovery kit before anything else (RFC 0001): says it was kept, and goes on. The page is waited for, since the
 * password is derived and the keys are made first, which takes a moment.
 */
export async function keepKit(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/keys\/kit/, { timeout: 15_000 });
  await page.getByRole('checkbox', { name: /kept my recovery kit/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
}

/**
 * Deletes the signed-in account from Settings, as a person does: the password is derived by the page and never sent (RFC 0001), so a test cannot post
 * it to the route itself. `expect` is what the page says after: the sign-in link once the account is gone, or the refusal of a wrong password.
 */
export async function deleteInSettings(page: Page, password: string): Promise<void> {
  await page.goto('/settings/data');
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  const remove = page.getByRole('form', { name: 'Delete account' });
  await expect(remove.getByLabel('Your password')).toBeVisible();
  await remove.getByLabel('Your password').fill(password);
  await remove.getByRole('button', { name: 'Delete my account for good' }).click();
}

/**
 * Forgets the session the way a browser that lost it would: the page is left first, because a signed-in page syncs in the background and, finding its session
 * gone, sends itself to sign-in (DESIGN.md §12.10), which would meet the next thing a test does with the page.
 */
export async function forgetSession(page: Page): Promise<void> {
  await page.goto('about:blank');
  await page.context().clearCookies();
}

/**
 * Forgets what this browser keeps in IndexedDB, as one that lost its key would, and opens the page again. The page is left first, for an address of the app that
 * opens no store, and each deletion is waited for: asked from an open page a deletion waits for that page to go, and WebKit then now and then hands the next page
 * the store as it was.
 */
export async function forgetStores(page: Page): Promise<void> {
  const at = page.url();
  await page.goto(new URL('/api/health', at).href);
  await page.evaluate(async () => {
    for (const { name } of await indexedDB.databases())
      if (name)
        await new Promise((done, failed) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = done;
          request.onerror = failed;
        });
  });
  await page.goto(at);
}

/** Records every Content-Security-Policy violation the page raises, from before it runs anything. */
export async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      w.__violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return () => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
}

/** Whether the browser has a session, asked of the server as the app's own pages ask it. */
export async function sessionOf(
  page: Page,
  base = '',
): Promise<{ user: { email: string } } | null> {
  const reply = await page.request.get(`${base}/api/auth/get-session`);
  return (await reply.json()) as { user: { email: string } } | null;
}

/**
 * Sign-up and sign-in are rate-limited per address, and every test reaches the one instance from the same one, so they would meet each other's limit. A
 * person on their own connection does not, so each test is a visitor of its own: an address in `X-Forwarded-For`, which is what a proxy in front of the
 * app tells it. `ip` is that address, for a test that calls the API itself.
 */
export const test = base.extend<{ ip: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads which fixtures a fixture needs from its destructuring, and this one needs none
  ip: async ({}, use, testInfo) => {
    let hash = 0;
    for (const char of `${testInfo.project.name}|${testInfo.titlePath.join('|')}`)
      hash = (hash * 31 + char.charCodeAt(0)) % 64_000;
    await use(`10.${Math.floor(hash / 250) % 250}.${hash % 250}.${testInfo.retry + 1}`);
  },
  context: async ({ context, ip }, use) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': ip });
    await use(context);
  },
});

/** What a store of the account's database holds, as the page sees it. A page that is navigating has no answer, and a poll asks again. */
export async function deviceRows<T = Record<string, unknown>>(
  page: Page,
  account: string,
  store: string,
): Promise<T[]> {
  try {
    return (await page.evaluate(
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
    )) as T[];
  } catch (error) {
    if (/context was destroyed|navigat|closed/i.test(String(error))) return [];
    throw error;
  }
}

/** The signed-in account's id, asked of the server as the app's own pages ask it. */
export async function accountOf(page: Page): Promise<string> {
  const session = (await sessionOf(page)) as { user: { id: string } } | null;
  return session?.user.id ?? '';
}

export interface Seed {
  name: string;
  /** A starter category key: `produce`, `dairy-eggs`, … ; none is Other. */
  category?: string;
  quantity?: string;
  unit?: string;
  note?: string;
}

/**
 * Puts items on the person's first list **through this device's outbox**, as the app does, so that they are encrypted as it sends them: the real endpoint applies them, so what
 * a test then ticks, clears and moves is real, and the server's answer to it is too. Returns the ids of the items made, in order.
 */
export async function seedItems(page: Page, items: Seed[], _baseURL: string): Promise<string[]> {
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'list')).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const [household] = await deviceRows<{ id: string }>(page, account, 'household');
  const [list] = await deviceRows<{ id: string }>(page, account, 'list');
  const [member] = await deviceRows<{ personId: string }>(page, account, 'member');
  const categories = await deviceRows<{ id: string; starterKey: string }>(
    page,
    account,
    'category',
  );
  const now = Date.now();
  const ids: string[] = [];
  const outbox = items.map((seed, index) => {
    const product = crypto.randomUUID();
    const item = crypto.randomUUID();
    ids.push(item);
    const categoryId =
      categories.find((c) => c.starterKey === (seed.category ?? 'other'))?.id ?? null;
    return {
      mutationId: crypto.randomUUID(),
      householdId: household?.id,
      changes: [
        {
          table: 'product',
          id: product,
          create: true,
          // A product is its list's (RFC 0004): an encrypted one is encrypted under that list's keys.
          fields: {
            listId: list?.id,
            name: seed.name,
            categoryId,
            createdAt: now,
            lastAddedAt: now,
          },
        },
        {
          table: 'item',
          id: item,
          create: true,
          fields: {
            listId: list?.id,
            productId: product,
            name: seed.name,
            quantity: seed.quantity ?? '1',
            unit: seed.unit ?? null,
            note: seed.note ?? null,
            categoryId,
            position: `a${index}`,
            addedBy: member?.personId,
            addedAt: now + index,
          },
        },
      ],
    };
  });
  // Into this device's outbox, as the app writes what a person adds: the app sends it, encrypted where its household has moved (RFC 0001), and the
  // server's answer brings the rows back. A server holds plain text sent to a household that has moved, so a test cannot post it as itself.
  await page.evaluate(
    ([name, entries]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name as string);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('outbox', 'readwrite');
          for (const mutation of entries as unknown[])
            tx.objectStore('outbox').add({ mutation, queuedAt: Date.now() });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [`shopper-${account}`, outbox] as const,
  );
  await page.reload();
  await expect
    .poll(
      async () => {
        const have = new Set(
          (await deviceRows<{ id: string }>(page, account, 'item')).map((row) => row.id),
        );
        return ids.every((id) => have.has(id));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return ids;
}

/** What the server holds of the person's items now, by asking it as a device with nothing would. */
export async function serverItems(
  page: Page,
  baseURL: string,
): Promise<
  {
    id: string;
    name: string;
    quantity: string;
    unit: string | null;
    note: string | null;
    categoryId: string | null;
    listId: string;
    boughtAt: number | null;
    clearedAt: number | null;
    position: string;
    deletedAt: number | null;
  }[]
> {
  const reply = await page.request.post('/api/sync', {
    headers: { origin: baseURL, 'content-type': 'application/json' },
    data: { version: 2, outbox: [], cursors: {} },
  });
  const body = (await reply.json()) as {
    households: { items: { id: string; name: string; note: string | null }[] }[];
  };
  // A household that has moved holds only ciphertext (RFC 0001): what each row says is the server's, and its name and note are what this device opened of
  // the same row.
  const account = await accountOf(page);
  const opened = new Map(
    (
      await deviceRows<{ id: string; name: string; note: string | null }>(page, account, 'item')
    ).map((row) => [row.id, row]),
  );
  return body.households.flatMap((h) =>
    h.items.map((item) => {
      const mine = opened.get(item.id);
      return { ...item, name: mine?.name ?? item.name, note: mine ? mine.note : item.note };
    }),
  ) as never[];
}

/**
 * Makes a link to a list of the person's **through the Share dialog**, as a person does (8.7), and returns its path and id. An encrypted list's link
 * carries its keys after `#` (RFC 0001, RFC 0004), which only the page can make, so a test cannot ask the operation for one itself.
 */
export async function makeLink(page: Page, baseURL: string): Promise<{ path: string; id: string }> {
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'household')).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const [household] = await deviceRows<{ id: string }>(page, account, 'household');
  // The list the dialog is about (RFC 0004): the one open, by its address, else the first.
  const open = /\/l\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  const list = open ?? (await deviceRows<{ id: string }>(page, account, 'list'))[0]?.id;
  const dialog = page.getByRole('dialog', { name: /^Share / });
  if (!(await dialog.isVisible()))
    await page.getByRole('button', { name: 'Share', exact: true }).last().click();
  await dialog.getByRole('button', { name: 'Make a link' }).click();
  const field = dialog.getByRole('textbox', { name: 'Link to share' });
  await expect(field).toHaveValue(/\/invite\//);
  const url = new URL(await field.inputValue());
  await page.keyboard.press('Escape');
  const listed = await page.request.post('/api/ops', {
    headers: { origin: baseURL, 'content-type': 'application/json' },
    data: { op: 'invite.list', household: household?.id, list },
  });
  const links = ((await listed.json()).result ?? []) as { id: string; createdAt?: number }[];
  const newest = [...links].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
  return { path: `${url.pathname}${url.hash}`, id: newest?.id ?? '' };
}

/**
 * Waits until every household of the page's account has moved to its device's encryption (RFC 0001), as each does once its device opens its key: a
 * test that writes to it then does so after the move, and not in a race with it.
 */
export async function waitMoved(page: Page, baseURL: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const reply = await page.request.post(`${baseURL}/api/sync`, {
          headers: { origin: baseURL, 'content-type': 'application/json' },
          data: { version: 2, outbox: [], cursors: {} },
        });
        const body = (await reply.json()) as { households?: { encryption?: { state: string } }[] };
        return (
          (body.households ?? []).length > 0 &&
          (body.households ?? []).every((h) => h.encryption?.state === 'encrypted')
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * Signs out from the avatar's menu, as a person does. Right after signing up the page is still settling (its lists move to the device's encryption and the
 * key opens again, which draws the header anew), and a click on a menu that is being drawn again is lost: WebKit shows it most. So the menu is opened and
 * Sign out chosen again until the signed-in area is gone.
 */
export async function signOutFromMenu(page: Page): Promise<void> {
  await expect(async () => {
    const menu = page.getByRole('button', { name: 'User menu' });
    if ((await menu.count()) > 0) {
      await menu.click({ timeout: 2_000 });
      await page.getByRole('menuitem', { name: 'Sign out' }).click({ timeout: 2_000 });
    }
    await expect(page.getByRole('button', { name: 'User menu' })).toHaveCount(0, {
      timeout: 5_000,
    });
  }).toPass({ timeout: 30_000 });
}
