import { describe, expect, it } from 'vitest';
import { site } from './site';

// A runner that finds no tests passes silently, so there is always one that cannot: the app names itself.
describe('the test runner', () => {
  it('runs, and the app is called Shopper', () => {
    expect(site.name).toBe('Shopper');
  });
});
