import type { LocalDatabase } from './db';
import { landingListOf } from './listview';
import { type Place, placesOf } from './places';
import type { ItemRow, ListRow, ProductRow } from './rows';
import { itemsOf, productsOf } from './store';

/**
 * **What Home shows** (RFC 0006, DESIGN.md §16.4), computed on the device from the rows it holds and stored nowhere: _Continue_ (the list used last), a tile for
 * every list (the person's own, then those shared with them, archived ones behind a toggle), and what can be said at a glance. Pure of React, so it is tested with
 * the device and nothing else. What waits for notices, trips and the pantry (what happened, spending, running low) is not here.
 */
export interface HomeTile {
  readonly list: ListRow;
  /** How many items are open on it; 0 for an archived list, which is not counted. */
  readonly open: number;
  readonly synced: boolean;
  /** Whose list it is, for a list someone shared: its Admin's name. */
  readonly by: string | null;
  /** Everyone on the list now, in the order they joined, when more than one is; otherwise none, since a list of one has no one else to show. */
  readonly people: readonly string[];
}

export interface Glance {
  /** Open items across the lists that are not archived. */
  readonly open: number;
  /** Items ticked in the last seven days, cleared or not. */
  readonly boughtThisWeek: number;
  /** The products bought most, with how many times, most first; none until something has been bought. */
  readonly mostBought: readonly { readonly name: string; readonly times: number }[];
}

export interface HomeData {
  /** The list the front address used to open: the last used, else the first. `null` when the person has no list. */
  readonly continue: HomeTile | null;
  /** Whether that list has never had an item on it: a new account's _Groceries_, which says what to do. */
  readonly fresh: boolean;
  readonly own: readonly HomeTile[];
  readonly shared: readonly HomeTile[];
  readonly archived: readonly HomeTile[];
  readonly glance: Glance;
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How many products _At a glance_ names. */
export const MOST_BOUGHT = 3;

/**
 * **The figures at a glance**, from the rows alone: open items counted by the caller, those ticked within a week of `now`, and the products bought most,
 * counted by name across the lists (the same thing bought for two lists is one), with the first spelling seen. Pure.
 */
export function glanceOf(input: {
  readonly open: number;
  readonly items: readonly Pick<ItemRow, 'boughtAt' | 'deletedAt'>[];
  readonly products: readonly Pick<ProductRow, 'name' | 'timesBought'>[];
  readonly now: number;
}): Glance {
  const since = input.now - WEEK_MS;
  const boughtThisWeek = input.items.filter(
    (item) => item.deletedAt === null && item.boughtAt !== null && item.boughtAt >= since,
  ).length;
  const byName = new Map<string, { name: string; times: number }>();
  for (const product of input.products) {
    if (product.timesBought <= 0) continue;
    const key = product.name.trim().toLocaleLowerCase();
    const seen = byName.get(key);
    if (seen) seen.times += product.timesBought;
    else byName.set(key, { name: product.name.trim(), times: product.timesBought });
  }
  const mostBought = [...byName.values()]
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name))
    .slice(0, MOST_BOUGHT);
  return { open: input.open, boughtThisWeek, mostBought };
}

/** Everyone on a list now, in the order they joined, when it is more than the reader. */
async function peopleOf(db: LocalDatabase, list: string): Promise<string[]> {
  const people = (await db.getAllFromIndex('member', 'byList', list))
    .filter((person) => person.leftAt === null)
    .sort((a, b) => a.joinedAt - b.joinedAt || (a.personId < b.personId ? -1 : 1));
  return people.length > 1 ? people.map((person) => person.name) : [];
}

async function tileOf(db: LocalDatabase, entry: Place['lists'][number]): Promise<HomeTile> {
  return {
    list: entry.list,
    open: entry.open,
    synced: entry.synced,
    by: entry.by,
    people: await peopleOf(db, entry.list.id),
  };
}

/** Home, as the device holds it: `undefined` until it has any household at all (a first load), so that nothing is drawn before there is something to say. */
export async function homeOf(db: LocalDatabase, now: number): Promise<HomeData | undefined> {
  const landing = await landingListOf(db);
  if (landing === undefined) return undefined;
  const places = await placesOf(db);
  const own: HomeTile[] = [];
  const shared: HomeTile[] = [];
  const archived: HomeTile[] = [];
  for (const place of places) {
    for (const entry of place.lists) {
      const tile = await tileOf(db, entry);
      // The household that is the person's own holds their lists, shared by them or not; any other is a list someone shared with them.
      (place.household.own ? own : shared).push(tile);
    }
    for (const list of place.archived)
      archived.push({ list, open: 0, synced: list.seq > 0, by: null, people: [] });
  }
  const live = [...own, ...shared];
  const continued = live.find((tile) => tile.list.id === landing) ?? null;
  const fresh =
    continued !== null && (await itemsOf(db, continued.list.id, { cleared: true })).length === 0;
  const items: ItemRow[] = [];
  for (const tile of live) items.push(...(await itemsOf(db, tile.list.id, { cleared: true })));
  const products: ProductRow[] = [];
  for (const place of places) products.push(...(await productsOf(db, place.household.id)));
  return {
    continue: continued,
    fresh,
    own,
    shared,
    archived,
    glance: glanceOf({
      open: live.reduce((total, tile) => total + tile.open, 0),
      items,
      products,
      now,
    }),
  };
}
