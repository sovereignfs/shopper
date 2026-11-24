import { describe, expect, it } from 'vitest';
import { pageKind } from './page-kind';

describe('the kind of page', () => {
  it('is home for the front address alone, and a page for everything else', () => {
    expect(pageKind('/')).toBe('home');
    expect(pageKind('')).toBe('home');
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
