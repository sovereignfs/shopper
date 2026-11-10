import '../zod-jitless';
import { z } from 'zod';
import { MAX_NAME_LENGTH, isName } from '../catalog/name';
import { isGroceryIcon } from '../catalog/icons';
import { isQuantity } from '../quantity/decimal';
import { isUnit } from '../quantity/units';

/**
 * **A mutation** (DESIGN.md §12.2): what a device sends, and the one definition of it. An action turns intent into one; `validate.ts` checks one; the
 * server applies one (task 5.2) and the device applies it to its own store (6.2). **Only what changed is sent: a field, not a row**, which is what makes
 * most conflicts vanish (§12.4). Ids are made by the device, so that a new row exists at once and anything can point at it offline; a mutation's id
 * makes sending it twice harmless.
 *
 * `FIELDS` is the whole of what may be said about each table: the fields it has, each with the shape it must have, and which are required to **create** a
 * row. A field not named here is refused, so a device cannot set what only the server may (a product's name key, how often it was bought). Categories are
 * fixed in 0.1.0 and have no entry: a change to one is refused (task 4.7 gives them one).
 */
export interface Change {
  readonly table: SyncedTable;
  readonly id: string;
  /** The row is new. Every required field is then given. */
  readonly create?: true;
  /** For a new item: "add another anyway" (DESIGN.md §9.3), which the server does not fold into the open item for the same product. */
  readonly separate?: true;
  readonly fields: Readonly<Record<string, FieldValue>>;
}

export interface Mutation {
  readonly mutationId: string;
  readonly householdId: string;
  readonly changes: readonly Change[];
}

/** A field's value: text, a number, nothing, or (never in 0.1.0) a boolean. */
export type FieldValue = string | number | null;

export const SYNCED_TABLES = ['list', 'item', 'product'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** The most changes in one mutation: _Clear bought_ on a full list, with room. */
export const MAX_CHANGES = 1000;
/** The longest a note may be (DESIGN.md §9.2). */
export const MAX_NOTE_LENGTH = 500;
const MAX_POSITION_LENGTH = 64;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isId = (text: string): boolean => UUID.test(text);
export const isPosition = (text: string): boolean =>
  text.length >= 1 && text.length <= MAX_POSITION_LENGTH && /^[0-9A-Za-z]+$/.test(text);

const id = z.string().refine(isId, 'not an id');
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const name = z.string().refine(isName, `a name of one to ${MAX_NAME_LENGTH} characters`);
/** Whether text holds a control character other than a tab, a line break or a carriage return: a note may have lines, and nothing else of the kind. */
function hasControl(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return true;
  }
  return false;
}
const note = z
  .string()
  .max(MAX_NOTE_LENGTH)
  .refine((text) => !hasControl(text), 'a control character');
const position = z.string().refine(isPosition, 'not a position');
const quantity = z.string().refine(isQuantity, 'not a quantity');
const unit = z.string().refine(isUnit, 'not a unit');
const icon = z.string().refine(isGroceryIcon, 'not an icon');
const nullable = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()]);

interface TableFields {
  readonly fields: Readonly<Record<string, z.ZodType<FieldValue>>>;
  /** Fields a row cannot be created without. */
  readonly required: readonly string[];
}

export const FIELDS: Record<SyncedTable, TableFields> = {
  list: {
    fields: {
      name,
      position,
      clearing: z.enum(['manual', 'on_finish', 'after_day']),
      archivedAt: nullable(time),
      deletedAt: nullable(time),
      createdAt: time,
    },
    required: ['name', 'position', 'createdAt'],
  },
  item: {
    fields: {
      listId: id,
      productId: id,
      name,
      note: nullable(note),
      quantity,
      unit: nullable(unit),
      categoryId: nullable(id),
      icon: nullable(icon),
      position,
      addedBy: id,
      addedAt: time,
      boughtAt: nullable(time),
      boughtBy: nullable(id),
      clearedAt: nullable(time),
      deletedAt: nullable(time),
    },
    required: ['listId', 'productId', 'name', 'quantity', 'position', 'addedBy', 'addedAt'],
  },
  product: {
    fields: {
      name,
      note: nullable(note),
      categoryId: nullable(id),
      icon: nullable(icon),
      defaultQuantity: nullable(quantity),
      defaultUnit: nullable(unit),
      lastAddedAt: nullable(time),
      deletedAt: nullable(time),
      createdAt: time,
    },
    required: ['name', 'createdAt'],
  },
};

/** The fields a table has, for code that has to know (a merge, a pull). */
export const fieldsOf = (table: SyncedTable): readonly string[] =>
  Object.keys(FIELDS[table].fields);
