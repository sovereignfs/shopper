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
      lists: lists.map((list) => ({ list, open: counts.get(list.id) ?? 0, synced: list.seq > 0 })),
      archived,
      nextPosition: after(last),
    });
  }
  return out;
}
