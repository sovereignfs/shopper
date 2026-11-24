import { encodeBarcode } from '@sovereignfs/ui';
import { qrModules } from './codes';
import type { CodeKind } from './kinds';

/**
 * **An image of a code, for tests**: the squares or bars of a value in a kind, drawn black on white with their quiet zone, at a scale, as the pixels of an `ImageData` (a plain object with the
 * same three fields, which ZXing's reader takes in Node, where there is no `ImageData`). What a camera would show of a card held still.
 */
export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: 'srgb';
}

export function imageOf(kind: CodeKind, value: string, scale = 4): Pixels | null {
  let rows: boolean[][];
  let quiet: number;
  if (kind === 'qr') {
    const squares = qrModules(value);
    if (!squares) return null;
    rows = squares;
    quiet = 4;
  } else {
    const bars = encodeBarcode(kind, value);
    if (!bars) return null;
    // A linear code is its bars repeated down the page: tall enough that a scanner's line crosses it whole.
    rows = Array.from(
      { length: Math.max(24, Math.round(bars.modules.length / 3)) },
      () => bars.modules,
    );
    quiet = Math.max(bars.quiet, 10);
  }
  const width = ((rows[0]?.length ?? 0) + quiet * 2) * scale;
  const height = (rows.length + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [row, modules] of rows.entries())
    for (const [column, dark] of modules.entries()) {
      if (!dark) continue;
      for (let y = 0; y < scale; y += 1)
        for (let x = 0; x < scale; x += 1) {
          const at = ((row + quiet) * scale + y) * width + (column + quiet) * scale + x;
          data[at * 4] = 0;
          data[at * 4 + 1] = 0;
          data[at * 4 + 2] = 0;
        }
    }
  return { data, width, height, colorSpace: 'srgb' };
}
