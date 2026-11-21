import { canonicalName } from '../catalog/canonical';
import type { SyncedTable } from '../actions/format';
import type { EncryptionMemory } from './transport';
import { householdNameKey, newKeyring, sealField, wrapKeyring } from './household';

/**
 * The device's side of moving a household (RFC 0001, amendment 2; `src/keys/server/move.ts`): once the app key is open, each household this device has
 * not seen move is offered. The server answers with its rows only where this account is its only member; the device makes the keys, encrypts every row
 * for itself, wraps the keyring under its own app key, and sends it all back. A household the server says cannot move is not asked again until the next
 * session; one that changed in between is asked again at the next sync. The keys leave the browser only wrapped.
 */
type Fetch = typeof fetch;

interface ManifestRow {
  id: string;
  fields: Record<string, string | null>;
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
    const rows: Record<
      string,
      { id: string; fields: Record<string, string | null>; nameKey?: string }[]
    > = {};
    for (const table of ['list', 'item', 'product'] as const) {
      rows[table] = [];
      for (const row of manifest.rows[table] ?? []) {
        const fields: Record<string, string | null> = {};
        for (const [field, value] of Object.entries(row.fields))
          fields[field] =
            value === null
              ? null
              : await sealField(ring, { household, table, row: row.id, field }, value);
        rows[table].push({
          id: row.id,
          fields,
          ...(table === 'product'
            ? {
                nameKey: await householdNameKey(
                  ring,
                  household,
                  canonicalName(row.fields.name ?? ''),
                ),
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
