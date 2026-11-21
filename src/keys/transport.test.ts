import { describe, expect, it } from 'vitest';
import type { Mutation } from '../actions/format';
import type { HouseholdPull, SyncAnswer, SyncRequest } from '../sync/protocol';
import { newKeyring, openField, wrapKeyring } from './household';
import { EncryptionMemory, encryptMutation, encryptingTransport, openPull } from './transport';

const H = '11111111-1111-4111-8111-111111111111';
const P = '44444444-4444-4444-8444-444444444444';
const ROW = '22222222-2222-4222-8222-222222222222';
const MARKER = 'MARKERzz9';

const appKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const storage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};
const mutation = (name: string): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: H,
  changes: [{ table: 'product', id: ROW, create: true, fields: { name, createdAt: 1 } }],
});
const pullOf = (over: Partial<HouseholdPull>): HouseholdPull => ({
  household: H,
  cursor: 5,
  more: false,
  view: { label: 'x', own: true, role: 'admin', seq: 5 },
  encryption: { state: 'encrypted', epoch: 1, keyring: null, person: null },
  lists: [],
  items: [],
  products: [],
  categories: [],
  members: [{ personId: P, self: true }],
  tombstones: [],
  aliases: [],
  ...over,
});
const answerOf = (households: HouseholdPull[]): SyncAnswer => ({
  protocol: 2,
  applied: [],
  refused: [],
  households,
  gone: [],
  settings: { intervalSeconds: 20 },
});

describe('a mutation to a moved household', () => {
  it('goes with its content encrypted for its row and a name key, and no plain text', async () => {
    const ring = newKeyring();
    const sent = await encryptMutation(ring, mutation(`Oat milk ${MARKER}`));
    const fields = sent.changes[0]?.fields ?? {};
    expect(JSON.stringify(sent)).not.toContain(MARKER);
    expect(String(fields.nameKey)).toMatch(/^n2\./);
    expect(
      await openField(
        ring,
        { household: H, table: 'product', row: ROW, field: 'name' },
        String(fields.name),
      ),
    ).toBe(`Oat milk ${MARKER}`);
  });
});

describe('the transport', () => {
  it('sends a household it has not seen move as it is, and holds one it has seen move while its key is locked, with its cursor kept', async () => {
    const memory = new EncryptionMemory(storage(), 'k');
    const sent: SyncRequest[] = [];
    const ring = newKeyring();
    const key = await appKey();
    const record = await wrapKeyring(key, ring, { person: P, household: H });
    const inner = async (request: SyncRequest) => {
      sent.push(request);
      return {
        kind: 'ok' as const,
        answer: answerOf([
          pullOf({ encryption: { state: 'encrypted', epoch: 1, keyring: record, person: P } }),
        ]),
      };
    };
    const held: { key?: CryptoKey } = {};
    const transport = encryptingTransport(inner, { appKey: () => held.key }, memory);
    const request = { version: 2, outbox: [mutation('tea')], cursors: { [H]: 3 } };

    // Not seen moving yet: as it is.
    const first = await transport(request);
    expect((sent[0]?.outbox[0] as Mutation).changes[0]?.fields.name).toBe('tea');
    // The answer said it moved, and the key is locked: the household is left out, so its cursor stays where it was.
    expect(first.kind === 'ok' && first.answer.households).toEqual([]);
    expect(memory.isEncrypted(H)).toBe(true);

    // Locked: nothing of it is sent.
    await transport(request);
    expect(sent[1]?.outbox).toEqual([]);

    // Open: it is sent encrypted, and its rows come back opened.
    held.key = key;
    const third = await transport(request);
    expect(JSON.stringify(sent[2]?.outbox)).not.toContain('"tea"');
    expect(third.kind === 'ok' && third.answer.households.length).toBe(1);
  });

  it('remembers a household moved across a restart, and never sends it plain text again', async () => {
    const kept = storage();
    new EncryptionMemory(kept, 'k').markEncrypted(H);
    const memory = new EncryptionMemory(kept, 'k');
    const sent: SyncRequest[] = [];
    const transport = encryptingTransport(
      async (request) => (sent.push(request), { kind: 'ok' as const, answer: answerOf([]) }),
      { appKey: () => undefined },
      memory,
    );
    await transport({ version: 2, outbox: [mutation(`rice ${MARKER}`)], cursors: {} });
    expect(JSON.stringify(sent)).not.toContain(MARKER);
  });
});

describe('a moved household’s pull', () => {
  it('opens each row for itself, and leaves the whole page out if one value is another row’s', async () => {
    const ring = newKeyring();
    const own = await encryptMutation(ring, mutation('bread'));
    const name = String(own.changes[0]?.fields.name);
    const pull = pullOf({ products: [{ id: ROW, name: '', encrypted: { name } }] });
    expect((await openPull(ring, pull))?.products[0]?.name).toBe('bread');
    const elsewhere = pullOf({
      products: [{ id: '33333333-3333-4333-8333-333333333333', name: '', encrypted: { name } }],
    });
    expect(await openPull(ring, elsewhere)).toBeUndefined();
  });
});
