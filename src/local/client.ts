import { type Mutation } from '../actions/format';
import { validateMutation } from '../actions/validate';
import { PROTOCOL, MAX_OUTBOX } from '../sync/protocol';
import type { LocalDatabase } from './db';
import {
  type Refusal,
  commitMutation,
  cursorsOf,
  lastSyncedAt,
  outboxSize,
  readOutbox,
  settle,
  syncIntervalSeconds,
} from './store';
import type { Transport } from './transport';

/**
 * A device's side of sync for one account (DESIGN.md §12): **commit** a mutation to the working copy and the outbox, **sync** the outbox to the server and
 * take what it answers, and tell whoever is listening that something changed. It is made of a database, a transport and a clock, all given, so that a test
 * makes devices out of them and no real network or time is involved.
 *
 * Nothing here is awaited by a screen: a screen calls `commit`, which finishes when the working copy has the change, and reads the working copy. It never
 * waits for `sync`, and nothing in the UI depends on one having happened.
 */
export class InvalidMutation extends Error {
  constructor(readonly reason: string) {
    super(`not a mutation: ${reason}`);
    this.name = 'InvalidMutation';
  }
}

export type SyncOutcome =
  | { status: 'synced' }
  | { status: 'offline' }
  | { status: 'signed-out' }
  | { status: 'update-required' }
  | { status: 'rate-limited'; retryAfterMs: number }
  | { status: 'error' };

export interface SyncClientOptions {
  db: LocalDatabase;
  transport: Transport;
  now?: () => number;
  newId?: () => string;
  /** Told when something other than this client changed the working copy: another tab (`BroadcastChannel`), for the loop and for the screens. */
  channel?:
    | Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'close'>
    | undefined;
  /** The most rounds of one `sync()`: a device with a very long way to catch up goes on at the next trigger. */
  maxRounds?: number;
}

export class SyncClient {
  private readonly listeners = new Set<() => void>();
  private readonly writeListeners = new Set<() => void>();
  private readonly refusalListeners = new Set<(refusals: Refusal[]) => void>();
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly onChannel = (event: Event) => {
    this.emit();
    if ((event as MessageEvent).data?.type === 'write') this.emitWrites();
  };

  constructor(private readonly options: SyncClientOptions) {
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? (() => crypto.randomUUID());
    options.channel?.addEventListener('message', this.onChannel);
  }

  get db(): LocalDatabase {
    return this.options.db;
  }

  /**
   * Applies a mutation to the working copy and queues it, as one write. It is checked first with the rules the server will use, so that a mutation that
   * would be refused for its shape is a bug found here and never queued. Resolves when the change is in the working copy, which is when a screen can show
   * it, **with the mutation that undoes it** (DESIGN.md §12.7), or `null` if there is nothing to undo.
   */
  async commit(mutation: unknown): Promise<Mutation | null> {
    const verdict = validateMutation(mutation);
    if (!verdict.ok) throw new InvalidMutation(verdict.problem);
    const undo = await commitMutation(this.options.db, verdict.mutation, this.now(), this.newId);
    this.announce('write');
    return undo;
  }

  /** Calls `listener` when the working copy changes, in this tab or in another. Returns the way to stop. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Calls `listener` when a mutation was written, in this tab or another: what the sync loop waits for. **Not when a sync ended**, which changes the working
   * copy too but gives the loop nothing to send, and which it would otherwise answer with another sync, for ever.
   */
  onWrite(listener: () => void): () => void {
    this.writeListeners.add(listener);
    return () => this.writeListeners.delete(listener);
  }

  /** Calls `listener` with the changes the server refused, which have been taken back locally and which the person is to be told of (task 6.3). */
  onRefused(listener: (refusals: Refusal[]) => void): () => void {
    this.refusalListeners.add(listener);
    return () => this.refusalListeners.delete(listener);
  }

  /** Reads the working copy: a query from `src/local/store.ts`, run against this client's database. */
  read<T>(query: (db: LocalDatabase) => Promise<T>): Promise<T> {
    return query(this.options.db);
  }

  /**
   * Whether this device has ever heard from the server. Until it has, a new device has nothing to show, and the app can say it is loading; after it,
   * never: a device that has synced once paints from its own copy at once, on any network (DESIGN.md §12.10).
   */
  async hasSynced(): Promise<boolean> {
    return (await lastSyncedAt(this.options.db)) !== undefined;
  }

  /** The operator's interval in seconds as the server last said, which the loop uses; `undefined` until the first answer. */
  intervalSeconds(): Promise<number | undefined> {
    return syncIntervalSeconds(this.options.db);
  }

  /** The number of changes waiting to be sent. */
  pending(): Promise<number> {
    return outboxSize(this.options.db);
  }

  /**
   * Sends the outbox and takes the answer, and again while there is more to send or to take, up to `maxRounds`. **Never throws for the network**: what went
   * wrong is the outcome, and the outbox is left as it was, so that the next try sends the same.
   */
  async sync(): Promise<SyncOutcome> {
    const rounds = this.options.maxRounds ?? 200;
    for (let round = 0; round < rounds; round++) {
      const sent = await readOutbox(this.options.db, MAX_OUTBOX);
      const result = await this.options.transport({
        version: PROTOCOL,
        outbox: sent.map((entry) => entry.mutation),
        cursors: await cursorsOf(this.options.db),
      });
      if (result.kind === 'offline') return { status: 'offline' };
      if (result.kind === 'signed-out') return { status: 'signed-out' };
      if (result.kind === 'update-required') return { status: 'update-required' };
      if (result.kind === 'rate-limited')
        return { status: 'rate-limited', retryAfterMs: result.retryAfterMs };
      if (result.kind === 'error') return { status: 'error' };

      const settled = await settle(this.options.db, sent, result.answer, this.now());
      this.announce('synced');
      if (settled.refused.length > 0)
        for (const listener of this.refusalListeners) listener(settled.refused);

      // Another round if the server has more for us, or we sent a full request and may have more to send; stop when neither moves.
      const full = sent.length >= MAX_OUTBOX;
      if (!settled.more && !full) return { status: 'synced' };
      if (settled.answered === 0 && !settled.more) return { status: 'synced' };
    }
    return { status: 'synced' };
  }

  /** Stops listening to other tabs. The working copy is left as it is. */
  close(): void {
    this.options.channel?.removeEventListener('message', this.onChannel);
    this.listeners.clear();
    this.writeListeners.clear();
    this.refusalListeners.clear();
  }

  private announce(type: 'write' | 'synced'): void {
    this.emit();
    if (type === 'write') this.emitWrites();
    this.options.channel?.postMessage({ type });
  }

  private emitWrites(): void {
    for (const listener of this.writeListeners) listener();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
