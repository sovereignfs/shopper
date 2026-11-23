import { describe, expect, it } from 'vitest';
import { titleOf } from './title';

// RFC 0005's table, row by row, for the pages that exist: Home's, Inventory's and the cards' come with 23.2, 23.4 and 24.3.
describe("a page's title", () => {
  it('is the app alone until a name is opened', () => {
    expect(titleOf([])).toBe('Shopper');
  });

  it("says the list's name before the app's", () => {
    expect(titleOf(['Weekly shop'])).toBe('Weekly shop · Shopper');
  });

  it('says Shopping before the list in shop mode', () => {
    expect(titleOf(['Shopping Weekly shop'])).toBe('Shopping Weekly shop · Shopper');
  });

  it("puts a list's settings and Settings in the order the table does", () => {
    expect(titleOf(['Settings', 'Weekly shop'])).toBe('Settings · Weekly shop · Shopper');
    expect(titleOf(['Data', 'Settings'])).toBe('Data · Settings · Shopper');
  });

  it('leaves out a part that says nothing, so a name with only spaces is not a gap', () => {
    expect(titleOf(['  ', 'Weekly shop'])).toBe('Weekly shop · Shopper');
  });
});
