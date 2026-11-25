import { describe, expect, it } from 'vitest';
import { addressOf, pageKind } from './page-kind';

describe('the kind of page', () => {
  it('is home for the front address alone, and a page for everything else', () => {
    expect(pageKind('/')).toBe('home');
    expect(pageKind('')).toBe('home');
    // What a client reads at the front address, which the proxy rewrites to the page `/home`.
    expect(pageKind('/home')).toBe('home');
    for (const path of [
      '/l/abc',
      '/shop',
      '/settings',
      '/settings/security',
      '/inventory',
      '/cards',
      '/bogus',
    ])
      expect(pageKind(path), path).toBe('page');
  });
});

describe('the address a person is at', () => {
  it('is the front address for what the proxy rewrites it to, and every other address as it is', () => {
    expect(addressOf('/home')).toBe('/');
    expect(addressOf('/')).toBe('/');
    expect(addressOf('/l/abc')).toBe('/l/abc');
    expect(addressOf('/settings/security')).toBe('/settings/security');
    // Only the exact path: a page of its own whose name starts the same is not Home.
    expect(addressOf('/homework')).toBe('/homework');
  });
});
