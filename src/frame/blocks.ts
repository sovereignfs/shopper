import type { AppSidebarBlock, AppSidebarItem } from '@sovereignfs/ui';
import { listColorOf, listIconOf } from '../lists/appearance';
import type { Place } from '../local/places';

/**
 * **The sidebar's blocks** (RFC 0005, DESIGN.md §16.2), from the places the device holds: **Home**; then **My lists** (the person's own, each with its icon in its
 * colour and how many items are open, and _New list_) and **Shared with me** (the lists others shared, each with whose it is under its name); and, when the person has
 * asked for them, **Archived**. The same blocks are the phone's drawer. An entry is here only when its page is: Inventory and Loyalty cards join with 23.4 and 24.3.
 * No group is named (RFC 0004). Pure of React, so it is tested with the places and nothing else; the icon and the colour are held to what a list may have
 * (`listIconOf`, `listColorOf`), so that a value the device holds that this build does not know is drawn as the default.
 */
export interface BlocksInput {
  readonly places: readonly Place[];
  /** The page shown, which marks its row current. */
  readonly pathname: string;
  /** Whether the archived lists are listed (a toggle under the blocks). */
  readonly archived: boolean;
  /** _New list_, for the person's own lists: what it does, given where the list would go. Without it there is no such row. */
  readonly onNew?: (place: Place) => void;
}

/**
 * What _New list_'s action is given as an address. The design system's sidebar closes a phone's drawer when a row **with an address** is followed, and not for an
 * action that is only a button, so a dialog opened from the drawer would be over a drawer that stays; an action with an address that the frame draws as a button
 * (`SignedInFrame`'s `link`) closes it and still is one. A gap for `sovereign`: an action that opens something should close the drawer.
 */
export const NEW_LIST = '#new-list';

const HOME: AppSidebarItem = { id: 'home', label: 'Home', icon: 'house', href: '/' };

/** One list as a row: its icon, its colour, what is open, and, said under its name, whose it is and whether the server has it yet. */
function row(
  list: Place['lists'][number]['list'],
  pathname: string,
  extra: { open?: number; by?: string | null; synced?: boolean; archived?: boolean },
): AppSidebarItem {
  const notes = [extra.by, extra.synced === false ? 'Not synced yet' : null].filter(
    (note): note is string => note !== null && note !== undefined && note !== '',
  );
  return {
    id: list.id,
    label: extra.archived ? `${list.name} (archived)` : list.name,
    icon: listIconOf(list.icon),
    iconColor: listColorOf(list.color),
    href: `/l/${list.id}`,
    active: pathname === `/l/${list.id}`,
    ...(extra.open ? { count: extra.open } : {}),
    ...(notes.length > 0 ? { description: notes.join(' · ') } : {}),
  };
}

export function blocksOf({ places, pathname, archived, onNew }: BlocksInput): AppSidebarBlock[] {
  const own = places.find((place) => place.household.own);
  const others = places.filter((place) => !place.household.own);
  const shared = others.flatMap((place) =>
    place.lists.map(({ list, open, by, synced }) => row(list, pathname, { open, by, synced })),
  );
  const blocks: AppSidebarBlock[] = [
    { id: 'places', items: [{ ...HOME, active: pathname === '/' }] },
  ];
  if (own)
    blocks.push({
      id: 'mine',
      heading: 'My lists',
      items: own.lists.map(({ list, open, synced }) => row(list, pathname, { open, synced })),
      ...(onNew
        ? { action: { label: 'New list', href: NEW_LIST, onClick: () => onNew(own) } }
        : {}),
    });
  if (shared.length > 0) blocks.push({ id: 'shared', heading: 'Shared with me', items: shared });
  const away = places.flatMap((place) => place.archived);
  if (archived && away.length > 0)
    blocks.push({
      id: 'archived',
      heading: 'Archived',
      items: away.map((list) => row(list, pathname, { archived: true })),
    });
  return blocks;
}

/** How many lists are archived, across every place: what the toggle under the blocks says. */
export const archivedCount = (places: readonly Place[]): number =>
  places.reduce((total, place) => total + place.archived.length, 0);
