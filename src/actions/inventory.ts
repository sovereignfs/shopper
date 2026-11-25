import type { InventoryEntry } from '../catalog/inventory';
import type { Unit } from '../quantity/units';
import { type Env, changed } from './env';
import type { Mutation } from './format';
import type { InventoryRow } from './rows';

/**
 * **The actions on a person's Inventory** (DESIGN.md §8.8): make an item, override a starter entry, change either, hide or restore, delete. Each is a pure
 * function to a mutation, or `null` when it would change nothing, and the mutation is for the person's **own group** (`householdId`): Inventory is theirs alone,
 * and the server refuses anyone else's. A flag travels as `0` or `1` (`FieldValue`).
 */
export interface InventoryFields {
  readonly note?: string | null;
  readonly categoryId?: string | null;
  readonly icon?: string | null;
  readonly unit?: Unit | null;
  readonly quantity?: string | null;
  readonly recurring?: boolean;
  readonly hidden?: boolean;
}

const flags = (input: InventoryFields): Record<string, number> => ({
  ...(input.recurring === undefined ? {} : { recurring: input.recurring ? 1 : 0 }),
  ...(input.hidden === undefined ? {} : { hidden: input.hidden ? 1 : 0 }),
});

const plain = (input: InventoryFields): Record<string, string | number | null> => {
  const { recurring: _recurring, hidden: _hidden, ...rest } = input;
  const out: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(rest)) if (value !== undefined) out[key] = value;
  return out;
};

/** A new item of the person's own, by the name they give it: recurring or once, shown. */
export function makeInventoryItem(
  env: Env,
  input: { householdId: string; name: string } & InventoryFields,
): Mutation {
  const { householdId, name, ...rest } = input;
  return {
    mutationId: env.newId(),
    householdId,
    changes: [
      {
        table: 'inventory_item',
        id: env.newId(),
        create: true,
        fields: {
          name,
          createdAt: env.now,
          recurring: 0,
          hidden: 0,
          ...plain(rest),
          ...flags(rest),
        },
      },
    ],
  };
}

/**
 * A person's change to a starter entry: a row that overrides it, by the entry's key (RFC 0006: layered, never copied). With no `name` it keeps the starter's; with
 * one it is renamed, and the entry's key stays on the row.
 */
export function overrideStarterEntry(
  env: Env,
  input: { householdId: string; starterKey: string; name?: string } & InventoryFields,
): Mutation {
  const { householdId, starterKey, name, ...rest } = input;
  return {
    mutationId: env.newId(),
    householdId,
    changes: [
      {
        table: 'inventory_item',
        id: env.newId(),
        create: true,
        fields: {
          starterKey,
          ...(name === undefined ? {} : { name }),
          createdAt: env.now,
          recurring: 0,
          hidden: 0,
          ...plain(rest),
          ...flags(rest),
        },
      },
    ],
  };
}

/** Changes what differs from the row: a name (an own item's, or an override's rename), or any of its fields. */
export function changeInventoryItem(
  env: Env,
  row: InventoryRow,
  input: { name?: string | null } & InventoryFields,
): Mutation | null {
  const { name, ...rest } = input;
  const differing = {
    ...changed(row, { name, ...plain(rest) }),
    ...changed({ recurring: row.recurring ? 1 : 0, hidden: row.hidden ? 1 : 0 }, flags(rest)),
  };
  if (Object.keys(differing).length === 0) return null;
  return {
    mutationId: env.newId(),
    householdId: row.householdId,
    changes: [{ table: 'inventory_item', id: row.id, fields: differing }],
  };
}

/** Hides an item, or a starter entry's override of it: it is offered nowhere until it is shown again. */
export const hideInventoryItem = (env: Env, row: InventoryRow): Mutation | null =>
  changeInventoryItem(env, row, { hidden: true });

export const restoreInventoryItem = (env: Env, row: InventoryRow): Mutation | null =>
  changeInventoryItem(env, row, { hidden: false });

/** Deletes an item of the person's own, or takes back a starter override (the starter entry is shown as it is). An edit restores it (§12.4). */
export function deleteInventoryItem(env: Env, row: InventoryRow): Mutation | null {
  if (row.deletedAt !== null) return null;
  return {
    mutationId: env.newId(),
    householdId: row.householdId,
    changes: [{ table: 'inventory_item', id: row.id, fields: { deletedAt: env.now } }],
  };
}

/** The row of an Inventory entry: the starter entry's override by its key, or the item of their own by its id; none for a starter entry that has not been changed. */
export const rowOfEntry = (
  rows: readonly InventoryRow[],
  entry: Pick<InventoryEntry, 'starterKey' | 'id'>,
): InventoryRow | undefined =>
  entry.starterKey !== null
    ? rows.find((row) => row.starterKey === entry.starterKey && row.deletedAt === null)
    : rows.find((row) => row.id === entry.id && row.deletedAt === null);

/**
 * **One change to an Inventory entry**, from the rows as the device holds them **now**: the entry's own row is changed (what differs, `changeInventoryItem`), and a starter entry that has
 * no row yet gets its override from the first change. What is cleared (`null`) of an entry with no row is what the starter already has, so it makes nothing. `null` when there is nothing to
 * write. The Inventory panel and the item's "Remember for next time" both make their changes with this, so that a change to a starter entry is one override in both.
 */
export function changeEntry(
  env: Env,
  householdId: string,
  rows: readonly InventoryRow[],
  entry: Pick<InventoryEntry, 'starterKey' | 'id'>,
  fields: InventoryFields & { name?: string | null },
): Mutation | null {
  const row = rowOfEntry(rows, entry);
  if (row) return changeInventoryItem(env, row, fields);
  if (entry.starterKey === null) return null;
  const { name: renamed, ...rest } = fields;
  const wanted = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== null));
  if (typeof renamed !== 'string' && Object.keys(wanted).length === 0) return null;
  return overrideStarterEntry(env, {
    householdId,
    starterKey: entry.starterKey,
    ...(typeof renamed === 'string' ? { name: renamed } : {}),
    ...wanted,
  });
}
