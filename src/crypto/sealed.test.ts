import { readFileSync } from 'node:fs';
import { is } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../db/client';
import { dbAll, dbRun } from '../db/exec';
import * as sqliteSchema from '../db/schema/sqlite';
import { freshDatabase } from '../db/test-support';
import { CryptoError } from './envelope';
import { entryOf, ringOf, type KeyRing } from './keys';
import { nameKeyOf } from './name-key';
import {
  assertKeys,
  keysInUse,
  MissingKeys,
  rotateSealed,
  SEALED_TABLES,
  type SealedTable,
} from './rotate';
import { SEALED, sealRow, SealedRegistryError, unsealRow, type SealedRegistry } from './sealed';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

const ring = (seed: number, previous?: number): KeyRing =>
  must(
    ringOf(Buffer.alloc(32, seed), previous === undefined ? undefined : Buffer.alloc(32, previous)),
  );

/** The test's own table and registry: the real ones are empty until the tables of the product exist. */
const REGISTRY: SealedRegistry = { thing: ['name', 'note'] };
const TABLE = 'thing';
const PLANTED = 'PLANTED-oat-milk-for-the-household';

describe('sealed rows (pure)', () => {
  it('round-trips the fields of a row and nothing more', () => {
    const sealed = sealRow(TABLE, 'row-1', { name: PLANTED, note: null }, ring(1), REGISTRY);
    expect(sealed.startsWith('t1.')).toBe(true);
    expect(sealed).not.toContain(PLANTED);
    expect(unsealRow(TABLE, 'row-1', sealed, ring(1), REGISTRY)).toEqual({
      name: PLANTED,
      note: null,
    });
  });

  it('opens with the previous key of the ring as well as the current one', () => {
    const sealed = sealRow(TABLE, 'row-1', { name: 'a' }, ring(1), REGISTRY);
    expect(unsealRow(TABLE, 'row-1', sealed, ring(2, 1), REGISTRY)).toEqual({ name: 'a' });
    expect(() => unsealRow(TABLE, 'row-1', sealed, ring(2), REGISTRY)).toThrow(CryptoError);
  });

  it('does not open as another row or another table', () => {
    const sealed = sealRow(TABLE, 'row-1', { name: 'a' }, ring(1), REGISTRY);
    expect(() => unsealRow(TABLE, 'row-2', sealed, ring(1), REGISTRY)).toThrow(CryptoError);
    const other: SealedRegistry = { ...REGISTRY, other: ['name'] };
    expect(() => unsealRow('other', 'row-1', sealed, ring(1), other)).toThrow(CryptoError);
  });

  it('seals only fields the registry lists, and only for a table it lists', () => {
    expect(() => sealRow(TABLE, 'r', { price: 1 }, ring(1), REGISTRY)).toThrow(SealedRegistryError);
    expect(() => sealRow('nowhere', 'r', { name: 'a' }, ring(1), REGISTRY)).toThrow(
      SealedRegistryError,
    );
    // The real registry is what a caller gets by default, and it knows no table yet.
    expect(() => sealRow('thing', 'r', { name: 'a' }, ring(1))).toThrow(SealedRegistryError);
  });

  it('makes a different envelope each time, from a data key of its own', () => {
    const a = sealRow(TABLE, 'row-1', { name: 'a' }, ring(1), REGISTRY);
    const b = sealRow(TABLE, 'row-1', { name: 'a' }, ring(1), REGISTRY);
    expect(a).not.toBe(b);
  });

  it('an error says what kind of failure it was and never a value', () => {
    const sealed = sealRow(TABLE, 'row-1', { name: PLANTED }, ring(1), REGISTRY);
    try {
      unsealRow(TABLE, 'row-9', sealed, ring(1), REGISTRY);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(PLANTED);
      expect((error as CryptoError).failure).toBe('cannot_open');
    }
  });
});

describe('the name key', () => {
  it('is one key for one name in one household, and differs by household and by name', () => {
    const k = ring(1);
    expect(nameKeyOf(k, 'h1', 'oat milk')).toBe(nameKeyOf(k, 'h1', 'oat milk'));
    expect(nameKeyOf(k, 'h1', 'oat milk')).not.toBe(nameKeyOf(k, 'h2', 'oat milk'));
    expect(nameKeyOf(k, 'h1', 'oat milk')).not.toBe(nameKeyOf(k, 'h1', 'oat milks'));
  });

  it('cannot be shifted: the household and the name are not run together', () => {
    const k = ring(1);
    expect(nameKeyOf(k, 'ab', 'c')).not.toBe(nameKeyOf(k, 'a', 'bc'));
  });

  it('changes with the instance key, and is not the name or its plain hash', () => {
    const one = nameKeyOf(ring(1), 'h1', 'oat milk');
    expect(one).not.toBe(nameKeyOf(ring(2), 'h1', 'oat milk'));
    expect(one).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(one).not.toContain('oat');
  });

  it('is under the current key of a ring, whatever its previous', () => {
    expect(nameKeyOf(ring(2, 1), 'h1', 'x')).toBe(nameKeyOf(ring(2), 'h1', 'x'));
    expect(entryOf(Buffer.alloc(32, 2)).fingerprint).toBe(ring(2).current.fingerprint);
  });
});

describe('the registry and the design', () => {
  const design = readFileSync(new URL('../../DESIGN.md', import.meta.url), 'utf8');
  const squash = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

  /** What §13.1's table says is sealed: table name to the fields, in the words of the design. */
  function sealedInDesign(): Map<string, Set<string>> {
    const line = design.split('\n').find((l) => l.startsWith('| Household: name; list: name;'));
    if (!line) throw new Error('DESIGN.md §13.1 no longer has its table of sealed fields');
    const cell = line.split('|')[1] ?? '';
    const out = new Map<string, Set<string>>();
    for (const part of cell.split(';')) {
      // The design's words in brackets say how a field is shown, not what it is: "name (a starter category is its key until renamed)".
      const [table, fields] = part.replace(/\([^)]*\)/g, '').split(':');
      if (!table || !fields) continue;
      out.set(squash(table), new Set(fields.split(',').map(squash)));
    }
    return out;
  }

  it('reads the design’s table', () => {
    const rows = sealedInDesign();
    expect(rows.get('household')).toEqual(new Set(['name']));
    expect(rows.get('item')).toEqual(new Set(['name', 'note', 'price']));
    expect(rows.size).toBeGreaterThanOrEqual(9);
  });

  it('lists no table or field the design does not seal', () => {
    const rows = sealedInDesign();
    const offenders: string[] = [];
    for (const [table, fields] of Object.entries(SEALED)) {
      const allowed = rows.get(squash(table));
      if (!allowed) offenders.push(table);
      else
        for (const field of fields)
          if (!allowed.has(squash(field))) offenders.push(`${table}.${field}`);
    }
    expect(offenders).toEqual([]);
  });

  /** The tables of a schema that have a `sealed` column and are not in the registry. */
  function unregistered(schema: Record<string, unknown>, registry: SealedRegistry): string[] {
    return Object.values(schema)
      .filter((value): value is SQLiteTable => is(value, SQLiteTable))
      .map((table) => getTableConfig(table))
      .filter((config) => config.columns.some((column) => column.name === 'sealed'))
      .map((config) => config.name)
      .filter((name) => !(name in registry));
  }

  it('lists every table of the schema that has a sealed column, and the rotation knows it', () => {
    expect(unregistered(sqliteSchema, SEALED)).toEqual([]);
    expect(SEALED_TABLES.map((t) => t.table).sort()).toEqual(Object.keys(SEALED).sort());
  });

  // The check above is only worth anything if it can fail, so show that it does.
  it('fails for a table with a sealed column that is not listed', async () => {
    const { sqliteTable } = await import('drizzle-orm/sqlite-core');
    const { id, sealed } = await import('../db/schema/sqlite/columns');
    const probe = sqliteTable('unlisted_probe', { id: id('id'), sealed: sealed('sealed') });
    expect(unregistered({ probe }, SEALED)).toEqual(['unlisted_probe']);
    expect(unregistered({ probe }, { unlisted_probe: ['name'] })).toEqual([]);
  });
});

describe('sealed rows in the database', async () => {
  let database: Database;
  let leg: string;
  let file: string | undefined;
  const spec: SealedTable = {
    table: TABLE,
    read: ['household_id'],
    recompute: (row, fields) => ({
      name_key: nameKeyOf(CURRENT, String(row.household_id), String(fields.name)),
    }),
  };
  let CURRENT: KeyRing = ring(2, 1);

  const table = () =>
    database.dialect === 'postgres' ? sql.raw('"shopper"."thing"') : sql.raw('"thing"');

  beforeAll(async () => {
    const fresh = await freshDatabase();
    database = fresh.database;
    leg = fresh.leg;
    if (fresh.config.dialect === 'sqlite' && fresh.config.form === 'file') file = fresh.config.path;
    if (database.dialect === 'postgres')
      await dbRun(database, sql`CREATE SCHEMA IF NOT EXISTS "shopper"`);
    await dbRun(
      database,
      sql`CREATE TABLE ${table()} (id text PRIMARY KEY, household_id text NOT NULL, name_key text, sealed text)`,
    );
  });

  beforeEach(async () => {
    await dbRun(database, sql`DELETE FROM ${table()}`);
  });

  afterAll(async () => {
    await database.close();
  });

  async function put(id: string, household: string, name: string, key: KeyRing) {
    const sealed = sealRow(TABLE, id, { name, note: null }, key, REGISTRY);
    await dbRun(
      database,
      sql`INSERT INTO ${table()} (id, household_id, name_key, sealed) VALUES (${id}, ${household}, ${nameKeyOf(key, household, name)}, ${sealed})`,
    );
  }

  it(`round-trips on this database (${'leg'})`, async () => {
    await put('a', 'h1', PLANTED, ring(2));
    const [row] = await dbAll<{ id: string; sealed: string }>(
      database,
      sql`SELECT id, sealed FROM ${table()}`,
    );
    expect(unsealRow(TABLE, 'a', must(row).sealed, ring(2), REGISTRY)).toEqual({
      name: PLANTED,
      note: null,
    });
    expect(leg).toMatch(/sqld|file|postgres/);
  });

  it('keeps the fields out of the database: the column, and for a file the bytes of the file', async () => {
    await put('a', 'h1', PLANTED, ring(2));
    const rows = await dbAll<Record<string, unknown>>(database, sql`SELECT * FROM ${table()}`);
    expect(JSON.stringify(rows)).not.toContain(PLANTED);
    if (file) {
      for (const suffix of ['', '-wal']) {
        let bytes = Buffer.alloc(0);
        try {
          bytes = readFileSync(`${file}${suffix}`);
        } catch {
          // No write-ahead log is a log with nothing in it.
        }
        expect(bytes.includes(PLANTED)).toBe(false);
        expect(bytes.includes('oat-milk')).toBe(false);
      }
    }
  });

  it('knows which keys the rows stand under, and stops when one is missing', async () => {
    await put('a', 'h1', 'x', ring(1));
    await put('b', 'h1', 'y', ring(2));
    expect(await keysInUse(database, [spec])).toEqual(
      new Set([ring(1).current.fingerprint, ring(2).current.fingerprint]),
    );
    await expect(assertKeys(database, ring(2, 1), [spec])).resolves.toBeUndefined();
    await expect(assertKeys(database, ring(2), [spec])).rejects.toThrow(MissingKeys);
    await expect(assertKeys(database, ring(2), [spec])).rejects.toThrow(
      ring(1).current.fingerprint,
    );
    await expect(assertKeys(database, ring(3), [spec])).rejects.not.toThrow(/PLANTED/);
  });

  it('rotates: re-wraps every row and recomputes every name key, and twice is safe', async () => {
    CURRENT = ring(2, 1);
    await put('a', 'h1', 'oat milk', ring(1));
    await put('b', 'h2', 'oat milk', ring(1));
    await put('c', 'h1', 'bread', ring(2));
    const before = await dbAll<{ id: string; sealed: string; name_key: string }>(
      database,
      sql`SELECT id, sealed, name_key FROM ${table()} ORDER BY id`,
    );

    const rowOf = <R extends { id: string }>(rows: R[], id: string): R =>
      must(rows.find((r) => r.id === id));
    const lines: string[] = [];
    expect(await rotateSealed(database, CURRENT, [spec], REGISTRY, (l) => lines.push(l))).toBe(2);
    expect(await rotateSealed(database, CURRENT, [spec], REGISTRY, (l) => lines.push(l))).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines.join()).not.toContain('oat milk');

    const after = await dbAll<{ id: string; sealed: string; name_key: string }>(
      database,
      sql`SELECT id, sealed, name_key FROM ${table()} ORDER BY id`,
    );
    for (const row of after) {
      expect(row.sealed.startsWith(`t1.${ring(2).current.fingerprint}.`)).toBe(true);
      // Opens with the new key alone.
      expect(unsealRow(TABLE, row.id, row.sealed, ring(2), REGISTRY).name).toBeTruthy();
    }
    expect(rowOf(after, 'a').name_key).toBe(nameKeyOf(ring(2), 'h1', 'oat milk'));
    expect(rowOf(after, 'b').name_key).toBe(nameKeyOf(ring(2), 'h2', 'oat milk'));
    // The moved rows changed, the one already on the new key did not.
    expect(rowOf(after, 'a').name_key).not.toBe(rowOf(before, 'a').name_key);
    expect(rowOf(after, 'c').sealed).toBe(rowOf(before, 'c').sealed);
    // The payload of a moved row was not touched: only the wrapping changed.
    const payload = (sealed: string) => sealed.split('.')[3];
    expect(payload(rowOf(after, 'a').sealed)).toBe(payload(rowOf(before, 'a').sealed));
  });

  it('two replicas rotating at once move each row exactly once', async () => {
    CURRENT = ring(2, 1);
    for (let i = 0; i < 12; i++) await put(`r${i}`, 'h1', `name ${i}`, ring(1));
    const moved = await Promise.all([
      rotateSealed(database, CURRENT, [spec], REGISTRY, () => undefined),
      rotateSealed(database, CURRENT, [spec], REGISTRY, () => undefined),
    ]);
    const [first = 0, second = 0] = moved;
    expect(first + second).toBe(12);
    expect(await keysInUse(database, [spec])).toEqual(new Set([ring(2).current.fingerprint]));
  });
});
