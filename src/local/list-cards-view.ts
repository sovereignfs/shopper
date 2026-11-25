import type { CardRow, ListCardRow } from '../actions/rows';
import type { LocalDatabase } from './db';

/**
 * **What the screens read of the cards linked to lists** (DESIGN.md §7.7, §11, RFC 0007, task 24.6), pure of React so that it is tested with the device. The device holds a link only when the account
 * is on both the list and the card (the server hands it to no one else, and a device forgets one whose list or card it no longer holds), and holds only the cards the account is on, so **what
 * a list shows is already what the person may open**: a link whose card is not here is no button, and a person on the list who is not on the card has neither.
 */

const byPosition = (a: CardRow, b: CardRow) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1;

/** The cards linked to a list that the device can show: live links, whose card is here and not deleted, in the order the person keeps their cards. */
export async function cardsOfList(db: LocalDatabase, listId: string): Promise<CardRow[]> {
  const out: CardRow[] = [];
  for (const link of await db.getAllFromIndex('list_card', 'byList', listId)) {
    if (link.deletedAt !== null) continue;
    const card = await db.get('card', link.cardId);
    if (card && card.deletedAt === null) out.push(card);
  }
  return out.sort(byPosition);
}

export interface Linkable {
  readonly card: CardRow;
  /** The device's row for this list and this card, deleted or not (linking again restores it). */
  readonly link: ListCardRow | undefined;
  readonly linked: boolean;
}

/**
 * The cards a list's Admin may link to it: **those of the list's own group that the account is on** (a link names a list and a card of the same group, and a card of another group is not one the
 * server will take), each with whether it is linked now.
 */
export async function linkableCardsOf(
  db: LocalDatabase,
  list: { id: string; householdId: string },
): Promise<Linkable[]> {
  const links = new Map<string, ListCardRow>();
  for (const link of await db.getAllFromIndex('list_card', 'byList', list.id))
    links.set(link.cardId, link);
  return (await db.getAllFromIndex('card', 'byHousehold', list.householdId))
    .filter((card) => card.deletedAt === null)
    .sort(byPosition)
    .map((card) => {
      const link = links.get(card.id);
      return { card, link, linked: link !== undefined && link.deletedAt === null };
    });
}
