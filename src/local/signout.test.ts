import { afterEach, describe, expect, it } from 'vitest';
import { PROTOCOL, type SyncAnswer } from '../sync/protocol';
import { SyncClient } from './client';
import { type LocalDatabase, deleteLocal, openLocal } from './db';
import { leaveDevice } from './signout';
import { closeDevices } from './test-support';
import type { Transport, TransportResult } from './transport';

const ID = () => crypto.randomUUID();
const open: LocalDatabase[] = [];
const accounts: string[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) db.close();
  for (const account of accounts.splice(0)) await deleteLocal(account);
  await closeDevices();
});
const databases = async () => (await indexedDB.databases()).map((db) => db.name);
const HOUSEHOLD = ID();

async function device(send: Transport) {
  const account = ID();
  accounts.push(account);
  const db = await openLocal(account);
  open.push(db);
  await db.put('household', {
    id: HOUSEHOLD,
    label: 'Home',
    own: true,
    role: 'admin',
    seq: 1,
    cursor: 1,
  });
  return { account, client: new SyncClient({ db, transport: send }), db };
}
const queue = (client: SyncClient) =>
  client.commit({
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

/** A transport that takes whatever it is sent and says it applied it. */
const accepting: Transport = async (request) => ({
  kind: 'ok',
  answer: {
    protocol: PROTOCOL,
    applied: (request.outbox as { mutationId: string }[]).map((m, i) => ({
      mutationId: m.mutationId,
      status: 'applied',
      seq: i + 1,
      folds: [],
    })),
    refused: [],
    gone: [],
    households: [],
    settings: { intervalSeconds: 20 },
  } satisfies SyncAnswer,
});
const offline: Transport = async (): Promise<TransportResult> => ({ kind: 'offline' });

describe('leaving a device', () => {
  it('sends what it can, ends the session, and deletes the account’s database, in that order', async () => {
    const d = await device(accepting);
    await queue(d.client);
    const order: string[] = [];
    const left = await leaveDevice({
      accountId: d.account,
      client: d.client,
      confirmLosing: async () => (order.push('asked'), true),
      endSession: async () => void order.push('ended'),
      announce: () => order.push('announced'),
    });
    expect(left).toEqual({ status: 'left' });
    expect(order).toEqual(['ended', 'announced']);
    expect(await databases()).not.toContain(`shopper-${d.account}`);
  });

  it('asks before losing changes it could not send, and stays if the person says to', async () => {
    const d = await device(offline);
    await queue(d.client);
    await queue(d.client);
    let asked = 0;
    let ended = 0;
    const left = await leaveDevice({
      accountId: d.account,
      client: d.client,
      confirmLosing: async (unsent) => ((asked = unsent), false),
      endSession: async () => void ended++,
    });
    expect(left).toEqual({ status: 'cancelled', unsent: 2 });
    expect(asked).toBe(2);
    expect(ended).toBe(0);
    expect(await databases()).toContain(`shopper-${d.account}`);
    expect(await d.client.pending()).toBe(2);
  });

  it('leaves anyway when the person says so', async () => {
    const d = await device(offline);
    await queue(d.client);
    const left = await leaveDevice({
      accountId: d.account,
      client: d.client,
      confirmLosing: async () => true,
      endSession: async () => undefined,
    });
    expect(left).toEqual({ status: 'left' });
    expect(await databases()).not.toContain(`shopper-${d.account}`);
  });

  it('changes nothing if the session cannot be ended, so that no one is left signed in with no data', async () => {
    const d = await device(accepting);
    await queue(d.client);
    const left = await leaveDevice({
      accountId: d.account,
      client: d.client,
      confirmLosing: async () => true,
      endSession: async () => {
        throw new Error('no network');
      },
    });
    expect(left).toEqual({ status: 'offline' });
    expect(await databases()).toContain(`shopper-${d.account}`);
  });

  it('deletes the database even when another tab holds it open, and leaves other accounts alone', async () => {
    const mine = await device(accepting);
    const theirs = await device(accepting);
    const another = await openLocal(mine.account);
    open.push(another);
    const left = await leaveDevice({
      accountId: mine.account,
      client: mine.client,
      confirmLosing: async () => true,
      endSession: async () => undefined,
    });
    expect(left).toEqual({ status: 'left' });
    const names = await databases();
    expect(names).not.toContain(`shopper-${mine.account}`);
    expect(names).toContain(`shopper-${theirs.account}`);
  });
});
