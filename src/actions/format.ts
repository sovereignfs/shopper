import '../zod-jitless';
import { z } from 'zod';
import { CODE_KINDS, MAX_CARD_CODE_LENGTH, MAX_CARD_NUMBER_LENGTH } from '../cards/kinds';
import { MAX_NAME_LENGTH, isName } from '../catalog/name';
import { isGroceryIcon } from '../catalog/icons';
import { NAME_KEY } from '../keys/household';
import { isListColor } from '../lists/appearance';
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

/**
 * A field's value: text, a number or nothing. **A flag is `0` or `1`** (an Inventory item's `recurring` and `hidden`): a mutation says it as a number, the
 * server writes the column as the dialect's boolean (`TableSpec.plain`'s `kind: 'bool'`), and a pull hands the row back with a boolean, as a device keeps it.
 */
export type FieldValue = string | number | null;

export const SYNCED_TABLES = [
  'list',
  'item',
  'product',
  'inventory_item',
  'category',
  'list_category',
  'card',
] as const;
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
/**
 * A list's icon and colour (RFC 0005): sealed, so a server can check them only as the person typed them, in a household that has not moved. The icon's
 * shape and not its name, since the set grows with the design system and a name this build does not know is drawn as the default; the colour is exact.
 */
const listIcon = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'not an icon')
  .max(40);
const listColor = z.string().refine(isListColor, 'not a colour');
/** A card's number and the value its code carries (§7.7): text with no control character, of a length a card has. */
const cardText = (most: number) =>
  z
    .string()
    .min(1)
    .max(most)
    .refine((text) => !hasControl(text) && !/[\n\r]/.test(text), 'a control character');
const nullable = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()]);
/** A flag, as a mutation says it. */
const flag = z.union([z.literal(0), z.literal(1)]);
/** The key of a starter catalog entry (`src/catalog/starter.ts`): its name as a slug, which a person's own entry never has (null). */
const STARTER_KEY = /^[\p{L}\p{N}]+(-[\p{L}\p{N}]+)*$/u;
const starterKey = z
  .string()
  .max(64)
  .refine((text) => STARTER_KEY.test(text), 'not a starter entry');

interface TableFields {
  readonly fields: Readonly<Record<string, z.ZodType<FieldValue>>>;
  /** Fields a row cannot be created without. */
  readonly required: readonly string[];
}

export const FIELDS: Record<SyncedTable, TableFields> = {
  list: {
    fields: {
      name,
      icon: nullable(listIcon),
      color: nullable(listColor),
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
      // The list whose catalog it is (RFC 0004): set when it is made, never changed.
      listId: nullable(id),
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
  // An item of a person's Inventory (§8.8): the person's own group's, written by its own account alone. A name is absent when an override of a starter entry keeps
  // the starter's, and then the starter entry is named.
  inventory_item: {
    fields: {
      // The starter entry it overrides; set when it is made, never changed. Null for one of the person's own.
      starterKey: nullable(starterKey),
      name: nullable(name),
      note: nullable(note),
      categoryId: nullable(id),
      icon: nullable(icon),
      unit: nullable(unit),
      quantity: nullable(quantity),
      recurring: flag,
      hidden: flag,
      deletedAt: nullable(time),
      createdAt: time,
    },
    required: ['createdAt'],
  },
  // A category of the group (§8.3): a starter one, which only the owner renames, hides and puts in order and nobody deletes, or one of the person's own. A device
  // never makes a starter category, so there is no field for its key. The name is null when a starter category has the code's.
  category: {
    fields: {
      name: nullable(name),
      icon: nullable(icon),
      position,
      hidden: flag,
      deletedAt: nullable(time),
    },
    required: ['position'],
  },
  // A list's copy of a person's own category (§8.3): only in a group that has moved. The device holds it plain as it holds every row (its name as text, and the source key it made under
  // the list's keys), and the transport encrypts the name at the sync; a group the server seals has none (`apply.ts` refuses a copy there, whichever form was sent). Its list and
  // source key are set when it is made and never change.
  list_category: {
    fields: {
      listId: id,
      sourceKey: z.string().regex(NAME_KEY, 'not a source key'),
      name,
      icon: nullable(icon),
      position,
      deletedAt: nullable(time),
    },
    required: ['listId', 'sourceKey', 'name', 'position'],
  },
  // A loyalty card (§7.7): only in a group that has moved, every field of what the person wrote encrypted under the card's own keys. The device holds it plain as it holds every row, and
  // the transport encrypts each field at the sync; a group the server seals has none (`apply.ts` refuses a card there, whichever form was sent).
  card: {
    fields: {
      shop: name,
      number: cardText(MAX_CARD_NUMBER_LENGTH),
      kind: z.enum(CODE_KINDS),
      code: cardText(MAX_CARD_CODE_LENGTH),
      icon: nullable(listIcon),
      color: nullable(listColor),
      holder: nullable(name),
      note: nullable(note),
      position,
      deletedAt: nullable(time),
      createdAt: time,
    },
    required: ['shop', 'number', 'kind', 'code', 'position', 'createdAt'],
  },
};

/** The fields of each table that are what people wrote (RFC 0001): encrypted by the device once its household has moved, and never read by the server. */
export const CONTENT: Record<SyncedTable, readonly string[]> = {
  list: ['name', 'icon', 'color'],
  item: ['name', 'note'],
  product: ['name', 'note'],
  inventory_item: ['name', 'note'],
  category: ['name'],
  list_category: ['name'],
  card: ['shop', 'number', 'kind', 'code', 'icon', 'color', 'holder', 'note'],
};

/** The fields a table has, for code that has to know (a merge, a pull). */
export const fieldsOf = (table: SyncedTable): readonly string[] =>
  Object.keys(FIELDS[table].fields);
