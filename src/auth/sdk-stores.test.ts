import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ringOf } from '../crypto/keys';
import { sdkTokenStore } from './sdk-stores';
import { type TestAuth, makeAuth } from './test-support';

/**
 * A person's refresh token (sdk §5.1), kept sealed in the auth store. Core rotates it on every use and takes one used twice for theft, so what protects it is
 * in this store: `write` is a conditional update, and `lock` is a lease on the row, so that two processes never renew one person's token at once. (Within one
 * process the SDK has one renewal in flight per person; the lease is what holds across processes, which a browser test cannot start.)
 */
let t: TestAuth;
beforeAll(async () => {
  t = await makeAuth();
});
afterAll(async () => {
  await t.close();
});

const ring = ringOf(randomBytes(32));
if (!ring) throw new Error('no key ring');
const store = () =>
  sdkTokenStore(
    () => Promise.resolve(t.store),
    () => ring,
  );

describe('a person’s refresh token', () => {
  it('is written once, replaced only by whoever holds the one it replaces, and read back as written', async () => {
    const tokens = store();
    expect(await tokens.read('sub-a')).toBeUndefined();
    expect(await tokens.write('sub-a', 'first', undefined)).toBe(true);
    // A second first write finds one there; a renewal that holds a token already replaced is refused, and the stored one stands.
    expect(await tokens.write('sub-a', 'other', undefined)).toBe(false);
    expect(await tokens.write('sub-a', 'second', 'not-the-stored-one')).toBe(false);
    expect(await tokens.read('sub-a')).toBe('first');
    expect(await tokens.write('sub-a', 'second', 'first')).toBe(true);
    expect(await tokens.read('sub-a')).toBe('second');
    // Another person's is not touched, and is not read through this one's name.
    expect(await tokens.read('sub-b')).toBeUndefined();
  });

  it('is renewed by one at a time: a second renewal of the same person waits for the first to end', async () => {
    const tokens = store();
    expect(await tokens.write('sub-lock', 'a', undefined)).toBe(true);
    let running = 0;
    let most = 0;
    const renewal = async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 150));
      running -= 1;
      return 'done';
    };
    const lock = tokens.lock;
    if (!lock) throw new Error('the store has no lock');
    const all = await Promise.all([
      lock('sub-lock', renewal),
      lock('sub-lock', renewal),
      lock('sub-lock', renewal),
    ]);
    expect(all).toEqual(['done', 'done', 'done']);
    // Never two at once.
    expect(most).toBe(1);
  });

  it('does not make one person wait for another’s renewal, and frees the lease when a renewal fails', async () => {
    const tokens = store();
    const lock = tokens.lock;
    if (!lock) throw new Error('the store has no lock');
    expect(await tokens.write('sub-c', 'a', undefined)).toBe(true);
    expect(await tokens.write('sub-d', 'a', undefined)).toBe(true);
    let release: () => void = () => undefined;
    const held = lock(
      'sub-c',
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve('c');
        }),
    );
    // Another person's lock is taken at once, while the first is held.
    expect(await lock('sub-d', async () => 'd')).toBe('d');
    release();
    expect(await held).toBe('c');
    // A renewal that throws leaves no lease behind: the next one is not made to wait.
    await expect(
      lock('sub-c', async () => {
        throw new Error('core was out of reach');
      }),
    ).rejects.toThrow('core was out of reach');
    const started = Date.now();
    expect(await lock('sub-c', async () => 'again')).toBe('again');
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
