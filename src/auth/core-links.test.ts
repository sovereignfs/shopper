import { describe, expect, it } from 'vitest';
import { coreLink, pictureOf } from './core-links';

const CORE = 'https://sovereign.example.com';

describe('an address on core', () => {
  it('is a page of its own under core’s origin, whatever core’s address ends with', () => {
    expect(coreLink(CORE, '/security')).toBe('https://sovereign.example.com/security');
    expect(coreLink(`${CORE}/`, '/profile')).toBe('https://sovereign.example.com/profile');
    expect(coreLink('http://localhost:3000', '/keys')).toBe('http://localhost:3000/keys');
  });
});

describe('the picture core names', () => {
  it('is kept when it is an address on core’s own origin', () => {
    expect(pictureOf(`${CORE}/files/avatar.png`, CORE)).toBe(`${CORE}/files/avatar.png`);
    expect(pictureOf(`${CORE}/files/avatar.png?v=2`, CORE)).toBe(`${CORE}/files/avatar.png?v=2`);
  });

  it('is nothing for another site, another port or scheme, a user in the address, or anything that is not an address', () => {
    for (const picture of [
      'https://elsewhere.example.com/a.png',
      'https://sovereign.example.com.evil.test/a.png',
      'https://sovereign.example.com:8443/a.png',
      'http://sovereign.example.com/a.png',
      'https://user@sovereign.example.com/a.png',
      'https://user:pass@sovereign.example.com/a.png',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      '/files/avatar.png',
      'not an address',
      '',
      null,
      undefined,
    ])
      expect(pictureOf(picture, CORE), String(picture)).toBeUndefined();
  });
});
