import { CONTENT, type Mutation, type SyncedTable } from '../actions/format';
import { canonicalName } from '../catalog/canonical';
import { starterEntryByKey } from '../catalog/starter';
import type { Transport } from '../local/transport';
import { readPending } from './pending';
import type { HouseholdPull, SyncAnswer, SyncRequest } from '../sync/protocol';
import {
  type Keyring,
  deriveInventoryKeyring,
  deriveListKeyring,
  deviceInventoryNameKey,
  listNameKey,
  openField,
  sealField,
  unwrapKeyring,
  unwrapListKeyring,
} from './household';

/**
 * **Encryption at the sync** (RFC 0001, amendment 2; RFC 0004; DESIGN.md §13): the device's store keeps what it has opened, and this, between the sync
 * loop and the network, encrypts what goes to a group that has moved and opens what comes back from it, **each value under its own list's keys**. Its
 * rules:
 *
 * - **A group this device has seen encrypted is never sent plain text**, even from the offline shell after a restart: which groups have moved is kept on
 *   the device (`EncryptionMemory`).
 * - **A group whose keys this device cannot open yet is held:** none of its mutations are sent (they stay in the outbox, in order), and it is left out of
 *   the answer, so its cursor does not move past rows the device could not open. That is a locked app key, or a group not heard of since the page opened.
 * - **A change for a list whose keys this device will not get is refused here,** into Couldn't sync, rather than holding everything after it: a list the
 *   person was removed from while the change waited offline. The server would refuse it anyway.
 * - **A value is opened only for its list and the row it was encrypted for, or one folded into it** (the pull's aliases).
 * - **An Inventory item is encrypted for its group** (task 23.3), in the place of a list, under the group's Inventory keys, which are derived from the
 *   group's keyring alone (`EncryptionMemory.inventoryKeyring`) and never from a copy of a list's keys that a link gave: nobody else has them.
 */
export interface KeySide {
  /** The app key, while this browser holds it (`useKeys`); undefined while locked. */
  appKey(): CryptoKey | undefined;
}

/**
 * Where a row of the device's store is, **as the server has it** (its shadow, when it has changes not sent yet), or `undefined` for one the device does
 * not holds: the outbox's changes are then followed in order from there.
 */
export type ListOf = (table: SyncedTable, id: string) => Promise<string | undefined>;

/** An item's name and note as the device holds it: what goes again, encrypted for the new list, with a change of list that does not carry them. */
export type ContentOf = (id: string) => Promise<{ name: string; note: string | null } | undefined>;

/** The starter entry an Inventory item overrides, as the device holds it (never changed once made): what a change that names no starter entry needs for the name key. */
export type StarterOf = (id: string) => Promise<string | null | undefined>;

/** An Inventory override of a starter entry this version of Shopper does not have: its name key cannot be made here. */
export class UnknownEntry extends Error {}

/** What the device remembers of each group's encryption: its state, kept across restarts, and the keys, in memory only. */
export class EncryptionMemory {
  private readonly encrypted: Set<string>;
  private readonly rings = new Map<string, Keyring>();
  private readonly listRings = new Map<string, Keyring>();
  /** A group's Inventory keys, derived from its keyring and kept in memory only. */
  private readonly inventoryRings = new Map<string, Keyring>();
  private readonly records = new Map<string, { record: string; person: string }>();
  private readonly listRecords = new Map<string, { record: string; person: string }>();
  /** Groups a pull has said this session how to open: a list of one still without keys is one this device will not get keys for. */
  private readonly heard = new Set<string>();

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
    private readonly key: string,
  ) {
    this.encrypted = new Set(readList(storage, key));
    // Copies of lists' keys from a link that the server has not taken yet (`pending.ts`): used meanwhile.
    for (const each of readPending(storage))
      this.listRecords.set(each.list, { record: each.record, person: each.person });
  }

  isEncrypted(household: string): boolean {
    return this.encrypted.has(household);
  }

  hasHeard(household: string): boolean {
    return this.heard.has(household);
  }

  markEncrypted(household: string): void {
    if (this.encrypted.has(household)) return;
    this.encrypted.add(household);
    try {
      this.storage?.setItem(this.key, JSON.stringify([...this.encrypted]));
    } catch {
      // Storage that is full or blocked: this tab still knows, and the server holds plain text sent to a moved group anyway.
    }
  }

  /** What a pull said of a group's keys: the group's keyring (its own account's only) and the reader's copies of lists' keys. */
  hear(
    household: string,
    keys: {
      keyring: string | null;
      lists?: Readonly<Record<string, string>>;
      person: string | null;
    },
  ): void {
    this.heard.add(household);
    if (!keys.person) return;
    if (keys.keyring) this.remember(household, keys.keyring, keys.person);
    for (const [list, record] of Object.entries(keys.lists ?? {})) {
      if (this.listRecords.get(list)?.record === record) continue;
      this.listRecords.set(list, { record, person: keys.person });
      this.listRings.delete(list);
    }
  }

  remember(household: string, record: string, person: string): void {
    const known = this.records.get(household);
    if (known?.record === record) return;
    this.records.set(household, { record, person });
    this.rings.delete(household);
    this.inventoryRings.delete(household);
  }

  /** The group's keyring, opened with the app key the first time it is asked for: its own account's only. */
  async keyring(household: string, appKey: CryptoKey | undefined): Promise<Keyring | undefined> {
    const open = this.rings.get(household);
    if (open) return open;
    const known = this.records.get(household);
    if (!known || !appKey) return undefined;
    const ring = await unwrapKeyring(appKey, known.record, { person: known.person, household });
    if (ring) this.rings.set(household, ring);
    return ring;
  }

  /**
   * **A list's keyring** (RFC 0004): the reader's own copy of it if they have one, given by a link, else derived from the group's keyring, which only the
   * group's own account holds. `undefined` if neither is here (or the app key is locked).
   */
  async listKeyring(
    household: string,
    list: string,
    appKey: CryptoKey | undefined,
  ): Promise<Keyring | undefined> {
    const open = this.listRings.get(list);
    if (open) return open;
    const known = this.listRecords.get(list);
    let ring: Keyring | undefined;
    if (known && appKey)
      ring = await unwrapListKeyring(appKey, known.record, { person: known.person, list });
    if (!ring) {
      const group = await this.keyring(household, appKey);
      if (group) ring = await deriveListKeyring(group, list);
    }
    if (ring) this.listRings.set(list, ring);
    return ring;
  }

  /**
   * **A group's Inventory keyring** (§13.2), derived from the group's own keyring and from nothing else: a list's copy of keys, which a link gives, is never
   * a way to it. `undefined` while the group's keyring is not open (a locked app key).
   */
  async inventoryKeyring(
    household: string,
    appKey: CryptoKey | undefined,
  ): Promise<Keyring | undefined> {
    const open = this.inventoryRings.get(household);
    if (open) return open;
    const group = await this.keyring(household, appKey);
    if (!group) return undefined;
    const ring = await deriveInventoryKeyring(group, household);
    this.inventoryRings.set(household, ring);
    return ring;
  }

  /** Sets a group's keyring this device just made (the move), so that it is used at once. */
  setKeyring(household: string, ring: Keyring): void {
    this.rings.set(household, ring);
    this.inventoryRings.delete(household);
    this.heard.add(household);
  }

  /** Sets a list's keyring this device was just given by a link, so that it is used at once. */
  setListKeyring(list: string, ring: Keyring): void {
    this.listRings.set(list, ring);
  }
}

function readList(storage: Pick<Storage, 'getItem'> | undefined, key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((each): each is string => typeof each === 'string')
      : [];
  } catch {
    return [];
  }
}

export function encryptingTransport(
  inner: Transport,
  keys: KeySide,
  memory: EncryptionMemory,
  listOf: ListOf,
  /** Told of the groups that came back still sealed by the server, so that they can be moved (`Mover`). */
  onPlain?: (households: readonly string[]) => void,
  contentOf: ContentOf = async () => undefined,
  starterOf: StarterOf = async () => undefined,
): Transport {
  return async (request) => {
    const appKey = keys.appKey();
    const { outbox, held, refused } = await encryptOutbox(
      request,
      memory,
      appKey,
      listOf,
      contentOf,
      starterOf,
    );
    const result = await inner({ ...request, outbox });
    if (result.kind !== 'ok') return result;
    const plain = result.answer.households
      .filter((pull) => pull.encryption.state === 'plain')
      .map((pull) => pull.household);
    if (plain.length > 0) onPlain?.(plain);
    // The key as it is now: it may have opened while the request was on its way.
    const answer = await openAnswer(result.answer, memory, keys.appKey(), held);
    return {
      kind: 'ok',
      answer: refused.length > 0 ? { ...answer, refused: [...answer.refused, ...refused] } : answer,
    };
  };
}

const NO_KEYS =
  'That list is not shared with you any more, so this change could not be sent. It is kept here.';
const UNKNOWN_ENTRY =
  'This change names an entry of the starter catalog that this version of Shopper does not have, so it could not be sent. It is kept here.';

/**
 * The outbox as it goes: a moved group's mutations encrypted, a group whose keys cannot be opened yet held back with everything after it, and a change
 * for a list whose keys this device will not get refused here.
 */
async function encryptOutbox(
  request: SyncRequest,
  memory: EncryptionMemory,
  appKey: CryptoKey | undefined,
  listOf: ListOf,
  contentOf: ContentOf,
  starterOf: StarterOf,
): Promise<{
  outbox: unknown[];
  held: Set<string>;
  refused: { mutationId: string; reason: string; sentence: string }[];
}> {
  const held = new Set<string>();
  const outbox: unknown[] = [];
  const refused: { mutationId: string; reason: string; sentence: string }[] = [];
  // Where each item is as the outbox goes, in order, from where the server has it: an edit sent before a move is for the list it was on then.
  const moved = new Map<string, string>();
  const listAt: ListOf = async (table, id) =>
    (table === 'item' ? moved.get(id) : undefined) ?? listOf(table, id);
  for (const raw of request.outbox) {
    const mutation = raw as Mutation;
    const household = mutation.householdId;
    if (held.has(household)) continue;
    if (!memory.isEncrypted(household)) {
      outbox.push(mutation);
      continue;
    }
    if (!appKey || !memory.hasHeard(household)) {
      held.add(household);
      continue;
    }
    let encrypted: Mutation | undefined;
    try {
      encrypted = await encryptMutation(
        await withContent(mutation, listAt, contentOf),
        (list) => memory.listKeyring(household, list, appKey),
        listAt,
        (group) => memory.inventoryKeyring(group, appKey),
        starterOf,
      );
    } catch (error) {
      if (!(error instanceof UnknownEntry)) throw error;
      refused.push({
        mutationId: mutation.mutationId,
        reason: 'invalid',
        sentence: UNKNOWN_ENTRY,
      });
      continue;
    }
    if (!encrypted) {
      refused.push({ mutationId: mutation.mutationId, reason: 'not_found', sentence: NO_KEYS });
      continue;
    }
    outbox.push(encrypted);
    for (const change of mutation.changes)
      if (change.table === 'item' && typeof change.fields.listId === 'string')
        moved.set(change.id, change.fields.listId);
  }
  return { outbox, held, refused };
}

/**
 * **A change of list carries the item's name and note** (RFC 0004): the server keeps them for one list's keys only, so an item that changes list (an
 * Undo of a move, a refused change moved to another list) sends them again, from the device, to be encrypted for the new one.
 */
async function withContent(
  mutation: Mutation,
  listAt: ListOf,
  contentOf: ContentOf,
): Promise<Mutation> {
  const changes = [];
  for (const change of mutation.changes) {
    const to = change.fields.listId;
    if (
      change.table !== 'item' ||
      change.create === true ||
      typeof to !== 'string' ||
      ('name' in change.fields && 'note' in change.fields) ||
      (await listAt('item', change.id)) === to
    ) {
      changes.push(change);
      continue;
    }
    const content = await contentOf(change.id);
    changes.push(
      content
        ? {
            ...change,
            fields: {
              name: content.name,
              note: content.note,
              ...change.fields,
            },
          }
        : change,
    );
  }
  return { ...mutation, changes };
}

/** The list a change's values are encrypted for: a list's own id, else the list it is on after the change. */
async function listOfChange(
  change: Mutation['changes'][number],
  listOf: ListOf,
  mutation: Mutation,
): Promise<string | undefined> {
  if (change.table === 'list') return change.id;
  const sent = change.fields.listId;
  if (typeof sent === 'string') return sent;
  // A product made with an item, and not told its list, is the item's list's, as the server makes it (`apply.ts`).
  if (change.table === 'product' && change.create) {
    const item = mutation.changes.find(
      (other) =>
        other.table === 'item' &&
        other.fields.productId === change.id &&
        typeof other.fields.listId === 'string',
    );
    if (item) return String(item.fields.listId);
  }
  return listOf(change.table, change.id);
}

/**
 * One mutation, its content encrypted field by field for its list and row, and a product's name key made beside its name. `undefined` if a list it
 * touches has no keys here.
 */
export async function encryptMutation(
  mutation: Mutation,
  ringOf: (list: string) => Promise<Keyring | undefined>,
  listOf: ListOf,
  /** A group's Inventory keys, for a change to an Inventory item (§13.2): never a list's. */
  inventoryRingOf: (household: string) => Promise<Keyring | undefined> = async () => undefined,
  starterOf: StarterOf = async () => undefined,
): Promise<Mutation | undefined> {
  const changes = [];
  for (const change of mutation.changes) {
    if (change.table === 'inventory_item') {
      const sealed = await encryptInventory(
        change,
        mutation.householdId,
        inventoryRingOf,
        starterOf,
      );
      if (!sealed) return undefined;
      changes.push(sealed);
      continue;
    }
    const fields: Record<string, string | number | null> = { ...change.fields };
    const content = CONTENT[change.table].filter((field) => typeof fields[field] === 'string');
    const naming = change.table === 'product' && typeof change.fields.name === 'string';
    if (content.length > 0 || naming) {
      const list = await listOfChange(change, listOf, mutation);
      const ring = list ? await ringOf(list) : undefined;
      if (!list || !ring) return undefined;
      for (const field of content)
        fields[field] = await sealField(
          ring,
          { list, table: change.table, row: change.id, field },
          String(fields[field]),
        );
      if (naming)
        fields.nameKey = await listNameKey(ring, list, canonicalName(String(change.fields.name)));
    }
    changes.push({ ...change, fields });
  }
  return { ...mutation, changes };
}

/**
 * **An Inventory item's change, encrypted for its group** (§13.1, §13.3): each text field under the group's Inventory keys, bound to the group (in the place of
 * a list), the table, the row and the field; and its name key, made beside the name, or, for an override that keeps the starter's name (or goes back to it),
 * from the starter entry's. The server cannot make it in a group that has moved, so it takes one with every make and every change that says a name.
 * `undefined` if the group's keys are not open; `UnknownEntry` if the starter entry is not one this version has.
 */
async function encryptInventory(
  change: Mutation['changes'][number],
  household: string,
  inventoryRingOf: (household: string) => Promise<Keyring | undefined>,
  starterOf: StarterOf,
): Promise<Mutation['changes'][number] | undefined> {
  const fields: Record<string, string | number | null> = { ...change.fields };
  const content = CONTENT.inventory_item.filter((field) => typeof fields[field] === 'string');
  const naming = change.create === true || 'name' in change.fields;
  if (content.length === 0 && !naming) return change;
  const ring = await inventoryRingOf(household);
  if (!ring) return undefined;
  for (const field of content)
    fields[field] = await sealField(
      ring,
      { list: household, table: 'inventory_item', row: change.id, field },
      String(fields[field]),
    );
  if (naming) {
    const starter =
      typeof change.fields.starterKey === 'string'
        ? change.fields.starterKey
        : ((await starterOf(change.id)) ?? '');
    const name =
      typeof change.fields.name === 'string'
        ? change.fields.name
        : starterEntryByKey(starter)?.name;
    if (name === undefined) throw new UnknownEntry();
    fields.nameKey = await deviceInventoryNameKey(ring, household, canonicalName(name));
  }
  return { ...change, fields };
}

/** The answer as the device takes it: a moved group's rows opened, and a group it cannot open left out, so that its cursor stays. */
async function openAnswer(
  answer: SyncAnswer,
  memory: EncryptionMemory,
  appKey: CryptoKey | undefined,
  held: Set<string>,
): Promise<SyncAnswer> {
  const households: HouseholdPull[] = [];
  for (const pull of answer.households) {
    if (pull.encryption.state !== 'encrypted') {
      households.push(pull);
      continue;
    }
    memory.markEncrypted(pull.household);
    memory.hear(pull.household, pull.encryption);
    if (!appKey) continue;
    const opened = await openPull(
      (list) => memory.listKeyring(pull.household, list, appKey),
      pull,
      (group) => memory.inventoryKeyring(group, appKey),
    );
    // Held this round for want of its keys, which this answer brought: another round at once sends what was held, rather than at the next interval.
    if (opened) households.push(held.has(pull.household) ? { ...opened, more: true } : opened);
  }
  return { ...answer, households };
}

const TABLE_OF: Record<'lists' | 'items' | 'products' | 'inventory', SyncedTable> = {
  lists: 'list',
  items: 'item',
  products: 'product',
  inventory: 'inventory_item',
};

/** Every row of a moved group's pull, its content opened under its list's keys; `undefined` if a value does not open, so that none of the page is taken. */
export async function openPull(
  ringOf: (list: string) => Promise<Keyring | undefined>,
  pull: HouseholdPull,
  inventoryRingOf: (household: string) => Promise<Keyring | undefined> = async () => undefined,
): Promise<HouseholdPull | undefined> {
  const aliasesOf = (table: SyncedTable, row: string) =>
    pull.aliases.filter((each) => each.table === table && each.to === row).map((each) => each.from);
  const out: Record<'lists' | 'items' | 'products' | 'inventory', Record<string, unknown>[]> = {
    lists: [],
    items: [],
    products: [],
    inventory: [],
  };
  for (const key of ['lists', 'items', 'products', 'inventory'] as const) {
    const table = TABLE_OF[key];
    for (const row of pull[key] ?? []) {
      const { encrypted, ...rest } = row as Record<string, unknown> & {
        encrypted?: Record<string, string>;
      };
      const id = String(row.id);
      // A list's own id, an Inventory item's group (in the place of a list: its keys are the group's Inventory keys, §13.2), else the list it is on.
      const list =
        table === 'list'
          ? id
          : table === 'inventory_item'
            ? pull.household
            : typeof row.listId === 'string'
              ? row.listId
              : undefined;
      const fields: Record<string, unknown> = { ...rest };
      for (const field of CONTENT[table]) {
        const value = encrypted?.[field];
        if (value === undefined) {
          if (field !== 'name') fields[field] = null;
          continue;
        }
        const ring = !list
          ? undefined
          : table === 'inventory_item'
            ? await inventoryRingOf(list)
            : await ringOf(list);
        const text =
          ring && list
            ? await openField(ring, { list, table, row: id, field }, value, aliasesOf(table, id))
            : undefined;
        if (text === undefined) return undefined;
        fields[field] = text;
      }
      out[key].push(fields);
    }
  }
  // A folded item's second note, carried for a device to join (§12.4): shown joined with the first on every device alike.
  for (const alias of pull.aliases) {
    if (!alias.carried || alias.table !== 'item') continue;
    const item = out.items.find((each) => each.id === alias.to);
    const list = typeof item?.listId === 'string' ? item.listId : undefined;
    const ring = list ? await ringOf(list) : undefined;
    if (!item || !list || !ring) continue;
    const target = { list, table: 'item', row: alias.to, field: 'note' };
    const text = await openField(ring, target, alias.carried, [alias.from]);
    if (text === undefined) continue;
    const first = typeof item.note === 'string' && item.note !== '' ? item.note : null;
    if (first !== text) item.note = first === null ? text : `${first}\n${text}`;
  }
  return { ...pull, ...out };
}
