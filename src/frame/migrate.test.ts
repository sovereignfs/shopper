import { describe, expect, it } from 'vitest';
import { NEW_SIDEBAR_KEY, OLD_SIDEBAR_KEY, migrateSidebar } from './migrate';

const storage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => void (data[key] = value),
    removeItem: (key: string) => void Reflect.deleteProperty(data, key),
  };
};

const HIDDEN = JSON.stringify({ page: { state: 'hidden', shown: 'rail' } });
const RAIL = JSON.stringify({ home: { state: 'rail', shown: 'rail' } });

describe('the sidebar’s remembered choices, carried to the design system’s key', () => {
  it('moves what was kept, once, and leaves nothing under the old key', () => {
    const kept = storage({ [OLD_SIDEBAR_KEY]: HIDDEN });
    migrateSidebar(kept);
    expect(kept.data[NEW_SIDEBAR_KEY]).toBe(HIDDEN);
    expect(OLD_SIDEBAR_KEY in kept.data).toBe(false);
    migrateSidebar(kept);
    expect(kept.data[NEW_SIDEBAR_KEY]).toBe(HIDDEN);
  });

  it('never writes over a choice already made under the new key, and still drops the old', () => {
    const kept = storage({ [OLD_SIDEBAR_KEY]: HIDDEN, [NEW_SIDEBAR_KEY]: RAIL });
    migrateSidebar(kept);
    expect(kept.data[NEW_SIDEBAR_KEY]).toBe(RAIL);
    expect(OLD_SIDEBAR_KEY in kept.data).toBe(false);
  });

  it('does nothing where nothing was kept, or the browser has no storage or refuses it', () => {
    const empty = storage();
    migrateSidebar(empty);
    expect(empty.data).toEqual({});
    expect(() => migrateSidebar(undefined)).not.toThrow();
    const refusing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(() => migrateSidebar(refusing)).not.toThrow();
  });
});
