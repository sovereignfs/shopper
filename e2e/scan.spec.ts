import { expect, type Page } from '@playwright/test';
import { encode } from 'uqr';
import { signUp, test, waitMoved } from './helpers';

/**
 * Scanning a card in a browser (task 24.4, RFC 0007, DESIGN.md §22.3): the camera is Chromium's fake one, which plays a file of a code held still; the page reads it **on the device** with the
 * browser's own detector where there is one, or the bundled WebAssembly decoder, and starts the card's form from what it read. **Nothing is requested while it scans**, and the decoder's `.wasm`
 * comes from this app's own origin and no other. Typing is the way when the camera is refused or there is none, in both browsers.
 */
/**
 * A camera that shows a picture held still: `getUserMedia` answers with the stream of a canvas that is painted with the picture, which the page then plays in its `<video>` and reads as it
 * would a real camera's (the same in both browsers, which a flag of one browser's fake camera would not be). The picture is a matrix of squares or bars, black on white with a quiet zone.
 */
interface Picture {
  readonly rows: readonly (readonly boolean[])[];
  readonly scale: number;
  readonly quiet: number;
}
async function showsCamera(page: Page, picture: Picture, blankFor = 0) {
  await page.addInitScript(
    ({ shown, blankFor: wait }) => {
      const width = 640;
      const height = 480;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      const started = Date.now();
      const paint = () => {
        if (!context) return;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        // A card not yet held up to the camera: a blank page for a while, which is when nothing may be asked of the network.
        if (Date.now() - started < wait) return;
        context.fillStyle = '#000';
        const columns = shown.rows[0]?.length ?? 0;
        const pictureWidth = (columns + shown.quiet * 2) * shown.scale;
        const pictureHeight = (shown.rows.length + shown.quiet * 2) * shown.scale;
        const left = Math.floor((width - pictureWidth) / 2) + shown.quiet * shown.scale;
        const top = Math.floor((height - pictureHeight) / 2) + shown.quiet * shown.scale;
        shown.rows.forEach((row, y) =>
          row.forEach((dark, x) => {
            if (dark)
              context.fillRect(
                left + x * shown.scale,
                top + y * shown.scale,
                shown.scale,
                shown.scale,
              );
          }),
        );
      };
      paint();
      // A canvas gives a frame when it is painted: painted again and again, it is a camera that is on.
      setInterval(paint, 100);
      const stream = canvas.captureStream(15);
      (window as unknown as { __camera: MediaStream }).__camera = stream;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => stream },
      });
    },
    { shown: picture, blankFor },
  );
}

// An EAN-13 from its specification (an independent encoder: the app's own is not what a camera is tested against).
const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const R = L.map((code) => [...code].map((bit) => (bit === '0' ? '1' : '0')).join(''));
const G = R.map((code) => [...code].reverse().join(''));
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];
function ean13(value: string): boolean[] {
  const digits = [...value].map(Number);
  const parity = PARITY[digits[0] ?? 0] ?? '';
  let bits = '101';
  for (let i = 0; i < 6; i += 1) bits += (parity[i] === 'L' ? L : G)[digits[i + 1] ?? 0];
  bits += '01010';
  for (let i = 7; i < 13; i += 1) bits += R[digits[i] ?? 0];
  return [...`${bits}101`].map((bit) => bit === '1');
}
const EAN: Picture = {
  rows: Array.from({ length: 40 }, () => ean13('5901234123457')),
  scale: 4,
  quiet: 11,
};
const QR: Picture = { rows: encode('MEMBER 77', { ecc: 'M', border: 0 }).data, scale: 8, quiet: 4 };

async function toCards(page: Page, baseURL: string | undefined) {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
  await page.goto('/cards');
  await expect(page.getByRole('heading', { level: 1, name: 'Loyalty cards' })).toBeVisible({
    timeout: 30_000,
  });
  await waitMoved(page, baseURL ?? '');
}

/** What the page asks the network for from now on. */
function watch(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

test.describe('with a camera that shows an EAN-13', () => {
  test('reads it on the device and starts the card from it, with the bundled decoder from this origin and nothing requested while scanning', async ({
    page,
    baseURL,
    browserName,
  }) => {
    test.slow();
    // The card is held up to the camera after a few seconds of a blank page: a window in which the decoder is ready and reading frames, and nothing may be asked of the network.
    await showsCamera(page, EAN, 3000);
    // The bundled decoder is the one under test: a browser that has its own detector is made to have none.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: undefined });
    });
    await toCards(page, baseURL);
    const requested = watch(page);
    await page.getByRole('button', { name: 'Scan card' }).click();
    await expect(page.getByText(/read on this device and goes nowhere/)).toBeVisible({
      timeout: 30_000,
    });
    // The decoder is ready: it came from this origin (its `.wasm` is a file of the app's own build), and from then on the page asks for nothing until the card is read.
    // (The page's own record of what it loaded, which both browsers keep even when the service worker answers.)
    const wasm = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.includes('zxing_reader') && name.endsWith('.wasm')),
    );
    // WebKit, with the service worker answering from what it kept, reports no entry for it: where it reports one, it is this origin's.
    if (browserName === 'chromium') expect(wasm.length).toBeGreaterThan(0);
    for (const url of wasm) expect(new URL(url).origin).toBe(new URL(baseURL ?? '').origin);
    const decoderLoaded = requested.length;
    const form = page.getByRole('dialog', { name: 'Add a card' });
    await expect(form).toBeVisible({ timeout: 30_000 });
    expect(requested.slice(decoderLoaded)).toEqual([]);
    // And nothing it asked for, ever, was for anyone else.
    for (const url of requested)
      expect(new URL(url).origin, url).toBe(new URL(baseURL ?? '').origin);
    await expect(form.getByLabel('Number', { exact: true })).toHaveValue('5901234123457');
    await expect(form.getByLabel('Kind of code')).toHaveValue('ean13');
    await form.getByLabel('Shop or brand').fill('Tesco');
    await form.getByRole('button', { name: 'Add the card' }).click();
    await expect(page.getByRole('link', { name: /Tesco/ })).toBeVisible();
    // The camera was let go the moment the code was read: its tracks are ended, and the picture holds none.
    expect(
      await page.evaluate(() =>
        (window as unknown as { __camera: MediaStream }).__camera
          .getTracks()
          .every((track) => track.readyState === 'ended'),
      ),
    ).toBe(true);
  });

  test('uses the browser’s own detector where it has all six kinds, and never loads the decoder then', async ({
    page,
    baseURL,
  }) => {
    await showsCamera(page, EAN);
    await page.addInitScript(() => {
      const formats = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'code_128', 'code_39'];
      Object.defineProperty(window, 'BarcodeDetector', {
        configurable: true,
        value: class {
          static async getSupportedFormats() {
            return formats;
          }
          async detect() {
            return [{ format: 'code_128', rawValue: 'NATIVE 1' }];
          }
        },
      });
    });
    await toCards(page, baseURL);
    const requested = watch(page);
    await page.getByRole('button', { name: 'Scan card' }).click();
    const form = page.getByRole('dialog', { name: 'Add a card' });
    await expect(form).toBeVisible({ timeout: 30_000 });
    await expect(form.getByLabel('Number', { exact: true })).toHaveValue('NATIVE 1');
    await expect(form.getByLabel('Kind of code')).toHaveValue('code128');
    expect(requested.some((url) => url.includes('zxing_reader'))).toBe(false);
  });
});

test.describe('with a camera that shows a QR code', () => {
  test('reads a QR code and starts the card from what it holds', async ({ page, baseURL }) => {
    test.slow();
    await showsCamera(page, QR);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: undefined });
    });
    await toCards(page, baseURL);
    await page.getByRole('button', { name: 'Scan card' }).click();
    const form = page.getByRole('dialog', { name: 'Add a card' });
    await expect(form).toBeVisible({ timeout: 30_000 });
    await expect(form.getByLabel('Kind of code')).toHaveValue('qr');
    await expect(form.getByLabel('Number', { exact: true })).toHaveValue('MEMBER 77');
  });
});

test.describe('with no way to scan', () => {
  test('a camera the person refuses leaves typing, and the form is the way', async ({
    page,
    baseURL,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new DOMException('Permission denied', 'NotAllowedError');
          },
        },
      });
    });
    await toCards(page, baseURL);
    await page.getByRole('button', { name: 'Scan card' }).click();
    const scan = page.getByRole('dialog', { name: 'Scan a card' });
    await expect(scan.getByText('The camera is not allowed here')).toBeVisible();
    await scan.getByRole('button', { name: 'Type the number instead' }).click();
    const form = page.getByRole('dialog', { name: 'Add a card' });
    await expect(form).toBeVisible();
    await form.getByLabel('Shop or brand').fill('Boots');
    await form.getByLabel('Number', { exact: true }).fill('77');
    await form.getByLabel('Kind of code').selectOption({ label: 'Code 128' });
    await form.getByRole('button', { name: 'Add the card' }).click();
    await expect(page.getByRole('link', { name: /Boots/ })).toBeVisible();
  });

  test('a device with no camera says so and leaves typing', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    });
    await toCards(page, baseURL);
    await page.getByRole('button', { name: 'Scan card' }).click();
    const scan = page.getByRole('dialog', { name: 'Scan a card' });
    await expect(scan.getByText('There is no camera to scan with')).toBeVisible();
    await scan.getByRole('button', { name: 'Cancel' }).click();
    await expect(scan).toHaveCount(0);
    // Nothing was made, and typing is still there.
    await page.getByRole('button', { name: 'Add card' }).click();
    await expect(page.getByRole('dialog', { name: 'Add a card' })).toBeVisible();
  });
});
