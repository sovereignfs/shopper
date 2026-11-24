import { expect, type Page } from '@playwright/test';
import { accountOf, anotherDevice, deviceRows, makeLink, test, signOutFromMenu } from './helpers';
import { PORTS } from './ports';

/**
 * Signing in through Sovereign (task 2.3, DESIGN.md §15.1), a fake one (`e2e/fake-sovereign-server.ts`), on two instances of their own, **both with sign-up
 * closed**: one set up with Sovereign only, and one set up both ways, which runs in suite mode all the same (RFC 0005). In suite mode `/sign-in` and
 * `/sign-up` send the browser to core at once, and the fake signs in whoever it was told to, so arriving at either is coming back signed in. A sign-in
 * through core is not refused by the sign-up setting. The instances keep their accounts between the two browsers, so each test is the same whichever
 * runs first.
 */
const SOVEREIGN = `http://localhost:${PORTS.sovereign}`;
const BOTH = `http://localhost:${PORTS.both}`;

async function nextPersonIs(
  page: Page,
  who: {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
    locale?: string;
    zoneinfo?: string;
    signedInSecondsAgo?: number;
  },
) {
  const reply = await page.request.post(`http://localhost:${PORTS.coreControl}/sign-in-as`, {
    data: who,
  });
  expect(reply.ok()).toBe(true);
}

/**
 * Signs in at Sovereign by opening `/sign-in` (or `path`), which in suite mode goes to core and back. Sign-in is rate-limited, three tries in ten seconds
 * from one address, and both browsers reach these instances from the same one: when told so, wait it out and go again, as a person would.
 */
async function throughSovereign(page: Page, path = '/sign-in') {
  const limited = page.getByText(/Too many tries/);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(path);
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
  // Signed out when the signed-in area is gone: the address alone is `/` before and after.
  await signOutFromMenu(page);
}

const person = (label: string) => ({
  sub: `e2e-${label}-${process.pid}-${Date.now()}`,
  email: `${label}-${process.pid}-${Date.now()}@sovereign.test`,
  name: label[0]?.toUpperCase() + label.slice(1),
});

test.describe('an instance that signs in through Sovereign only, with sign-up closed', () => {
  test.use({ baseURL: SOVEREIGN, viewport: { width: 1280, height: 800 } });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test('sends sign-in and sign-up to core at once, and has nothing of the local ways, which are not there to find', async ({
    page,
  }) => {
    for (const path of ['/forgot-password', '/reset-password']) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in with Sovereign' })).toBeVisible();
    // Sign-up has no form of its own: it is core's, so the page sends the browser there and back, asking for core's sign-up (`prompt=create`).
    await nextPersonIs(page, person('signup'));
    await throughSovereign(page, '/sign-up');
    const prompts = async () =>
      (await (await page.request.get(`http://localhost:${PORTS.coreControl}/prompts`)).json()) as (
        string | null
      )[];
    expect((await prompts()).at(-1)).toBe('create');
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveCount(0);
    await signOut(page);
    // Sign-in asks for core's sign-in, with no prompt.
    await nextPersonIs(page, person('signin'));
    await throughSovereign(page);
    expect((await prompts()).at(-1)).toBeNull();
    await signOut(page);
  });

  test('anyone Sovereign signs in gets an account, as who Sovereign says they are, with their first household, though sign-up is closed', async ({
    page,
  }) => {
    for (const who of [person('first'), person('second')]) {
      await nextPersonIs(page, who);
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

  test('Settings is core’s to say: the profile as core says it, with its picture, and links to core in place of a password and a delete', async ({
    page,
  }) => {
    const core = `http://localhost:${PORTS.coreAuth}`;
    const who = { ...person('pictured'), picture: `${core}/avatar.png` };
    await nextPersonIs(page, who);
    await throughSovereign(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
      timeout: 30_000,
    });
    // The page's policy lets an image come from core and from nowhere else beyond the app, and the avatar in the header is core's picture.
    const csp = (await page.request.get('/')).headers()['content-security-policy'] ?? '';
    expect(csp).toContain(`img-src 'self' data: blob: ${core}`);
    await expect(page.getByRole('button', { name: 'User menu' }).locator('img')).toHaveAttribute(
      'src',
      `${core}/avatar.png`,
    );

    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    // Profile: read only, as core says it, with a way to change it there.
    await expect(dialog.getByText(who.name, { exact: true })).toBeVisible();
    await expect(dialog.getByText(who.email)).toBeVisible();
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'Edit in Sovereign' })).toHaveAttribute(
      'href',
      `${core}/profile`,
    );
    await expect(dialog.locator('img').first()).toHaveAttribute('src', `${core}/avatar.png`);
    // Security: core's, with no password to change here.
    await dialog.getByRole('button', { name: 'Security' }).click();
    await expect(dialog.getByRole('link', { name: /Sovereign’s security/ })).toHaveAttribute(
      'href',
      `${core}/security`,
    );
    await expect(dialog.getByRole('link', { name: 'Open your keys' })).toHaveAttribute(
      'href',
      `${core}/keys`,
    );
    await expect(dialog.getByRole('form', { name: 'Change password' })).toHaveCount(0);
    // Preferences: appearance, language and notifications are core's; the list's view and this device are Shopper's.
    await dialog.getByRole('button', { name: 'Preferences' }).click();
    await expect(dialog.getByRole('link', { name: 'Change them in Sovereign' })).toHaveAttribute(
      'href',
      `${core}/preferences`,
    );
    await expect(dialog.getByRole('radio', { name: 'By aisle' })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Dark' })).toBeVisible();
    // Data: Shopper's export, a line about core's, and deleting is core's.
    await dialog.getByRole('button', { name: 'Data' }).click();
    await expect(dialog.getByText(/holds Shopper’s part/)).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Delete it in Sovereign' })).toHaveAttribute(
      'href',
      `${core}/delete-account`,
    );
    await expect(dialog.getByRole('button', { name: 'Delete my account…' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await signOut(page);
  });

  test('Sovereign’s language and time zone are the ones dates are written in, as it says them at each sign-in, and are changed there', async ({
    page,
  }) => {
    const first = person('regional');
    await nextPersonIs(page, first);
    await throughSovereign(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
      timeout: 30_000,
    });
    await signOut(page);

    // The same person, with a language and a time zone at Sovereign now.
    await nextPersonIs(page, { ...first, locale: 'de-DE', zoneinfo: 'Pacific/Auckland' });
    await throughSovereign(page);
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('button', { name: 'Preferences' }).click();
    // Used and not edited here; the device's own times follow them.
    await expect(dialog.getByText(/These are Sovereign’s/)).toBeVisible();
    await expect(dialog.getByLabel('Time zone')).toHaveCount(0);
    await expect(dialog.getByText(/Last synced \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/)).toBeVisible({
      timeout: 30_000,
    });
    // Appearance stays Shopper's, since it cannot follow Sovereign's.
    await expect(dialog.getByRole('radio', { name: 'Dark' })).toBeVisible();
    await page.keyboard.press('Escape');
    await signOut(page);
  });

  test('the export asks for a sign-in at Sovereign in the last few minutes, sends the person through it, and then serves their records', async ({
    page,
    baseURL,
  }) => {
    const base = baseURL ?? '';
    // Signed in at Sovereign an hour ago, on a session that is still alive there.
    const old = { ...person('exporter'), signedInSecondsAgo: 3600 };
    await nextPersonIs(page, old);
    await throughSovereign(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
      timeout: 30_000,
    });
    const ask = () =>
      page.request.post('/api/account/export', {
        headers: { origin: base, 'content-type': 'application/json' },
        data: {},
      });
    // Nothing is served for a sign-in that old, and no password is asked for.
    const refused = await ask();
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toEqual({ code: 'SIGN_IN_AGAIN' });
    // A password does not stand in for it.
    const guessed = await page.request.post('/api/account/export', {
      headers: { origin: base, 'content-type': 'application/json' },
      data: { password: 'anything' },
    });
    expect(guessed.status()).toBe(403);

    // The page says so and offers the way: through core with `prompt=login`, and back to Data.
    await page.goto('/settings/data');
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByText(/Shopper’s part/)).toBeVisible();
    // The way through Sovereign, as the page's button has it.
    await page.goto('/api/auth/sign-in/sovereign?prompt=login&returnTo=%2Fsettings%2Fdata');
    await expect(page).toHaveURL(/\/settings\/data$/);
    const prompts = (await (
      await page.request.get(`http://localhost:${PORTS.coreControl}/prompts`)
    ).json()) as (string | null)[];
    expect(prompts.at(-1)).toBe('login');

    // Signed in again just now, the same session is served: this person's own records, and the request names nothing.
    const served = await ask();
    expect(served.status()).toBe(200);
    const body = (await served.json()) as {
      head: { version: string };
      records: { kind: string }[];
    };
    expect(body.head.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.records.some((part) => part.kind === 'person')).toBe(true);
    await page.keyboard.press('Escape');
    await signOut(page);
  });

  test('the same person signs in again as the same account, and signing out is local', async ({
    page,
  }) => {
    const who = person('again');
    await nextPersonIs(page, who);
    await throughSovereign(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible({
      timeout: 30_000,
    });
    await signOut(page);
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
    // Back at the invitation, signed in.
    await expect(guest.page).toHaveURL(link.path.split('#')[0] ?? link.path);
    await guest.page.getByRole('button', { name: 'Join' }).click();
    await expect(
      guest.page.getByRole('navigation', { name: 'Shopper' }).getByText('Shared with me'),
    ).toBeVisible({ timeout: 30_000 });
    await guest.context.close();
  });

  // What Sovereign tells the app when a person's session there ends, or they delete their account (task 2.4). The fake signs the notice with the key it
  // publishes, as Sovereign does, and the test posts it where the manifest says to. It names the person, not one of their core sessions: a notice
  // that names a core session ends only the sessions that came from it (auth.md §8).
  type Wrong = 'signature' | 'audience' | 'expired' | 'type';
  async function noticeFrom(
    page: Page,
    kind: 'logout' | 'account-deleted',
    sub: string,
    wrong?: Wrong,
  ): Promise<string> {
    const reply = await page.request.post(`http://localhost:${PORTS.coreControl}/notice`, {
      data: { kind, sub, wrong },
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
    // Signed out on both: no session is left. (Sent to sign in, suite mode would go straight to core, which the fake answers by signing in again.)
    for (const tab of [page, elsewhere]) {
      const session = await tab.request.get('/api/auth/get-session');
      expect(await session.json()).toBeNull();
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
      // Refused with nothing said (auth.md §8): what was wrong with it is not the sender's to learn.
      expect(reply.status(), wrong).toBe(400);
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
      guest.page.getByRole('navigation', { name: 'Shopper' }).getByText('Shared with me'),
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

  // A sign-in through core that did not complete, declined at Sovereign included, comes back with the package's one word for it (auth.md §8;
  // a real decline is driven in `src/auth/sovereign.test.ts`).
  test('a person who declines at Sovereign is told it did not complete and is not signed in', async ({
    page,
  }) => {
    await page.goto('/sign-in?error=sovereign');
    await expect(page.getByText(/Signing in with Sovereign did not complete/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'User menu' })).toHaveCount(0);
  });
});

test.describe('an instance set up both ways, which runs in suite mode', () => {
  test.use({ baseURL: BOTH, viewport: { width: 1280, height: 800 } });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test('signs in through Sovereign only: no password form, and the local routes are not there', async ({
    page,
    request,
  }) => {
    for (const path of ['/forgot-password', '/reset-password']) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
    const reply = await request.post(`${BOTH}/api/auth/sign-up/email`, {
      headers: { origin: BOTH },
      data: { name: 'Mallory', email: 'mallory@both.test', password: 'x'.repeat(43) },
    });
    expect(reply.status()).toBe(404);
    await nextPersonIs(page, person('stranger'));
    await throughSovereign(page);
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveCount(0);
    await signOut(page);
  });
});
