import { type DBSchema, type IDBPDatabase, deleteDB, openDB } from 'idb';
import type { Mutation } from '../actions/format';
import type {
  CategoryRow,
  HouseholdRecord,
  ItemRow,
  ListRow,
  MemberRow,
  ProductRow,
  SyncedRow,
} from './rows';

/**
 * The browser's working copy (DESIGN.md §12.1): IndexedDB through `idb`, **one database per account**, named for it, so that a second account on the same
 * device sees nothing of the first and signing out can delete exactly one. The UI reads and writes only this; the server is something the sync loop talks to.
 *
 * - `household`, `list`, `item`, `product`, `category`, `member`
 *                  the rows as the device shows them: the server's, with this device's unanswered edits laid over (`store.ts`).
 * - `shadow`       for a row that has unanswered edits, the row as the server last had it, so that an edit can be taken back and a pull can be merged under
 *                  the edits. A row with no unanswered edit has none; one the device made and the server has not answered has `row: null`.
 * - `outbox`       the mutations not yet answered, in the order they were made, written in the same transaction as the rows they changed.
 * - `failed`       **Couldn't sync** (§12.5): a mutation the server refused, kept whole with the reason and a sentence, out of the outbox and off the screens, until
 *                  the person moves it to another list or discards it. Nothing a person typed is thrown away.
 * - `meta`         small facts: when the device last heard from the server, the operator's interval, whether storage is persistent.
 */
export interface OutboxEntry {
  /** The order, assigned by the store. */
  n?: number;
  mutation: Mutation;
  queuedAt: number;
}

/** A change the server refused (DESIGN.md §12.5): what it was, as a person would say it, and why it was not taken. */
export interface FailedEntry {
  /** The order, assigned by the store. */
  n?: number;
  mutation: Mutation;
  /** The server's reason, from a fixed list (`src/sync/refusal.ts`). */
  reason: string;
  /** Why, in a sentence a person can read: the server's, or this device's where it knows more (a household left, a list deleted). */
  sentence: string;
  /** What was being done: "Added Oat milk", "Ticked Milk". */
  what: string;
  failedAt: number;
}

export interface Shadow {
  table: string;
  id: string;
  row: SyncedRow | null;
}

export interface LocalSchema extends DBSchema {
  household: { key: string; value: HouseholdRecord };
  list: { key: string; value: ListRow; indexes: { byHousehold: string } };
  item: { key: string; value: ItemRow; indexes: { byList: string; byProduct: string } };
  product: { key: string; value: ProductRow; indexes: { byHousehold: string } };
  category: { key: string; value: CategoryRow; indexes: { byHousehold: string } };
  member: { key: [string, string]; value: MemberRow; indexes: { byHousehold: string } };
  shadow: { key: [string, string]; value: Shadow };
  outbox: { key: number; value: OutboxEntry };
  failed: { key: number; value: FailedEntry };
  meta: { key: string; value: unknown };
}

export type LocalDatabase = IDBPDatabase<LocalSchema>;

/** Every store a write may touch: a write is in all of them or in none. */
export const WRITE_STORES = [
  'household',
  'list',
  'item',
  'product',
  'category',
  'member',
  'shadow',
  'outbox',
  'failed',
  'meta',
] as const;

/** The version of the stores. A change to them adds a step to `upgrade` and raises this; it never edits an earlier step. */
export const LOCAL_VERSION = 2;

/** The database for an account (DESIGN.md §12.1). */
export const localName = (accountId: string): string => `shopper-${accountId}`;

export async function openLocal(
  accountId: string,
  name = localName(accountId),
): Promise<LocalDatabase> {
  return openDB<LocalSchema>(name, LOCAL_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('household', { keyPath: 'id' });
        db.createObjectStore('list', { keyPath: 'id' }).createIndex('byHousehold', 'householdId');
        const item = db.createObjectStore('item', { keyPath: 'id' });
        item.createIndex('byList', 'listId');
        item.createIndex('byProduct', 'productId');
        db.createObjectStore('product', { keyPath: 'id' }).createIndex(
          'byHousehold',
          'householdId',
        );
        db.createObjectStore('category', { keyPath: 'id' }).createIndex(
          'byHousehold',
          'householdId',
        );
        db.createObjectStore('member', { keyPath: ['householdId', 'personId'] }).createIndex(
          'byHousehold',
          'householdId',
        );
        db.createObjectStore('shadow', { keyPath: ['table', 'id'] });
        db.createObjectStore('outbox', { keyPath: 'n', autoIncrement: true });
        db.createObjectStore('meta');
      }
      // Version 2 (task 6.3): Couldn't sync. A database from version 1 keeps everything it has.
      if (oldVersion < 2) db.createObjectStore('failed', { keyPath: 'n', autoIncrement: true });
    },
    // Another tab is deleting this account's database (it signed out, or the account was deleted): this connection is in the way, so it lets go. Without it
    // the deletion waits for every tab to close, and a person who signed out would still have their lists on the device.
    blocking(_currentVersion, _blockedVersion, event) {
      (event.target as IDBDatabase).close();
    },
  });
}

/** Deletes an account's database from this device: what signing out does (DESIGN.md §12.10). Resolves when it is gone. */
export async function deleteLocal(accountId: string, name = localName(accountId)): Promise<void> {
  await deleteDB(name);
}
