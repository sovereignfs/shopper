import { expect, type Page } from '@playwright/test';
import {
  accountOf,
  anotherDevice,
  deviceRows,
  makeLink,
  seedItems,
  serverItems,
  signUp,
  test,
} from './helpers';

/**
 * Leaving and removing, in a browser (task 3.5): a Member who leaves, or is removed by the Admin, loses the household from their device at the next sync and
 * keeps their own; what they added stays on the list under their name, shown as left; the Admin cannot leave; a Member cannot remove anyone. There is no
 * button yet (8.7), so these call the operations the Share dialog will.
 */
const op = (page: Page, base: string, data: Record<string, unknown>) =>
  page.request.post('/api/ops', {
    headers: { origin: base, 'content-type': 'application/json' },
    data,
  });

async function householdOf(page: Page): Promise<string> {
  const account = await accountOf(page);
  await expect
    .poll(async () => (await deviceRows(page, account, 'household')).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const [household] = await deviceRows<{ id: string }>(page, account, 'household');
  if (!household) throw new Error('no household');
  return household.id;
}

/** Ada has a household with Milk on it; Grace has joined it through a link, and has it on her device. */
async function shared(page: Page, browser: Parameters<typeof anotherDevice>[0], base: string) {
  await signUp(page, { name: 'Ada' });
  await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], base);
  const link = await makeLink(page, base);
  const guest = await anotherDevice(browser, base);
  await signUp(guest.page, { name: 'Grace' });
  await guest.page.goto(link.path);
  await guest.page.getByRole('button', { name: 'Join' }).click();
  await expect(guest.page.getByRole('checkbox', { name: /Milk/ })).toBeVisible({ timeout: 30_000 });
  return { household: await householdOf(page), guest };
}

for (const how of ['leaves', 'is removed'] as const) {
  test(`when a Member ${how}, the household goes from their device and their name stays on what they added`, async ({
    page,
    browser,
    baseURL,
  }) => {
    const base = baseURL ?? '';
    const { household, guest } = await shared(page, browser, base);
    // Grace adds something to Ada's list.
    const field = guest.page.getByRole('combobox', { name: 'Add an item' });
    await field.focus();
    await guest.page.keyboard.type('Oat milk');
    await guest.page.keyboard.press('Enter');
    await expect(guest.page.getByRole('checkbox', { name: /Oat milk/ })).toBeVisible();
    const graceAccount = await accountOf(guest.page);
    await expect
      .poll(async () => (await deviceRows(guest.page, graceAccount, 'outbox')).length, {
        timeout: 15_000,
      })
      .toBe(0);
    const adaAccount = await accountOf(page);
    // Ada's device learns that Grace is in at its next sync.
    await expect
      .poll(async () => (await deviceRows(page, adaAccount, 'member')).length, { timeout: 30_000 })
      .toBe(2);
    const members = await deviceRows<{ personId: string; self: boolean }>(
      page,
      adaAccount,
      'member',
    );
    const gracePerson = members.find((member) => !member.self)?.personId;

    const reply =
      how === 'leaves'
        ? await op(guest.page, base, { op: 'member.leave', household })
        : await op(page, base, { op: 'member.remove', household, person: gracePerson });
    expect(reply.status()).toBe(200);

    // Grace's device drops Ada's household at its next sync, and keeps her own.
    await guest.page.reload();
    await expect
      .poll(async () => (await deviceRows(guest.page, graceAccount, 'household')).length, {
        timeout: 30_000,
      })
      .toBe(1);
    await expect(guest.page.getByRole('checkbox', { name: /Milk/ })).toHaveCount(0);

    // Ada still has Grace's item, named, as left.
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /Oat milk/ })).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: /Oat milk/ }) }),
    ).toContainText('added by Grace (left)');
    expect((await serverItems(page, base)).some((item) => item.name === 'Oat milk')).toBe(true);
    await guest.context.close();
  });
}

test('the Admin cannot leave, and a Member cannot remove anyone', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  const { household, guest } = await shared(page, browser, base);
  const adminLeaves = await op(page, base, { op: 'member.leave', household });
  expect(adminLeaves.status()).toBe(409);
  expect((await adminLeaves.json()).message).toContain('only Admin');

  const members = await deviceRows<{ personId: string; self: boolean }>(
    page,
    await accountOf(page),
    'member',
  );
  const adaPerson = members.find((member) => member.self)?.personId;
  const memberRemoves = await op(guest.page, base, {
    op: 'member.remove',
    household,
    person: adaPerson,
  });
  expect(memberRemoves.status()).toBe(404);
  await guest.context.close();
});
