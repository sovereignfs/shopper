import { expect, type Page } from '@playwright/test';
import { PHONE, seedItems, signUp, test } from './helpers';

/**
 * A list's header (task 22.4, RFC 0005): Shop first and primary, Share, and the menu as a ghost button, all of one height, with the menu's glyph meeting the
 * rows' right edge, at a desktop's width and a phone's, in light and in dark. Shop is there only when there is something to buy.
 */
async function boxes(page: Page) {
  const box = async (name: string) => {
    const button = page.getByRole('button', { name, exact: true });
    return {
      button: await button.boundingBox(),
      glyph: await button.locator('svg').last().boundingBox(),
    };
  };
  return { shop: await box('Shop'), share: await box('Share'), menu: await box('List menu') };
}

for (const [label, viewport] of [
  ['a desktop', { width: 1280, height: 900 }],
  ['a phone', PHONE],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`the header's three buttons are one height and the menu meets the rows' edge, on ${label}, in ${scheme}`, async ({
      page,
      baseURL,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await signUp(page);
      await seedItems(page, [{ name: 'Milk', category: 'dairy-eggs' }], baseURL ?? '');
      await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
      const { shop, share, menu } = await boxes(page);
      for (const part of [shop, share, menu]) expect(part.button).not.toBeNull();
      const heights = [shop, share, menu].map((part) => Math.round(part.button?.height ?? 0));
      expect(new Set(heights).size, `heights ${heights.join(', ')}`).toBe(1);

      // Shop is first, with its label also on a phone; Share keeps its label only where there is room.
      expect(shop.button?.x ?? 0).toBeLessThan(share.button?.x ?? 0);
      await expect(page.getByRole('button', { name: 'Shop', exact: true })).toContainText('Shop');
      const shareLabel = page
        .getByRole('button', { name: 'Share', exact: true })
        .getByText('Share');
      if (viewport.width < 600) await expect(shareLabel).toBeHidden();
      else await expect(shareLabel).toBeVisible();

      // The menu's glyph, not its button, meets the right edge of the rows below it.
      const row = await page.getByRole('listitem').filter({ hasText: 'Milk' }).boundingBox();
      const rowEdge = (row?.x ?? 0) + (row?.width ?? 0);
      const glyphEdge = (menu.glyph?.x ?? 0) + (menu.glyph?.width ?? 0);
      expect(Math.abs(glyphEdge - rowEdge)).toBeLessThanOrEqual(1);
    });
  }
}

test('a list with nothing to buy has no Shop button', async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shop', exact: true })).toHaveCount(0);
});
