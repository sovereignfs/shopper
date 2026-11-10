import { integer, text } from 'drizzle-orm/sqlite-core';

/**
 * The column vocabulary every table is written in, so that a kind of value has one representation on both dialects (DESIGN.md §20.2).
 * `schema/postgres/columns.ts` exports the same names; the schema parity test keeps the two in step. A table names these and never a
 * dialect's own type.
 *
 * - `id`        a row's key: text, a UUID made by the device for synced rows (§20.2).
 * - `ref`       a reference to another table's `id`: the same text, not a key itself.
 * - `epochMs`   a point in time as milliseconds since the epoch, a JS number: no time zones, no Date parsing, the same on both dialects.
 * - `counter`   a 64-bit whole number that is a JS number: a sequence, a count.
 * - `bool`      a boolean. SQLite stores 0 and 1, and reads it back as a JS boolean through the driver's mode; PostgreSQL has a boolean.
 * - `decimal`   a quantity as its canonical decimal string (`"1.5"`), never a binary float (§9.3). It is text on both; `src/quantity` is what makes
 *               and checks the string, and the write path refuses one that is not canonical.
 * - `sealed`    the envelope of a row's sensitive fields (§13.1), as text. Only `src/crypto/sealed.ts` writes or reads it.
 * - `fseq`      JSON as text: a map of field name to the `seq` that last wrote the field (§12.4). The server reads it to merge, not to query.
 * - `position`  text compared byte by byte (§9.6). SQLite's default comparison is by bytes; PostgreSQL's needs `COLLATE "C"`.
 *
 * Money, a 64-bit count of minor units, joins with prices in phase 2 (task 4.9).
 */
export const id = (name: string) => text(name).primaryKey();

export const ref = (name: string) => text(name);

export const epochMs = (name: string) => integer(name, { mode: 'number' });

export const counter = (name: string) => integer(name, { mode: 'number' });

export const bool = (name: string) => integer(name, { mode: 'boolean' });

export const decimal = (name: string) => text(name);

export const sealed = (name: string) => text(name);

export const fseq = (name: string) => text(name);

export const position = (name: string) => text(name);
