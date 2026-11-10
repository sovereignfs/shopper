import { type Env, changed } from './env';
import type { Mutation } from './format';
import type { ListRow } from './rows';

/**
 * **The actions on lists** (DESIGN.md §9.1): make, rename, reorder, archive and restore, each a pure function to a mutation, or `null` when it would
 * change nothing. Deleting a list for good is not here: it is an Admin's online operation on an archived list (task 5.4).
 */
export function makeList(
  env: Env,
  input: { householdId: string; name: string; position: string },
): Mutation {
  return {
    mutationId: env.newId(),
    householdId: input.householdId,
    changes: [
      {
        table: 'list',
        id: env.newId(),
        create: true,
        fields: {
          name: input.name,
          position: input.position,
          clearing: 'manual',
          createdAt: env.now,
        },
      },
    ],
  };
}

export function renameList(env: Env, list: ListRow, name: string): Mutation | null {
  return one(env, list, { name });
}

/** Moves a list to a position among the household's lists, which a person changes by dragging. */
export function reorderList(env: Env, list: ListRow, position: string): Mutation | null {
  return one(env, list, { position });
}

/** Archives a list: it leaves the lists that are shown and is kept (and offered to restore). Its items stay. */
export function archiveList(env: Env, list: ListRow): Mutation | null {
  return list.archivedAt === null ? one(env, list, { archivedAt: env.now }) : null;
}

export function restoreList(env: Env, list: ListRow): Mutation | null {
  return list.archivedAt !== null ? one(env, list, { archivedAt: null }) : null;
}

function one(
  env: Env,
  list: ListRow,
  fields: Record<string, string | number | null>,
): Mutation | null {
  const differing = changed(list, fields);
  if (Object.keys(differing).length === 0) return null;
  return {
    mutationId: env.newId(),
    householdId: list.householdId,
    changes: [{ table: 'list', id: list.id, fields: differing }],
  };
}
