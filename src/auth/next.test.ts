import { describe, expect, it } from 'vitest';
import { nextQuery, safeNext } from './next';

const TOKEN = 'A'.repeat(43);

describe('where to go after signing in', () => {
  it('follows an invitation’s page and nothing else', () => {
    expect(safeNext(`/invite/${TOKEN}`)).toBe(`/invite/${TOKEN}`);
    for (const bad of [
      undefined,
      null,
      '',
      '/',
      '//evil.example',
      'https://evil.example/invite/' + TOKEN,
      `/invite/${TOKEN}/extra`,
      `/invite/${TOKEN}?x=1`,
      '/invite/short',
      '/settings',
      ['/invite/' + TOKEN],
    ])
      expect(safeNext(bad as string), String(bad)).toBeNull();
  });

  it('carries it to the other page as a query', () => {
    expect(nextQuery(`/invite/${TOKEN}`)).toBe(`?next=%2Finvite%2F${TOKEN}`);
    expect(nextQuery(null)).toBe('');
  });
});
