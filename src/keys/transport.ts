import { CONTENT, type Mutation, type SyncedTable } from '../actions/format';
import { canonicalName } from '../catalog/canonical';
import type { Transport } from '../local/transport';
import type { HouseholdPull, SyncAnswer, SyncRequest } from '../sync/protocol';
import { type Keyring, householdNameKey, openField, sealField, unwrapKeyring } from './household';

/**
 * **Encryption at the sync** (RFC 0001, amendment 2; DESIGN.md §13): the device's store keeps what it has opened, and this, between the sync loop and the
 * network, encrypts what goes to a household that has moved and opens what comes back from it. Its rules:
 *
 * - **A household this device has seen encrypted is never sent plain text**, even from the offline shell after a restart: which households have moved
 *   is kept on the device (`EncryptionMemory`).
 * - **A household whose keys this device cannot open is held:** none of its mutations are sent (they stay in the outbox, in order), and it is left out
 *   of the answer, so its cursor does not move past rows the device could not open.
 * - **A value is opened only for the row it was encrypted for, or one folded into it** (the pull's aliases).
 */
export interface KeySide {
  /** The app key, while this browser holds it (`useKeys`); undefined while locked. */
  appKey(): CryptoKey | undefined;
}

/** What the device remembers of each household's encryption: its state, kept across restarts, and its keyring, in memory only. */
export class EncryptionMemory {
  private readonly encrypted: Set<string>;
  private readonly rings = new Map<string, Keyring>();
  private readonly records = new Map<string, { record: string; person: string }>();

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
    private readonly key: string,
  ) {
    this.encrypted = new Set(readList(storage, key));
  }

  isEncrypted(household: string): boolean {
    return this.encrypted.has(household);
  }

  markEncrypted(household: string): void {
    if (this.encrypted.has(household)) return;
    this.encrypted.add(household);
    try {
      this.storage?.setItem(this.key, JSON.stringify([...this.encrypted]));
    } catch {
      // Storage that is full or blocked: this tab still knows, and the server holds plain text sent to a moved household anyway.
    }
  }

  remember(household: string, record: string, person: string): void {
    const known = this.records.get(household);
    if (known?.record === record) return;
    this.records.set(household, { record, person });
    this.rings.delete(household);
  }

  /** The household's keyring, opened with the app key the first time it is asked for. */
  async keyring(household: string, appKey: CryptoKey | undefined): Promise<Keyring | undefined> {
    const open = this.rings.get(household);
    if (open) return open;
    const known = this.records.get(household);
    if (!known || !appKey) return undefined;
    const ring = await unwrapKeyring(appKey, known.record, { person: known.person, household });
    if (ring) this.rings.set(household, ring);
    return ring;
  }

  /** Sets a household's keyring this device just made (the move), so that it is used at once. */
  setKeyring(household: string, ring: Keyring): void {
    this.rings.set(household, ring);
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
): Transport {
  return async (request) => {
    const appKey = keys.appKey();
    const { outbox, held } = await encryptOutbox(request, memory, appKey);
    const result = await inner({ ...request, outbox });
    if (result.kind !== 'ok') return result;
    return { kind: 'ok', answer: await openAnswer(result.answer, memory, appKey, held) };
  };
}

/** The outbox as it goes: a moved household's mutations encrypted, and a household whose keys are locked held back, with everything after it. */
async function encryptOutbox(
  request: SyncRequest,
  memory: EncryptionMemory,
  appKey: CryptoKey | undefined,
): Promise<{ outbox: unknown[]; held: Set<string> }> {
  const held = new Set<string>();
  const outbox: unknown[] = [];
  for (const raw of request.outbox) {
    const mutation = raw as Mutation;
    const household = mutation.householdId;
    if (held.has(household)) continue;
    if (!memory.isEncrypted(household)) {
      outbox.push(mutation);
      continue;
    }
    const ring = await memory.keyring(household, appKey);
    if (!ring) {
      held.add(household);
      continue;
    }
    outbox.push(await encryptMutation(ring, mutation));
  }
  return { outbox, held };
}

/** One mutation, its content encrypted field by field for its row, and a product's name key made beside its name. */
export async function encryptMutation(ring: Keyring, mutation: Mutation): Promise<Mutation> {
  const changes = [];
  for (const change of mutation.changes) {
    const fields: Record<string, string | number | null> = { ...change.fields };
    for (const field of CONTENT[change.table]) {
      const value = fields[field];
      if (typeof value !== 'string') continue;
      fields[field] = await sealField(
        ring,
        { household: mutation.householdId, table: change.table, row: change.id, field },
        value,
      );
    }
    if (change.table === 'product' && typeof change.fields.name === 'string')
      fields.nameKey = await householdNameKey(
        ring,
        mutation.householdId,
        canonicalName(change.fields.name),
      );
    changes.push({ ...change, fields });
  }
  return { ...mutation, changes };
}

/** The answer as the device takes it: a moved household's rows opened, and a household it cannot open left out, so that its cursor stays. */
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
    const self = pull.members.find((member) => member.self === true);
    if (pull.encryption.keyring && typeof self?.personId === 'string')
      memory.remember(pull.household, pull.encryption.keyring, self.personId);
    const ring = await memory.keyring(pull.household, appKey);
    if (!ring || held.has(pull.household)) continue;
    const opened = await openPull(ring, pull);
    if (opened) households.push(opened);
  }
  return { ...answer, households };
}

const TABLE_OF: Record<'lists' | 'items' | 'products', SyncedTable> = {
  lists: 'list',
  items: 'item',
  products: 'product',
};

/** Every row of a moved household's pull, its content opened; `undefined` if a value does not open, so that none of the page is taken. */
export async function openPull(
  ring: Keyring,
  pull: HouseholdPull,
): Promise<HouseholdPull | undefined> {
  const aliasesOf = (table: SyncedTable, row: string) =>
    pull.aliases.filter((each) => each.table === table && each.to === row).map((each) => each.from);
  const out: Record<'lists' | 'items' | 'products', Record<string, unknown>[]> = {
    lists: [],
    items: [],
    products: [],
  };
  for (const key of ['lists', 'items', 'products'] as const) {
    const table = TABLE_OF[key];
    for (const row of pull[key]) {
      const { encrypted, ...rest } = row as Record<string, unknown> & {
        encrypted?: Record<string, string>;
      };
      const id = String(row.id);
      const fields: Record<string, unknown> = { ...rest };
      for (const field of CONTENT[table]) {
        const value = encrypted?.[field];
        if (value === undefined) {
          if (field !== 'name') fields[field] = null;
          continue;
        }
        const text = await openField(
          ring,
          { household: pull.household, table, row: id, field },
          value,
          aliasesOf(table, id),
        );
        if (text === undefined) return undefined;
        fields[field] = text;
      }
      out[key].push(fields);
    }
  }
  // A folded item's second note, carried for a device to join (§12.4): shown joined with the first on every device alike.
  for (const alias of pull.aliases) {
    if (!alias.carried || alias.table !== 'item') continue;
    const target = { household: pull.household, table: 'item', row: alias.to, field: 'note' };
    const text = await openField(ring, target, alias.carried, [alias.from]);
    const item = out.items.find((each) => each.id === alias.to);
    if (text === undefined || !item) continue;
    const first = typeof item.note === 'string' && item.note !== '' ? item.note : null;
    if (first !== text) item.note = first === null ? text : `${first}\n${text}`;
  }
  return { ...pull, ...out };
}
