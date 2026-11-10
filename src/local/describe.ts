import { after } from '../actions/position';
import type { Change, FieldValue, Mutation } from '../actions/format';
import type { ListRow } from './rows';

/**
 * **Saying what a mutation was, and re-making it** (DESIGN.md §12.5), pure. A refused change is shown in Couldn't sync as a person would say it ("Added Oat
 * milk"), with the reason; a tick that was refused says so in a toast; and a change that added something to a list can be **moved to another list**, which
 * is a new mutation made from the refused one.
 */
export type Kind = 'add' | 'tick' | 'untick' | 'delete' | 'clear' | 'archive' | 'list' | 'edit';

export interface Described {
  readonly kind: Kind;
  readonly what: string;
}

type Name = (table: string, id: string) => string | undefined;

const text = (value: FieldValue | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** What a mutation did, in a few words. `nameOf` finds the name of a row the mutation does not carry the name of (an edit of an existing item). */
export function describeMutation(mutation: Mutation, nameOf: Name): Described {
  const changes = mutation.changes;
  const named = (change: Change) => text(change.fields.name) ?? nameOf(change.table, change.id);
  const items = changes.filter((change) => change.table === 'item');
  const added = items.find((change) => change.create);
  if (added) return { kind: 'add', what: `Added ${named(added) ?? 'an item'}` };
  const madeList = changes.find((change) => change.table === 'list' && change.create);
  if (madeList) return { kind: 'list', what: `Made the list ${named(madeList) ?? ''}`.trim() };

  const cleared = items.filter(
    (change) => typeof change.fields.clearedAt === 'number' && !('boughtAt' in change.fields),
  );
  if (cleared.length > 0 && cleared.length === changes.length)
    return {
      kind: 'clear',
      what:
        cleared.length === 1
          ? `Cleared ${named(cleared[0] as Change) ?? 'an item'}`
          : `Cleared ${cleared.length} bought items`,
    };

  const only = changes[0] as Change;
  const name = named(only) ?? (only.table === 'list' ? 'a list' : 'an item');
  if (typeof only.fields.boughtAt === 'number') return { kind: 'tick', what: `Ticked ${name}` };
  if ('boughtAt' in only.fields && only.fields.boughtAt === null)
    return { kind: 'untick', what: `Unticked ${name}` };
  if (typeof only.fields.deletedAt === 'number') return { kind: 'delete', what: `Deleted ${name}` };
  if (typeof only.fields.archivedAt === 'number')
    return { kind: 'archive', what: `Archived ${name}` };
  return { kind: 'edit', what: `Changed ${name}` };
}

/** The change in a mutation that says which list an item is on, if it does: a new item, or one moved. */
const placing = (change: Change): boolean =>
  change.table === 'item' && (change.create === true || 'listId' in change.fields);

/** Whether a refused mutation can be moved to another list: it put something on a list. A tick or an edit of an item that is gone has nowhere to go. */
export const canMove = (mutation: Mutation): boolean => mutation.changes.some(placing);

/**
 * The mutation made from a refused one so that what was put on a list goes to `list` instead, **at the end of it** (after `last`, the position of its last
 * item), as a new mutation with a new id. `null` if it cannot: it put nothing on a list, or `list` is not of the household it was for (a move to another
 * household is for when households can be made, DESIGN.md §7).
 */
export function remake(
  mutation: Mutation,
  list: Pick<ListRow, 'id' | 'householdId'>,
  last: string | null,
  newId: () => string,
): Mutation | null {
  if (!canMove(mutation) || list.householdId !== mutation.householdId) return null;
  let end = last;
  const changes = mutation.changes.map((change): Change => {
    if (!placing(change)) return change;
    end = after(end);
    return { ...change, fields: { ...change.fields, listId: list.id, position: end } };
  });
  return { mutationId: newId(), householdId: mutation.householdId, changes };
}

/** What a toast says of a refused change: a tick is undone, and the sentence says why. */
export function refusalToast(
  described: Described,
  sentence: string,
): { title: string; message: string } {
  const title =
    described.kind === 'tick'
      ? `Couldn't tick that off`
      : described.kind === 'add'
        ? `Couldn't add that`
        : `Couldn't sync a change`;
  const kept = described.kind === 'tick' ? 'It was put back.' : 'It is kept in Settings.';
  return { title, message: `${sentence} ${kept}` };
}
