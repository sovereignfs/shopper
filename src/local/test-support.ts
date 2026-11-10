import 'fake-indexeddb/auto';
import type { Someone } from '../access/test-support';
import { SyncClient } from './client';
import { type LocalDatabase, deleteLocal, localName, openLocal } from './db';
import type { LoopEnvironment } from './loop';
import { householdsOf, itemsOf, listsOf, productsOf } from './store';
import type { Transport } from './transport';
import { type EndpointDeps, handleSync } from '../sync/endpoint';
import type { SyncRequest } from '../sync/protocol';

/** A test's way of making devices: each is a working copy of its own in IndexedDB (a fake one), a client, and a wire to the server that can be cut. */
const open: LocalDatabase[] = [];
const names: string[] = [];

export async function closeDevices(): Promise<void> {
  for (const db of open.splice(0)) db.close();
  for (const name of names.splice(0)) await deleteLocal('', name);
}

export interface Wire {
  /** While true the device has no network. */
  offline: boolean;
  /** Every request that reached the server, as the server read it. */
  readonly requests: SyncRequest[];
}

/** A transport that is the server's own `handleSync`, with the request and the answer passed through JSON as the network would. */
export function serverTransport(
  deps: () => EndpointDeps,
  who: Pick<Someone, 'accountId'>,
  wire: Wire,
): Transport {
  return async (request) => {
    if (wire.offline) return { kind: 'offline' };
    const sent = JSON.parse(JSON.stringify(request)) as SyncRequest;
    wire.requests.push(sent);
    const reply = await handleSync(deps(), who.accountId, sent);
    if (reply.status === 426) return { kind: 'update-required' };
    if (reply.status !== 200) return { kind: 'error', status: reply.status };
    return { kind: 'ok', answer: JSON.parse(JSON.stringify(reply.body)) };
  };
}

export async function device(deps: () => EndpointDeps, who: Someone) {
  const wire: Wire = { offline: false, requests: [] };
  const name = localName(`${who.accountId}-${crypto.randomUUID()}`);
  names.push(name);
  const db = await openLocal('', name);
  open.push(db);
  let clock = 1_800_000_000_000;
  const client = new SyncClient({
    db,
    transport: serverTransport(deps, who, wire),
    now: () => (clock += 1000),
  });
  return { who, db, client, wire };
}

export type Device = Awaited<ReturnType<typeof device>>;

/** What a device shows of a household, whole: every list, every item (cleared ones too) and every product, in a stable order. */
export async function shown(db: LocalDatabase, household: string) {
  const lists = await listsOf(db, household);
  const items = (
    await Promise.all(lists.map((list) => itemsOf(db, list.id, { cleared: true })))
  ).flat();
  const byId = <T extends { id: string }>(rows: T[]) => rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { lists, items: byId(items), products: byId(await productsOf(db, household)) };
}

export const households = async (db: LocalDatabase) => (await householdsOf(db)).map((h) => h.id);

/** Time and the browser's events, by hand: a test moves the clock, fires `online` and takes locks, and nothing waits for anything real. */
export class FakeEnvironment implements LoopEnvironment {
  now = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private next = 1;
  private listeners: Record<string, (() => void)[]> = {};
  held = new Set<string>();
  randomValue = 0.5;
  shown = true;

  setTimeout = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.timers.push({ at: this.now + ms, fn, id });
    return id;
  };
  clearTimeout = (handle: unknown) => {
    this.timers = this.timers.filter((timer) => timer.id !== handle);
  };
  random = () => this.randomValue;
  visible = () => this.shown;
  locks = {
    request: async (
      name: string,
      _options: { ifAvailable: true },
      callback: (lock: unknown) => Promise<void> | void,
    ) => {
      if (this.held.has(name)) return callback(null);
      this.held.add(name);
      try {
        return await callback({ name });
      } finally {
        this.held.delete(name);
      }
    },
  };
  events = {
    listen: (type: 'online' | 'focus' | 'visible', listener: () => void) => {
      (this.listeners[type] ??= []).push(listener);
      return () => {
        this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== listener);
      };
    },
  };
  fire(type: string) {
    for (const listener of this.listeners[type] ?? []) listener();
  }
  async advance(ms: number) {
    const until = this.now + ms;
    for (;;) {
      const due = this.timers.filter((timer) => timer.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((timer) => timer.id !== due.id);
      this.now = due.at;
      due.fn();
      await settleMicrotasks();
    }
    this.now = until;
  }
}

/** Lets promises that are already on their way finish, including the IndexedDB requests between them. */
export const settleMicrotasks = async () => {
  for (let i = 0; i < 30; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};
