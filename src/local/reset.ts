import type { SyncClient } from './client';
import { deleteLocal } from './db';

/**
 * **Reset this device** (DESIGN.md §17): sends what is waiting, then throws the working copy away so that the next load pulls every household again. For a
 * device that has gone wrong, or that holds a household the person wants gone. It is not signing out: the session stays.
 *
 * What cannot be sent is lost by it, and so is what is in Couldn't sync, so **it asks first, with the number**, and does nothing if the person says no.
 * Everything outside the browser is given, so the whole of it is tested without one.
 */
export interface ResetOptions {
  accountId: string;
  client: SyncClient;
  /** Asks the person about changes that would be lost: true to go on. */
  confirmLosing(unsent: number, refused: number): Promise<boolean>;
  /** Deletes the account's database; by default the one `openLocal` opens for it. A test names its own. */
  deleteDatabase?(): Promise<void>;
}

export type Reset = { status: 'reset' } | { status: 'cancelled'; unsent: number; refused: number };

export async function resetDevice(options: ResetOptions): Promise<Reset> {
  const { accountId, client } = options;
  await client.sync();
  // A sync that was refused moves what it refused to Couldn't sync, which is counted: it is lost too.
  const unsent = await client.pending();
  const refused = await client.failedCount();
  if (unsent + refused > 0 && !(await options.confirmLosing(unsent, refused)))
    return { status: 'cancelled', unsent, refused };
  client.close();
  client.db.close();
  await (options.deleteDatabase ?? (() => deleteLocal(accountId)))();
  return { status: 'reset' };
}
