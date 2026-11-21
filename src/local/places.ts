import { after } from '../actions/position';
import type { LocalDatabase } from './db';
import type { HouseholdRecord, ListRow } from './rows';
import { householdsOf, listsOf, openCounts } from './store';

/**
 * **The places the sidebar shows** (DESIGN.md §16.2), read from the device: each household the person is in, their own first, with its lists in order, each
 * with how many items are open on it, and how many lists are archived (which are behind a toggle and not in the way). A list the server has not answered
 * for yet (`seq` 0) is marked as not synced. Pure of React, so it is tested with the device and nothing else.
 */
export interface Place {
  readonly household: HouseholdRecord;
  readonly lists: readonly {
    readonly list: ListRow;
    readonly open: number;
    readonly synced: boolean;
    /** Whose list it is, for a list someone shared (RFC 0004): its Admin's name, or `null` for the reader's own or before its people are known. */
    readonly by: string | null;
  }[];
  readonly archived: readonly ListRow[];
  /** The position a new list takes: after every list the household has, archived too, so that restoring one does not put two in one place. */
  readonly nextPosition: string;
}

export async function placesOf(db: LocalDatabase): Promise<Place[]> {
  const out: Place[] = [];
  for (const household of await householdsOf(db)) {
    const lists = await listsOf(db, household.id);
    const archived = await listsOf(db, household.id, { archived: true });
    const counts = await openCounts(db, household.id);
    const last =
      [...lists, ...archived]
        .map((list) => list.position)
        .sort()
        .at(-1) ?? null;
    out.push({
      household,
      lists: await Promise.all(
        lists.map(async (list) => ({
          list,
          open: counts.get(list.id) ?? 0,
          synced: list.seq > 0,
          by: household.own ? null : await adminOf(db, list.id),
        })),
      ),
      archived,
      nextPosition: after(last),
    });
  }
  return out;
}

/** The name of a list's Admin as the device holds it, if it is not the reader. */
async function adminOf(db: LocalDatabase, list: string): Promise<string | null> {
  const people = await db.getAllFromIndex('member', 'byList', list);
  return (
    people.find((person) => person.role === 'admin' && !person.self && person.leftAt === null)
      ?.name ?? null
  );
}
