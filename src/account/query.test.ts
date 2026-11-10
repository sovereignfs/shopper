import { describe, expect, it } from 'vitest';
import { one, sectionOf } from './query';

describe('which section of Settings an address asks for', () => {
  it('opens the one it names, and Profile for anything else', () => {
    expect(sectionOf({ section: 'sign-in' })).toBe('sign-in');
    expect(sectionOf({ section: 'data' })).toBe('data');
    for (const section of [undefined, '', 'nonsense', 'Sign-In', '__proto__', 'profile ']) {
      expect(sectionOf({ section })).toBe('profile');
    }
  });

  it('takes the first value of a parameter, and nothing from a list', () => {
    expect(one('a')).toBe('a');
    expect(one(['a', 'b'])).toBeUndefined();
    expect(one(undefined)).toBeUndefined();
  });
});
