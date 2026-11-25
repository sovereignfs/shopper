import { describe, expect, it } from 'vitest';
import { type CopyKeys, sourceKeyOn } from './copies';
import { copySourceKey, deriveListKeyring, newKeyring } from './household';

/** The source key of a category on a list needs a group that has moved and a list's keys that are open (DESIGN.md §8.3). */
const HOUSEHOLD = '10000000-0000-4000-8000-000000000001';
const LIST = '20000000-0000-4000-8000-000000000001';
const CATEGORY = '30000000-0000-4000-8000-000000000001';

describe('the source key of a category on a list', () => {
  it('is made from the list’s keys, and from nothing else', async () => {
    const ring = await deriveListKeyring(newKeyring(), LIST);
    const keys: CopyKeys = { encrypted: () => true, ringOf: async () => ring };
    expect(await sourceKeyOn(keys, HOUSEHOLD, LIST, CATEGORY)).toBe(
      await copySourceKey(ring, LIST, CATEGORY),
    );
  });

  it('is none for a group the server still seals, and none while the list’s keys are not open', async () => {
    const ring = await deriveListKeyring(newKeyring(), LIST);
    expect(
      await sourceKeyOn(
        { encrypted: () => false, ringOf: async () => ring },
        HOUSEHOLD,
        LIST,
        CATEGORY,
      ),
    ).toBeUndefined();
    expect(
      await sourceKeyOn(
        { encrypted: async () => true, ringOf: async () => undefined },
        HOUSEHOLD,
        LIST,
        CATEGORY,
      ),
    ).toBeUndefined();
  });
});
