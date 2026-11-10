import type { Browser, BrowserContext, Page } from '@playwright/test';

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
