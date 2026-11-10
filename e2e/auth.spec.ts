import { expect } from '@playwright/test';
import { PASSWORD, newEmail, sessionOf, signUp, test } from './helpers';
import { PORTS } from './ports';

/**
 * Signing up and in, in a browser (task 2.1). The first instance is open to sign-up (the default of 0.1.0), so each test makes the account it needs;
 * a second, closed to sign-up, is for the policy. The front address is a placeholder until 2.2, so what these show is the session, which the server
 * answers for.
 */
test('an account can be made, and signs the person in', async ({ page }) => {
  const email = await signUp(page);
  expect((await sessionOf(page))?.user.email).toBe(email);
});

test('signing in with the right password signs in, and signing in again, signed in, has nothing to ask', async ({
  page,
}) => {
  const email = await signUp(page);
  await page.context().clearCookies();
  expect(await sessionOf(page)).toBeNull();

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  expect((await sessionOf(page))?.user.email).toBe(email);

  // Signed in, the sign-in page has nothing to ask.
  await page.goto('/sign-in');
  await expect(page).toHaveURL('/');
});

test('a wrong password reads the same as an address with no account, and signs no one in', async ({
  page,
}) => {
  const email = await signUp(page);
  await page.context().clearCookies();
  const messages: string[] = [];
  for (const address of [email, newEmail('nobody')]) {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(address);
    await page.getByLabel('Password').fill('not the password at all');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const alert = page.getByText(/do not match/);
    await expect(alert).toBeVisible();
    messages.push((await alert.textContent()) ?? '');
  }
  expect(messages[1]).toBe(messages[0]);
  expect(await sessionOf(page)).toBeNull();
});

test('a password that is too short is refused by the server, and the form asks for the length', async ({
  page,
  request,
  ip,
}) => {
  await page.goto('/sign-up');
  await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '10');
  const reply = await request.post('/api/auth/sign-up/email', {
    headers: { origin: new URL(page.url()).origin, 'x-forwarded-for': ip },
    data: { name: 'Ada', email: newEmail(), password: 'short' },
  });
  expect(reply.status()).toBe(400);
  expect((await reply.json()).code).toBe('PASSWORD_TOO_SHORT');
});

test('an account is deleted with its password, and nothing of it signs in again', async ({
  page,
  ip,
}) => {
  const email = await signUp(page);
  const headers = { origin: new URL(page.url()).origin, 'x-forwarded-for': ip };

  // What it would do, before it is done: the first household, with nobody else in it, would be deleted.
  const preview = await page.request.get('/api/account/delete', { headers });
  expect(preview.status()).toBe(200);
  expect((await preview.json()).households).toMatchObject([{ own: true, outcome: 'deleted' }]);

  const wrong = await page.request.post('/api/account/delete', {
    headers,
    data: { password: 'not the password' },
  });
  expect(wrong.status()).toBe(403);
  expect((await wrong.json()).code).toBe('WRONG_PASSWORD');
  expect((await sessionOf(page))?.user.email).toBe(email);

  const done = await page.request.post('/api/account/delete', {
    headers,
    data: { password: PASSWORD },
  });
  expect(done.status()).toBe(204);
  expect(await sessionOf(page)).toBeNull();

  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/do not match/)).toBeVisible();
});

test.describe('an instance closed to sign-up', () => {
  const base = `http://localhost:${PORTS.closed}`;

  test('takes the first account, refuses the second at the server, and says so on the page', async ({
    page,
    request,
    ip,
  }) => {
    // Whichever browser gets here first makes the first account; the other finds sign-up already closed.
    await page.goto(`${base}/sign-up`);
    if (await page.getByRole('heading', { name: 'Create your account' }).isVisible()) {
      await signUp(page, { base });
      await page.context().clearCookies();
    }
    const reply = await request.post(`${base}/api/auth/sign-up/email`, {
      headers: { origin: base, 'x-forwarded-for': ip },
      data: { name: 'Mallory', email: newEmail('mallory'), password: PASSWORD },
    });
    expect(reply.status()).toBe(403);
    expect((await reply.json()).code).toBe('SIGNUP_CLOSED');

    await page.goto(`${base}/sign-up`);
    await expect(page.getByRole('heading', { name: 'Sign-up is closed' })).toBeVisible();
  });
});
