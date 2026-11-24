import { type Decoder, nativeDecoder, wasmDecoder } from './scan';

/**
 * **The decoder a page uses** (DESIGN.md §22.3): the browser's own where it reads all six kinds, otherwise ZXing's, loaded only when a scan starts (it is a megabyte of WebAssembly, and most visits
 * scan nothing) **and from this app's own origin**: the `.wasm` is an asset of the build, emitted beside the app's other static files, which the service worker keeps. The library's default is a
 * CDN, which is never asked: a frame is not shown to a third party, and nothing is requested while a card is scanned.
 */
const WASM = new URL(
  '../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',
  import.meta.url,
);

export async function pickDecoder(): Promise<Decoder> {
  const native = await nativeDecoder();
  if (native) return native;
  const reader = await import('zxing-wasm/reader');
  return wasmDecoder(reader as never, {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? WASM.href : prefix + path,
  });
}
