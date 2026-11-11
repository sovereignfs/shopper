import { expect, type Page } from '@playwright/test';
import { PASSWORD, anotherDevice, makeLink, test } from './helpers';
import { PORTS } from './ports';

/**
 * Signing in through Sovereign (task 2.3, DESIGN.md §15.1), a fake one (`e2e/fake-sovereign-server.ts`), on two instances of their own, **both with sign-up
 * closed**: one that takes only Sovereign, and one that takes both ways. A sign-in through core is not refused by the sign-up setting; one whose address is a
 * local account's is refused with a sentence and makes and touches nothing. The instances keep their accounts between the two browsers, so each test is the
 * same whichever runs first.
 */
const SOVEREIGN = `http://localhost:${PORTS.sovereign}`;
const BOTH = `http://localhost:${PORTS.both}`;
const LOCAL = { email: 'local-owner@both.test', name: 'Local Owner' };

async function nextPersonIs(page: Page, who: { sub: string; email: string; name?: string }) {
  const reply = await page.request.post(`http://localhost:${PORTS.coreControl}/sign-in-as`, {
    data: who,
  });
  expect(reply.ok()).toBe(true);
}

/**
 * Starts the sign-in at Sovereign. Sign-in is rate-limited, three tries in ten seconds from one address, and both browsers reach these instances from the same
 * one: when told so, wait it out and go again, as a person would.
 */
async function throughSovereign(page: Page) {
  const button = page.getByRole('button', { name: 'Sign in with Sovereign' });
  const limited = page.getByText(/Too many tries/);
  for (let attempt = 0; attempt < 3; attempt++) {
    await button.click();
    await expect(
      limited
        .or(page.getByRole('button', { name: 'User menu' }))
        .or(page.getByText(/already an account|Sign-up is closed/)),
    ).toBeVisible();
    if (!(await limited.isVisible())) return;
    await page.waitForTimeout(10_500);
  }
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  // Signed out when the signed-in area is gone: the address alone is `/` before and after.
  await expect(page.getByRole('button', { name: 'User menu' })).toHaveCount(0);
}

const person = (label: string) => ({
  sub: `e2e-${label}-${process.pid}-${Date.now()}`,
  email: `${label}-${process.pid}-${Date.now()}@sovereign.test`,
  name: label[0]?.toUpperCase() + label.slice(1),
});

test.describe('an instance that signs in through Sovereign only, with sign-up closed', () => {
  test.use({ baseURL: SOVEREIGN, viewport: { width: 1280, height: 800 } });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test('offers Sovereign and nothing of the local ways, which are not there to find', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: 'Sign in with Sovereign' })).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveCount(0);
    for (const path of ['/sign-up', '/forgot-password', '/reset-password']) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
  });

  test('anyone Sovereign signs in gets an account, as who Sovereign says they are, with their first household, though sign-up is closed', async ({
    page,
  }) => {
    for (const who of [person('first'), person('second')]) {
      await nextPersonIs(page, who);
      await page.goto('/sign-in');
      await throughSovereign(page);
      await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
      await page.getByRole('button', { name: 'User menu' }).click();
      await expect(page.getByText(who.name, { exact: true })).toBeVisible();
      await expect(page.getByText(who.email)).toBeVisible();
      await page.keyboard.press('Escape');
      // Their own household, with its first list, is made with the account.
      await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole('navigation', { name: 'Shopper' }).getByText('My lists'),
      ).toBeVisible();
      await signOut(page);
    }
  });

  test('the same person signs in again as the same account, and signing out is local', async ({
    page,
  }) => {
    const who = person('again');
    await nextPersonIs(page, who);
    await page.goto('/sign-in');
    await throughSovereign(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
      timeout: 30_000,
    });
    await signOut(page);
    await page.goto('/sign-in');
    await throughSovereign(page);
    // The same account: its household is still the one list, not a second.
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('navigation', { name: 'Shopper' }).getByText('My lists'),
    ).toHaveCount(1);
    await signOut(page);
  });

  test('someone invited by a link signs in through Sovereign and comes back to it, and joins', async ({
    page,
    browser,
  }) => {
    await nextPersonIs(page, person('host'));
    await page.goto('/sign-in');
    await throughSovereign(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
      timeout: 30_000,
    });
    const link = await makeLink(page, SOVEREIGN);

    const guest = await anotherDevice(browser, SOVEREIGN);
    await nextPersonIs(guest.page, person('guest'));
    await guest.page.goto(link.path);
    // Nothing warns of a closed instance: Sovereign is a way in whatever sign-up says.
    await expect(guest.page.getByText(/not taking new ones/)).toHaveCount(0);
    await guest.page.getByRole('link', { name: 'Sign in' }).click();
    await guest.page.getByRole('button', { name: 'Sign in with Sovereign' }).click();
    // Back at the invitation, signed in.
    await expect(guest.page).toHaveURL(link.path);
    await guest.page.getByRole('button', { name: 'Join' }).click();
    await expect(
      guest.page.getByRole('navigation', { name: 'Shopper' }).getByText('Host’s lists'),
    ).toBeVisible({ timeout: 30_000 });
    await guest.context.close();
  });

  test('a person who declines at Sovereign is told so and is not signed in', async ({ page }) => {
    await page.goto('/sign-in?error=access_denied');
    await expect(page.getByText(/You declined to share/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'User menu' })).toHaveCount(0);
  });
});

test.describe('an instance that takes both ways, with sign-up closed', () => {
  test.use({ baseURL: BOTH, viewport: { width: 1280, height: 800 } });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  /** The local account, made once by whichever browser gets here first: sign-up takes the first account and then closes. */
  async function localAccountExists(page: Page) {
    await page.goto('/sign-up');
    if (await page.getByRole('heading', { name: 'Create your account' }).isVisible()) {
      await page.getByLabel('Name').fill(LOCAL.name);
      await page.getByLabel('Email').fill(LOCAL.email);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/$/);
      await signOut(page);
    } else {
      await expect(page.getByRole('heading', { name: 'Sign-up is closed' })).toBeVisible();
    }
  }

  test('offers both ways, and the local one still works', async ({ page }) => {
    await localAccountExists(page);
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: 'Sign in with Sovereign' })).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await page.getByLabel('Email').fill(LOCAL.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
    await signOut(page);
  });

  test('a stranger signs in through Sovereign though local sign-up is closed', async ({ page }) => {
    await localAccountExists(page);
    await nextPersonIs(page, person('stranger'));
    await page.goto('/sign-in');
    await throughSovereign(page);
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
    await signOut(page);
  });

  test('a Sovereign login whose address is a local account’s is refused with a sentence, and the local account is as it was', async ({
    page,
  }) => {
    await localAccountExists(page);
    await nextPersonIs(page, { sub: `e2e-impostor-${process.pid}`, ...LOCAL });
    await page.goto('/sign-in');
    await throughSovereign(page);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText(/Sign in with your password/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'User menu' })).toHaveCount(0);
    // The local account still signs in with its password, as itself.
    await page.getByLabel('Email').fill(LOCAL.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'User menu' }).click();
    await expect(page.getByText(LOCAL.name, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await signOut(page);
  });
});
