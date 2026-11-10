import type { FieldValue } from '../actions/format';

/**
 * **Merging a change into a row, field by field** (DESIGN.md §12.4), pure: the server runs it on the rows it holds and a device on its own (task 6.2), so
 * that one rule decides. A change says some fields of a row; **each field it says is set, and the fields it does not say are left alone**, which is why two
 * members changing different fields of one item both stand. Two changes of the same field are decided by arrival at the server: the later wins, since the
 * server's order is the order (the household's `seq`, §12.3). Each field that changes is stamped with the `seq` of the change in `fseq`, so that which
 * field is newer is known without opening anything sealed.
 *
 * **An edit restores a deleted row:** a change that does not itself say `deletedAt` to a row that is deleted clears it, since losing someone's work is
 * worse than an item coming back (§12.4). A change that says `deletedAt` is believed (two deletes are a delete, and an undo of a delete is a restore).
 */
export interface Merged {
  /** The row's values after the change. */
  readonly values: Readonly<Record<string, FieldValue>>;
  /** The stamps after the change. */
  readonly fseq: Readonly<Record<string, number>>;
  /** The fields whose value changed, which is what is written and what a device is told. */
  readonly changed: readonly string[];
}

export function mergeChange(
  values: Readonly<Record<string, FieldValue>>,
  fseq: Readonly<Record<string, number>>,
  fields: Readonly<Record<string, FieldValue>>,
  seq: number,
): Merged {
  const next: Record<string, FieldValue> = { ...values };
  const stamps: Record<string, number> = { ...fseq };
  const changed: string[] = [];
  const set = (name: string, value: FieldValue) => {
    if (next[name] === value) return;
    next[name] = value;
    stamps[name] = seq;
    changed.push(name);
  };
  for (const [name, value] of Object.entries(fields)) set(name, value);
  if ((values.deletedAt ?? null) !== null && !('deletedAt' in fields)) set('deletedAt', null);
  return { values: next, fseq: stamps, changed };
}
