import { sql } from 'drizzle-orm';
import { pgSchema } from 'drizzle-orm/pg-core';
import { sqliteTable } from 'drizzle-orm/sqlite-core';
import {
  generateDrizzleJson,
  generateMigration,
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from 'drizzle-kit/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from './client';
import { dbAll, dbGet, dbRun } from './exec';
import * as pgColumns from './schema/postgres/columns';
import * as sqliteColumns from './schema/sqlite/columns';
import { freshDatabase, testTarget } from './test-support';

/**
 * The column vocabulary (DESIGN.md §20.2) is only worth anything if each word means the same thing on both dialects, so this makes a table
 * out of every word, with the SQL the generator really writes for it, and reads values back through each. The tables are the test's own and
 * are dropped afterwards; the app's schema is not touched.
 */
const { leg } = testTarget();

/** A schema of the test's own in PostgreSQL, so that dropping it cannot reach anything else. */
const probeSchema = pgSchema('shopper_probe');

const sqliteProbe = sqliteTable('vocabulary_probe', {
  id: sqliteColumns.id('id'),
  owner: sqliteColumns.ref('owner').notNull(),
  at: sqliteColumns.epochMs('at').notNull(),
  seq: sqliteColumns.counter('seq').notNull(),
  done: sqliteColumns.bool('done').notNull(),
  qty: sqliteColumns.decimal('qty'),
  sealed: sqliteColumns.sealed('sealed'),
  data: sqliteColumns.fseq('data').notNull(),
  rank: sqliteColumns.position('rank').notNull(),
});

const pgProbe = probeSchema.table('vocabulary_probe', {
  id: pgColumns.id('id'),
  owner: pgColumns.ref('owner').notNull(),
  at: pgColumns.epochMs('at').notNull(),
  seq: pgColumns.counter('seq').notNull(),
  done: pgColumns.bool('done').notNull(),
  qty: pgColumns.decimal('qty'),
  sealed: pgColumns.sealed('sealed'),
  data: pgColumns.fseq('data').notNull(),
  rank: pgColumns.position('rank').notNull(),
});

/** The statements the generator writes to make the probe, as the migrations of the app are made. */
async function createStatements(dialect: Database['dialect']): Promise<string[]> {
  if (dialect === 'sqlite') {
    return generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson({ sqliteProbe }),
    );
  }
  return generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson({ probeSchema, pgProbe }),
  );
}

let database: Database;
let table: ReturnType<typeof sql.raw>;

beforeAll(async () => {
  ({ database } = await freshDatabase());
  table =
    database.dialect === 'postgres'
      ? sql.raw('"shopper_probe"."vocabulary_probe"')
      : sql.raw('"vocabulary_probe"');
  if (database.dialect === 'postgres') {
    await dbRun(database, sql`DROP SCHEMA IF EXISTS shopper_probe CASCADE`);
  }
  for (const statement of await createStatements(database.dialect)) {
    await dbRun(database, sql.raw(statement));
  }
});

afterAll(async () => {
  if (database.dialect === 'postgres') {
    await dbRun(database, sql`DROP SCHEMA IF EXISTS shopper_probe CASCADE`);
  }
  await database.close();
});

describe(`the column vocabulary (${leg})`, () => {
  it('stores a time in milliseconds and a counter as numbers, exactly, past 2^32', async () => {
    const at = 1_800_000_000_123;
    const seq = 5_000_000_000;
    await dbRun(
      database,
      sql`INSERT INTO ${table} (id, owner, at, seq, done, data, rank) VALUES ('t1', 'a', ${at}, ${seq}, ${true}, '{}', 'a0')`,
    );
    const row = await dbGet<{ at: unknown; seq: unknown }>(
      database,
      sql`SELECT at, seq FROM ${table} WHERE id = 't1'`,
    );
    expect(row).toEqual({ at, seq });
    expect(typeof row?.at).toBe('number');
    expect(typeof row?.seq).toBe('number');
  });

  it('stores a boolean that can be read back as true and false', async () => {
    await dbRun(
      database,
      sql`INSERT INTO ${table} (id, owner, at, seq, done, data, rank) VALUES ('t2', 'a', 1, 1, ${false}, '{}', 'a1')`,
    );
    const rows = await dbAll<{ id: string; done: unknown }>(
      database,
      sql`SELECT id, done FROM ${table} WHERE id IN ('t1', 't2') ORDER BY id`,
    );
    // SQLite returns 0 and 1 where PostgreSQL returns booleans: raw reads cast where it matters (exec.ts), and a query says `done = ...`.
    expect(rows.map((r) => [r.id, Boolean(r.done)])).toEqual([
      ['t1', true],
      ['t2', false],
    ]);
  });

  it('keeps a quantity as the exact decimal string it was given, never a float', async () => {
    for (const [id, qty] of [
      ['q1', '1.5'],
      ['q2', '0.001'],
      ['q3', '12345678901234567890.125'],
      ['q4', '2'],
    ] as const) {
      await dbRun(
        database,
        sql`INSERT INTO ${table} (id, owner, at, seq, done, qty, data, rank) VALUES (${id}, 'a', 1, 1, ${false}, ${qty}, '{}', ${id})`,
      );
    }
    const rows = await dbAll<{ id: string; qty: unknown }>(
      database,
      sql`SELECT id, qty FROM ${table} WHERE id LIKE 'q%' ORDER BY id`,
    );
    expect(rows.map((r) => r.qty)).toEqual(['1.5', '0.001', '12345678901234567890.125', '2']);
    expect(rows.every((r) => typeof r.qty === 'string')).toBe(true);
  });

  it('keeps a sealed envelope exactly, whatever characters it holds', async () => {
    const envelope = 'v1.AAECAwQFBgc=.Zm9vYmFy_-+/=.{"k":1}';
    await dbRun(
      database,
      sql`INSERT INTO ${table} (id, owner, at, seq, done, sealed, data, rank) VALUES ('s1', 'a', 1, 1, ${false}, ${envelope}, '{}', 's')`,
    );
    expect(
      await dbGet<{ sealed: string }>(database, sql`SELECT sealed FROM ${table} WHERE id = 's1'`),
    ).toEqual({ sealed: envelope });
  });

  it('keeps JSON text exactly, without reformatting it', async () => {
    const data = '{"title":{"v":"Water the plants"},"done":{"c":"AAEC"}}';
    await dbRun(
      database,
      sql`INSERT INTO ${table} (id, owner, at, seq, done, data, rank) VALUES ('j1', 'a', 1, 1, ${false}, ${data}, 'j')`,
    );
    expect(
      await dbGet<{ data: string }>(database, sql`SELECT data FROM ${table} WHERE id = 'j1'`),
    ).toEqual({ data });
  });

  // The reason the word exists. PostgreSQL's own collation puts "aa" before "aA" (and "a1" in places a byte order never would); a position is
  // only meaningful compared by bytes, so two devices and two databases must agree on the order.
  it('orders a position by bytes: digits, then upper case, then lower case', async () => {
    for (const rank of ['aa', 'a0', 'aA', 'a1', 'Zz', 'b', 'a']) {
      await dbRun(
        database,
        sql`INSERT INTO ${table} (id, owner, at, seq, done, data, rank) VALUES (${`r-${rank}`}, 'a', 1, 1, ${false}, '{}', ${rank})`,
      );
    }
    const rows = await dbAll<{ rank: string }>(
      database,
      sql`SELECT rank FROM ${table} WHERE id LIKE 'r-%' ORDER BY rank`,
    );
    expect(rows.map((r) => r.rank)).toEqual(['Zz', 'a', 'a0', 'a1', 'aA', 'aa', 'b']);
    // And it is the order JavaScript gives when it compares code units, which is what the client does.
    const inJs = ['aa', 'a0', 'aA', 'a1', 'Zz', 'b', 'a'].sort((x, y) =>
      x < y ? -1 : x > y ? 1 : 0,
    );
    expect(rows.map((r) => r.rank)).toEqual(inJs);
  });

  // The ordering above passes on a PostgreSQL whose default collation is already by bytes (Alpine's, which has no locale collation), so the
  // column's own collation is asked as well: it is "C" on every PostgreSQL, whatever the database was made with.
  it.runIf(leg === 'postgres')('declares the byte collation on the column itself', async () => {
    const row = await dbGet<{ collation: string | null }>(
      database,
      sql`SELECT collation_name AS collation FROM information_schema.columns WHERE table_schema = 'shopper_probe' AND table_name = 'vocabulary_probe' AND column_name = 'rank'`,
    );
    expect(row?.collation).toBe('C');
  });

  it('has a primary key on the id', async () => {
    await expect(
      dbRun(
        database,
        sql`INSERT INTO ${table} (id, owner, at, seq, done, data, rank) VALUES ('t1', 'a', 1, 1, ${false}, '{}', 'x')`,
      ),
    ).rejects.toThrow();
  });
});

describe('the generated SQL', () => {
  it('names the byte collation for a position on PostgreSQL, and nothing on SQLite', async () => {
    const pg = (await createStatements('postgres')).join('\n');
    const lite = (await createStatements('sqlite')).join('\n');
    expect(pg).toContain('"rank" text COLLATE "C" NOT NULL');
    expect(lite).toContain('`rank` text NOT NULL');
    expect(lite).not.toContain('COLLATE');
  });
});
