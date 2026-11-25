import { OTHER } from '../catalog/categories';
import { type Env, changed } from './env';
import type { Mutation } from './format';
import { after } from './position';
import type { CategoryRow } from './rows';

/**
 * **The actions on a group's categories** (DESIGN.md §8.3): make one of the person's own, rename, give an icon, hide or show, put in order, delete. Each is a pure
 * function to a mutation, or `null` when it would change nothing or is not allowed, and the mutation is for the person's **own group** (`householdId`): the
 * server refuses anyone else's. A flag travels as `0` or `1` (`FieldValue`). A starter category is renamed, hidden and moved, never deleted, and _Other_ is never
 * hidden; the server holds to both, and these do not make a change it would refuse.
 */

/** A new category of the person's own, by the name they give it, last in the aisle order unless it is given a place (a position, §9.6). */
export function makeCategory(
  env: Env,
  input: {
    householdId: string;
    name: string;
    /** The last position in the group's aisle order as the device holds it, so that the new one goes after it; `null` for the first. */
    last?: string | null;
    position?: string;
    icon?: string | null;
  },
): Mutation {
  return {
    mutationId: env.newId(),
    householdId: input.householdId,
    changes: [
      {
        table: 'category',
        id: env.newId(),
        create: true,
        fields: {
          name: input.name,
          position: input.position ?? after(input.last ?? null),
          hidden: 0,
          ...(input.icon === undefined ? {} : { icon: input.icon }),
        },
      },
    ],
  };
}

const mutationOf = (
  env: Env,
  row: CategoryRow,
  fields: Record<string, string | number | null>,
): Mutation => ({
  mutationId: env.newId(),
  householdId: row.householdId,
  changes: [{ table: 'category', id: row.id, fields }],
});

/**
 * Renames a category. A starter category given `null` has the code's name again; a category of the person's own always has one, so `null` is nothing for it.
 */
export function renameCategory(env: Env, row: CategoryRow, name: string | null): Mutation | null {
  if (name === null) {
    if (row.starterKey === null) return null;
    return mutationOf(env, row, { name: null });
  }
  const differing = changed(row, { name });
  return Object.keys(differing).length === 0 ? null : mutationOf(env, row, differing);
}

/** Gives a category an icon of the design system's set, or none (the starter's, or the default). */
export function setCategoryIcon(env: Env, row: CategoryRow, icon: string | null): Mutation | null {
  const differing = changed(row, { icon });
  return Object.keys(differing).length === 0 ? null : mutationOf(env, row, differing);
}

/** Hides a category: it is not offered, and its items show under _Other_ until moved. _Other_ cannot be hidden. */
export function hideCategory(env: Env, row: CategoryRow): Mutation | null {
  if (row.starterKey === OTHER || row.hidden) return null;
  return mutationOf(env, row, { hidden: 1 });
}

/** Shows a hidden category again. */
export function showCategory(env: Env, row: CategoryRow): Mutation | null {
  return row.hidden ? mutationOf(env, row, { hidden: 0 }) : null;
}

/** Puts a category between two others in the aisle order: the position is `between(before, after)` (`src/actions/position.ts`). */
export function moveCategory(env: Env, row: CategoryRow, position: string): Mutation | null {
  return position === row.position ? null : mutationOf(env, row, { position });
}

/** Deletes a category of the person's own (an edit restores it, §12.4). A starter category is never deleted, so there is nothing to make for one. */
export function deleteCategory(env: Env, row: CategoryRow): Mutation | null {
  if (row.starterKey !== null || row.deletedAt !== null) return null;
  return mutationOf(env, row, { deletedAt: env.now });
}
