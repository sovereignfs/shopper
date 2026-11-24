import { expect, type Page } from '@playwright/test';
import {
  PHONE,
  accountOf,
  deviceRows,
  offline,
  online,
  recordViolations,
  signUp,
  test,
  waitMoved,
} from './helpers';

/**
 * Loyalty cards in a browser (task 24.3, RFC 0007, DESIGN.md §16.14): `/cards` is in the sidebar and the phone's footer; a card is added by typing its number and choosing its kind (checked as it
 * is typed: a check digit is added or refused), each kind shows a code, a card opens full screen with its number in text beneath it and the screen kept on, it is all read from the device so it opens
 * with no network, and its Admin changes it and deletes it (an online operation that asks first). A card is only kept once the group has moved to device encryption, which a new account's does
 * at its first load.
 */
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Shopper' });
const heading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Loyalty cards' });

interface CardRow {
  id: string;
  shop: string;
  number: string;
  kind: string;
  code: string;
  deletedAt: number | null;
}
const rowsOf = async (page: Page): Promise<CardRow[]> =>
  (await deviceRows<CardRow>(page, await accountOf(page), 'card')).filter(
    (row) => row.deletedAt === null,
  );

async function open(page: Page, baseURL: string | undefined) {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await sidebar(page).getByRole('link', { name: 'Loyalty cards' }).click();
  await expect(page).toHaveURL('/cards');
  await expect(heading(page)).toBeVisible({ timeout: 30_000 });
  // A card is made in a group that has moved to device encryption, which a new account's does at its first load.
  await waitMoved(page, baseURL ?? '');
}

async function addCard(
  page: Page,
  card: { shop: string; number: string; kind?: string; code?: string },
) {
  await page.getByRole('button', { name: 'Add card' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a card' });
  await dialog.getByLabel('Shop or brand').fill(card.shop);
  await dialog.getByLabel('Number', { exact: true }).fill(card.number);
  if (card.kind) await dialog.getByLabel('Kind of code').selectOption({ label: card.kind });
  if (card.code)
    await dialog.getByLabel('What the QR code holds (if not the number)').fill(card.code);
  await dialog.getByRole('button', { name: 'Add the card' }).click();
  return dialog;
}

test('a card of each kind is added by typing, checked as it is typed, and shown full screen with its number beneath its code', async ({
  page,
  baseURL,
}) => {
  test.slow();
  const violations = await recordViolations(page);
  await open(page, baseURL);
  await expect(page.getByText('No cards yet')).toBeVisible();

  // A check digit is added to a number that lacks one, and a wrong one is refused with a sentence and makes no card.
  const dialog = await addCard(page, { shop: 'Refused', number: '5901234123450', kind: 'EAN-13' });
  await expect(dialog.getByRole('alert')).toContainText('13 digits');
  expect(await rowsOf(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  const made = [
    { shop: 'Tesco', number: '590123412345', kind: 'EAN-13', shown: '5901234123457' },
    { shop: 'Boots', number: '036000291452', kind: 'UPC-A', shown: '036000291452' },
    { shop: 'Aldi', number: '9638507', kind: 'EAN-8', shown: '96385074' },
    { shop: 'Spar', number: 'CARD 4321-9', kind: 'Code 128', shown: 'CARD 4321-9' },
    { shop: 'Coop', number: 'ABC-12', kind: 'Code 39', shown: 'ABC-12' },
    {
      shop: 'Lidl',
      number: 'MEMBER 77',
      kind: 'QR code',
      code: 'https://example.com/lidl/77',
      shown: 'MEMBER 77',
    },
  ];
  for (const card of made) {
    await addCard(page, card);
    await expect(page.getByRole('link', { name: new RegExp(card.shop) })).toBeVisible();
  }
  await expect.poll(async () => (await rowsOf(page)).length).toBe(6);
  expect((await rowsOf(page)).map((row) => row.kind).sort()).toEqual(
    ['code128', 'code39', 'ean13', 'ean8', 'qr', 'upca'].sort(),
  );
  // The check digit is in what is held, and what a QR code holds is what was typed for it.
  expect((await rowsOf(page)).find((row) => row.shop === 'Tesco')).toMatchObject({
    number: '5901234123457',
    code: '5901234123457',
  });
  expect((await rowsOf(page)).find((row) => row.shop === 'Lidl')).toMatchObject({
    number: 'MEMBER 77',
    code: 'https://example.com/lidl/77',
  });

  // Each opens full screen: its code drawn, its number in text, and nothing drawn that a scanner could not read.
  for (const card of made) {
    await page.getByRole('link', { name: new RegExp(card.shop) }).click();
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: card.shop })).toBeVisible();
    await expect(page.getByRole('img', { name: new RegExp(`^${card.shop}: `) })).toBeVisible();
    await expect(page.getByLabel('Number', { exact: true })).toContainText(card.shown);
    await page.getByRole('link', { name: 'Cards' }).first().click();
    await expect(heading(page)).toBeVisible();
  }
  expect(await violations()).toEqual([]);
});

test('a card opens with no network, and the screen is asked to stay on while it is shown', async ({
  page,
  context,
  baseURL,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __wake: number }).__wake = 0;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          (window as unknown as { __wake: number }).__wake += 1;
          return { release: async () => undefined };
        },
      },
    });
  });
  await open(page, baseURL);
  await addCard(page, { shop: 'Tesco', number: '590123412345', kind: 'EAN-13' });
  await expect.poll(async () => (await rowsOf(page)).length).toBe(1);
  const id = (await rowsOf(page))[0]?.id ?? '';
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 30_000 })
    .toBe(0);
  await offline(context);
  // The shell answers the address with no network, and the card is read from the device.
  await page.goto(`/cards/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Tesco' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('img', { name: /^Tesco: EAN-13/ })).toBeVisible();
  await expect(page.getByLabel('Number', { exact: true })).toHaveText('5901234123457');
  expect(
    await page.evaluate(() => (window as unknown as { __wake: number }).__wake),
  ).toBeGreaterThan(0);
  await page.goto('/cards');
  await expect(heading(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: /Tesco/ })).toBeVisible();
  // Deleting needs the server, and says so.
  await page.getByRole('link', { name: /Tesco/ }).click();
  await page.getByRole('button', { name: 'Delete this card…' }).click();
  await page.getByRole('button', { name: 'Delete the card' }).click();
  await expect(page.getByText('This needs a connection')).toBeVisible();
  await online(context);
});

test('its Admin changes a card, with a cleared note, and deletes it, which takes it from the grid and the device', async ({
  page,
  baseURL,
}) => {
  await open(page, baseURL);
  await addCard(page, { shop: 'Boots', number: '77', kind: 'Code 128' });
  await page.getByRole('link', { name: /Boots/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Change the card' });
  await edit.getByLabel('Shop or brand').fill('Boots Advantage');
  await edit.getByLabel('Name on the card (optional)').fill('A. Lovelace');
  await edit.getByLabel('Note (optional)').fill('Scan before paying');
  await edit.getByRole('button', { name: 'Save the card' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boots Advantage' })).toBeVisible();
  await expect(page.getByText('A. Lovelace')).toBeVisible();
  await expect(page.getByText('Scan before paying')).toBeVisible();
  await expect
    .poll(async () => (await rowsOf(page))[0]?.shop, { timeout: 10_000 })
    .toBe('Boots Advantage');
  // The note cleared: it is gone from the card.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Change the card' })
    .getByLabel('Note (optional)')
    .fill('');
  await page
    .getByRole('dialog', { name: 'Change the card' })
    .getByRole('button', { name: 'Save the card' })
    .click();
  await expect(page.getByText('Scan before paying')).toHaveCount(0);
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'outbox')).length, { timeout: 30_000 })
    .toBe(0);
  expect(await deviceRows(page, account, 'failed')).toEqual([]);

  // Delete asks first; Cancel keeps it, and Delete takes it from the server and the device.
  await page.getByRole('button', { name: 'Delete this card…' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boots Advantage' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete this card…' }).click();
  await page.getByRole('button', { name: 'Delete the card' }).click();
  await expect(page).toHaveURL('/cards');
  await expect(page.getByText('No cards yet')).toBeVisible();
  await expect.poll(async () => (await deviceRows(page, account, 'card')).length).toBe(0);
});

test('on a phone the cards keep to the width, the footer has the cards, and a card’s code is as wide as the screen', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize(PHONE);
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/cards');
  await expect(heading(page)).toBeVisible({ timeout: 30_000 });
  await waitMoved(page, baseURL ?? '');
  await addCard(page, { shop: 'Tesco', number: '590123412345', kind: 'EAN-13' });
  await expect(page.getByRole('link', { name: /Tesco/ })).toBeVisible();
  // The phone's footer has the cards on its right, as a link that is the page shown.
  await expect(page.getByRole('link', { name: 'Loyalty cards' }).last()).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('link', { name: /Tesco/ }).click();
  const image = page.getByRole('img', { name: /^Tesco: EAN-13/ });
  await expect(image).toBeVisible();
  const box = await image.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(PHONE.width * 0.7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
