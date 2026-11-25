import { describe, expect, it } from 'vitest';
import { SECTIONS, one, sectionBefore, sectionOf } from './query';

describe('which section of Settings an address names', () => {
  it('is one of the six, and nothing for any other segment', () => {
    expect([...SECTIONS]).toEqual([
      'profile',
      'security',
      'preferences',
      'notifications',
      'device',
      'data',
    ]);
    for (const section of SECTIONS) expect(sectionOf(section)).toBe(section);
    for (const section of [
      undefined,
      '',
      'nonsense',
      'Security',
      '__proto__',
      'constructor',
      'profile ',
      'sign-in',
    ])
      expect(sectionOf(section), String(section)).toBeNull();
  });
});

describe('where an old /settings?section= address goes', () => {
  it('to the section that took the old one’s place', () => {
    expect(sectionBefore('profile')).toBe('profile');
    expect(sectionBefore('sign-in')).toBe('security');
    expect(sectionBefore('encryption')).toBe('security');
    // They were Preferences' for 0.5.0 to 0.8.2; they are sections of their own.
    expect(sectionBefore('device')).toBe('device');
    expect(sectionBefore('notifications')).toBe('notifications');
    expect(sectionBefore('data')).toBe('data');
  });

  it('to Profile for anything else', () => {
    for (const section of [undefined, '', 'nonsense', 'Sign-In', '__proto__', 'toString'])
      expect(sectionBefore(section), String(section)).toBe('profile');
  });
});

describe('a search parameter', () => {
  it('takes the first value of a parameter, and nothing from a list', () => {
    expect(one('a')).toBe('a');
    expect(one(['a', 'b'])).toBeUndefined();
    expect(one(undefined)).toBeUndefined();
  });
});
