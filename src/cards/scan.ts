import { type CodeKind } from './kinds';

/**
 * **Reading a code from a camera frame, on the device** (DESIGN.md §22.3, task 24.4, RFC 0007): the browser's `BarcodeDetector` where it has the six kinds a card may hold, otherwise **ZXing's decoder
 * as WebAssembly, bundled with Shopper and served from its own origin** (never from a CDN, which the library would otherwise use), so that **no frame leaves the device** and nothing is requested
 * while a card is scanned. Written to be used for products too (14.1): it says what a frame holds (`Found`: a kind and a value) and nothing about cards.
 */
export interface Found {
  readonly kind: CodeKind;
  /** What the code holds: an EAN, a UPC with its check digit, the text of the others. */
  readonly value: string;
}

/** What reads a frame: the browser's detector (`native`) or the bundled one (`wasm`). */
export interface Decoder {
  readonly name: 'native' | 'wasm';
  /** Has everything it needs to read a frame: the bundled decoder's WebAssembly fetched and compiled, which is the one thing it asks of the network, so that reading a frame asks for nothing. */
  ready(): Promise<void>;
  /** The first code in a frame that is one of the six kinds, or `null`. A frame that holds none is not an error. */
  decode(frame: ImageData): Promise<Found | null>;
}

/** How the browser's detector names the six kinds (the Shape Detection API), and how ZXing does: the one table each, held by tests to the six. */
export const NATIVE_FORMATS: Readonly<Record<string, CodeKind>> = {
  qr_code: 'qr',
  ean_13: 'ean13',
  ean_8: 'ean8',
  upc_a: 'upca',
  code_128: 'code128',
  code_39: 'code39',
};
export const ZXING_FORMATS: Readonly<Record<string, CodeKind>> = {
  QRCode: 'qr',
  EAN13: 'ean13',
  EAN8: 'ean8',
  UPCA: 'upca',
  Code128: 'code128',
  Code39: 'code39',
};

/**
 * What a decoder found, as a card holds it. **A UPC-A is an EAN-13 with a leading zero** (the bars are the same), and a decoder says which it saw by what it was asked for and how it was
 * built: ZXing answers `EAN13` with thirteen digits for a UPC-A's bars. A code of thirteen digits with a leading zero is the UPC-A the card says it is, with its twelve digits; every other value
 * is as it was read.
 */
function found(kind: CodeKind, value: string): Found {
  return kind === 'ean13' && /^0\d{12}$/.test(value)
    ? { kind: 'upca', value: value.slice(1) }
    : { kind, value };
}

/** The browser's detector, as the part of it this uses. */
interface NativeDetector {
  detect(source: ImageBitmapSource): Promise<{ format: string; rawValue: string }[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * The browser's own detector, if it has every one of the six kinds (a browser with some of them would read some cards and not others, which is worse than the one decoder that reads all);
 * `null` where there is none.
 */
export async function nativeDecoder(
  scope: { BarcodeDetector?: NativeDetectorClass } = globalThis as {
    BarcodeDetector?: NativeDetectorClass;
  },
): Promise<Decoder | null> {
  const Detector = scope.BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported = new Set(await Detector.getSupportedFormats());
    if (!Object.keys(NATIVE_FORMATS).every((format) => supported.has(format))) return null;
    const detector = new Detector({ formats: Object.keys(NATIVE_FORMATS) });
    return {
      name: 'native',
      ready: async () => undefined,
      async decode(frame) {
        for (const each of await detector.detect(frame)) {
          const kind = NATIVE_FORMATS[each.format];
          if (kind && each.rawValue !== '') return found(kind, each.rawValue);
        }
        return null;
      },
    };
  } catch {
    return null;
  }
}

/** The part of ZXing's reader this uses, so that a test can give it the bundle's wasm from a file and a page gives it the URL of the one it serves. */
export interface ZXingReader {
  prepareZXingModule(options: {
    overrides: Record<string, unknown>;
    fireImmediately: boolean;
  }): unknown;
  readBarcodes(
    input: ImageData,
    options: { formats: string[]; maxNumberOfSymbols: number; tryHarder: boolean },
  ): Promise<{ isValid: boolean; format: string; text: string }[]>;
}

/**
 * The bundled decoder. **Where its `.wasm` comes from is the caller's** (`overrides`): a page gives it the address of the file its own build serves, and the library's default, a CDN, is never
 * used (it would be a request to a third party, and a frame's worth of trust in it). The module is made once, when the first frame is read.
 */
export function wasmDecoder(reader: ZXingReader, overrides: Record<string, unknown>): Decoder {
  let preparing: Promise<void> | undefined;
  const ready = () =>
    (preparing ??= Promise.resolve(
      reader.prepareZXingModule({ overrides, fireImmediately: true }),
    ).then(() => undefined));
  return {
    name: 'wasm',
    ready,
    async decode(frame) {
      await ready();
      const results = await reader.readBarcodes(frame, {
        formats: Object.keys(ZXING_FORMATS),
        maxNumberOfSymbols: 1,
        tryHarder: true,
      });
      for (const each of results) {
        const kind = ZXING_FORMATS[each.format];
        if (kind && each.isValid && each.text !== '') return found(kind, each.text);
      }
      return null;
    },
  };
}
