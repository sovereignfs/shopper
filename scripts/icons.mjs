// Makes the app's PNG icons from the mark in public/icons/icon.svg, with the browser that is already here for the browser tests: `pnpm icons`.
//
//   icon-192.png, icon-512.png   the mark on its rounded square, as the SVG is
//   maskable-512.png              full bleed, with the mark inside the middle 60% so that any shape a platform cuts keeps all of it
//   apple-touch-icon.png          180 x 180, full bleed: iOS rounds it itself
//
// The files are committed; this is how they were made, and how to make them again if the mark changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = readFileSync(`${dir}icon.svg`, 'utf8');
const mark = (svg.match(/<path[\s\S]*<\/svg>/) ?? [''])[0].replace('</svg>', '');
const BACKGROUND = '#18181b';

/** The SVG with the mark scaled about the centre by `scale`, on a square of `radius` (0 for full bleed). */
const icon = (scale, radius) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${radius}" fill="${BACKGROUND}"/><g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${mark}</g></svg>`;

const files = [
  ['icon-192.png', 192, icon(1, 112)],
  ['icon-512.png', 512, icon(1, 112)],
  ['maskable-512.png', 512, icon(0.6, 0)],
  ['apple-touch-icon.png', 180, icon(0.78, 0)],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, body] of files) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${body}`,
  );
  writeFileSync(
    `${dir}${name}`,
    await page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    }),
  );
}
await browser.close();
