import { expect, type Page } from '@playwright/test';
import {
  anotherDevice,
  accountOf,
  deviceRows,
  forgetSession,
  newEmail,
  PASSWORD,
  recordViolations,
  seedItems,
  serverItems,
  signUp,
  test,
} from './helpers';

/**
 * Invitations by link, in a browser (task 3.4): journey 3 of DESIGN.md §3, alone with no mail set up. One person makes a link, a second opens it, makes an
 * account, comes back to it through the round trip and joins, and both see and edit the same lists. One page says every dead link, a second acceptance is
 * refused, someone already in is told so, and an outsider cannot make a link for a household. There is no Share dialog yet (8.7), so the link is made through
 * the operation the dialog will call.
 */
async function makeLink(page: Page, baseURL: string): Promise<{ path: string; id: string }> {
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'household')).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const [household] = await deviceRows<{ id: string }>(page, account, 'household');
  const reply = await page.request.post('/api/ops', {
    headers: { origin: baseURL, 'content-type': 'application/json' },
    data: { op: 'invite.create', household: household?.id },
  });
  expect(reply.status()).toBe(200);
  return (await reply.json()).result as { path: string; id: string };
}

test('a second person opens the link, makes an account, comes back to it, joins, and both edit the same lists', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], base);
  const link = await makeLink(page, base);

  const { context, page: guest } = await anotherDevice(browser, base);
  const violations = await recordViolations(guest);
  await guest.goto(link.path);
  await expect(guest.getByRole('heading', { name: 'Join Ada’s lists' })).toBeVisible();
  await expect(guest.getByText('Ada invited you')).toBeVisible();
  // The page says the household and who invited, and nothing else: no address, no list, no item.
  await expect(guest.getByText(/@example\.com|Milk|Groceries/)).toHaveCount(0);

  await guest.getByRole('link', { name: 'create an account' }).click();
  await expect(guest).toHaveURL(/\/sign-up\?next=/);
  await guest.getByLabel('Name').fill('Grace');
  await guest.getByLabel('Email').fill(newEmail('grace'));
  await guest.getByLabel('Password').fill(PASSWORD);
  await guest.getByRole('button', { name: 'Create account' }).click();
  // The link survived the round trip.
  await expect(guest).toHaveURL(link.path);
  await guest.getByRole('button', { name: 'Join' }).click();

  // Grace lands on Ada's lists, with Ada's Milk, and ticks it.
  await expect(guest.getByRole('checkbox', { name: /Milk/ })).toBeVisible({ timeout: 30_000 });
  await expect(
    guest.getByRole('navigation', { name: 'Shopper' }).getByText('Ada’s lists'),
  ).toBeVisible();
  await guest.getByRole('checkbox', { name: /Milk/ }).click();
  await expect(guest.getByRole('button', { name: /Bought \(1\)/ })).toBeVisible();

  // Ada sees Grace among the people, and what Grace ticked.
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'member')).length, { timeout: 30_000 })
    .toBe(2);
  await expect
    .poll(async () => (await serverItems(page, base)).filter((i) => i.boughtAt !== null).length, {
      timeout: 30_000,
    })
    .toBe(1);
  expect(await violations()).toEqual([]);
  await context.close();
});

test('a link used, a link revoked and a link that was never one all show the same page, and a second acceptance is refused', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const used = await makeLink(page, base);
  const revoked = await makeLink(page, base);
  const account = await accountOf(page);
  const [household] = await deviceRows<{ id: string }>(page, account, 'household');
  const revoke = await page.request.post('/api/ops', {
    headers: { origin: base, 'content-type': 'application/json' },
    data: { op: 'invite.revoke', household: household?.id, invitation: revoked.id },
  });
  expect(revoke.status()).toBe(200);

  const first = await anotherDevice(browser, base);
  await signUp(first.page, { name: 'Grace' });
  await first.page.goto(used.path);
  await first.page.getByRole('button', { name: 'Join' }).click();
  await expect(first.page).toHaveURL(`${base}/`);

  const second = await anotherDevice(browser, base);
  await signUp(second.page, { name: 'Lin' });
  const dead = [used.path, revoked.path, `/invite/${'A'.repeat(43)}`, '/invite/short'];
  const pages = new Set<string>();
  for (const path of dead) {
    await second.page.goto(path);
    await expect(
      second.page.getByRole('heading', { name: 'This link does not work' }),
    ).toBeVisible();
    pages.add(
      await second.page
        .getByRole('main')
        .innerText()
        .catch(() => ''),
    );
  }
  expect(pages.size).toBe(1);

  // Lin, signed in, cannot be let in by the used link even by calling the door directly.
  const token = used.path.replace('/invite/', '');
  const direct = await second.page.request.post('/api/invite/accept', {
    headers: { origin: base, 'content-type': 'application/json' },
    data: { token },
  });
  expect(direct.status()).toBe(404);
  await first.context.close();
  await second.context.close();
});

test('someone already in the household who opens its link is told so, and nothing changes', async ({
  page,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const link = await makeLink(page, base);
  await page.goto(link.path);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('You are already in this household')).toBeVisible();
  const account = await accountOf(page);
  expect(await deviceRows(page, account, 'member')).toHaveLength(1);
});

test('someone who has an account signs in through the link and comes back to it', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const link = await makeLink(page, base);

  const email = newEmail('lin');
  const other = await anotherDevice(browser, base);
  await signUp(other.page, { name: 'Lin', email });
  await forgetSession(other.page);
  await other.page.goto(link.path);
  await other.page.getByRole('link', { name: 'Sign in' }).click();
  await expect(other.page).toHaveURL(/\/sign-in\?next=/);
  await other.page.getByLabel('Email').fill(email);
  await other.page.getByLabel('Password').fill(PASSWORD);
  await other.page.getByRole('button', { name: 'Sign in' }).click();
  await expect(other.page).toHaveURL(link.path);
  await expect(other.page.getByRole('button', { name: 'Join' })).toBeVisible();
  await other.context.close();
});

test('a link is not followed to anywhere but an invitation’s page', async ({ page }) => {
  await page.goto('/sign-in?next=https://evil.example/');
  await expect(page.getByRole('heading', { name: 'Sign in to Shopper' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create account' })).toHaveAttribute(
    'href',
    '/sign-up',
  );
});

test('an outsider cannot make a link for a household, nor revoke one', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const link = await makeLink(page, base);
  const account = await accountOf(page);
  const [household] = await deviceRows<{ id: string }>(page, account, 'household');

  const eve = await anotherDevice(browser, base);
  await signUp(eve.page, { name: 'Eve' });
  const create = await eve.page.request.post('/api/ops', {
    headers: { origin: base, 'content-type': 'application/json' },
    data: { op: 'invite.create', household: household?.id },
  });
  expect(create.status()).toBe(404);
  const revoke = await eve.page.request.post('/api/ops', {
    headers: { origin: base, 'content-type': 'application/json' },
    data: { op: 'invite.revoke', household: household?.id, invitation: link.id },
  });
  expect(revoke.status()).toBe(404);
  await eve.context.close();
});
