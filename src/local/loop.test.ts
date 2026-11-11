import { afterEach, describe, expect, it } from 'vitest';
import { SyncClient, type SyncOutcome } from './client';
import { openLocal, deleteLocal, localName, type LocalDatabase } from './db';
import { startSyncLoop } from './loop';
import { FakeEnvironment, closeDevices, settleMicrotasks } from './test-support';
import { PROTOCOL, type SyncAnswer } from '../sync/protocol';
import type { Transport, TransportResult } from './transport';

const ID = () => crypto.randomUUID();
const open: LocalDatabase[] = [];
const accounts: string[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) db.close();
  for (const account of accounts.splice(0)) await deleteLocal(account);
  await closeDevices();
});

const HOUSEHOLD = ID();
const answer = (over: Partial<SyncAnswer> = {}): SyncAnswer => ({
  protocol: PROTOCOL,
  applied: [],
  refused: [],
  gone: [],
  households: [],
  settings: { intervalSeconds: 20 },
  ...over,
});
const ok = (): TransportResult => ({ kind: 'ok', answer: answer() });

/** A client whose working copy holds one household, so that a write has somewhere to go. */
async function client(send: Transport, name = ID()) {
  accounts.push(name);
  const db = await openLocal(name);
  open.push(db);
  await db.put('household', {
    id: HOUSEHOLD,
    label: 'Home',
    own: true,
    role: 'admin',
    seq: 1,
    cursor: 1,
  });
  await db.put('list', {
    id: ID(),
    householdId: HOUSEHOLD,
    name: 'Groceries',
    position: 'a0',
    clearing: 'manual',
    archivedAt: null,
    deletedAt: null,
    createdAt: 1,
    seq: 1,
  });
  return new SyncClient({ db, transport: send });
}
const write = (c: SyncClient) =>
  c.commit({
    mutationId: ID(),
    householdId: HOUSEHOLD,
    changes: [
      {
        table: 'list',
        id: ID(),
        create: true,
        fields: { name: 'x', position: 'a1', createdAt: 5 },
      },
    ],
  });

describe('the sync loop', () => {
  it('syncs once on load, then on the operator’s interval, read each time', async () => {
    const env = new FakeEnvironment();
    let calls = 0;
    const c = await client(async () => (calls++, ok()));
    const gaps = [5000, 10_000];
    const loop = startSyncLoop({
      client: c,
      lockName: 'l',
      environment: env,
      interval: () => gaps.shift() ?? 10_000,
    });
    await settleMicrotasks();
    expect(calls).toBe(1);
    await env.advance(4999);
    expect(calls).toBe(1);
    await env.advance(1);
    expect(calls).toBe(2);
    await env.advance(9999);
    expect(calls).toBe(2);
    await env.advance(1);
    expect(calls).toBe(3);
    loop.stop();
    await env.advance(60_000);
    expect(calls).toBe(3);
  });

  it('takes a changed interval at once when it is rearmed, and not only when the timer already set runs out', async () => {
    const env = new FakeEnvironment();
    let calls = 0;
    const c = await client(async () => (calls++, ok()));
    let gap = 20_000;
    const loop = startSyncLoop({
      client: c,
      lockName: 'l',
      environment: env,
      interval: () => gap,
    });
    await settleMicrotasks();
    expect(calls).toBe(1);
    await env.advance(3000);
    gap = 10_000;
    loop.rearm();
    await env.advance(9999);
    expect(calls).toBe(1);
    await env.advance(1);
    expect(calls).toBe(2);
    loop.stop();
    loop.rearm();
    await env.advance(60_000);
    expect(calls).toBe(2);
  });

  it('does nothing on the interval while the page is hidden, and syncs when it is shown', async () => {
    const env = new FakeEnvironment();
    let calls = 0;
    const c = await client(async () => (calls++, ok()));
    const loop = startSyncLoop({
      client: c,
      lockName: 'l',
      environment: env,
      interval: () => 1000,
    });
    await settleMicrotasks();
    env.shown = false;
    await env.advance(5000);
    expect(calls).toBe(1);
    env.shown = true;
    env.fire('visible');
    await settleMicrotasks();
    expect(calls).toBe(2);
    loop.stop();
  });

  it('syncs after a write, once for a burst of them', async () => {
    const env = new FakeEnvironment();
    const sent: number[] = [];
    const c = await client(async (request) => (sent.push(request.outbox.length), ok()));
    const loop = startSyncLoop({
      client: c,
      lockName: 'l',
      environment: env,
      interval: () => 10 * 60_000,
    });
    await settleMicrotasks();
    await write(c);
    await write(c);
    await write(c);
    await env.advance(299);
    expect(sent).toEqual([0]);
    await env.advance(1);
    await settleMicrotasks();
    expect(sent).toEqual([0, 3]);
    loop.stop();
  });

  it('syncs when the tab regains focus and when the network returns', async () => {
    const env = new FakeEnvironment();
    let calls = 0;
    const c = await client(async () => (calls++, ok()));
    const loop = startSyncLoop({
      client: c,
      lockName: 'l',
      environment: env,
      interval: () => 10 * 60_000,
    });
    await settleMicrotasks();
    env.fire('focus');
    await settleMicrotasks();
    env.fire('online');
    await settleMicrotasks();
    expect(calls).toBe(3);
    loop.stop();
  });

  it('lets one tab sync at a time and the others find the lock taken', async () => {
    const env = new FakeEnvironment();
    let calls = 0;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const slow: Transport = async () => {
      calls++;
      await held;
      return ok();
    };
    const first = await client(slow);
    const second = await client(slow);
    const a = startSyncLoop({
      client: first,
      lockName: 'shopper:account',
      environment: env,
      interval: () => 10 * 60_000,
    });
    await settleMicrotasks();
    const b = startSyncLoop({
      client: second,
      lockName: 'shopper:account',
      environment: env,
      interval: () => 10 * 60_000,
    });
    await settleMicrotasks();
    expect(calls).toBe(1);
    release();
    await settleMicrotasks();
    // Once the first is done the lock is free again, and a second tab may sync.
    await b.syncNow();
    expect(calls).toBe(2);
    a.stop();
    b.stop();
  });

  it('backs off silently when offline, grows the wait, and believes a server that says when to come back', async () => {
    const env = new FakeEnvironment();
    const results: TransportResult[] = [
      { kind: 'offline' },
      { kind: 'offline' },
      { kind: 'rate-limited', retryAfterMs: 7000 },
      ok(),
    ];
    const outcomes: SyncOutcome[] = [];
    const at: number[] = [];
    const c = await client(async () => {
      at.push(env.now);
      return results.shift() ?? ok();
    });
    const loop = startSyncLoop({
      client: c,
      lockName: 'l',
      environment: env,
      interval: () => 60 * 60_000,
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    await settleMicrotasks();
    await env.advance(60_000);
    expect(outcomes.map((o) => o.status)).toEqual(['offline', 'offline', 'rate-limited', 'synced']);
    // 2s, then 4s (with random 0.5 the jitter is 1), then the server’s 7s.
    expect(at).toEqual([0, 2000, 6000, 13_000]);
    loop.stop();
  });

  it('stops and says so when the session has ended, keeping the outbox', async () => {
    const env = new FakeEnvironment();
    let calls = 0;
    let signedOut = 0;
    const c = await client(async () => (calls++, calls === 1 ? ok() : { kind: 'signed-out' }));
    const loop = startSyncLoop({
      client: c,
      lockName: 'l',
      environment: env,
      interval: () => 10 * 60_000,
      onSignedOut: () => signedOut++,
    });
    await settleMicrotasks();
    await write(c);
    await env.advance(300);
    await settleMicrotasks();
    expect(signedOut).toBe(1);
    expect(await c.pending()).toBe(1);
    await env.advance(60 * 60_000);
    expect(calls).toBe(2);
    loop.stop();
  });

  it('stops for a device that is too old, keeping the outbox', async () => {
    const env = new FakeEnvironment();
    let told = 0;
    const c = await client(async () => ({ kind: 'update-required' }));
    const loop = startSyncLoop({
      client: c,
      lockName: 'l',
      environment: env,
      onUpdateRequired: () => told++,
    });
    await settleMicrotasks();
    await write(c);
    expect(told).toBe(1);
    expect(await c.pending()).toBe(1);
    loop.stop();
  });
});

describe('a client and another tab', () => {
  it('hears of a write another tab made through the channel, so that the loop of whichever tab holds the lock sends it', async () => {
    const listeners: ((event: MessageEvent) => void)[] = [];
    const channel = {
      postMessage: (data: unknown) => listeners.forEach((l) => l({ data } as MessageEvent)),
      addEventListener: (_: string, l: (event: MessageEvent) => void) => listeners.push(l),
      removeEventListener: () => undefined,
      close: () => undefined,
    };
    const name = ID();
    accounts.push(name);
    const db = await openLocal(name);
    open.push(db);
    const a = new SyncClient({ db, transport: async () => ok(), channel: channel as never });
    const b = new SyncClient({ db, transport: async () => ok(), channel: channel as never });
    let heardWrites = 0;
    let heardChanges = 0;
    b.onWrite(() => heardWrites++);
    b.subscribe(() => heardChanges++);
    await db.put('household', {
      id: HOUSEHOLD,
      label: 'Home',
      own: true,
      role: 'admin',
      seq: 1,
      cursor: 1,
    });
    await write(a);
    expect(heardWrites).toBe(1);
    expect(heardChanges).toBeGreaterThan(0);
    expect(localName('x')).toBe('shopper-x');
  });
});
