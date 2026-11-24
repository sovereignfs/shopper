import { describe, expect, it } from 'vitest';
import { list } from '../actions/test-support';
import { DEFAULT_LIST_COLOR, DEFAULT_LIST_ICON } from '../lists/appearance';
import type { Place } from '../local/places';
import { NEW_LIST, archivedCount, blocksOf } from './blocks';

const own: Place = {
  household: { id: 'h1', label: 'Mine', own: true, role: 'admin', seq: 1, cursor: 1 },
  lists: [
    {
      list: list({ id: 'l1', name: 'Groceries', icon: 'milk', color: '#dc2626' }),
      open: 12,
      synced: true,
      by: null,
    },
    { list: list({ id: 'l2', name: 'Hardware' }), open: 0, synced: false, by: null },
  ],
  archived: [list({ id: 'l3', name: 'Old', archivedAt: 1 })],
  nextPosition: 'a2',
};
const theirs: Place = {
  household: { id: 'h2', label: 'Theirs', own: false, role: 'member', seq: 1, cursor: 1 },
  lists: [{ list: list({ id: 'l4', name: 'Party' }), open: 3, synced: true, by: 'Thulana' }],
  archived: [list({ id: 'l5', name: 'Camping', archivedAt: 1 })],
  nextPosition: 'a1',
};

const ids = (blocks: ReturnType<typeof blocksOf>) => blocks.map((block) => block.id);

describe('the sidebar’s blocks', () => {
  it('are Home with Inventory, My lists and Shared with me, in that order, with no group named', () => {
    const blocks = blocksOf({ places: [own, theirs], pathname: '/', archived: false });
    expect(ids(blocks)).toEqual(['places', 'mine', 'shared']);
    expect(blocks[0]?.items.map((item) => [item.label, item.href])).toEqual([
      ['Home', '/'],
      ['Inventory', '/inventory'],
    ]);
    expect(blocks[1]?.heading).toBe('My lists');
    expect(blocks[2]?.heading).toBe('Shared with me');
    // What is read on the screen never says a group, or whose household it came from.
    const words = blocks.flatMap((block) => [
      block.heading ?? '',
      ...block.items.flatMap((item) => [item.label, item.description ?? '']),
    ]);
    expect(words.join(' ')).not.toMatch(/household|group|Theirs|Mine/i);
  });

  it('give each list its icon in its colour, its open count and its address, and mark the page shown', () => {
    const [, mine] = blocksOf({ places: [own], pathname: '/l/l1', archived: false });
    expect(mine?.items[0]).toEqual({
      id: 'l1',
      label: 'Groceries',
      icon: 'milk',
      iconColor: '#dc2626',
      href: '/l/l1',
      active: true,
      count: 12,
    });
    // Nothing open: no count. Not synced yet: said under its name. The defaults for what was never given, which is nothing written.
    expect(mine?.items[1]).toMatchObject({
      label: 'Hardware',
      icon: DEFAULT_LIST_ICON,
      iconColor: DEFAULT_LIST_COLOR,
      active: false,
      description: 'Not synced yet',
    });
    expect(mine?.items[1]).not.toHaveProperty('count');
  });

  it('say whose a shared list is, under its name', () => {
    const blocks = blocksOf({ places: [own, theirs], pathname: '/', archived: false });
    expect(blocks[2]?.items).toEqual([
      expect.objectContaining({ label: 'Party', description: 'Thulana', count: 3 }),
    ]);
  });

  it('draw a value the device holds that a list may not have as the default, and never put it in a style', () => {
    const odd = {
      ...own,
      lists: [
        {
          list: list({ id: 'x', name: 'Odd', icon: 'not-an-icon', color: 'url(javascript:x)' }),
          open: 0,
          synced: true,
          by: null,
        },
      ],
    };
    const [, mine] = blocksOf({ places: [odd], pathname: '/', archived: false });
    expect(mine?.items[0]).toMatchObject({
      icon: DEFAULT_LIST_ICON,
      iconColor: DEFAULT_LIST_COLOR,
    });
  });

  it('offer New list for the person’s own lists, and only when told what it does', () => {
    const asked: Place[] = [];
    const withIt = blocksOf({
      places: [own, theirs],
      pathname: '/',
      archived: false,
      onNew: (place) => asked.push(place),
    });
    expect(withIt[1]?.action).toMatchObject({ label: 'New list', href: NEW_LIST });
    withIt[1]?.action?.onClick?.();
    expect(asked).toEqual([own]);
    expect(withIt[2]).not.toHaveProperty('action');
    expect(blocksOf({ places: [own], pathname: '/', archived: false })[1]).not.toHaveProperty(
      'action',
    );
  });

  it('list the archived lists of every place only when asked, and count them', () => {
    expect(archivedCount([own, theirs])).toBe(2);
    expect(ids(blocksOf({ places: [own, theirs], pathname: '/', archived: false }))).not.toContain(
      'archived',
    );
    const blocks = blocksOf({ places: [own, theirs], pathname: '/l/l3', archived: true });
    expect(ids(blocks)).toContain('archived');
    expect(blocks.at(-1)?.items.map((item) => [item.label, item.active])).toEqual([
      ['Old (archived)', true],
      ['Camping (archived)', false],
    ]);
  });

  it('are Home and Inventory alone for a device that has no places yet', () => {
    expect(ids(blocksOf({ places: [], pathname: '/', archived: false }))).toEqual(['places']);
  });

  it('mark Inventory when it is the page shown, and Home only at the front address', () => {
    const [places] = blocksOf({ places: [own], pathname: '/inventory', archived: false });
    expect(places?.items.map((item) => [item.id, item.active])).toEqual([
      ['home', false],
      ['inventory', true],
    ]);
  });
});
