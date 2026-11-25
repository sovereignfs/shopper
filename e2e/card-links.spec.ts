import { expect, type Browser, type Page } from '@playwright/test';
import {
  accountOf,
  anotherDevice,
  deviceRows,
  fillSignUp,
  keepKit,
  makeLink,
  newEmail,
  offline,
  online,
  PASSWORD,
  recordViolations,
  seedItems,
  signUp,
  test,
  waitMoved,
} from './helpers';

/**
 * A card linked to a list, in a browser (task 24.6, RFC 0007, DESIGN.md §7.7, §11.1): the list's Admin links a card from the list's settings, Shopping mode shows a button for it, one tap opens it with
 * its code and number, offline too; **a person on the list who is not on the card has no link on their device and no button**, and the button appears for them once they are on the card; a Member
 * is offered no Cards section. The device's own store is what is looked at, not only what the screen shows.
 */
interface Row {
  id: string;
  householdId?: string;
  listId?: string;
  cardId?: string;
  deletedAt?: number | null;
  shop?: string;
}

async function withCard(page: Page, baseURL: string) {
  await signUp(page, { name: 'Ada' });
  await seedItems(page, [{ name: 'Milk' }], baseURL);
  await page.goto('/cards');
  await expect(page.getByRole('heading', { level: 1, name: 'Loyalty cards' })).toBeVisible({
    timeout: 30_000,
  });
  await waitMoved(page, baseURL);
  await page.getByRole('button', { name: 'Add card' }).click();
  const form = page.getByRole('dialog', { name: 'Add a card' });
  await form.getByLabel('Shop or brand').fill('Tesco');
  await form.getByLabel('Number', { exact: true }).fill('590123412345');
  await form.getByLabel('Kind of code').selectOption({ label: 'EAN-13' });
  await form.getByRole('button', { name: 'Add the card' }).click();
  await expect(page.getByRole('link', { name: /Tesco/ })).toBeVisible();
  const account = await accountOf(page);
  const [list] = await deviceRows<Row>(page, account, 'list');
  const [household] = await deviceRows<Row>(page, account, 'household');
  const card = (await deviceRows<Row>(page, account, 'card')).find((row) => row.shop === 'Tesco');
  return { account, list: list?.id ?? '', household: household?.id ?? '', card: card?.id ?? '' };
}

const settings = (page: Page) => page.getByRole('dialog', { name: 'List settings' });
const showCard = (page: Page) => page.getByRole('button', { name: /^Show (the card|a card)/ });

async function linkIn(page: Page, list: string) {
  await page.goto(`/l/${list}?settings=cards`);
  await expect(settings(page)).toBeVisible({ timeout: 30_000 });
  const toggle = settings(page).getByRole('switch', { name: 'Link Tesco' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toBeChecked();
}

async function openShop(page: Page, list: string, household: string) {
  await page.goto(`/shop?h=${household}&l=${list}`);
  await expect(page.getByRole('status').filter({ hasText: 'to get' })).toBeVisible({
    timeout: 30_000,
  });
}

test('the list’s Admin links a card in the list’s settings, Shopping mode opens it with one tap, offline too, and unlinking takes the button away', async ({
  page,
  baseURL,
}) => {
  test.slow();
  const base = baseURL ?? '';
  const violations = await recordViolations(page);
  const { account, list, household, card } = await withCard(page, base);
  // No button before anything is linked.
  await openShop(page, list, household);
  await expect(showCard(page)).toHaveCount(0);
  await linkIn(page, list);
  await expect
    .poll(async () => (await deviceRows<Row>(page, account, 'list_card')).length, {
      timeout: 15_000,
    })
    .toBe(1);
  expect((await deviceRows<Row>(page, account, 'list_card'))[0]).toMatchObject({
    listId: list,
    cardId: card,
    deletedAt: null,
  });
  // Shopping mode has the card, one tap away.
  await openShop(page, list, household);
  await expect(showCard(page)).toHaveCount(1);
  await showCard(page).click();
  const shown = page.getByRole('dialog', { name: 'Tesco' });
  await expect(shown).toBeVisible();
  // A header of its own, with the close button in it: the title is there on a desktop too, where a dialog with a title alone has no row for it.
  await expect(shown.getByText('Tesco', { exact: true })).toBeVisible();
  await expect(shown.getByRole('img', { name: /^Tesco: EAN-13/ })).toBeVisible();
  await expect(shown.getByLabel('Number', { exact: true })).toHaveText('5901234123457');
  await shown.getByRole('button', { name: 'Done' }).click();
  await expect(shown).toHaveCount(0);
  // With no network, after a reload the shell and the device answer, and the card opens from Shopping mode.
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 30_000 })
    .toBe(0);
  await offline(page.context());
  await page.reload();
  await expect(showCard(page)).toBeVisible({ timeout: 30_000 });
  await showCard(page).click();
  await expect(
    page.getByRole('dialog', { name: 'Tesco' }).getByLabel('Number', { exact: true }),
  ).toHaveText('5901234123457');
  await online(page.context());
  await page.keyboard.press('Escape');
  // Taken off in the settings: the button goes, and the link is kept, dated, so that linking again is the same one.
  await page.goto(`/l/${list}?settings=cards`);
  const toggle = settings(page).getByRole('switch', { name: 'Link Tesco' });
  await expect(toggle).toBeChecked({ timeout: 30_000 });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect
    .poll(async () => (await deviceRows<Row>(page, account, 'list_card'))[0]?.deletedAt ?? null)
    .not.toBeNull();
  await openShop(page, list, household);
  await expect(showCard(page)).toHaveCount(0);
  expect(await deviceRows<Row>(page, account, 'list_card')).toHaveLength(1);
  expect(await violations()).toEqual([]);
});

async function guestThrough(browser: Browser, base: string, path: string, button: RegExp | string) {
  const guest = await anotherDevice(browser, base);
  await guest.page.goto(path);
  await guest.page.getByRole('link', { name: 'create an account' }).click();
  await fillSignUp(guest.page, { name: 'Grace', email: newEmail('grace'), password: PASSWORD });
  await guest.page.getByRole('button', { name: 'Create account' }).click();
  await keepKit(guest.page);
  await guest.page.getByRole('button', { name: button }).click();
  return guest;
}

test('a person on the list who is not on the card has no link and no button, and is shown the card the moment they are given it; a Member is offered no Cards section', async ({
  page,
  browser,
  baseURL,
}) => {
  test.slow();
  const base = baseURL ?? '';
  const { list, household, card } = await withCard(page, base);
  await linkIn(page, list);
  await page.keyboard.press('Escape');
  // Grace joins the list by its link.
  await page.goto(`/l/${list}`);
  const listLink = await makeLink(page, base);
  const grace = await guestThrough(browser, base, listLink.path, 'Join');
  await expect(
    grace.page.getByRole('navigation', { name: 'Shopper' }).getByText('Shared with me'),
  ).toBeVisible({ timeout: 30_000 });
  const graceAccount = await accountOf(grace.page);
  await expect
    .poll(async () => (await deviceRows<Row>(grace.page, graceAccount, 'item')).length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  // On the list and not the card: none of the link's rows reached her, and Shopping mode has no button.
  expect(await deviceRows(grace.page, graceAccount, 'list_card')).toEqual([]);
  expect(await deviceRows(grace.page, graceAccount, 'card')).toEqual([]);
  await openShop(grace.page, list, household);
  await expect(showCard(grace.page)).toHaveCount(0);
  // A Member of the list is offered no Cards section, even by its address.
  await grace.page.goto(`/l/${list}?settings=cards`);
  await expect(settings(grace.page)).toBeVisible({ timeout: 30_000 });
  await expect(settings(grace.page).getByRole('switch', { name: 'Link Tesco' })).toHaveCount(0);
  await expect(settings(grace.page).getByText('Cards for this list')).toHaveCount(0);
  await grace.page.keyboard.press('Escape');

  // Ada gives her the card, by its own link: now she is on both, and the link comes to her device though it was made before.
  await page.goto(`/cards/${card}`);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const share = page.getByRole('dialog', { name: /^Share / });
  await share.getByRole('button', { name: 'Make a link' }).click();
  const cardLink = await share.getByRole('textbox', { name: 'Link to share' }).inputValue();
  await grace.page.goto(cardLink);
  await grace.page.getByRole('button', { name: 'Add the card' }).click();
  await expect(grace.page).toHaveURL(`${base}/cards`, { timeout: 30_000 });
  await expect
    .poll(async () => (await deviceRows<Row>(grace.page, graceAccount, 'list_card')).length, {
      timeout: 40_000,
    })
    .toBe(1);
  await openShop(grace.page, list, household);
  await expect(showCard(grace.page)).toHaveCount(1, { timeout: 30_000 });
  await showCard(grace.page).click();
  await expect(
    grace.page.getByRole('dialog', { name: 'Tesco' }).getByLabel('Number', { exact: true }),
  ).toHaveText('5901234123457');
  await grace.context.close();
});
