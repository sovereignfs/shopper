import { describe, expect, it } from 'vitest';
import { Titles, titleOf } from './title';

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

describe('who sets the title', () => {
  it('is the screen opened last, and the one under it again when it goes', () => {
    const titles = new Titles();
    expect(titles.current()).toBeUndefined();
    const list = titles.add('Weekly shop · Shopper');
    expect(titles.current()).toBe('Weekly shop · Shopper');
    const settings = titles.add('Profile · Settings · Shopper');
    expect(titles.current()).toBe('Profile · Settings · Shopper');
    titles.remove(settings);
    expect(titles.current()).toBe('Weekly shop · Shopper');
    titles.remove(list);
    expect(titles.current()).toBeUndefined();
  });

  it('keeps a screen under another under it when the one under changes its title', () => {
    const titles = new Titles();
    const list = titles.add('Shopper');
    titles.add('Data · Settings · Shopper');
    list.title = 'Weekly shop · Shopper';
    expect(titles.current()).toBe('Data · Settings · Shopper');
  });

  it('forgets a screen that is removed twice, or that was never there', () => {
    const titles = new Titles();
    const one = titles.add('One');
    titles.remove(one);
    titles.remove(one);
    titles.remove({ title: 'Never added', over: false });
    expect(titles.current()).toBeUndefined();
  });

  it('is a dialog over the page under it, whichever of them mounted first', () => {
    const titles = new Titles();
    // Loaded directly, Settings mounts before the list under it has opened its name.
    const settings = titles.add('Profile · Settings · Shopper', true);
    const list = titles.add('Weekly shop · Shopper');
    expect(titles.current()).toBe('Profile · Settings · Shopper');
    list.title = 'Groceries · Shopper';
    expect(titles.current()).toBe('Profile · Settings · Shopper');
    titles.remove(settings);
    expect(titles.current()).toBe('Groceries · Shopper');
  });

  it('is the dialog opened last, among dialogs', () => {
    const titles = new Titles();
    titles.add('Settings · Weekly shop · Shopper', true);
    titles.add('Data · Settings · Shopper', true);
    expect(titles.current()).toBe('Data · Settings · Shopper');
  });
});
