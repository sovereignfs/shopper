import { open, seal, type Binding } from './envelope';
import type { KeyRing } from './keys';

/**
 * **Sealed rows** (DESIGN.md §13.1). Everything that says what a household buys, where, for how much, or who they are is kept in one `sealed` column
 * per row: its sensitive fields as one JSON object, in one envelope with one data key (`src/crypto/envelope.ts`), bound to the table and the row's
 * id. **This is the only place that makes or reads that column**, and it knows only the fields the registry below lists for a table, so a field is
 * never sealed by accident and never left in the clear by omission. A sealed field is never in a `WHERE`, an `ORDER BY` or an index: what the
 * database must sort, join, count or merge stays in columns of its own.
 *
 * The registry is **the code's copy of the table in `DESIGN.md` §13.1**, and `sealed.test.ts` holds the two together: a table with a `sealed` column
 * that is not listed here fails it, and so does a field listed here that the design does not seal. A task that adds a table with a sealed field adds
 * it here, to that table in the design, and to `People.deletePerson`, export and import, in the same change.
 */
export type SealedRegistry = Readonly<Record<string, readonly string[]>>;

/**
 * Table by table, the fields it seals. It grows with the tables: persons (3.1), households (3.2), categories (4.2), products (5.3), lists (5.4)
 * and items (5.5) in phase 1; shops, trips and trip lines (7.1), prices and the invitation's email (3.10) in phase 2.
 */
export const SEALED: SealedRegistry = {
  person: ['name', 'email'],
  household: ['name'],
  product: ['name', 'note'],
  category: ['name'],
  list: ['name'],
};

/** A sealed field's value: text, or a number (money, in phase 2), or nothing. */
export type SealedValue = string | number | null;
export type SealedFields = Readonly<Record<string, SealedValue>>;

/** Said for a table or field the registry does not know. It names the table and the field, never a value. */
export class SealedRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SealedRegistryError';
  }
}

function fieldsOf(table: string, registry: SealedRegistry): readonly string[] {
  const fields = registry[table];
  if (!fields) throw new SealedRegistryError(`"${table}" has no sealed fields in the registry`);
  return fields;
}

const bindingOf = (table: string, id: string): Binding => ({ id, purpose: table });

/**
 * The `sealed` column of a row: `fields` sealed to this table and this id, under the current key. Every key of `fields` must be one the registry lists
 * for the table; a field that is not given is not in the envelope. The whole row's sealed fields are written at once, since one envelope holds them
 * (a merge unseals, changes the fields it was sent, and seals again, in the mutation's transaction).
 */
export function sealRow(
  table: string,
  id: string,
  fields: SealedFields,
  ring: KeyRing,
  registry: SealedRegistry = SEALED,
): string {
  const allowed = fieldsOf(table, registry);
  for (const name of Object.keys(fields)) {
    if (!allowed.includes(name))
      throw new SealedRegistryError(`"${table}.${name}" is not a sealed field in the registry`);
  }
  return seal(JSON.stringify(fields), bindingOf(table, id), ring.current);
}

/**
 * The fields of a `sealed` column, opened for the table and id it was sealed to, with whichever key of the ring it names. A value moved to another
 * row or table does not open, and nothing says why beyond the kind of failure (`CryptoError`).
 */
export function unsealRow(
  table: string,
  id: string,
  sealed: string,
  ring: KeyRing,
  registry: SealedRegistry = SEALED,
): SealedFields {
  const allowed = fieldsOf(table, registry);
  const parsed: unknown = JSON.parse(open(sealed, bindingOf(table, id), ring));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new SealedRegistryError(`"${table}" has a sealed value that is not a row of fields`);
  const out: Record<string, SealedValue> = {};
  for (const [name, value] of Object.entries(parsed)) {
    // A field the registry no longer lists is not handed on: it cannot have been written by this code.
    if (!allowed.includes(name)) continue;
    if (value !== null && typeof value !== 'string' && typeof value !== 'number')
      throw new SealedRegistryError(`"${table}.${name}" is not text, a number or nothing`);
    out[name] = value;
  }
  return out;
}
