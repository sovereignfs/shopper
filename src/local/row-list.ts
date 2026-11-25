import type { SyncedTable } from '../actions/format';
import type { ListOf } from '../keys/transport';
import type { LocalDatabase } from './db';

/**
 * **Where a row is, for its list's keys** (RFC 0004, §8.3): the list an item's, a product's or a list's copy's values are encrypted under, as the server has the row (its
 * shadow, while changes to it wait), else as the device holds it. The transport asks for it when a change does not say its list (an Admin's rename of a copy, an item's
 * edit), and follows the outbox in order from there. **One function**, used by the page and by every device test, so that a table the transport must answer for is added in
 * one place: a copy it did not answer for would be refused on the device with the sentence for a list the person has left.
 */
export const rowListOf =
  (db: LocalDatabase): ListOf =>
  async (table: SyncedTable, id: string) => {
    if (table !== 'item' && table !== 'product' && table !== 'list_category') return undefined;
    const shadow = await db.get('shadow', [table, id]);
    // A copy made on this device and not yet answered has a shadow with no row: its list never changes, so the row the device holds says it.
    const row =
      shadow && (shadow.row || table !== 'list_category') ? shadow.row : await db.get(table, id);
    const list = (row as { listId?: string | null } | null | undefined)?.listId;
    return typeof list === 'string' ? list : undefined;
  };
