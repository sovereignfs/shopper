/**
 * **The tables of a household's rows**: every table that carries `household_id`, deleted by it when a household is deleted (DESIGN.md §7.5, §19), in an
 * order that leaves nothing pointing at what is gone. `household` itself is deleted last, by `id`. **Each task that adds such a table lists it here**, and
 * `tables.test.ts` fails for one that is in the schema and not here, since a household deleted with a row left behind has not been deleted.
 */
export const HOUSEHOLD_TABLES: readonly string[] = [
  'member',
  'category',
  'list',
  'product',
  'alias',
  'tombstone',
];
