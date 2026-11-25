import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ringOf, type KeyRing } from '../crypto/keys';
import { SEALED_TABLES, rotateSealed } from '../crypto/rotate';
import { sealRow, unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { inventoryNameKey } from './inventory-key';
import { productNameKey } from './product-key';
import { starterEntryByKey } from './starter';

const { leg } = testTarget();
const ring = (seed: number, previous?: number): KeyRing => {
  const made = ringOf(
    Buffer.alloc(32, seed),
    previous === undefined ? undefined : Buffer.alloc(32, previous),
  );
  if (!made) throw new Error('no ring');
  return made;
};

describe('the key of an Inventory item (23.3)', () => {
  it('is one key for every way of writing a name, in one group, and differs between groups, names and instance keys', () => {
    const keys = ['Bin Bags', 'bin  bags', 'BIN BAGS', ' bin bags '].map((n) =>
      inventoryNameKey(ring(1), 'h1', n),
    );
    expect(new Set(keys).size).toBe(1);
    expect(inventoryNameKey(ring(1), 'h1', 'bin bags')).not.toBe(
      inventoryNameKey(ring(1), 'h2', 'bin bags'),
    );
    expect(inventoryNameKey(ring(1), 'h1', 'bin bags')).not.toBe(
      inventoryNameKey(ring(1), 'h1', 'bin bag'),
    );
    expect(inventoryNameKey(ring(1), 'h1', 'bin bags')).not.toBe(
      inventoryNameKey(ring(2), 'h1', 'bin bags'),
    );
  });

  it('is never the key a product of the same group and name has, so the two tables say nothing of each other', () => {
    expect(inventoryNameKey(ring(1), 'h1', 'oat milk')).not.toBe(
      productNameKey(ring(1), 'h1', 'oat milk'),
    );
  });
});

describe(`Inventory in the database (${leg})`, () => {
  let database: Database;
  beforeAll(async () => {
    ({ database } = await freshDatabase('app'));
    await runMigrations(database);
  });
  afterAll(async () => database.close());

  const table = () => appTable(database, 'inventory_item');
  async function put(
    id: string,
    household: string,
    fields: { name?: string; starterKey?: string },
    key: KeyRing,
  ) {
    const named = fields.name ?? starterEntryByKey(fields.starterKey ?? '')?.name ?? '';
    await dbRun(
      database,
      sql`INSERT INTO ${table()} (id, household_id, starter_key, name_key, sealed, created_at)
          VALUES (${id}, ${household}, ${fields.starterKey ?? null}, ${inventoryNameKey(key, household, named)},
                  ${sealRow('inventory_item', id, fields.name === undefined ? {} : { name: fields.name }, key)}, ${Date.now()})`,
    );
  }

  it('is one to a name in a group, and one override to a starter entry, by the unique indexes', async () => {
    await put('i1', 'h1', { name: 'Bin Bags' }, ring(1));
    await expect(put('i2', 'h1', { name: 'bin  bags' }, ring(1))).rejects.toThrow();
    await put('i3', 'h2', { name: 'bin bags' }, ring(1));
    await put('i4', 'h1', { starterKey: 'bread' }, ring(1));
    await expect(
      put('i5', 'h1', { starterKey: 'bread', name: 'Sourdough' }, ring(1)),
    ).rejects.toThrow();
    // A person's own items have no entry, and any number of them is fine.
    await put('i6', 'h1', { name: 'Dish sponges' }, ring(1));
    await put('i7', 'h1', { name: 'Sticky tape' }, ring(1));
  });

  it('is rotated with the key: the name key is recomputed from the name, or from the starter entry’s for an override that keeps it, twice is safe', async () => {
    const spec = SEALED_TABLES.find((each) => each.table === 'inventory_item');
    if (!spec) throw new Error('inventory_item is not a sealed table');
    const next = ring(2, 1);
    expect(await rotateSealed(database, next, [spec], undefined, () => undefined)).toBe(5);
    expect(await rotateSealed(database, next, [spec], undefined, () => undefined)).toBe(0);
    const rows = await dbAll<{
      id: string;
      household_id: string;
      starter_key: string | null;
      name_key: string;
      sealed: string;
    }>(
      database,
      sql`SELECT id, household_id, starter_key, name_key, sealed FROM ${table()} ORDER BY id`,
    );
    for (const row of rows) {
      const sealed = unsealRow('inventory_item', row.id, row.sealed, ring(2));
      const name =
        typeof sealed.name === 'string'
          ? sealed.name
          : (starterEntryByKey(row.starter_key ?? '')?.name ?? '');
      expect(row.name_key, row.id).toBe(inventoryNameKey(ring(2), row.household_id, name));
    }
    // The old key's name key is gone, and the unique index is on the new one.
    expect(rows.some((row) => row.name_key === inventoryNameKey(ring(1), 'h1', 'bin bags'))).toBe(
      false,
    );
    await expect(put('i8', 'h1', { name: 'BIN BAGS' }, ring(2))).rejects.toThrow();
  });
});
