/**
 * **A list's keys waiting to be kept** (RFC 0004, task 21.4): joining by a link gives the list's keyring once, and the person's own copy, wrapped under
 * their own app key, is then kept on the server (`list.key.mine`). If that call does not get through, the copy waits here, in the browser's storage,
 * until it does: the device uses it meanwhile, so that nothing the person writes on the list waits for it. It is wrapped, so it is nothing to anyone
 * without the person's app key; it goes once the server has it.
 */
export interface PendingListKey {
  readonly household: string;
  readonly list: string;
  readonly person: string;
  readonly record: string;
}

const KEY = 'shopper.list-keys.pending';

type Store = Pick<Storage, 'getItem' | 'setItem'> | undefined;

export function readPending(storage: Store): PendingListKey[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter(
          (each): each is PendingListKey =>
            typeof each === 'object' &&
            each !== null &&
            ['household', 'list', 'person', 'record'].every(
              (field) => typeof (each as Record<string, unknown>)[field] === 'string',
            ),
        )
      : [];
  } catch {
    return [];
  }
}

function write(storage: Store, entries: readonly PendingListKey[]): void {
  try {
    storage?.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage that is full or blocked: the copy is tried again from the link only if the person opens it again.
  }
}

export function addPending(storage: Store, entry: PendingListKey): void {
  write(storage, [...readPending(storage).filter((each) => each.list !== entry.list), entry]);
}

export function dropPending(storage: Store, list: string): void {
  write(
    storage,
    readPending(storage).filter((each) => each.list !== list),
  );
}

/** Sends each waiting copy (`keep`), and forgets the ones the server took. */
export async function keepPending(
  storage: Store,
  keep: (entry: PendingListKey) => Promise<boolean>,
): Promise<void> {
  for (const entry of readPending(storage)) if (await keep(entry)) dropPending(storage, entry.list);
}
