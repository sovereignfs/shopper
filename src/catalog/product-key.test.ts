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
import { productNameKey } from './product-key';

const { leg } = testTarget();
const ring = (seed: number, previous?: number): KeyRing => {
  const made = ringOf(
    Buffer.alloc(32, seed),
    previous === undefined ? undefined : Buffer.alloc(32, previous),
  );
  if (!made) throw new Error('no ring');
  return made;
};

describe('the key of a product', () => {
  it('is one key for every way of writing a name, in one household', () => {
    const keys = ['Oat Milk', 'oat  milk', 'OAT MILK', ' oat milk '].map((n) =>
      productNameKey(ring(1), 'h1', n),
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('differs between households, between names, and between instance keys', () => {
    expect(productNameKey(ring(1), 'h1', 'oat milk')).not.toBe(
      productNameKey(ring(1), 'h2', 'oat milk'),
    );
    expect(productNameKey(ring(1), 'h1', 'oat milk')).not.toBe(
      productNameKey(ring(1), 'h1', 'oat milks'),
    );
    expect(productNameKey(ring(1), 'h1', 'oat milk')).not.toBe(
      productNameKey(ring(2), 'h1', 'oat milk'),
    );
  });
});

describe(`products in the database (${leg})`, () => {
  let database: Database;
  beforeAll(async () => {
    ({ database } = await freshDatabase('app'));
    await runMigrations(database);
  });
  afterAll(async () => database.close());

  const table = () => appTable(database, 'product');
  async function put(id: string, household: string, name: string, key: KeyRing) {
    await dbRun(
      database,
      sql`INSERT INTO ${table()} (id, household_id, name_key, sealed, created_at)
          VALUES (${id}, ${household}, ${productNameKey(key, household, name)}, ${sealRow('product', id, { name, note: null }, key)}, ${Date.now()})`,
    );
  }

  it('are one to a name in a household, by the unique index, and the same name is free in another household', async () => {
    await put('p1', 'h1', 'Oat Milk', ring(1));
    await expect(put('p2', 'h1', 'oat  milk', ring(1))).rejects.toThrow();
    await put('p3', 'h2', 'oat milk', ring(1));
    await put('p4', 'h1', 'bread', ring(1));
  });

  it('are rotated with the key: the name key is recomputed under the new key with the row, twice is safe, and the index still holds', async () => {
    const product = SEALED_TABLES.find((spec) => spec.table === 'product');
    if (!product) throw new Error('product is not a sealed table');
    const next = ring(2, 1);
    expect(await rotateSealed(database, next, [product], undefined, () => undefined)).toBe(3);
    expect(await rotateSealed(database, next, [product], undefined, () => undefined)).toBe(0);
    const rows = await dbAll<{
      id: string;
      household_id: string;
      name_key: string;
      sealed: string;
    }>(database, sql`SELECT id, household_id, name_key, sealed FROM ${table()} ORDER BY id`);
    for (const row of rows) {
      const name = String(unsealRow('product', row.id, row.sealed, ring(2)).name);
      expect(row.name_key, row.id).toBe(productNameKey(ring(2), row.household_id, name));
    }
    // The old key's name key is gone, and the unique index is on the new one.
    expect(rows.some((row) => row.name_key === productNameKey(ring(1), 'h1', 'oat milk'))).toBe(
      false,
    );
    await expect(put('p5', 'h1', 'OAT MILK', ring(2))).rejects.toThrow();
  });
});
