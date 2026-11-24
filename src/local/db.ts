import { type DBSchema, type IDBPDatabase, deleteDB, openDB } from 'idb';
import type { Mutation } from '../actions/format';
import type {
  CategoryRow,
  HouseholdRecord,
  InventoryRow,
  ItemRow,
  ListCategoryRow,
  ListRow,
  MemberRow,
  ProductRow,
  SyncedRow,
} from './rows';

/**
 * The browser's working copy (DESIGN.md §12.1): IndexedDB through `idb`, **one database per account**, named for it, so that a second account on the same
 * device sees nothing of the first and signing out can delete exactly one. The UI reads and writes only this; the server is something the sync loop talks to.
 *
 * - `household`, `list`, `item`, `product`, `category`, `list_category`, `inventory_item`, `member`
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
  /** The copies of people's categories on the lists the account is on (§8.3): the lists', their names opened under the list's keys. */
  list_category: {
    key: string;
    value: ListCategoryRow;
    indexes: { byHousehold: string; byList: string };
  };
  /** The account's own Inventory (§8.8): only a device of that account has any. */
  inventory_item: { key: string; value: InventoryRow; indexes: { byHousehold: string } };
  member: {
    key: [string, string];
    value: MemberRow;
    indexes: { byHousehold: string; byList: string };
  };
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
  'list_category',
  'inventory_item',
  'member',
  'shadow',
  'outbox',
  'failed',
  'meta',
] as const;

/** The version of the stores. A change to them adds a step to `upgrade` and raises this; it never edits an earlier step. */
export const LOCAL_VERSION = 5;

/** The database for an account (DESIGN.md §12.1). */
export const localName = (accountId: string): string => `shopper-${accountId}`;

export async function openLocal(
  accountId: string,
  name = localName(accountId),
): Promise<LocalDatabase> {
  return openDB<LocalSchema>(name, LOCAL_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
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
        db.createObjectStore('shadow', { keyPath: ['table', 'id'] });
        db.createObjectStore('outbox', { keyPath: 'n', autoIncrement: true });
        db.createObjectStore('meta');
      }
      // Version 2 (task 6.3): Couldn't sync. A database from version 1 keeps everything it has.
      if (oldVersion < 2) db.createObjectStore('failed', { keyPath: 'n', autoIncrement: true });
      // Version 3 (RFC 0004, task 21.2): people are on a list, not a household, so the store is keyed by list. It is made again empty, and every cursor
      // goes back to the start, so that the next pull brings the people of each list (and anything else) again.
      if (oldVersion >= 1 && oldVersion < 3) {
        db.deleteObjectStore('member');
        let household = await transaction.objectStore('household').openCursor();
        while (household) {
          await household.update({ ...household.value, cursor: 0 });
          household = await household.continue();
        }
      }
      if (oldVersion < 3) {
        const member = db.createObjectStore('member', { keyPath: ['listId', 'personId'] });
        member.createIndex('byHousehold', 'householdId');
        member.createIndex('byList', 'listId');
      }
      // Version 4 (RFC 0006, task 23.3): the account's own Inventory. Nothing is reset: no Inventory was ever written before, so no cursor has passed any of it.
      if (oldVersion < 4) {
        db.createObjectStore('inventory_item', { keyPath: 'id' }).createIndex(
          'byHousehold',
          'householdId',
        );
      }
      // Version 5 (DESIGN.md §8.3, task 23.3): the copies of people's categories on the lists the account is on. Nothing is reset: no copy was ever written before, so no cursor
      // has passed any of them.
      if (oldVersion < 5) {
        const copies = db.createObjectStore('list_category', { keyPath: 'id' });
        copies.createIndex('byHousehold', 'householdId');
        copies.createIndex('byList', 'listId');
      }
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
