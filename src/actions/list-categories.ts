import { type Env, changed } from './env';
import type { Change, Mutation } from './format';
import { after } from './position';
import type { ListCategoryRow } from './rows';

/**
 * **The actions on a list's copies of people's categories** (DESIGN.md §8.3, decisions 15 to 17): put a person's own category on a list, which is a copy of it, and
 * change a copy, which is the list's Admin's. Each is a pure function to a mutation (or a change to go in one), or `null` when it would change nothing. **The source key is
 * made by the caller** (`src/keys/household.ts`, `copySourceKey`, under the list's keys, from the category's id): an action holds no key, and the copy says what it copies by
 * that key and never by the category's id.
 */

/** The copy of a category on a list, and the change that makes it when the list has none: an item of the category is put on the list with the copy's id. */
export interface CopyPlan {
  readonly id: string;
  /** The make, or `null` when the list has a live copy for the source key already. */
  readonly change: Change | null;
}

/**
 * **A category of the person's own put on a list**: the list's live copy of it, found by the source key, or a new copy to be made in the same mutation as what names it.
 * A copy an Admin deleted is made again, as a new row under the same source key (the server folds it into the deleted one and restores it, and the device repoints what names
 * it, `store.ts`). It goes last in the aisle order unless it is given a place (`last` is the last position among the list's categories as the device holds them).
 */
export function copyOnList(
  env: Env,
  input: {
    listId: string;
    sourceKey: string;
    name: string;
    /** The copies the device holds for the list, deleted ones included. */
    copies: readonly ListCategoryRow[];
    last?: string | null;
    position?: string;
    icon?: string | null;
  },
): CopyPlan {
  const there = input.copies.find(
    (copy) => copy.sourceKey === input.sourceKey && copy.deletedAt === null,
  );
  if (there) return { id: there.id, change: null };
  const id = env.newId();
  return {
    id,
    change: {
      table: 'list_category',
      id,
      create: true,
      fields: {
        listId: input.listId,
        sourceKey: input.sourceKey,
        name: input.name,
        position: input.position ?? after(input.last ?? null),
        ...(input.icon === undefined ? {} : { icon: input.icon }),
      },
    },
  };
}

/** A category put on a list with nothing else (a list's Admin adding one to its aisle order): the mutation, and the copy's id. `null` when the list has it already. */
export function putCategoryOnList(
  env: Env,
  input: { householdId: string } & Parameters<typeof copyOnList>[1],
): { mutation: Mutation; id: string } | null {
  const plan = copyOnList(env, input);
  if (!plan.change) return null;
  return {
    id: plan.id,
    mutation: { mutationId: env.newId(), householdId: input.householdId, changes: [plan.change] },
  };
}

const mutationOf = (
  env: Env,
  row: ListCategoryRow,
  fields: Record<string, string | number | null>,
): Mutation => ({
  mutationId: env.newId(),
  householdId: row.householdId,
  changes: [{ table: 'list_category', id: row.id, fields }],
});

/** Renames a copy: the list's Admin's (the server refuses anyone else's). */
export function renameCopy(env: Env, row: ListCategoryRow, name: string): Mutation | null {
  const differing = changed(row, { name });
  return Object.keys(differing).length === 0 ? null : mutationOf(env, row, differing);
}

/** Gives a copy an icon, or none. */
export function setCopyIcon(env: Env, row: ListCategoryRow, icon: string | null): Mutation | null {
  const differing = changed(row, { icon });
  return Object.keys(differing).length === 0 ? null : mutationOf(env, row, differing);
}

/** Puts a copy between two others in the list's aisle order (`between` in `src/actions/position.ts`). */
export function moveCopy(env: Env, row: ListCategoryRow, position: string): Mutation | null {
  return position === row.position ? null : mutationOf(env, row, { position });
}

/** Deletes a copy: what names it shows under _Other_ until someone puts the category on the list again, which restores it. */
export function deleteCopy(env: Env, row: ListCategoryRow): Mutation | null {
  return row.deletedAt === null ? mutationOf(env, row, { deletedAt: env.now }) : null;
}

/**
 * **A category renamed in Inventory, its copies renamed with it** (§8.3): the copies the person found on the lists they are Admin of (`copiesOfCategory`,
 * `src/keys/copies.ts`), one mutation for each group they are in, since a mutation is for one. A copy that has the name already says nothing.
 */
export function renameCopies(
  env: Env,
  copies: readonly ListCategoryRow[],
  name: string,
): Mutation[] {
  const byHousehold = new Map<string, Change[]>();
  for (const copy of copies) {
    const differing = changed(copy, { name });
    if (Object.keys(differing).length === 0) continue;
    const list = byHousehold.get(copy.householdId) ?? [];
    list.push({ table: 'list_category', id: copy.id, fields: differing });
    byHousehold.set(copy.householdId, list);
  }
  return [...byHousehold].map(([householdId, changes]) => ({
    mutationId: env.newId(),
    householdId,
    changes,
  }));
}
