import { after } from '../actions/position';
import type { Change, FieldValue, Mutation } from '../actions/format';
import type { ListRow } from './rows';

/**
 * **Saying what a mutation was, and re-making it** (DESIGN.md §12.5), pure. A refused change is shown in Couldn't sync as a person would say it ("Added Oat
 * milk"), with the reason; a tick that was refused says so in a toast; and a change that added something to a list can be **moved to another list**, which
 * is a new mutation made from the refused one.
 */
export type Kind =
  | 'add'
  | 'tick'
  | 'untick'
  | 'delete'
  | 'clear'
  | 'archive'
  | 'list'
  | 'inventory'
  | 'card'
  | 'edit';

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
  // A card is named by its shop (§7.7), as everything else is by its name.
  const named = (change: Change) =>
    text(change.fields.name) ?? text(change.fields.shop) ?? nameOf(change.table, change.id);
  const items = changes.filter((change) => change.table === 'item');
  const added = items.find((change) => change.create);
  if (added) return { kind: 'add', what: `Added ${named(added) ?? 'an item'}` };
  // What a new name made in the person's Inventory (§8.8): refused for a limit, it is not an item that was put on a list.
  const filled = changes.find((change) => change.table === 'inventory_item' && change.create);
  if (filled)
    return { kind: 'inventory', what: `Added ${named(filled) ?? 'an item'} to Inventory` };
  // A category of the person's own, made in Inventory (§8.3): refused for the limit, it is not an item.
  const madeCategory = changes.find((change) => change.table === 'category' && change.create);
  if (madeCategory)
    return {
      kind: 'inventory',
      what: `Added the category ${named(madeCategory) ?? ''}`.trim(),
    };
  // A card made on a device (§7.7): refused for the limit, or for a group that has not moved, it is the card that is not kept.
  const madeCard = changes.find((change) => change.table === 'card' && change.create);
  if (madeCard) return { kind: 'card', what: `Added the card ${named(madeCard) ?? ''}`.trim() };
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
  if (only.table === 'category' || only.table === 'list_category') {
    const category = named(only) ?? 'a category';
    return typeof only.fields.deletedAt === 'number'
      ? { kind: 'inventory', what: `Deleted the category ${category}` }
      : { kind: 'inventory', what: `Changed the category ${category}` };
  }
  if (only.table === 'card') {
    const card = named(only) ?? 'a card';
    return typeof only.fields.deletedAt === 'number'
      ? { kind: 'card', what: `Put away the card ${card}` }
      : { kind: 'card', what: `Changed the card ${card}` };
  }
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
  /**
   * The ids of the copies of people's categories the device holds (§8.3): a copy is the list's it was made on, so an item or a product that names one cannot go to another list
   * with it, and a copy the refused change itself made was for the list it was refused on. They are left behind, and what named them is named nothing, which shows it under _Other_.
   */
  copies: ReadonlySet<string> = new Set(),
): Mutation | null {
  if (!canMove(mutation) || list.householdId !== mutation.householdId) return null;
  let end = last;
  const left = new Set(copies);
  for (const change of mutation.changes) if (change.table === 'list_category') left.add(change.id);
  const unnamed = (change: Change): Change =>
    typeof change.fields.categoryId === 'string' && left.has(change.fields.categoryId)
      ? { ...change, fields: { ...change.fields, categoryId: null } }
      : change;
  const changes = mutation.changes
    .filter((change) => change.table !== 'list_category')
    .map((made): Change => {
      const change = unnamed(made);
      // A product the add made joins the catalog of the list it goes to (RFC 0004, 21.3).
      if (change.table === 'product' && change.create)
        return { ...change, fields: { ...change.fields, listId: list.id } };
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
