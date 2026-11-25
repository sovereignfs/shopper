/**
 * **A list's, or a card's, keys waiting to be kept** (RFC 0004, task 21.4; RFC 0007, task 24.5): joining by a link gives the keyring once, and the person's own copy, wrapped under their own app
 * key, is then kept on the server (`list.key.mine`, `card.key.mine`). If that call does not get through, the copy waits here, in the browser's storage, until it does: the device uses it meanwhile,
 * so that nothing the person writes on the list or the card waits for it. It is wrapped, so it is nothing to anyone without the person's app key; it goes once the server has it. A list's copies
 * and a card's are kept apart, each under its own key of the storage, and by the same code.
 */
export interface PendingListKey {
  readonly household: string;
  readonly list: string;
  readonly person: string;
  readonly record: string;
}

/** A card's copy waiting (RFC 0007). */
export interface PendingCardKey {
  readonly household: string;
  readonly card: string;
  readonly person: string;
  readonly record: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem'> | undefined;

/** One kind of waiting copy: where it is kept, which field names what it is a copy for, and what the three operations on it are. */
function waiting<T extends { readonly record: string }>(key: string, of: 'list' | 'card') {
  const fields = ['household', of, 'person', 'record'];
  const same = (a: T, b: T) =>
    (a as unknown as Record<string, string>)[of] === (b as unknown as Record<string, string>)[of];
  const read = (storage: Store): T[] => {
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(key) ?? '[]');
      return Array.isArray(parsed)
        ? parsed.filter(
            (each): each is T =>
              typeof each === 'object' &&
              each !== null &&
              fields.every((field) => typeof (each as Record<string, unknown>)[field] === 'string'),
          )
        : [];
    } catch {
      return [];
    }
  };
  const write = (storage: Store, entries: readonly T[]): void => {
    try {
      storage?.setItem(key, JSON.stringify(entries));
    } catch {
      // Storage that is full or blocked: the copy is tried again from the link only if the person opens it again.
    }
  };
  return {
    read,
    add: (storage: Store, entry: T) =>
      write(storage, [...read(storage).filter((each) => !same(each, entry)), entry]),
    drop: (storage: Store, entry: T) =>
      write(
        storage,
        read(storage).filter((each) => !same(each, entry)),
      ),
  };
}

const lists = waiting<PendingListKey>('shopper.list-keys.pending', 'list');
const cards = waiting<PendingCardKey>('shopper.card-keys.pending', 'card');

export const readPending = (storage: Store): PendingListKey[] => lists.read(storage);
export const addPending = (storage: Store, entry: PendingListKey): void =>
  lists.add(storage, entry);
export const dropPending = (storage: Store, list: string): void =>
  lists.drop(storage, { household: '', list, person: '', record: '' });

/** Sends each waiting copy (`keep`), and forgets the ones the server took. */
export async function keepPending(
  storage: Store,
  keep: (entry: PendingListKey) => Promise<boolean>,
): Promise<void> {
  for (const entry of readPending(storage)) if (await keep(entry)) dropPending(storage, entry.list);
}

export const readPendingCards = (storage: Store): PendingCardKey[] => cards.read(storage);
export const addPendingCard = (storage: Store, entry: PendingCardKey): void =>
  cards.add(storage, entry);
export const dropPendingCard = (storage: Store, card: string): void =>
  cards.drop(storage, { household: '', card, person: '', record: '' });

/** Sends each waiting card copy (`keep`), and forgets the ones the server took. */
export async function keepPendingCards(
  storage: Store,
  keep: (entry: PendingCardKey) => Promise<boolean>,
): Promise<void> {
  for (const entry of readPendingCards(storage))
    if (await keep(entry)) dropPendingCard(storage, entry.card);
}
