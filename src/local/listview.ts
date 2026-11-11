import type { LocalDatabase } from './db';
import type { CategoryRow, HouseholdRecord, ItemRow, ListRow, MemberRow, ProductRow } from './rows';
import { categoriesOf, hasSynced, householdsOf, itemsOf, listsOf, productsOf } from './store';

/**
 * **What a list screen reads from the device** (DESIGN.md §16.5): the list, its household, its items (open and bought, not cleared and not deleted), the
 * household's categories in aisle order and products (for what is often bought), the names of the people who added and ticked (everyone who has ever been in
 * the household, since a person who left still added what they added), who the reader is, and whether the household has more than one person in it (so
 * that "added by" is said). Pure of React, so it is tested with the device and nothing else.
 */
export type ListData =
  | { readonly found: false; readonly synced: boolean }
  | {
      readonly found: true;
      readonly list: ListRow;
      /** The household's lists that are not archived, for moving an item between them (DESIGN.md §9.4). */
      readonly lists: ListRow[];
      readonly household: HouseholdRecord;
      readonly items: ItemRow[];
      readonly categories: CategoryRow[];
      readonly products: ProductRow[];
      readonly names: Readonly<Record<string, string>>;
      /** The people in the household now, in the order they joined: what the sharing dialog lists. The address is there only where the reader may see it. */
      readonly members: MemberRow[];
      /** The reader's person id in this household, or `null` before the device has the household's members. */
      readonly me: string | null;
      readonly shared: boolean;
      /** Whether to say who added and who ticked: the household has more than one person in it, or someone who has left is still named on what they did. */
      readonly showPeople: boolean;
    };

export async function listViewOf(db: LocalDatabase, id: string): Promise<ListData> {
  const list = await db.get('list', id);
  const household = list ? await db.get('household', list.householdId) : undefined;
  if (!list || list.deletedAt !== null || !household)
    return { found: false, synced: await hasSynced(db) };
  const members = await db.getAllFromIndex('member', 'byHousehold', household.id);
  return {
    found: true,
    list,
    lists: await listsOf(db, household.id),
    household,
    items: await itemsOf(db, id),
    categories: await categoriesOf(db, household.id),
    products: await productsOf(db, household.id),
    // Someone who left is still named on what they added and ticked, and says so (DESIGN.md §7.5): "Sam (left)".
    names: Object.fromEntries(
      members.map((member) => [
        member.personId,
        member.leftAt === null ? member.name : `${member.name} (left)`,
      ]),
    ),
    members: members
      .filter((member) => member.leftAt === null)
      .sort((a, b) => a.joinedAt - b.joinedAt || (a.personId < b.personId ? -1 : 1)),
    me: members.find((member) => member.self)?.personId ?? null,
    shared: members.filter((member) => member.leftAt === null).length > 1,
    showPeople:
      members.filter((member) => member.leftAt === null).length > 1 ||
      members.some((member) => member.leftAt !== null),
  };
}

/** Records the list a person is on, so that the front address opens it next time (DESIGN.md §16.4). */
export const rememberList = (db: LocalDatabase, id: string): Promise<unknown> =>
  db.put('meta', id, 'lastList');

/**
 * **The list the front address opens** (DESIGN.md §16.4): the last one the person used, if it is still there and not archived, else the first list of their
 * own household, else the first of any, else none. `undefined` until the device has households at all.
 */
export async function landingListOf(db: LocalDatabase): Promise<string | null | undefined> {
  const households = await householdsOf(db);
  if (households.length === 0) return undefined;
  const last = await db.get('meta', 'lastList');
  if (typeof last === 'string') {
    const list = await db.get('list', last);
    if (
      list &&
      list.deletedAt === null &&
      list.archivedAt === null &&
      households.some((h) => h.id === list.householdId)
    )
      return list.id;
  }
  for (const household of households) {
    const first = (await listsOf(db, household.id))[0];
    if (first) return first.id;
  }
  return null;
}

/**
 * **Where someone who has just joined a household lands** (DESIGN.md §16.4): that household's first list, once the device has pulled it. `undefined` until
 * it has the household and a list of it, so that the front address shows what it otherwise would in the meantime.
 */
export async function joinedLandingOf(
  db: LocalDatabase,
  household: string,
): Promise<string | undefined> {
  if (!(await householdsOf(db)).some((each) => each.id === household)) return undefined;
  return (await listsOf(db, household))[0]?.id;
}
