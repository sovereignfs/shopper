import { is } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import * as sqliteSchema from '../db/schema/sqlite/app';
import { HOUSEHOLD_TABLES } from './tables';

const tables = Object.values(sqliteSchema as Record<string, unknown>)
  .filter((value): value is SQLiteTable => is(value, SQLiteTable))
  .map((table) => getTableConfig(table));

describe("a household's tables", () => {
  it('lists every table that carries household_id, and only those', () => {
    const carrying = tables
      .filter((config) => config.columns.some((column) => column.name === 'household_id'))
      .map((config) => config.name)
      .sort();
    expect([...HOUSEHOLD_TABLES].sort()).toEqual(carrying);
  });

  it('does not list household itself, which is deleted last by its id', () => {
    expect(HOUSEHOLD_TABLES).not.toContain('household');
    expect(tables.some((config) => config.name === 'household')).toBe(true);
  });
});
