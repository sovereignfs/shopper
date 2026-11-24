import { canonicalName } from '../catalog/canonical';
import { starterEntryByKey } from '../catalog/starter';
import type { SyncedTable } from '../actions/format';
import type { EncryptionMemory } from './transport';
import {
  type Keyring,
  deriveInventoryKeyring,
  deriveListKeyring,
  deviceInventoryNameKey,
  listNameKey,
  newKeyring,
  sealField,
  wrapKeyring,
} from './household';

/**
 * The device's side of moving a household (RFC 0001, amendment 2; `src/keys/server/move.ts`): once the app key is open, each household this device has
 * not seen move is offered. The server answers with its rows only where this account is its only member; the device makes the keys, encrypts every row
 * for itself, wraps the keyring under its own app key, and sends it all back. A household the server says cannot move is not asked again until the next
 * session; one that changed in between is asked again at the next sync. The keys leave the browser only wrapped.
 */
type Fetch = typeof fetch;

interface ManifestRow {
  id: string;
  /**
   * Its list (a list's own id): whose keys, derived from the group's, its values are encrypted under (RFC 0004). An Inventory item's is its group, whose
   * Inventory keys (derived from the group's, §13.2) its values are encrypted under.
   */
  list: string;
  fields: Record<string, string | null>;
  /** An Inventory item's starter entry (null for one of the person's own): the name its name key is made from when it has none of its own. */
  starterKey?: string | null;
}

export class Mover {
  private readonly cannot = new Set<string>();
  private running = false;

  constructor(
    private readonly memory: EncryptionMemory,
    private readonly fetcher: Fetch = (...args) => fetch(...args),
  ) {}

  /** Moves what it can of `households`. Says whether one moved, so that the device syncs again. */
  async run(households: readonly string[], appKey: CryptoKey | undefined): Promise<boolean> {
    if (!appKey || this.running) return false;
    this.running = true;
    let moved = false;
    try {
      for (const household of households) {
        if (this.memory.isEncrypted(household) || this.cannot.has(household)) continue;
        const outcome = await this.moveOne(household, appKey);
        if (outcome === 'moved') moved = true;
        if (outcome === 'cannot') this.cannot.add(household);
      }
    } finally {
      this.running = false;
    }
    return moved;
  }

  private async moveOne(
    household: string,
    appKey: CryptoKey,
  ): Promise<'moved' | 'cannot' | 'later'> {
    let manifest: { seq: number; person: string; rows: Record<SyncedTable, ManifestRow[]> };
    try {
      const reply = await this.fetcher(`/api/keys/move?household=${household}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (reply.status === 404) return 'cannot';
      if (!reply.ok) return 'later';
      manifest = (await reply.json()) as typeof manifest;
    } catch {
      return 'later';
    }
    const ring = newKeyring();
    const lists = new Map<string, Keyring>();
    const listRing = async (list: string) => {
      const known = lists.get(list);
      if (known) return known;
      const made = await deriveListKeyring(ring, list);
      lists.set(list, made);
      return made;
    };
    const rows: Record<
      string,
      { id: string; fields: Record<string, string | null>; nameKey?: string }[]
    > = {};
    // The group's Inventory keys, made from the keyring just made and kept by nobody else (§13.2).
    const inventoryRing = await deriveInventoryKeyring(ring, household);
    for (const table of ['list', 'item', 'product', 'inventory_item'] as const) {
      rows[table] = [];
      const taken = new Set<string>();
      for (const row of manifest.rows[table] ?? []) {
        if (table === 'inventory_item') {
          const made = await inventoryRow(inventoryRing, household, row);
          // A starter entry this version does not have, or two rows that come to one name key (a skewed catalog between the server and this device): the unique key
          // would refuse the whole move on every attempt, so it waits for a version that can.
          if (!made || taken.has(made.nameKey ?? '')) return 'cannot';
          taken.add(made.nameKey ?? '');
          rows[table].push(made);
          continue;
        }
        // A product from before lists had catalogs has no list, and its group cannot move until the server gives it one.
        if (!row.list) return 'cannot';
        const keys = await listRing(row.list);
        const fields: Record<string, string | null> = {};
        for (const [field, value] of Object.entries(row.fields))
          fields[field] =
            value === null
              ? null
              : await sealField(keys, { list: row.list, table, row: row.id, field }, value);
        rows[table].push({
          id: row.id,
          fields,
          ...(table === 'product'
            ? {
                nameKey: await listNameKey(keys, row.list, canonicalName(row.fields.name ?? '')),
              }
            : {}),
        });
      }
    }
    const keyring = await wrapKeyring(appKey, ring, { person: manifest.person, household });
    try {
      const reply = await this.fetcher('/api/keys/move', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ household, seq: manifest.seq, keyring, rows }),
      });
      if (reply.status === 404) return 'cannot';
      if (!reply.ok) return 'later';
    } catch {
      return 'later';
    }
    this.memory.markEncrypted(household);
    this.memory.remember(household, keyring, manifest.person);
    this.memory.setKeyring(household, ring);
    return 'moved';
  }
}

/** An Inventory item's row, answered: each value encrypted for its group under its Inventory keys, and its name key. `undefined` if it has no name to make one from. */
async function inventoryRow(
  inventoryRing: Keyring,
  household: string,
  row: ManifestRow,
): Promise<{ id: string; fields: Record<string, string | null>; nameKey?: string } | undefined> {
  const name =
    row.fields.name ?? (row.starterKey ? starterEntryByKey(row.starterKey)?.name : undefined);
  if (name === undefined || name === null) return undefined;
  const fields: Record<string, string | null> = {};
  for (const [field, value] of Object.entries(row.fields))
    fields[field] =
      value === null
        ? null
        : await sealField(
            inventoryRing,
            { list: household, table: 'inventory_item', row: row.id, field },
            value,
          );
  return {
    id: row.id,
    fields,
    nameKey: await deviceInventoryNameKey(inventoryRing, household, canonicalName(name)),
  };
}
