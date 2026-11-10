import type { IDBPTransaction, StoreNames } from 'idb';
import { byPosition } from '../actions/position';
import {
  type Change,
  type FieldValue,
  type Mutation,
  SYNCED_TABLES,
  type SyncedTable,
} from '../actions/format';
import { canonicalName } from '../catalog/canonical';
import type { HouseholdPull, SyncAnswer } from '../sync/protocol';
import {
  type FailedEntry,
  type LocalDatabase,
  type LocalSchema,
  type OutboxEntry,
  WRITE_STORES,
} from './db';
import { type Kind, describeMutation } from './describe';
import {
  type CategoryRow,
  type HouseholdRecord,
  type ItemRow,
  type ListRow,
  type MemberRow,
  type ProductRow,
  type SyncedRow,
  applyChange,
  reversal,
} from './rows';

/**
 * Reading and writing the working copy (DESIGN.md §12.1, §12.3). Everything that changes more than one store does it in **one IndexedDB transaction**, so
 * that closing the tab, a crash or a full disk at any moment leaves the rows and the outbox agreeing: a write is in both or in neither. A transaction here
 * holds no `await` of anything but IndexedDB, which is what keeps it open.
 */
type Tx = IDBPTransaction<LocalSchema, StoreNames<LocalSchema>[], 'readwrite'>;
const keyOf = (table: string, id: string) => `${table}\u0000${id}`;
const isSynced = (table: string): table is SyncedTable =>
  (SYNCED_TABLES as readonly string[]).includes(table);

/**
 * Runs `work` in one read-write transaction over every store, and **aborts it if `work` throws**. IndexedDB commits a transaction when it has nothing more
 * to wait for, and an exception in our code does not make it wait or stop: without the abort, whatever `work` had written before it threw would be
 * committed, and a write would be in the rows and not in the outbox, which is exactly what one transaction is for.
 */
async function inTransaction<T>(db: LocalDatabase, work: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = db.transaction([...WRITE_STORES], 'readwrite');
  try {
    const result = await work(tx);
    await tx.done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted: nothing is left to undo.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export class UnknownHousehold extends Error {
  constructor() {
    super('this device does not hold that household');
    this.name = 'UnknownHousehold';
  }
}

/* ---- Writing ---- */

/**
 * Applies a mutation to the working copy and queues it, in one transaction. The rows a change touches are remembered as the server last had them
 * (`shadow`) the first time they are touched, so that the change can be taken back or merged under. **Returns the mutation that reverses it** (undo is a
 * new mutation, DESIGN.md §12.7), or `null` if there is nothing to reverse. Also does on the device what the server does besides: a tick or an untick moves
 * the product's count and last-bought time, and an item put on an archived list restores it, so that suggestions and lists are right at once offline.
 */
export async function commitMutation(
  db: LocalDatabase,
  mutation: Mutation,
  now: number,
  newId: () => string,
  /** A Couldn't sync entry this mutation is made from: it is taken out of there in the same transaction, so that it is in one place or the other, never both and never neither. */
  resolves?: number,
): Promise<Mutation | null> {
  return inTransaction(db, async (tx) => {
    if (!(await tx.objectStore('household').get(mutation.householdId)))
      throw new UnknownHousehold();
    if (resolves !== undefined) await tx.objectStore('failed').delete(resolves);
    const undo: Change[] = [];
    const items: { before: ItemRow | undefined; after: ItemRow }[] = [];

    for (const change of mutation.changes) {
      const table = change.table;
      const store = tx.objectStore(table) as unknown as {
        get(id: string): Promise<SyncedRow | undefined>;
        put(row: SyncedRow): Promise<unknown>;
      };
      const row = await store.get(change.id);
      if (!(await tx.objectStore('shadow').get([table, change.id])))
        await tx.objectStore('shadow').put({ table, id: change.id, row: row ?? null });
      const next = applyChange(table, row as never, change, mutation.householdId, now) as SyncedRow;
      await store.put(next);
      const back = reversal(
        table,
        row as unknown as Record<string, FieldValue> | undefined,
        next as unknown as Record<string, FieldValue>,
        change,
        now,
      );
      if (back) undo.push(back);
      if (table === 'item')
        items.push({ before: row as ItemRow | undefined, after: next as ItemRow });
    }

    for (const { before, after } of items) await afterItem(tx, before, after);
    await tx.objectStore('outbox').add({ mutation, queuedAt: now });
    const first = undo[0];
    return first ? { mutationId: newId(), householdId: mutation.householdId, changes: undo } : null;
  });
}

/** What an item's being written does to others as shown on the device: the product's tick count and an archived list (DESIGN.md §8.5, §12.4). */
async function afterItem(tx: Tx, before: ItemRow | undefined, after: ItemRow): Promise<void> {
  const was = before?.boughtAt ?? null;
  const is = after.boughtAt;
  if ((was === null) !== (is === null)) {
    const product = await tx.objectStore('product').get(after.productId);
    if (product)
      await tx
        .objectStore('product')
        .put(
          is !== null
            ? { ...product, timesBought: product.timesBought + 1, lastBoughtAt: is }
            : { ...product, timesBought: Math.max(0, product.timesBought - 1) },
        );
  }
  if (!before || before.listId !== after.listId) {
    const list = await tx.objectStore('list').get(after.listId);
    if (list && list.archivedAt !== null)
      await tx.objectStore('list').put({ ...list, archivedAt: null });
  }
}

/* ---- The outbox and what the device remembers ---- */

/** The mutations not yet answered, oldest first, at most `limit`. */
export async function readOutbox(
  db: LocalDatabase,
  limit: number,
): Promise<(OutboxEntry & { n: number })[]> {
  const out: (OutboxEntry & { n: number })[] = [];
  let cursor = await db.transaction('outbox').store.openCursor();
  while (cursor && out.length < limit) {
    out.push({ ...cursor.value, n: cursor.key });
    cursor = await cursor.continue();
  }
  return out;
}

export const outboxSize = (db: LocalDatabase): Promise<number> => db.count('outbox');

/** A household and the `seq` this device has pulled it to: what a sync asks for. */
export async function cursorsOf(db: LocalDatabase): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const household of await db.getAll('household')) out[household.id] = household.cursor;
  return out;
}

export async function readMeta<T>(
  db: LocalDatabase,
  key: string,
  fallback: T,
  is: (value: unknown) => value is T,
): Promise<T> {
  const value = await db.get('meta', key);
  return is(value) ? value : fallback;
}

const isNumber = (value: unknown): value is number => typeof value === 'number';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export const lastSyncedAt = async (db: LocalDatabase): Promise<number | undefined> =>
  (await readMeta<number | undefined>(db, 'lastSyncedAt', undefined, isNumber)) ?? undefined;

/** The operator's interval, as the server last said it, or `undefined` before the first answer. */
export const syncIntervalSeconds = async (db: LocalDatabase): Promise<number | undefined> =>
  (await readMeta<number | undefined>(db, 'intervalSeconds', undefined, isNumber)) ?? undefined;

/** Whether the browser granted persistent storage, for Settings; `undefined` if it was never asked. */
export const persistenceGranted = async (db: LocalDatabase): Promise<boolean | undefined> =>
  (await readMeta<boolean | undefined>(db, 'persisted', undefined, isBoolean)) ?? undefined;

export const rememberPersistence = (db: LocalDatabase, granted: boolean): Promise<unknown> =>
  db.put('meta', granted, 'persisted');

/* ---- Taking the server's answer ---- */

/** A refused mutation, kept whole so that what the person typed is not lost (`Couldn't sync`, task 6.3). */
export interface Refusal extends Omit<FailedEntry, 'n'> {
  /** What kind of change it was, for what a toast says of it. */
  readonly kind: Kind;
}

export interface Settled {
  readonly refused: Refusal[];
  /** The server has more past a cursor. */
  readonly more: boolean;
  /** How many of the sent mutations were answered either way. */
  readonly answered: number;
}

/**
 * Takes what the server answered, in one transaction, so that a device is never left having forgotten a mutation and not yet taken its result.
 *
 *  - Answered mutations leave the outbox; a refused one is **taken back** (its rows are shown again from what the server last had, with the rest laid over)
 *    and handed back whole.
 *  - **A pending edit stays on top of a pull:** a row with edits waiting is the server's row (kept as its shadow) with those edits laid over it again, so a
 *    pull never overwrites what the person has just done on this device.
 *  - Server rows replace local ones; tombstones delete; **aliases re-point** what the device holds (a product folded into another, an item folded into
 *    another), including what is waiting in the outbox; a household the account has left is deleted from the device, **its waiting changes kept**.
 */
export async function settle(
  db: LocalDatabase,
  sent: readonly (OutboxEntry & { n: number })[],
  answer: SyncAnswer,
  now: number,
): Promise<Settled> {
  return inTransaction(db, async (tx) => {
    const refused: Refusal[] = [];
    const undone = new Set<string>();
    const touched = new Set<string>();
    const pulled = new Set<string>();
    let answered = 0;

    const applied = new Set(answer.applied.map((each) => each.mutationId));
    const refusals = new Map(answer.refused.map((each) => [each.mutationId, each]));
    for (const entry of sent) {
      const id = entry.mutation.mutationId;
      const refusal = refusals.get(id);
      if (!applied.has(id) && !refusal) continue;
      answered += 1;
      await tx.objectStore('outbox').delete(entry.n);
      for (const change of entry.mutation.changes) {
        touched.add(keyOf(change.table, change.id));
        if (refusal) undone.add(keyOf(change.table, change.id));
      }
      if (refusal) {
        // Kept whole, out of the outbox and off the screens, with its reason: nothing a person typed is thrown away (DESIGN.md §12.5).
        const why = await explain(tx, entry.mutation, refusal, answer);
        const failed = {
          mutation: entry.mutation,
          reason: refusal.reason,
          sentence: why.sentence,
          what: why.what,
          failedAt: now,
        };
        await tx.objectStore('failed').add(failed);
        refused.push({ ...failed, kind: why.kind });
      }
    }
    for (const each of answer.applied)
      for (const fold of each.folds) await repoint(tx, fold.table, fold.from, fold.to, touched);

    let more = false;
    for (const household of answer.households) {
      more = more || household.more;
      await takeHousehold(tx, household, touched, pulled);
    }
    for (const id of answer.gone) await forgetHousehold(tx, id, touched);

    await reshow(tx, touched, undone, pulled);
    await tx.objectStore('meta').put(now, 'lastSyncedAt');
    await tx.objectStore('meta').put(answer.settings.intervalSeconds, 'intervalSeconds');
    return { refused, more, answered };
  });
}

type Raw = Record<string, unknown>;

/**
 * What a refused mutation was, and why, **before the pull is taken** (the rows it names are still as the device showed them). The server's refusal reads as
 * not found whatever the cause, so that it says nothing about what exists; **the device knows more about its own household**, and says so: a household the
 * account has left, a list that was deleted. Anything else is the server's sentence.
 */
async function explain(
  tx: Tx,
  mutation: Mutation,
  refusal: SyncAnswer['refused'][number],
  answer: SyncAnswer,
): Promise<{ kind: Kind; what: string; sentence: string }> {
  const names = new Map<string, string>();
  // The lists the change is about: the one it names, the one it puts an item on, and the one an item it changes is on (a tick names the item and not the list).
  const lists = new Set<string>();
  for (const change of mutation.changes) {
    const row = await (
      tx.objectStore(change.table) as unknown as {
        get(id: string): Promise<{ name?: string; listId?: string } | undefined>;
      }
    ).get(change.id);
    if (row?.name) names.set(keyOf(change.table, change.id), row.name);
    if (change.table === 'list') lists.add(change.id);
    if (typeof change.fields.listId === 'string') lists.add(change.fields.listId);
    else if (typeof row?.listId === 'string') lists.add(row.listId);
  }
  const { kind, what } = describeMutation(mutation, (table, id) => names.get(keyOf(table, id)));

  const household = await tx.objectStore('household').get(mutation.householdId);
  if (answer.gone.includes(mutation.householdId) || !household)
    return { kind, what, sentence: `You're no longer in ${household?.label ?? 'that household'}.` };

  if (refusal.reason === 'not_found') {
    const tombstoned = new Set(
      answer.households.flatMap((pull) =>
        pull.tombstones.filter((t) => t.table === 'list').map((t) => t.id),
      ),
    );
    for (const id of lists) {
      const list = await tx.objectStore('list').get(id);
      if (tombstoned.has(id) || !list)
        return { kind, what, sentence: `${list ? list.name : 'That list'} was deleted.` };
    }
  }
  return { kind, what, sentence: refusal.sentence };
}

async function takeHousehold(
  tx: Tx,
  pull: HouseholdPull,
  touched: Set<string>,
  pulled: Set<string>,
): Promise<void> {
  const had = await tx.objectStore('household').get(pull.household);
  await tx.objectStore('household').put({
    id: pull.household,
    label: pull.view.label,
    own: pull.view.own,
    role: pull.view.role,
    seq: pull.view.seq,
    cursor: Math.max(had?.cursor ?? 0, pull.cursor),
  });

  const incoming: [SyncedTable, readonly Raw[]][] = [
    ['list', pull.lists],
    ['item', pull.items],
    ['product', pull.products],
  ];
  for (const [table, rows] of incoming) {
    for (const raw of rows) {
      const row = raw as unknown as SyncedRow;
      const shadow = await tx.objectStore('shadow').get([table, row.id]);
      if (shadow) {
        await tx.objectStore('shadow').put({ ...shadow, row });
        touched.add(keyOf(table, row.id));
      } else {
        await (tx.objectStore(table) as unknown as { put(row: SyncedRow): Promise<unknown> }).put(
          row,
        );
      }
      pulled.add(keyOf(table, row.id));
    }
  }
  for (const raw of pull.categories)
    await tx.objectStore('category').put(raw as unknown as CategoryRow);
  for (const raw of pull.members)
    await tx
      .objectStore('member')
      .put({ ...(raw as unknown as MemberRow), householdId: pull.household });

  for (const gone of pull.tombstones) {
    if (isSynced(gone.table) || gone.table === 'category') {
      await (tx.objectStore(gone.table) as unknown as { delete(id: string): Promise<void> }).delete(
        gone.id,
      );
      await tx.objectStore('shadow').delete([gone.table, gone.id]);
      touched.delete(keyOf(gone.table, gone.id));
    }
    // A list deleted for good took its items with it, and left a tombstone for the list alone.
    if (gone.table === 'list') {
      for (const item of await tx.objectStore('item').index('byList').getAll(gone.id)) {
        await tx.objectStore('item').delete(item.id);
        await tx.objectStore('shadow').delete(['item', item.id]);
        touched.delete(keyOf('item', item.id));
      }
    }
  }
  for (const alias of pull.aliases) await repoint(tx, alias.table, alias.from, alias.to, touched);
}

/**
 * **A row made twice that became one** (DESIGN.md §12.4): what the device holds under `from` is now `to`. The row is dropped, what pointed at it is
 * re-pointed (items to the product), and **what is waiting in the outbox is re-pointed too**, so that a later change to the folded row goes to the one
 * that stands. Safe to do twice.
 */
async function repoint(
  tx: Tx,
  table: string,
  from: string,
  to: string,
  touched: Set<string>,
): Promise<void> {
  if (table !== 'product' && table !== 'item') return;
  await tx.objectStore(table).delete(from);
  await tx.objectStore('shadow').delete([table, from]);
  touched.delete(keyOf(table, from));
  touched.add(keyOf(table, to));

  if (table === 'product') {
    for (const item of await tx.objectStore('item').index('byProduct').getAll(from))
      await tx.objectStore('item').put({ ...item, productId: to });
    let shadow = await tx.objectStore('shadow').openCursor();
    while (shadow) {
      const row = shadow.value.row as ItemRow | null;
      if (shadow.value.table === 'item' && row && row.productId === from)
        await shadow.update({ ...shadow.value, row: { ...row, productId: to } });
      shadow = await shadow.continue();
    }
  }

  let rewritten = false;
  let cursor = await tx.objectStore('outbox').openCursor();
  while (cursor) {
    let changed = false;
    const changes = cursor.value.mutation.changes.map((change) => {
      let next = change;
      if (change.table === table && change.id === from) {
        next = { ...next, id: to };
        changed = true;
      }
      if (table === 'product' && change.table === 'item' && change.fields.productId === from) {
        next = { ...next, fields: { ...next.fields, productId: to } };
        changed = true;
      }
      return next;
    });
    if (changed) {
      await cursor.update({ ...cursor.value, mutation: { ...cursor.value.mutation, changes } });
      rewritten = true;
    }
    cursor = await cursor.continue();
  }
  // What now waits on the row that stands is protected from a pull like any other waiting change: the row as the device has it is its shadow.
  if (rewritten && !(await tx.objectStore('shadow').get([table, to])))
    await tx.objectStore('shadow').put({
      table,
      id: to,
      row: ((await tx.objectStore(table).get(to)) as SyncedRow | undefined) ?? null,
    });
}

/** Deletes a household the account has left from the device. **Its waiting changes stay** in the outbox: the server will refuse them, and what was typed goes to Couldn't sync. */
async function forgetHousehold(tx: Tx, id: string, touched: Set<string>): Promise<void> {
  const owned = [
    ['list', await tx.objectStore('list').index('byHousehold').getAll(id)],
    ['product', await tx.objectStore('product').index('byHousehold').getAll(id)],
    ['category', await tx.objectStore('category').index('byHousehold').getAll(id)],
  ] as const;
  for (const [table, rows] of owned) {
    for (const row of rows) {
      await (tx.objectStore(table) as unknown as { delete(id: string): Promise<void> }).delete(
        row.id,
      );
      await tx.objectStore('shadow').delete([table, row.id]);
      touched.delete(keyOf(table, row.id));
    }
  }
  // Items are indexed by list, not by household, so they are found by reading them.
  let shadow = await tx.objectStore('shadow').openCursor();
  while (shadow) {
    const row = shadow.value.row as { householdId?: string } | null;
    if (row?.householdId === id) await shadow.delete();
    shadow = await shadow.continue();
  }
  let item = await tx.objectStore('item').openCursor();
  while (item) {
    if (item.value.householdId === id) await item.delete();
    item = await item.continue();
  }
  for (const member of await tx.objectStore('member').index('byHousehold').getAll(id))
    await tx.objectStore('member').delete([member.householdId, member.personId]);
  await tx.objectStore('household').delete(id);
}

/**
 * Shows each of `keys` again from its shadow and the mutations still waiting. With nothing waiting the shadow goes: a row that was undone goes back to the
 * server's, one the server sent is the server's, and one the device made and the server refused is gone.
 */
async function reshow(
  tx: Tx,
  keys: ReadonlySet<string>,
  undone: ReadonlySet<string>,
  pulled: ReadonlySet<string>,
): Promise<void> {
  if (keys.size === 0) return;
  const held = new Set((await tx.objectStore('household').getAllKeys()) as string[]);
  const waiting = new Map<string, { change: Change; household: string; at: number }[]>();
  let cursor = await tx.objectStore('outbox').openCursor();
  while (cursor) {
    const { mutation, queuedAt } = cursor.value;
    // A household this device no longer holds has nothing to show: its waiting changes are for the server to refuse.
    if (held.has(mutation.householdId))
      for (const change of mutation.changes) {
        const key = keyOf(change.table, change.id);
        if (keys.has(key))
          waiting.set(key, [
            ...(waiting.get(key) ?? []),
            { change, household: mutation.householdId, at: queuedAt },
          ]);
      }
    cursor = await cursor.continue();
  }

  for (const key of keys) {
    const [table, id] = key.split('\u0000') as [string, string];
    if (!isSynced(table) || id === undefined) continue;
    const store = tx.objectStore(table) as unknown as {
      get(id: string): Promise<unknown>;
      put(row: SyncedRow): Promise<unknown>;
      delete(id: string): Promise<void>;
    };
    const shadow = await tx.objectStore('shadow').get([table, id]);
    const changes = waiting.get(key) ?? [];

    if (changes.length > 0) {
      let row: SyncedRow | undefined = shadow
        ? (shadow.row ?? undefined)
        : ((await store.get(id)) as SyncedRow | undefined);
      // A change that is not a create has nothing to say about a row the device does not have, and is the server's to refuse.
      if (!row && !changes.some(({ change }) => change.create)) continue;
      for (const { change, household, at } of changes)
        row = applyChange(table, row as never, change, household, at) as SyncedRow;
      if (row) await store.put(row);
      continue;
    }
    if (shadow) {
      if (undone.has(key) || pulled.has(key)) {
        if (shadow.row) await store.put(shadow.row);
        else await store.delete(id);
      }
      await tx.objectStore('shadow').delete([table, id]);
    }
  }
}

/** Whether a row has an edit waiting to be sent. */
export async function isPending(
  db: LocalDatabase,
  table: SyncedTable,
  id: string,
): Promise<boolean> {
  return (await db.get('shadow', [table, id])) !== undefined;
}

/* ---- Queries: they read the working copy and never the network (DESIGN.md §12.1), and a screen never sees a deleted row ---- */

const live = (row: { deletedAt: number | null }): boolean => row.deletedAt === null;

/** The households the account is in: its own first, then by name. */
export async function householdsOf(db: LocalDatabase): Promise<HouseholdRecord[]> {
  return (await db.getAll('household')).sort(
    (a, b) =>
      Number(b.own) - Number(a.own) || a.label.localeCompare(b.label) || (a.id < b.id ? -1 : 1),
  );
}

/** A household's lists in order; archived ones only when asked for (they are offered to restore). */
export async function listsOf(
  db: LocalDatabase,
  householdId: string,
  options: { archived?: boolean } = {},
): Promise<ListRow[]> {
  const rows = await db.getAllFromIndex('list', 'byHousehold', householdId);
  return rows
    .filter((row) => live(row) && (row.archivedAt !== null) === (options.archived === true))
    .sort(byPosition);
}

/** The items of a list as it shows them, in order: open and bought, not cleared and not deleted. Cleared ones only when asked for. */
export async function itemsOf(
  db: LocalDatabase,
  listId: string,
  options: { cleared?: boolean } = {},
): Promise<ItemRow[]> {
  const rows = await db.getAllFromIndex('item', 'byList', listId);
  return rows
    .filter((row) => live(row) && (options.cleared === true || row.clearedAt === null))
    .sort(byPosition);
}

/** How many open items each list of a household has, for the sidebar's count. */
export async function openCounts(
  db: LocalDatabase,
  householdId: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const list of await listsOf(db, householdId))
    counts.set(
      list.id,
      (await db.getAllFromIndex('item', 'byList', list.id)).filter(
        (item) => live(item) && item.boughtAt === null && item.clearedAt === null,
      ).length,
    );
  return counts;
}

export async function productsOf(db: LocalDatabase, householdId: string): Promise<ProductRow[]> {
  return (await db.getAllFromIndex('product', 'byHousehold', householdId)).filter(live);
}

/** The household's categories in aisle order. */
export async function categoriesOf(db: LocalDatabase, householdId: string): Promise<CategoryRow[]> {
  return (await db.getAllFromIndex('category', 'byHousehold', householdId))
    .filter(live)
    .sort(byPosition);
}

/** The household's members who are in it now. */
export async function membersOf(db: LocalDatabase, householdId: string): Promise<MemberRow[]> {
  return (await db.getAllFromIndex('member', 'byHousehold', householdId)).filter(
    (member) => member.leftAt === null,
  );
}

/** The household's product for a name, by the name it is known by (`canonicalName`), which is what the server folds on: so that adding "Oat Milk" finds "oat milk". */
export async function productNamed(
  db: LocalDatabase,
  householdId: string,
  name: string,
): Promise<ProductRow | undefined> {
  const key = canonicalName(name);
  return (await productsOf(db, householdId)).find((product) => canonicalName(product.name) === key);
}

/**
 * **The open item for a product on a list, if there is one** (DESIGN.md §9.3): what the _+1_ offer is made from. A second add of what is already open is
 * not a second row; the screen offers one more of it, or "add another anyway".
 */
export async function openItemFor(
  db: LocalDatabase,
  listId: string,
  productId: string,
): Promise<ItemRow | undefined> {
  return (await db.getAllFromIndex('item', 'byList', listId)).find(
    (item) =>
      item.productId === productId &&
      live(item) &&
      item.boughtAt === null &&
      item.clearedAt === null,
  );
}

export async function getRow<T extends SyncedTable>(
  db: LocalDatabase,
  table: T,
  id: string,
): Promise<(T extends 'list' ? ListRow : T extends 'item' ? ItemRow : ProductRow) | undefined> {
  return (await db.get(table, id)) as never;
}

/* ---- Couldn't sync ---- */

/** The changes the server refused, oldest first. */
export async function failedOf(db: LocalDatabase): Promise<(FailedEntry & { n: number })[]> {
  return (await db.getAll('failed')) as (FailedEntry & { n: number })[];
}

export const failedCount = (db: LocalDatabase): Promise<number> => db.count('failed');

/** Gives up a refused change for good. It is the only way one leaves Couldn't sync besides being moved. */
export const discardFailed = (db: LocalDatabase, n: number): Promise<void> =>
  db.delete('failed', n);
