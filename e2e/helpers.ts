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
  return { context, page: await context.newPage() };
}

export const PASSWORD = 'correct horse battery';

let counter = 0;
/** An address no other test has used, in either browser: the instance is shared, and a person is made once. */
export const newEmail = (label = 'person'): string =>
  `${label}-${process.pid}-${Date.now()}-${++counter}@example.com`;

/** Makes an account through the sign-up page, as a person would, and waits until they are signed in and on the front address. */
export async function signUp(
  page: Page,
  { name = 'Ada', email = newEmail(), password = PASSWORD, base = '' } = {},
): Promise<string> {
  await page.goto(`${base}/sign-up`);
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(`${base}/`);
  return email;
}

/**
 * Forgets the session the way a browser that lost it would: the page is left first, because a signed-in page syncs in the background and, finding its session
 * gone, sends itself to sign-in (DESIGN.md §12.10), which would meet the next thing a test does with the page.
 */
export async function forgetSession(page: Page): Promise<void> {
  await page.goto('about:blank');
  await page.context().clearCookies();
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
 * Puts items on the person's first list **through the server**, as another device would, and brings them to this one: the real endpoint applies them, so what
 * a test then ticks, clears and moves is real, and the server's answer to it is too. Returns the ids of the items made, in order.
 */
export async function seedItems(page: Page, items: Seed[], baseURL: string): Promise<string[]> {
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
          fields: { name: seed.name, categoryId, createdAt: now, lastAddedAt: now },
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
  const reply = await page.request.post('/api/sync', {
    headers: { origin: baseURL, 'content-type': 'application/json' },
    data: { version: 1, outbox, cursors: {} },
  });
  expect(reply.status()).toBe(200);
  const body = (await reply.json()) as { refused: unknown[] };
  expect(body.refused).toEqual([]);
  await page.reload();
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
    boughtAt: number | null;
    clearedAt: number | null;
    position: string;
    deletedAt: number | null;
  }[]
> {
  const reply = await page.request.post('/api/sync', {
    headers: { origin: baseURL, 'content-type': 'application/json' },
    data: { version: 1, outbox: [], cursors: {} },
  });
  const body = (await reply.json()) as { households: { items: never[] }[] };
  return body.households.flatMap((h) => h.items);
}
