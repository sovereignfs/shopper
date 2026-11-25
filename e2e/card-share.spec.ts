import { expect, type Browser, type Page } from '@playwright/test';
import {
  accountOf,
  anotherDevice,
  deviceRows,
  fillSignUp,
  keepKit,
  newEmail,
  offline,
  online,
  PASSWORD,
  recordViolations,
  signUp,
  test,
  waitMoved,
} from './helpers';

/**
 * Sharing a loyalty card, in a browser (task 24.5, RFC 0007, DESIGN.md §7.7): a card's Admin shares it from its screen (`?share=1`) by a link that carries the card's keys after `#`; a second person opens it,
 * makes an account and **has that card and nothing else of the first person's** (no list, no item, no other card), reads it with no network, and shows it; the Admin removes them, or they leave, and the
 * card goes from their device. **The device's own store is what is looked at**, not only what the screen shows.
 */
const dialog = (page: Page) => page.getByRole('dialog', { name: /^Share / });

interface Row {
  id: string;
  householdId?: string;
  deletedAt?: number | null;
}

async function cardsPage(page: Page, baseURL: string, name = 'Ada') {
  await signUp(page, { name });
  await page.goto('/cards');
  await expect(page.getByRole('heading', { level: 1, name: 'Loyalty cards' })).toBeVisible({
    timeout: 30_000,
  });
  await waitMoved(page, baseURL);
}

async function addCard(page: Page, shop: string, number: string) {
  await page.getByRole('button', { name: 'Add card' }).click();
  const form = page.getByRole('dialog', { name: 'Add a card' });
  await form.getByLabel('Shop or brand').fill(shop);
  await form.getByLabel('Number', { exact: true }).fill(number);
  await form.getByLabel('Kind of code').selectOption({ label: 'EAN-13' });
  await form.getByRole('button', { name: 'Add the card' }).click();
  await expect(page.getByRole('link', { name: new RegExp(shop) })).toBeVisible();
}

/** Ada opens the card and its sharing dialog, and makes a link, which she is shown once. */
async function linkFor(page: Page, shop: string): Promise<string> {
  await page.getByRole('link', { name: new RegExp(shop) }).click();
  await expect(page.getByRole('heading', { level: 1, name: shop })).toBeVisible();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page).toHaveURL(/\?share=1$/);
  await dialog(page).getByRole('button', { name: 'Make a link' }).click();
  const url = await dialog(page).getByRole('textbox', { name: 'Link to share' }).inputValue();
  expect(url).toMatch(/\/invite\/[A-Za-z0-9_-]{43}#[A-Za-z0-9_-]{43}$/);
  return url;
}

/** A second person opens the link, makes an account through it and adds the card. */
async function accept(browser: Browser, base: string, url: string, name = 'Grace') {
  const guest = await anotherDevice(browser, base);
  await guest.page.goto(url);
  await guest.page.getByRole('link', { name: 'create an account' }).click();
  await fillSignUp(guest.page, { name, email: newEmail(name.toLowerCase()), password: PASSWORD });
  await guest.page.getByRole('button', { name: 'Create account' }).click();
  await keepKit(guest.page);
  await guest.page.getByRole('button', { name: 'Add the card' }).click();
  await expect(guest.page).toHaveURL(`${base}/cards`, { timeout: 30_000 });
  return guest;
}

test('a card is shared by a link, shown by the person it is shared with with nothing else of the sharer’s on their device, offline, until its Admin removes them', async ({
  page,
  browser,
  baseURL,
}) => {
  test.slow();
  const base = baseURL ?? '';
  const violations = await recordViolations(page);
  await cardsPage(page, base);
  await addCard(page, 'Tesco', '590123412345');
  await addCard(page, 'Boots', '400638133393');
  const adaAccount = await accountOf(page);
  const [adaGroup] = await deviceRows<{ id: string; own: boolean }>(page, adaAccount, 'household');
  const adaCard = (await deviceRows<Row & { shop: string }>(page, adaAccount, 'card')).find(
    (row) => row.shop === 'Tesco',
  )?.id;

  const url = await linkFor(page, 'Tesco');
  await expect(dialog(page).getByRole('region', { name: 'People' })).toContainText('Ada (you)');
  await expect(dialog(page)).toContainText(
    'People you share this card with can see and show it, and nothing else of yours.',
  );
  await expect(dialog(page)).toContainText('Anyone holding this link can add this card');
  await expect(dialog(page).getByRole('region', { name: 'Links waiting' })).toContainText(
    'Made by Ada',
  );

  // The page says who invited and that it is a card, and nothing else: no shop, no number, no list.
  const peek = await anotherDevice(browser, base);
  await peek.page.goto(url);
  await expect(peek.page.getByText('Ada invited you to a loyalty card')).toBeVisible();
  const said = await peek.page.locator('body').innerText();
  for (const word of ['Tesco', 'Boots', '5901234123457', 'Groceries'])
    expect(said).not.toContain(word);
  await peek.context.close();

  const grace = await accept(browser, base, url);
  const graceAccount = await accountOf(grace.page);
  // The cards are Grace's under "Shared with you", from Ada, and Ada's other card is not among them.
  await expect(grace.page.getByRole('heading', { name: 'Shared with you' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(grace.page.getByRole('link', { name: /Tesco/ })).toContainText('From Ada');
  await expect(grace.page.getByRole('link', { name: /Boots/ })).toHaveCount(0);

  // On her device: that card and its people, and no row of Ada's group besides (no list, item, product, category, Inventory item, or other card).
  await expect
    .poll(async () => (await deviceRows<Row>(grace.page, graceAccount, 'card')).length, {
      timeout: 30_000,
    })
    .toBe(1);
  expect((await deviceRows<Row>(grace.page, graceAccount, 'card'))[0]?.id).toBe(adaCard);
  for (const store of [
    'list',
    'item',
    'product',
    'category',
    'inventory_item',
    'list_category',
    'member',
  ])
    expect(
      (await deviceRows<Row>(grace.page, graceAccount, store)).filter(
        (row) => row.householdId === adaGroup?.id,
      ),
      store,
    ).toEqual([]);
  expect(
    (await deviceRows<{ cardId: string; self: boolean }>(grace.page, graceAccount, 'card_member'))
      .map((row) => row.self)
      .sort(),
  ).toEqual([false, true]);
  await expect(
    grace.page.getByRole('navigation', { name: 'Shopper' }).getByText('Shared with me'),
  ).toHaveCount(0);

  // She opens it: its code and number, and none of what only its Admin has; a Member can leave.
  await grace.page.getByRole('link', { name: /Tesco/ }).click();
  await expect(grace.page.getByRole('heading', { level: 1, name: 'Tesco' })).toBeVisible();
  await expect(grace.page.getByLabel('Number', { exact: true })).toHaveText('5901234123457');
  await expect(grace.page.getByRole('img', { name: /^Tesco: EAN-13/ })).toBeVisible();
  for (const name of ['Edit', 'Share', 'Delete this card…'])
    await expect(grace.page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(grace.page.getByRole('button', { name: 'Leave this card…' })).toBeVisible();

  // The link was used up, and Ada's dialog now lists Grace.
  await page.reload();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('region', { name: 'Links waiting' })).toContainText(
    'No links are waiting.',
  );
  await expect
    .poll(
      async () =>
        (await dialog(page).getByRole('region', { name: 'People' }).innerText()).includes('Grace'),
      {
        timeout: 40_000,
      },
    )
    .toBe(true);

  // With no network the card opens from her device.
  await offline(grace.context);
  await grace.page.goto(`/cards/${adaCard}`);
  await expect(grace.page.getByRole('heading', { level: 1, name: 'Tesco' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(grace.page.getByLabel('Number', { exact: true })).toHaveText('5901234123457');
  await online(grace.context);

  // Ada removes her, after a confirmation, and the card (and the group she reached it by) leaves Grace's device.
  await dialog(page).getByRole('button', { name: 'Remove Grace' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(dialog(page).getByRole('region', { name: 'People' })).not.toContainText('Grace');
  await grace.page.goto('/cards');
  await expect
    .poll(async () => (await deviceRows<Row>(grace.page, graceAccount, 'card')).length, {
      timeout: 40_000,
    })
    .toBe(0);
  expect(await deviceRows(grace.page, graceAccount, 'card_member')).toEqual([]);
  await expect(grace.page.getByText('No cards yet')).toBeVisible();
  // Ada still has both cards.
  await page.keyboard.press('Escape');
  expect(
    (await deviceRows<Row>(page, adaAccount, 'card')).filter((row) => row.deletedAt === null),
  ).toHaveLength(2);
  expect(await violations()).toEqual([]);
  await grace.context.close();
});

test('a person who has a card can leave it, which asks first and takes it from their device', async ({
  page,
  browser,
  baseURL,
}) => {
  test.slow();
  const base = baseURL ?? '';
  await cardsPage(page, base);
  await addCard(page, 'Aldi', '590123412345');
  const url = await linkFor(page, 'Aldi');
  const grace = await accept(browser, base, url);
  const graceAccount = await accountOf(grace.page);
  await grace.page.getByRole('link', { name: /Aldi/ }).click();
  await grace.page.getByRole('button', { name: 'Leave this card…' }).click();
  await grace.page.getByRole('button', { name: 'Cancel' }).click();
  await expect(grace.page.getByRole('heading', { level: 1, name: 'Aldi' })).toBeVisible();
  await grace.page.getByRole('button', { name: 'Leave this card…' }).click();
  await grace.page.getByRole('button', { name: 'Leave the card' }).click();
  await expect(grace.page).toHaveURL(`${base}/cards`);
  await expect(grace.page.getByText('No cards yet')).toBeVisible();
  await expect
    .poll(async () => (await deviceRows<Row>(grace.page, graceAccount, 'card')).length, {
      timeout: 30_000,
    })
    .toBe(0);
  // Ada's card is still hers, and her dialog no longer lists Grace.
  await page.goto('/cards');
  await expect(page.getByRole('link', { name: /Aldi/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: /Aldi/ }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await dialog(page).getByRole('region', { name: 'People' }).innerText()).includes('Grace'),
      {
        timeout: 40_000,
      },
    )
    .toBe(false);
  await grace.context.close();
});

test('a link to a card works once and stops when revoked, and only the card’s Admin can make, list or revoke one', async ({
  page,
  browser,
  baseURL,
}) => {
  test.slow();
  const base = baseURL ?? '';
  await cardsPage(page, base);
  await addCard(page, 'Spar', '590123412345');
  const used = await linkFor(page, 'Spar');
  await dialog(page).getByRole('button', { name: 'Make a link' }).click();
  // The second link replaces the first in the field, which is shown once.
  await expect(dialog(page).getByRole('textbox', { name: 'Link to share' })).not.toHaveValue(used);
  const revoked = await dialog(page).getByRole('textbox', { name: 'Link to share' }).inputValue();
  // Two are waiting now; Ada revokes the newest, which the list shows with who made it.
  await expect(
    dialog(page).getByRole('region', { name: 'Links waiting' }).getByRole('listitem'),
  ).toHaveCount(2);
  await dialog(page)
    .getByRole('region', { name: 'Links waiting' })
    .getByRole('button', { name: /^Revoke the link/ })
    .last()
    .click();
  await expect(
    dialog(page).getByRole('region', { name: 'Links waiting' }).getByRole('listitem'),
  ).toHaveCount(1);

  const grace = await accept(browser, base, used);
  // The link is used up: for everyone, the same page as any link that does not work.
  const lin = await anotherDevice(browser, base);
  await signUp(lin.page, { name: 'Lin' });
  const dead = new Set<string>();
  for (const link of [used, revoked, `${base}/invite/${'A'.repeat(43)}`]) {
    await lin.page.goto(link);
    await expect(lin.page.getByRole('heading', { name: 'This link does not work' })).toBeVisible();
    dead.add(await lin.page.getByRole('main').innerText());
  }
  expect(dead.size).toBe(1);

  // Grace has the card and none of the Admin's operations on it: each reads as not found, and so does anything of the Admin's by someone with no part in it.
  const adaAccount = await accountOf(page);
  const [group] = await deviceRows<{ id: string }>(page, adaAccount, 'household');
  const [card] = await deviceRows<{ id: string }>(page, adaAccount, 'card');
  const post = (who: Page, body: Record<string, unknown>) =>
    who.request.post('/api/ops', {
      headers: { origin: base, 'content-type': 'application/json' },
      data: { household: group?.id, card: card?.id, ...body },
    });
  for (const who of [grace.page, lin.page]) {
    for (const body of [
      { op: 'card.invite.create', wrappedKey: `ck2.${'A'.repeat(20)}.${'B'.repeat(40)}` },
      { op: 'card.invite.list' },
      { op: 'card.invite.revoke', invitation: crypto.randomUUID() },
      { op: 'card.member.remove', person: crypto.randomUUID() },
      { op: 'card.delete' },
    ])
      expect((await post(who, body)).status(), JSON.stringify(body)).toBe(404);
  }
  expect((await post(lin.page, { op: 'card.member.leave' })).status()).toBe(404);
  expect(
    (
      await post(lin.page, {
        op: 'card.key.mine',
        record: `cr1.${'A'.repeat(20)}.${'B'.repeat(40)}`,
      })
    ).status(),
  ).toBe(404);
  await grace.context.close();
  await lin.context.close();
});

test('a copy of the card’s keys that did not get to the server waits in the browser, opens the card meanwhile, and is kept at the next load', async ({
  page,
  browser,
  baseURL,
}) => {
  test.slow();
  const base = baseURL ?? '';
  await cardsPage(page, base);
  await addCard(page, 'Lidl', '590123412345');
  const url = await linkFor(page, 'Lidl');

  const grace = await anotherDevice(browser, base);
  await grace.page.goto(url);
  await grace.page.getByRole('link', { name: 'create an account' }).click();
  await fillSignUp(grace.page, {
    name: 'Grace',
    email: newEmail('grace'),
    password: PASSWORD,
  });
  await grace.page.getByRole('button', { name: 'Create account' }).click();
  await keepKit(grace.page);
  // The call that keeps her copy does not get through (nothing else is held back): the link has given her the keys once, and they wait. The page's own `fetch` is what fails, the same in both
  // browsers, on this page and on the pages after it, while the flag is set.
  const hold = () => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (
        window.localStorage.getItem('e2e.hold') === '1' &&
        String(init?.body ?? '').includes('card.key.mine')
      )
        throw new TypeError('Failed to fetch');
      return original(input, init);
    };
  };
  await grace.page.addInitScript(hold);
  await grace.page.evaluate(hold);
  await grace.page.evaluate(() => window.localStorage.setItem('e2e.hold', '1'));
  await grace.page.getByRole('button', { name: 'Add the card' }).click();
  await expect(grace.page).toHaveURL(`${base}/cards`, { timeout: 30_000 });
  const pending = () =>
    grace.page.evaluate(() => window.localStorage.getItem('shopper.card-keys.pending'));
  await expect.poll(async () => JSON.parse((await pending()) ?? '[]').length).toBe(1);
  // The card opens with the copy that waits, though the server has none to hand back.
  await expect(grace.page.getByRole('link', { name: /Lidl/ })).toBeVisible({ timeout: 40_000 });
  await grace.page.getByRole('link', { name: /Lidl/ }).click();
  await expect(grace.page.getByLabel('Number', { exact: true })).toHaveText('5901234123457');
  // The network comes back to it, and the next load sends the copy and forgets it.
  await grace.page.evaluate(() => window.localStorage.setItem('e2e.hold', '0'));
  await grace.page.reload();
  await expect
    .poll(async () => JSON.parse((await pending()) ?? '[]').length, { timeout: 30_000 })
    .toBe(0);
  await grace.page.reload();
  await expect(grace.page.getByLabel('Number', { exact: true })).toHaveText('5901234123457');
  await grace.context.close();
});
