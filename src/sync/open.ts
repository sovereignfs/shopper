import { sql } from 'drizzle-orm';

/** The condition for an item that is **open**: not bought, not cleared and not deleted (DESIGN.md §4). For a `WHERE` on the item table. */
export const OPEN_ITEM = sql.raw('bought_at IS NULL AND cleared_at IS NULL AND deleted_at IS NULL');
