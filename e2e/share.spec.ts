import { expect, type Page } from '@playwright/test';
import {
  accountOf,
  anotherDevice,
  deviceRows,
  fillSignUp,
  newEmail,
  offline,
  online,
  PASSWORD,
  recordViolations,
  seedItems,
  signUp,
  test,
} from './helpers';

/**
 * The sharing dialog, in a browser (task 8.7): journey 3 of DESIGN.md §3 through the dialog and nothing else. Share on a list opens it at `?share=1`; it says
 * that everyone sees every list; it lists the people, with addresses only for an Admin; Invite makes a link shown once; live links are listed and revoked;
 * a Member can leave and the Admin can remove, each after a confirmation; with no network it shows what the device held and changes nothing.
 */
const dialog = (page: Page) => page.getByRole('dialog', { name: /^Share / });
const openShare = async (page: Page) => {
  // After a reload the address still says `?share=1`, so the dialog may already be open.
  if (page.url().includes('share=1')) {
    await expect(dialog(page)).toBeVisible();
    return;
  }
  await page.getByRole('button', { name: 'Share', exact: true }).last().click();
  await expect(dialog(page)).toBeVisible();
};

/** Ada, signed up and with the dialog open, makes a link and returns its address. */
async function linkFrom(page: Page): Promise<string> {
  await openShare(page);
  await dialog(page).getByRole('button', { name: 'Make a link' }).click();
  const url = await dialog(page).getByRole('textbox', { name: 'Link to share' }).inputValue();
  expect(url).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  return url;
}

/** A second person opens the link, makes an account through it and joins. */
async function joinThrough(
  browser: Parameters<typeof anotherDevice>[0],
  base: string,
  url: string,
  name: string,
) {
  const guest = await anotherDevice(browser, base);
  const email = newEmail(name.toLowerCase());
  await guest.page.goto(url);
  await guest.page.getByRole('link', { name: 'create an account' }).click();
  await fillSignUp(guest.page, { name, email, password: PASSWORD });
  await guest.page.getByRole('button', { name: 'Create account' }).click();
  await guest.page.getByRole('button', { name: 'Join' }).click();
  // Landed on the household just joined: its section is in the sidebar once the device has pulled it.
  await expect(
    guest.page.getByRole('navigation', { name: 'Shopper' }).getByText('Ada’s lists'),
  ).toBeVisible({ timeout: 30_000 });
  return { ...guest, email };
}

test('the dialog says everyone sees every list, lists the people, and makes a link shown once with its terms', async ({
  page,
  baseURL,
}) => {
  const violations = await recordViolations(page);
  const email = await signUp(page, { name: 'Ada' });
  await openShare(page);
  await expect(page).toHaveURL(/\?share=1$/);
  await expect(
    dialog(page).getByText('People you share with see and edit every list here.'),
  ).toBeVisible();
  const people = dialog(page).getByRole('region', { name: 'People' });
  await expect(people).toContainText('Ada (you)');
  await expect(people).toContainText('Admin');
  await expect(people).toContainText(email);
  await expect(dialog(page).getByRole('region', { name: 'Links waiting' })).toContainText(
    'No links are waiting',
  );

  await dialog(page).getByRole('button', { name: 'Make a link' }).click();
  const invite = dialog(page).getByRole('region', { name: 'Invite' });
  await expect(invite.getByRole('textbox', { name: 'Link to share' })).toHaveValue(
    new RegExp(`^${baseURL}/invite/`),
  );
  await expect(invite.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(invite).toContainText('Anyone holding this link can join');
  await expect(invite).toContainText('shown once');
  await expect(dialog(page).getByRole('region', { name: 'Links waiting' })).toContainText(
    'Made by Ada',
  );
  // The Admin cannot leave: there is no Leave to press.
  await expect(dialog(page).getByRole('button', { name: /^Leave/ })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/^[^?]*$/);
  expect(await violations()).toEqual([]);
});

test('a second person joins through the link, and the Admin sees them, with their address; the Member sees no Remove, no address of the Admin’s, and can leave', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  const adaEmail = await signUp(page, { name: 'Ada' });
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], base);
  const url = await linkFrom(page);
  const grace = await joinThrough(browser, base, url, 'Grace');
  await expect(grace.page.getByRole('checkbox', { name: /Milk/ })).toBeVisible();

  // Ada: the dialog lists Grace once the device has pulled it, with her address.
  await page.reload();
  await openShare(page);
  const adaPeople = dialog(page).getByRole('region', { name: 'People' });
  await expect(adaPeople).toContainText('Grace', { timeout: 30_000 });
  await expect(adaPeople).toContainText(grace.email);

  // A third person joins, so that Grace has another Member to look at: she must not be offered Remove for them.
  await dialog(page).getByRole('button', { name: 'Make a link' }).click();
  const second = await dialog(page).getByRole('textbox', { name: 'Link to share' }).inputValue();
  const lin = await joinThrough(browser, base, second, 'Lin');
  await grace.page.reload();

  // Grace, a Member: the Admin is marked, the Admin's address is not shown, there is no Remove, and she may leave.
  await expect(grace.page.getByRole('checkbox', { name: /Milk/ })).toBeVisible();
  await openShare(grace.page);
  await expect(grace.page.getByRole('dialog', { name: 'Share Ada’s lists' })).toBeVisible();
  const gracePeople = dialog(grace.page).getByRole('region', { name: 'People' });
  await expect(gracePeople).toContainText('Ada');
  await expect(gracePeople).toContainText('Admin');
  await expect(gracePeople).toContainText('Lin', { timeout: 30_000 });
  await expect(gracePeople).not.toContainText(adaEmail);
  await expect(dialog(grace.page).getByRole('button', { name: /^Remove/ })).toHaveCount(0);
  // Ada's link is listed to her, but Grace may not revoke it.
  await expect(dialog(grace.page).getByRole('button', { name: /^Revoke/ })).toHaveCount(0);
  await dialog(grace.page)
    .getByRole('button', { name: /^Leave/ })
    .click();
  await grace.page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(grace.page).toHaveURL(`${base}/`);
  const graceAccount = await accountOf(grace.page);
  await expect
    .poll(async () => (await deviceRows(grace.page, graceAccount, 'household')).length, {
      timeout: 30_000,
    })
    .toBe(1);
  await lin.context.close();
  await grace.context.close();
});

test('the Admin removes a Member after a confirmation, and the Member’s device drops the household', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const url = await linkFrom(page);
  const grace = await joinThrough(browser, base, url, 'Grace');
  const graceAccount = await accountOf(grace.page);

  await page.reload();
  await openShare(page);
  await expect(dialog(page).getByRole('region', { name: 'People' })).toContainText('Grace', {
    timeout: 30_000,
  });
  await dialog(page).getByRole('button', { name: 'Remove Grace' }).click();
  // Asked first: cancelling changes nothing.
  await expect(page.getByText(/will no longer see these lists/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page).getByRole('region', { name: 'People' })).toContainText('Grace');
  await dialog(page).getByRole('button', { name: 'Remove Grace' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(dialog(page).getByRole('region', { name: 'People' })).not.toContainText('Grace', {
    timeout: 30_000,
  });
  await grace.page.reload();
  await expect
    .poll(async () => (await deviceRows(grace.page, graceAccount, 'household')).length, {
      timeout: 30_000,
    })
    .toBe(1);
  await grace.context.close();
});

test('a link is revoked from the dialog, and then it is a link that does not work', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const url = await linkFrom(page);
  const waiting = dialog(page).getByRole('region', { name: 'Links waiting' });
  await expect(waiting).toContainText('Made by Ada');
  await waiting.getByRole('button', { name: /^Revoke/ }).click();
  await expect(waiting).toContainText('No links are waiting');

  const other = await anotherDevice(browser, base);
  await other.page.goto(url);
  await expect(other.page.getByRole('heading', { name: 'This link does not work' })).toBeVisible();
  await other.context.close();
});

test('with no network the dialog shows the people it held and changes nothing, and says why', async ({
  page,
  context,
}) => {
  await signUp(page, { name: 'Ada' });
  await openShare(page);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await offline(context);
  await openShare(page);
  await expect(dialog(page).getByRole('region', { name: 'People' })).toContainText('Ada (you)');
  await dialog(page).getByRole('button', { name: 'Make a link' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('needs a connection');
  await expect(dialog(page).getByRole('textbox', { name: 'Link to share' })).toHaveCount(0);
  await online(context);
  await dialog(page).getByRole('button', { name: 'Make a link' }).click();
  await expect(dialog(page).getByRole('textbox', { name: 'Link to share' })).toBeVisible();
});

test('the household’s section in the sidebar opens it too', async ({ page }) => {
  await signUp(page, { name: 'Ada' });
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Shopper' })
    .getByRole('button', { name: 'Share' })
    .click();
  await expect(dialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\?share=1$/);
});
