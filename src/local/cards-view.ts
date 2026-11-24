import type { CardRow } from '../actions/rows';
import type { LocalDatabase } from './db';
import { cardMembersOf, cardsOf } from './store';

/**
 * **What the Cards screens read from the device** (DESIGN.md §16.14), pure of React so that it is tested with the device: each card with the reader's place on it, whether it is the reader's own
 * (made in their own group) or shared with them, and, for a shared one, whose it is. Only cards the device holds, which are the ones the account is on.
 */
export interface CardView {
  readonly card: CardRow;
  /** The reader's place on the card: its Admin changes and deletes it, a Member shows it. `null` before the device has the card's people. */
  readonly role: 'admin' | 'member' | null;
  /** Made in the reader's own group. */
  readonly own: boolean;
  /** The name of its Admin when it is someone else's, as the device holds it. */
  readonly by: string | null;
  /** How many people are on it now. */
  readonly people: number;
}

export interface CardsData {
  /** The reader's own group, where a new card is made; `undefined` before the device has it. */
  readonly household: string | undefined;
  /** Their own cards in the order they put them, then the cards shared with them. */
  readonly own: readonly CardView[];
  readonly shared: readonly CardView[];
  /** The position of the last of their own cards, which a new one goes after. */
  readonly last: string | null;
}

async function viewOf(
  db: LocalDatabase,
  card: CardRow,
  ownGroup: string | undefined,
): Promise<CardView> {
  const people = await cardMembersOf(db, card.id);
  const self = people.find((person) => person.self);
  const own = ownGroup !== undefined && card.householdId === ownGroup;
  return {
    card,
    role: self?.role ?? null,
    own,
    by: own
      ? null
      : (people.find((person) => person.role === 'admin' && !person.self)?.name ?? null),
    people: people.length,
  };
}

export async function cardsScreenOf(db: LocalDatabase): Promise<CardsData> {
  const households = await db.getAll('household');
  const ownGroup = households.find((each) => each.own)?.id;
  const views = await Promise.all((await cardsOf(db)).map((card) => viewOf(db, card, ownGroup)));
  const own = views.filter((view) => view.own);
  return {
    household: ownGroup,
    own,
    shared: views.filter((view) => !view.own),
    last: own.at(-1)?.card.position ?? null,
  };
}

/** One card as the device holds it, or `undefined` for one it does not have: a card another person owns reads the same as one that is not there (§5.2). */
export async function cardViewOf(db: LocalDatabase, id: string): Promise<CardView | undefined> {
  const card = (await db.get('card', id)) ?? undefined;
  if (!card || card.deletedAt !== null) return undefined;
  const ownGroup = (await db.getAll('household')).find((each) => each.own)?.id;
  return viewOf(db, card, ownGroup);
}
