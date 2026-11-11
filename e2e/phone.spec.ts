import { expect, type Page } from '@playwright/test';
import { PHONE, recordViolations, seedItems, signUp, test } from './helpers';

/**
 * The phone, in a browser (task 8.8): the footer (Lists, the launcher, Settings), the way back to the lists, the add field at the top, ticking and a long
 * press to edit, the item's dialog the whole screen, and nothing that scrolls sideways at a phone's width. The same routes and the same data as on a wide
 * screen: only what is drawn differs, so the wide screen has no footer.
 */
const footer = (page: Page) => page.locator('footer');
const nothingSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('a wide screen has no footer', async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await expect(footer(page).getByRole('button', { name: 'Lists' })).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the footer takes you to your lists and to Settings, and its launcher offers a new list', async ({
    page,
  }) => {
    const violations = await recordViolations(page);
    await signUp(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
    await expect(footer(page).getByRole('button', { name: 'Lists' })).toBeVisible();
    await footer(page).getByRole('button', { name: 'Lists' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer.getByRole('link', { name: /Groceries/ })).toBeVisible();
    await drawer.getByRole('link', { name: /Groceries/ }).click();
    await expect(drawer).toHaveCount(0);

    // The way back to the lists is in the list's own header, too.
    await page.getByRole('button', { name: 'Lists' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await page.keyboard.press('Escape');

    await footer(page)
      .getByRole('button', { name: /apps|add/i })
      .click();
    await page.getByRole('dialog', { name: 'What to add' }).getByText('New list').click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await page.keyboard.press('Escape');

    await footer(page).getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(footer(page).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      /.+/,
    );
    expect(await nothingSideways(page)).toBe(true);
    expect(await violations()).toEqual([]);
  });

  test('a list is used end to end: add, tick, edit by a long press and by the pencil, with nothing sideways', async ({
    page,
    baseURL,
  }) => {
    await signUp(page);
    await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
    const field = page.getByRole('combobox', { name: 'Add an item' });
    await field.focus({ timeout: 15_000 });
    // The add field is the first thing on a list, above the items.
    const fieldBox = await field.boundingBox();
    const firstRow = await page.getByRole('checkbox', { name: /Milk/ }).boundingBox();
    expect(fieldBox && firstRow && fieldBox.y < firstRow.y).toBe(true);
    await page.keyboard.type('bread');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('checkbox', { name: /Bread/ })).toBeVisible();
    await page.getByRole('checkbox', { name: /Milk/ }).click();
    await expect(page.getByRole('button', { name: /Bought \(1\)/ })).toBeVisible();
    expect(await nothingSideways(page)).toBe(true);

    // A long press, as a finger makes it, opens the item; a tap does not.
    const row = page.getByRole('checkbox', { name: /Bread/ });
    await row.evaluate(async (element) => {
      const init = { bubbles: true, pointerType: 'touch', pointerId: 7, isPrimary: true };
      element.dispatchEvent(new PointerEvent('pointerdown', init));
      await new Promise((resolve) => setTimeout(resolve, 700));
      element.dispatchEvent(new PointerEvent('pointerup', init));
    });
    const dialog = page.getByRole('dialog', { name: /Item: Bread/ });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(PHONE.width - 1);
    await page.keyboard.press('Escape');

    // The pencil is a target a finger can hit.
    const pencil = await page.getByRole('button', { name: 'Edit Bread' }).boundingBox();
    expect(Math.min(pencil?.width ?? 0, pencil?.height ?? 0)).toBeGreaterThanOrEqual(32);
    await page.getByRole('button', { name: 'Edit Bread' }).click();
    await expect(dialog).toBeVisible();
    expect(await nothingSideways(page)).toBe(true);
  });
});
