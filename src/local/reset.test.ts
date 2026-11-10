import { afterEach, describe, expect, it } from 'vitest';
import { PROTOCOL, type SyncAnswer } from '../sync/protocol';
import { SyncClient } from './client';
import { type LocalDatabase, deleteLocal, openLocal } from './db';
import { resetDevice } from './reset';
import { closeDevices } from './test-support';
import type { Transport } from './transport';

const ID = () => crypto.randomUUID();
const HOUSEHOLD = ID();
const open: LocalDatabase[] = [];
const accounts: string[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) db.close();
  for (const account of accounts.splice(0)) await deleteLocal(account);
  await closeDevices();
});
const databases = async () => (await indexedDB.databases()).map((db) => db.name);

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
const answer = (over: Partial<SyncAnswer>): SyncAnswer => ({
  protocol: PROTOCOL,
  applied: [],
  refused: [],
  gone: [],
  households: [],
  settings: { intervalSeconds: 20 },
  ...over,
});

describe('resetting a device', () => {
  it('sends what it can and deletes the database, without asking when nothing would be lost', async () => {
    const d = await device(async (request) => ({
      kind: 'ok',
      answer: answer({
        applied: (request.outbox as { mutationId: string }[]).map((m) => ({
          mutationId: m.mutationId,
          status: 'applied',
          seq: 2,
          folds: [],
        })),
      }),
    }));
    await queue(d.client);
    let asked = 0;
    expect(
      await resetDevice({
        accountId: d.account,
        client: d.client,
        confirmLosing: async () => (asked++, true),
      }),
    ).toEqual({ status: 'reset' });
    expect(asked).toBe(0);
    expect(await databases()).not.toContain(`shopper-${d.account}`);
  });

  it('asks, with both numbers, about what was refused and what could not be sent, and keeps everything if the person says no', async () => {
    let calls = 0;
    const d = await device(async (request) => {
      calls++;
      const ids = (request.outbox as { mutationId: string }[]).map((m) => m.mutationId);
      // The first is refused, and so lands in Couldn't sync; the rest cannot be sent at all.
      return calls === 1
        ? {
            kind: 'ok',
            answer: answer({
              refused: ids
                .slice(0, 1)
                .map((mutationId) => ({ mutationId, reason: 'limit', sentence: 'Too many.' })),
            }),
          }
        : { kind: 'offline' };
    });
    await queue(d.client);
    await d.client.sync();
    await queue(d.client);
    let said: [number, number] | undefined;
    const result = await resetDevice({
      accountId: d.account,
      client: d.client,
      confirmLosing: async (unsent, refused) => ((said = [unsent, refused]), false),
    });
    expect(result).toEqual({ status: 'cancelled', unsent: 1, refused: 1 });
    expect(said).toEqual([1, 1]);
    expect(await databases()).toContain(`shopper-${d.account}`);
    expect(await d.client.failedCount()).toBe(1);
  });

  it('goes on when the person says yes', async () => {
    const d = await device(async () => ({ kind: 'offline' }));
    await queue(d.client);
    expect(
      await resetDevice({
        accountId: d.account,
        client: d.client,
        confirmLosing: async () => true,
      }),
    ).toEqual({ status: 'reset' });
    expect(await databases()).not.toContain(`shopper-${d.account}`);
  });
});
