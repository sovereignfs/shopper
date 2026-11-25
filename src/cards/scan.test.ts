import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as reader from 'zxing-wasm/reader';
import { type Found, NATIVE_FORMATS, ZXING_FORMATS, nativeDecoder, wasmDecoder } from './scan';
import { CODE_KINDS, type CodeKind } from './kinds';
import { imageOf } from './test-images';

/**
 * Reading a code from a frame (task 24.4, DESIGN.md §22.3): **each of the six kinds is read from an image of it by the bundled decoder** (the real ZXing, as WebAssembly, given its `.wasm` from
 * the file), and the browser's detector, which a test cannot run, is held to the same six by its mapping and by a stand-in that says what the real one says. The values: a card of each kind.
 */
const require = createRequire(import.meta.url);
const wasm = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
const decoder = wasmDecoder(reader as never, {
  // As a page would give it a file's address; here the file is read, since a test has no server.
  instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) {
    void WebAssembly.instantiate(wasm, imports).then(({ instance }) => done(instance));
    return {};
  },
});

const VECTORS: readonly { kind: CodeKind; value: string; read?: Found }[] = [
  { kind: 'ean13', value: '5901234123457' },
  { kind: 'ean13', value: '4006381333931' },
  // A UPC-A is an EAN-13 with a leading zero, and ZXing says EAN-13: it is read as the UPC-A it is.
  { kind: 'upca', value: '614141000036' },
  { kind: 'ean8', value: '96385074' },
  { kind: 'upca', value: '036000291452' },
  { kind: 'code128', value: 'CARD 4321-9' },
  { kind: 'code128', value: '6034040240012345678' },
  { kind: 'code39', value: 'ABC-12 $/+%' },
  { kind: 'qr', value: 'MEMBER 77' },
  { kind: 'qr', value: 'https://example.com/lidl/77?card=ab&x=%C3%A9' },
];

describe('the bundled decoder reads each kind from an image of it', () => {
  it.each(VECTORS)('$kind $value', async ({ kind, value }) => {
    const image = imageOf(kind, value);
    expect(image).not.toBeNull();
    const found = await decoder.decode(image as never);
    expect(found).toEqual({ kind, value });
  });

  it('is made ready once, by asking for its wasm, and reads no frame until it is', async () => {
    let asked = 0;
    const counting = wasmDecoder(
      {
        prepareZXingModule: (options) => {
          asked += 1;
          return reader.prepareZXingModule(options as never);
        },
        readBarcodes: reader.readBarcodes as never,
      },
      {
        instantiateWasm(
          imports: WebAssembly.Imports,
          done: (instance: WebAssembly.Instance) => void,
        ) {
          void WebAssembly.instantiate(wasm, imports).then(({ instance }) => done(instance));
          return {};
        },
      },
    );
    expect(asked).toBe(0);
    await Promise.all([counting.ready(), counting.ready()]);
    expect(asked).toBe(1);
    expect(await counting.decode(imageOf('qr', 'MEMBER 77') as never)).toEqual({
      kind: 'qr',
      value: 'MEMBER 77',
    });
    expect(asked).toBe(1);
  });

  it('takes the first result that is a valid code of one of the six kinds, and no other', async () => {
    const said = (
      results: { isValid: boolean; format: string; text: string }[],
    ): Parameters<typeof wasmDecoder>[0] => ({
      prepareZXingModule: () => undefined,
      readBarcodes: async () => results,
    });
    const frame = imageOf('qr', 'x') as never;
    const stand = wasmDecoder(
      said([
        // Read but not valid (a check digit that does not add up), a kind that is not one of the six, an empty one: none is a card's code.
        { isValid: false, format: 'EAN13', text: '5901234123450' },
        { isValid: true, format: 'DataMatrix', text: 'FOREIGN' },
        { isValid: true, format: 'Code128', text: '' },
        { isValid: true, format: 'Code39', text: 'ABC-12' },
        { isValid: true, format: 'QRCode', text: 'LATER' },
      ]),
      {},
    );
    expect(await stand.decode(frame)).toEqual({ kind: 'code39', value: 'ABC-12' });
    expect(
      await wasmDecoder(said([{ isValid: false, format: 'QRCode', text: 'x' }]), {}).decode(frame),
    ).toBeNull();
  });

  it('covers all six kinds, and is the same value that a card would hold once typed', () => {
    expect(new Set(VECTORS.map((each) => each.kind))).toEqual(new Set(CODE_KINDS));
  });

  it('finds nothing in a blank frame or a frame of noise, and says so without failing', async () => {
    const blank = {
      data: new Uint8ClampedArray(200 * 200 * 4).fill(255),
      width: 200,
      height: 200,
      colorSpace: 'srgb',
    } as const;
    expect(await decoder.decode(blank as never)).toBeNull();
    const noise = new Uint8ClampedArray(200 * 200 * 4);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) % 256;
    expect(
      await decoder.decode({ data: noise, width: 200, height: 200, colorSpace: 'srgb' } as never),
    ).toBeNull();
  });

  it('reads a code that is smaller, as a card held further from the camera is', async () => {
    for (const { kind, value } of VECTORS.filter((each) => each.kind !== 'code39')) {
      const small = imageOf(kind, value, 2);
      expect(await decoder.decode(small as never), `${kind} ${value}`).toEqual({ kind, value });
    }
  });
});

describe('the formats a decoder names', () => {
  it('map each of the six kinds in both decoders, and only those', () => {
    expect(new Set(Object.values(NATIVE_FORMATS))).toEqual(new Set(CODE_KINDS));
    expect(new Set(Object.values(ZXING_FORMATS))).toEqual(new Set(CODE_KINDS));
    expect(Object.keys(NATIVE_FORMATS)).toHaveLength(6);
    expect(Object.keys(ZXING_FORMATS)).toHaveLength(6);
  });
});

describe('the browser’s detector', () => {
  const frame = {
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
    colorSpace: 'srgb',
  } as never;
  const detector = (formats: string[], found: { format: string; rawValue: string }[]) =>
    class {
      static getSupportedFormats = async () => formats;
      constructor(readonly options: { formats: string[] }) {}
      detect = async () => found;
    };

  it('is used only where it has all six kinds, and asked for those six', async () => {
    const all = Object.keys(NATIVE_FORMATS);
    const Detector = detector(all, [{ format: 'ean_13', rawValue: '5901234123457' }]);
    const chosen = await nativeDecoder({ BarcodeDetector: Detector as never });
    expect(chosen?.name).toBe('native');
    expect(await chosen?.decode(frame)).toEqual({ kind: 'ean13', value: '5901234123457' });
    // One kind missing: the bundled decoder is better than one that reads some cards and not others.
    expect(
      await nativeDecoder({ BarcodeDetector: detector(all.slice(1), []) as never }),
    ).toBeNull();
    expect(await nativeDecoder({})).toBeNull();
    expect(
      await nativeDecoder({
        // A detector whose list of formats cannot be read: a function with the one static method, as the real one is a class of.
        BarcodeDetector: Object.assign(function Detector() {}, {
          getSupportedFormats: async () => {
            throw new Error('nope');
          },
        }) as never,
      }),
    ).toBeNull();
  });

  it('reads a UPC-A the way the bundled decoder does: an EAN-13 with a leading zero is the UPC-A it is', async () => {
    const all = Object.keys(NATIVE_FORMATS);
    const chosen = await nativeDecoder({
      BarcodeDetector: detector(all, [{ format: 'ean_13', rawValue: '0036000291452' }]) as never,
    });
    expect(await chosen?.decode(frame)).toEqual({ kind: 'upca', value: '036000291452' });
    const same = await nativeDecoder({
      BarcodeDetector: detector(all, [{ format: 'upc_a', rawValue: '036000291452' }]) as never,
    });
    expect(await same?.decode(frame)).toEqual({ kind: 'upca', value: '036000291452' });
  });

  it('takes the first code that is one of the six and has a value, and none for a frame with only others', async () => {
    const all = Object.keys(NATIVE_FORMATS);
    const found = await nativeDecoder({
      BarcodeDetector: detector(all, [
        { format: 'pdf417', rawValue: 'other' },
        { format: 'code_128', rawValue: '' },
        { format: 'code_39', rawValue: 'ABC' },
      ]) as never,
    });
    expect(await found?.decode(frame)).toEqual({ kind: 'code39', value: 'ABC' });
    const none = await nativeDecoder({
      BarcodeDetector: detector(all, [{ format: 'pdf417', rawValue: 'other' }]) as never,
    });
    expect(await none?.decode(frame)).toBeNull();
  });
});
