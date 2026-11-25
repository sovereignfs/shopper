import { describe, expect, it } from 'vitest';
import { VIEW_KEY, readView, viewOf, writeView } from './view-preference';

const storage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => void (data[key] = value),
  };
};

describe('how a list shows its items by default', () => {
  it('is one of the two, and none for anything else stored', () => {
    expect(viewOf('aisle')).toBe('aisle');
    expect(viewOf('added')).toBe('added');
    for (const value of [null, undefined, '', 'Aisle', 'grid', '__proto__'])
      expect(viewOf(value)).toBeNull();
  });

  it('is read from and written to the device, under the key the list screen has always used', () => {
    expect(VIEW_KEY).toBe('shopper:list-view');
    const kept = storage();
    expect(readView(kept)).toBeNull();
    writeView(kept, 'added');
    expect(kept.data[VIEW_KEY]).toBe('added');
    expect(readView(kept)).toBe('added');
    expect(readView(storage({ [VIEW_KEY]: 'aisle' }))).toBe('aisle');
  });

  it('survives a browser with no storage, or one that refuses it', () => {
    expect(readView(undefined)).toBeNull();
    const refusing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readView(refusing)).toBeNull();
    expect(() => writeView(refusing, 'added')).not.toThrow();
  });
});
