import '../zod-jitless';
import { z } from 'zod';
import { FIELDS, MAX_CHANGES, SYNCED_TABLES, isId, type Mutation } from './format';

/**
 * **The validators: one module**, run by the browser before it queues a mutation and by the server before it applies one (DESIGN.md §12.2), so that what
 * a device thinks is well-formed and what the server accepts cannot differ. It checks **shape**: that the mutation is an object of the right form, its ids
 * are ids, its tables are synced tables, each field is one the table has and has the shape the table gives it (a name of a sensible length, a note, a
 * canonical quantity, a known unit, a grocery icon, a position, a time), a create has every field it needs, and the mutation is not unreasonably large.
 *
 * It cannot check what needs the database: that a list, a product or a category named by a field is **the household's own**, that the household is the
 * account's, that a limit is not passed. The server's apply checks those, in the statement (task 5.2), and refuses with a reason from a fixed list (task 5.2).
 */
export type Verdict =
  | { readonly ok: true; readonly mutation: Mutation }
  | { readonly ok: false; readonly problem: string };

const envelope = z.object({
  mutationId: z.string().refine(isId, 'not an id'),
  householdId: z.string().refine(isId, 'not an id'),
  changes: z.array(z.unknown()).min(1).max(MAX_CHANGES),
});

const change = z.object({
  table: z.enum(SYNCED_TABLES),
  id: z.string().refine(isId, 'not an id'),
  create: z.literal(true).optional(),
  separate: z.literal(true).optional(),
  fields: z.record(z.string(), z.unknown()),
});

export function validateMutation(input: unknown): Verdict {
  const head = envelope.safeParse(input);
  if (!head.success) return refuse(head.error);
  const changes: Mutation['changes'][number][] = [];
  const seen = new Set<string>();
  for (const [index, raw] of head.data.changes.entries()) {
    const parsed = change.safeParse(raw);
    if (!parsed.success) return refuse(parsed.error, `change ${index + 1}`);
    const { table, id, create, separate, fields } = parsed.data;
    const key = `${table}:${id}`;
    // One row twice in a mutation is two things said about it at once; they are one change, or the mutation is wrong.
    if (seen.has(key))
      return { ok: false, problem: `change ${index + 1} names a ${table} that an earlier one did` };
    seen.add(key);

    const spec = FIELDS[table];
    const names = Object.keys(fields);
    if (names.length === 0) return { ok: false, problem: `change ${index + 1} says nothing` };
    const clean: Record<string, string | number | null> = {};
    for (const name of names) {
      const shape = spec.fields[name];
      if (!shape)
        return { ok: false, problem: `change ${index + 1}: ${table} has no field ${name}` };
      const value = shape.safeParse(fields[name]);
      if (!value.success)
        return {
          ok: false,
          problem: `change ${index + 1}: ${table}.${name} is ${value.error.issues[0]?.message ?? 'wrong'}`,
        };
      clean[name] = value.data;
    }
    if (create) {
      const missing = spec.required.filter((name) => !(name in clean));
      if (missing.length > 0)
        return {
          ok: false,
          problem: `change ${index + 1}: a new ${table} needs ${missing.join(', ')}`,
        };
    }
    changes.push({
      table,
      id,
      ...(create ? { create: true as const } : {}),
      ...(create && separate ? { separate: true as const } : {}),
      fields: clean,
    });
  }
  return {
    ok: true,
    mutation: { mutationId: head.data.mutationId, householdId: head.data.householdId, changes },
  };
}

function refuse(error: z.ZodError, where = 'the mutation'): Verdict {
  const issue = error.issues[0];
  const path = issue?.path.join('.') ?? '';
  return {
    ok: false,
    problem: `${where}${path ? ` (${path})` : ''} is ${issue?.message ?? 'malformed'}`,
  };
}
