import { expect, type Page } from '@playwright/test';
import {
  PASSWORD,
  accountOf,
  anotherDevice,
  deviceRows,
  fillSignUp,
  makeLink,
  test,
} from './helpers';
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

  // What Sovereign tells the app when a person's session there ends, or they delete their account (task 2.4). The fake signs the notice with the key it
  // publishes, as Sovereign does, and the test posts it where the manifest says to.
  type Wrong = 'signature' | 'audience' | 'expired' | 'type';
  async function noticeFrom(
    page: Page,
    kind: 'logout' | 'account-deleted',
    sub: string,
    wrong?: Wrong,
  ): Promise<string> {
    const reply = await page.request.post(`http://localhost:${PORTS.coreControl}/notice`, {
      data: { kind, sub, sid: 'core-session-1', wrong },
    });
    expect(reply.ok()).toBe(true);
    return reply.text();
  }
  const sendLogout = (page: Page, token: string) =>
    page.request.post('/api/sovereign/backchannel-logout', { form: { logout_token: token } });
  const sendDeletion = (page: Page, token: string) =>
    page.request.post('/api/sovereign/account-deleted', { form: { account_deleted_token: token } });
  async function signInAs(page: Page, who: { sub: string; email: string; name?: string }) {
    await nextPersonIs(page, who);
    await page.goto('/sign-in');
    await throughSovereign(page);
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
  }

  test('signing out at Sovereign signs the person out here, wherever they are signed in', async ({
    page,
    browser,
  }) => {
    const who = person('leaver');
    await signInAs(page, who);
    const other = await browser.newContext({ baseURL: SOVEREIGN });
    const elsewhere = await other.newPage();
    await signInAs(elsewhere, who);

    const reply = await sendLogout(page, await noticeFrom(page, 'logout', who.sub));
    expect(reply.status()).toBe(200);
    for (const tab of [page, elsewhere]) {
      await tab.goto('/home');
      await expect(tab).toHaveURL(/\/sign-in/);
    }
    await other.close();
    // And they can sign in again: the account is theirs still.
    await signInAs(page, who);
    await signOut(page);
  });

  test('a notice that is wrong, or is sent twice, is refused and ends nothing', async ({
    page,
  }) => {
    const who = person('steady');
    await signInAs(page, who);
    for (const wrong of ['signature', 'audience', 'expired', 'type'] as const) {
      const reply = await sendLogout(page, await noticeFrom(page, 'logout', who.sub, wrong));
      expect(reply.status(), wrong).toBe(400);
      expect(await reply.json()).toEqual({ error: 'invalid_request' });
    }
    // A deletion token is not a logout token, nor the reverse.
    expect(
      (await sendLogout(page, await noticeFrom(page, 'account-deleted', who.sub))).status(),
    ).toBe(400);
    expect((await sendDeletion(page, await noticeFrom(page, 'logout', who.sub))).status()).toBe(
      400,
    );
    // Nothing at all, and not a form.
    expect(
      (await page.request.post('/api/sovereign/backchannel-logout', { form: {} })).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post('/api/sovereign/account-deleted', {
          data: { account_deleted_token: 'x.y.z' },
        })
      ).status(),
    ).toBe(400);
    // They are still signed in.
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();

    // The same good notice twice: the first ends the session, the second is a replay.
    const token = await noticeFrom(page, 'logout', who.sub);
    expect((await sendLogout(page, token)).status()).toBe(200);
    expect((await sendLogout(page, token)).status()).toBe(400);
  });

  test('an account-deleted notice removes the person, and a household they shared goes on without them', async ({
    page,
    browser,
  }) => {
    const host = person('hostdel');
    const leaver = person('gone');
    await signInAs(page, host);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
      timeout: 30_000,
    });
    const link = await makeLink(page, SOVEREIGN);
    const hostAccount = await accountOf(page);

    const guest = await anotherDevice(browser, SOVEREIGN);
    await signInAs(guest.page, leaver);
    await guest.page.goto(link.path);
    await guest.page.getByRole('button', { name: 'Join' }).click();
    await expect(
      guest.page.getByRole('navigation', { name: 'Shopper' }).getByText('Hostdel’s lists'),
    ).toBeVisible({ timeout: 30_000 });

    const deleted = await sendDeletion(page, await noticeFrom(page, 'account-deleted', leaver.sub));
    expect(deleted.status()).toBe(200);
    // Core sends it until it is answered, with a new token: the second is answered 200 as well.
    expect(
      (await sendDeletion(page, await noticeFrom(page, 'account-deleted', leaver.sub))).status(),
    ).toBe(200);

    // The deleted person's session is gone; the host is signed in, with the household whole and the leaver's name still on it as a member who left.
    await guest.page.goto('/home');
    await expect(guest.page).toHaveURL(/\/sign-in/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await deviceRows<{ leftAt: number | null }>(page, hostAccount, 'member')).filter(
            (member) => member.leftAt !== null,
          ).length,
        { timeout: 30_000 },
      )
      .toBe(1);
    await guest.context.close();
  });

  test('these addresses answer only a POST, and where Sovereign is not set up they are not there', async ({
    page,
  }) => {
    for (const path of ['/api/sovereign/backchannel-logout', '/api/sovereign/account-deleted']) {
      expect((await page.request.get(path)).status(), path).toBe(405);
    }
    // The ordinary instance has no core: the same addresses are not found.
    for (const path of ['/api/sovereign/backchannel-logout', '/api/sovereign/account-deleted']) {
      const reply = await page.request.post(`http://localhost:${PORTS.app}${path}`, {
        form: { logout_token: 'x.y.z' },
      });
      expect(reply.status(), path).toBe(404);
    }
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
      await fillSignUp(page, { name: LOCAL.name, email: LOCAL.email, password: PASSWORD });
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
