import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client';
import { dbAll, dbRun, transaction } from '../db/exec';
import { canonicalName } from '../catalog/canonical';
import { appTable } from '../db/tables';
import { nameKeyOf } from './name-key';
import { fingerprintOfSealed, rewrap } from './envelope';
import type { KeyRing } from './keys';
import { SEALED, unsealRow, type SealedFields, type SealedRegistry } from './sealed';

/**
 * A table that holds a `sealed` column, as rotation and the start-up check need to know it. `table` is the name as the database has it, and is also
 * the row's `purpose` (`src/crypto/sealed.ts`). `schema` is the PostgreSQL schema it is in; SQLite has none.
 */
export interface SealedTable {
  readonly table: string;
  /** The columns, besides `id` and `sealed`, that a recompute needs to read. */
  readonly read?: readonly string[];
  /**
   * What else depends on the key and is recomputed with the row: the name key of a product. Given the row as read and its sealed fields **opened**, it
   * returns the columns to set (column name to value). Run in the row's own transaction, so that the two cannot disagree.
   */
  readonly recompute?: (
    row: Record<string, unknown>,
    fields: SealedFields,
    ring: KeyRing,
  ) => Record<string, string | number | null>;
}

/** The tables that hold sealed rows. Each task that adds one lists it here, with the registry (`SEALED`) and the design's §13.1. */
export const SEALED_TABLES: readonly SealedTable[] = [
  { table: 'person' },
  { table: 'household' },
  { table: 'category' },
  { table: 'list' },
  { table: 'item' },
  {
    // A product's name key is an HMAC under a key derived from the instance key, so it changes with the key and is recomputed with the row.
    table: 'product',
    read: ['household_id'],
    recompute: (row, fields, ring) => ({
      name_key: nameKeyOf(ring, String(row.household_id), canonicalName(String(fields.name ?? ''))),
    }),
  },
];

const BATCH = 100;

const columns = (names: readonly string[]): SQL =>
  sql.raw(names.map((name) => `"${name}"`).join(', '));

/** Said when rows are sealed under a key this server was not given. It names fingerprints, which are safe to say, and never a key. */
export class MissingKeys extends Error {
  constructor(readonly fingerprints: readonly string[]) {
    super(
      `rows are sealed under keys that this server does not have: ${fingerprints.join(', ')}. ` +
        'Give the server SHOPPER_ENCRYPTION_KEY (and SHOPPER_ENCRYPTION_KEY_PREVIOUS while a key is being replaced).',
    );
    this.name = 'MissingKeys';
  }
}

/**
 * Which keys the sealed rows of the given tables stand under, as fingerprints. The fingerprint is the second part of the envelope, so it is read
 * from the text of the column with `SUBSTR`; nothing sealed is read or compared.
 */
export async function keysInUse(
  database: Database,
  tables: readonly SealedTable[] = SEALED_TABLES,
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const { table } of tables) {
    const rows = await dbAll<{ fp: string }>(
      database,
      sql`SELECT DISTINCT SUBSTR(sealed, 4, 16) AS fp FROM ${appTable(database, table)} WHERE sealed IS NOT NULL`,
    );
    for (const row of rows) found.add(row.fp);
  }
  return found;
}

/** Stops the start-up when what is sealed cannot be opened: a key that was dropped would otherwise be found when a person needs a list. */
export async function assertKeys(
  database: Database,
  ring: KeyRing,
  tables: readonly SealedTable[] = SEALED_TABLES,
): Promise<void> {
  const known = new Set([ring.current.fingerprint, ring.previous?.fingerprint]);
  const missing = [...(await keysInUse(database, tables))].filter((fp) => !known.has(fp));
  if (missing.length > 0) throw new MissingKeys(missing.sort());
}

/**
 * **Rotation, at start-up** (DESIGN.md §13.1): every sealed row wrapped under `previous` is wrapped again under `current`, the payload is not touched,
 * and what depends on the key (a product's name key) is recomputed in the same transaction. It may run from every replica at once and twice over:
 * each row is moved by an update that holds only while the row is as it was read, so exactly one of them moves it and the others find it moved. It
 * resumes where it stopped, since a row on the current key is not selected again. Returns how many rows this run moved.
 */
export async function rotateSealed(
  database: Database,
  ring: KeyRing,
  tables: readonly SealedTable[] = SEALED_TABLES,
  registry: SealedRegistry = SEALED,
  log: (line: string) => void = (line) => console.info(line),
): Promise<number> {
  const previous = ring.previous;
  if (!previous) return 0;
  let total = 0;
  for (const spec of tables) {
    const t = appTable(database, spec.table);
    const extra = spec.read && spec.read.length > 0 ? sql`, ${columns(spec.read)}` : sql``;
    const prefix = `t1.${previous.fingerprint}.%`;
    for (;;) {
      const rows = await dbAll<Record<string, unknown> & { id: string; sealed: string }>(
        database,
        sql`SELECT id, sealed${extra} FROM ${t} WHERE sealed LIKE ${prefix} ORDER BY id LIMIT ${BATCH}`,
      );
      if (rows.length === 0) break;
      let moved = 0;
      for (const row of rows) {
        if (fingerprintOfSealed(row.sealed) !== previous.fingerprint) continue;
        const binding = { id: row.id, purpose: spec.table };
        const again = rewrap(row.sealed, binding, previous, ring.current);
        const done = await transaction(database, async (tx) => {
          const changed = await dbAll<{ id: string }>(
            tx,
            sql`UPDATE ${t} SET sealed = ${again} WHERE id = ${row.id} AND sealed = ${row.sealed} RETURNING id`,
          );
          if (changed.length === 0 || !spec.recompute) return changed.length;
          const fields = unsealRow(spec.table, row.id, again, ring, registry);
          for (const [column, value] of Object.entries(spec.recompute(row, fields, ring))) {
            await dbRun(
              tx,
              sql`UPDATE ${t} SET ${sql.raw(`"${column}"`)} = ${value} WHERE id = ${row.id}`,
            );
          }
          return changed.length;
        });
        moved += done;
      }
      total += moved;
      // Another replica moved the rest while this one looked: nothing is left that this run can move.
      if (moved === 0) break;
    }
  }
  if (total > 0)
    log(
      `[shopper] sealed rows: ${total} moved from key ${previous.fingerprint} to key ${ring.current.fingerprint}`,
    );
  return total;
}
