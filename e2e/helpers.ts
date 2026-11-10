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
