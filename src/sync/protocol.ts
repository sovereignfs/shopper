import { z } from 'zod';
import { isId } from '../actions/format';

/**
 * **The sync protocol** (DESIGN.md §12.3): one request, `POST /api/sync`, carrying the device's outbox in order and a cursor for each household it holds,
 * and one answer carrying what was applied or refused, the account's current households, and what changed since each cursor. A **version** travels with every
 * request: a device that is too old is told to update, and keeps its outbox.
 */
export const PROTOCOL = 1;

/** The most mutations one request carries, and the most the server will read of one. */
export const MAX_OUTBOX = 200;
export const MAX_BODY = 2 * 1024 * 1024;

export const syncRequest = z.object({
  version: z.number().int(),
  /** The mutations the device has not had answered, oldest first. Each is checked by `validateMutation` when applied. */
  outbox: z.array(z.unknown()).max(MAX_OUTBOX),
  /** For each household the device holds, the `seq` it has pulled to; 0 for a household it has none of. */
  cursors: z.record(z.string().refine(isId, 'not an id'), z.number().int().min(0)),
});

export type SyncRequest = z.infer<typeof syncRequest>;

/** What a pull of one household answers: rows past the cursor, up to a `seq` that is whole (every row of every change at it), and whether there is more. */
export interface HouseholdPull {
  readonly household: string;
  /** The `seq` the device has now pulled to: the next cursor. */
  readonly cursor: number;
  readonly more: boolean;
  /** The household as the reader sees it. */
  readonly view: { label: string; own: boolean; role: 'admin' | 'member'; seq: number };
  readonly lists: readonly Record<string, unknown>[];
  readonly items: readonly Record<string, unknown>[];
  readonly products: readonly Record<string, unknown>[];
  readonly categories: readonly Record<string, unknown>[];
  readonly members: readonly Record<string, unknown>[];
  readonly tombstones: readonly { table: string; id: string; seq: number }[];
  readonly aliases: readonly { table: string; from: string; to: string; seq: number }[];
}

export interface SyncAnswer {
  readonly protocol: number;
  readonly applied: readonly {
    mutationId: string;
    status: 'applied' | 'replayed';
    seq: number;
    folds: readonly { table: string; from: string; to: string }[];
  }[];
  readonly refused: readonly { mutationId: string; reason: string; sentence: string }[];
  readonly households: readonly HouseholdPull[];
  /** Households the device holds that the account is no longer in: it deletes its copy. */
  readonly gone: readonly string[];
  /** Settings the browser needs and cannot read from its own build (DESIGN.md §12.6). */
  readonly settings: { readonly intervalSeconds: number };
}
