import { describe, expect, it } from 'vitest';
import type { Mutation } from '../actions/format';
import type { HouseholdPull, SyncAnswer, SyncRequest } from '../sync/protocol';
import {
  deriveListKeyring,
  newKeyring,
  openField,
  wrapKeyring,
  wrapListKeyring,
} from './household';
import { addPending } from './pending';
import {
  EncryptionMemory,
  type ListOf,
  encryptMutation,
  encryptingTransport,
  openPull,
} from './transport';

const H = '11111111-1111-4111-8111-111111111111';
const P = '44444444-4444-4444-8444-444444444444';
const ROW = '22222222-2222-4222-8222-222222222222';
const LIST = '55555555-5555-4555-8555-555555555555';
const OTHER_LIST = '66666666-6666-4666-8666-666666666666';
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
const noRows: ListOf = async () => undefined;
const mutation = (name: string, list = LIST): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: H,
  changes: [
    { table: 'product', id: ROW, create: true, fields: { listId: list, name, createdAt: 1 } },
  ],
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

describe('a mutation to a moved group', () => {
  it('goes with its content encrypted for its list and row and a name key, and no plain text', async () => {
    const ring = await deriveListKeyring(newKeyring(), LIST);
    const sent = await encryptMutation(
      mutation(`Oat milk ${MARKER}`),
      async (list) => (list === LIST ? ring : undefined),
      noRows,
    );
    const fields = sent?.changes[0]?.fields ?? {};
    expect(JSON.stringify(sent)).not.toContain(MARKER);
    expect(String(fields.nameKey)).toMatch(/^n3\./);
    expect(
      await openField(
        ring,
        { list: LIST, table: 'product', row: ROW, field: 'name' },
        String(fields.name),
      ),
    ).toBe(`Oat milk ${MARKER}`);
  });

  it('is encrypted for the list an edited row is on, read from the device', async () => {
    const ring = await deriveListKeyring(newKeyring(), LIST);
    const edit: Mutation = {
      mutationId: crypto.randomUUID(),
      householdId: H,
      changes: [{ table: 'item', id: ROW, fields: { note: 'ripe' } }],
    };
    const sent = await encryptMutation(
      edit,
      async (list) => (list === LIST ? ring : undefined),
      async (table, id) => (table === 'item' && id === ROW ? LIST : undefined),
    );
    expect(String(sent?.changes[0]?.fields.note).split('.')[2]).toBe(LIST);
    // A list with no keys here: nothing to send.
    expect(
      await encryptMutation(
        edit,
        async () => undefined,
        async () => LIST,
      ),
    ).toBeUndefined();
  });
});

describe('the transport', () => {
  it('sends a group it has not seen move as it is, and holds one it has seen move while its key is locked, with its cursor kept', async () => {
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
    const transport = encryptingTransport(inner, { appKey: () => held.key }, memory, noRows);
    const request = { version: 2, outbox: [mutation('tea')], cursors: { [H]: 3 } };

    // Not seen moving yet: as it is.
    const first = await transport(request);
    expect((sent[0]?.outbox[0] as Mutation).changes[0]?.fields.name).toBe('tea');
    // The answer said it moved, and the key is locked: the group is left out, so its cursor stays where it was.
    expect(first.kind === 'ok' && first.answer.households).toEqual([]);
    expect(memory.isEncrypted(H)).toBe(true);

    // Locked: nothing of it is sent.
    await transport(request);
    expect(sent[1]?.outbox).toEqual([]);

    // Open: it is sent encrypted under the list's keys, derived from the group's, and its rows come back opened.
    held.key = key;
    const third = await transport(request);
    expect(JSON.stringify(sent[2]?.outbox)).not.toContain('"tea"');
    expect(third.kind === 'ok' && third.answer.households.length).toBe(1);
  });

  it('remembers a group moved across a restart, and never sends it plain text again', async () => {
    const kept = storage();
    new EncryptionMemory(kept, 'k').markEncrypted(H);
    const memory = new EncryptionMemory(kept, 'k');
    const sent: SyncRequest[] = [];
    const transport = encryptingTransport(
      async (request) => (sent.push(request), { kind: 'ok' as const, answer: answerOf([]) }),
      { appKey: () => undefined },
      memory,
      noRows,
    );
    await transport({ version: 2, outbox: [mutation(`rice ${MARKER}`)], cursors: {} });
    expect(JSON.stringify(sent)).not.toContain(MARKER);
  });

  it('refuses a change for a list it holds no keys of, into Couldn’t sync, and sends what came after it (RFC 0004)', async () => {
    // Someone on Groceries by a link, whose change to Hardware waited offline while they were taken off Hardware; then the page was opened again.
    const key = await appKey();
    const groceries = await deriveListKeyring(newKeyring(), LIST);
    const record = await wrapListKeyring(key, groceries, { person: P, list: LIST });
    const kept = storage();
    new EncryptionMemory(kept, 'k').markEncrypted(H);
    const memory = new EncryptionMemory(kept, 'k');
    const sent: SyncRequest[] = [];
    const transport = encryptingTransport(
      async (request) => (
        sent.push(request),
        {
          kind: 'ok' as const,
          answer: answerOf([
            pullOf({
              encryption: {
                state: 'encrypted',
                epoch: 1,
                keyring: null,
                lists: { [LIST]: record },
                person: P,
              },
            }),
          ]),
        }
      ),
      { appKey: () => key },
      memory,
      noRows,
    );
    const stale = mutation(`nails ${MARKER}`, OTHER_LIST);
    const fresh = mutation('milk', LIST);
    const request = { version: 2, outbox: [stale, fresh], cursors: { [H]: 3 } };

    // Not heard of since the page opened: held, not refused, since its keys may be on their way.
    const first = await transport(request);
    expect(sent[0]?.outbox).toEqual([]);
    expect(first.kind === 'ok' && first.answer.refused).toEqual([]);

    // Heard of: the change to Hardware is refused here, kept on the device; Groceries' goes, encrypted.
    const second = await transport(request);
    expect(second.kind === 'ok' && second.answer.refused.map((r) => r.mutationId)).toEqual([
      stale.mutationId,
    ]);
    expect((sent[1]?.outbox as Mutation[]).map((m) => m.mutationId)).toEqual([fresh.mutationId]);
    expect(JSON.stringify(sent)).not.toContain(MARKER);
  });

  it('refuses a change to Inventory whose group keys are not here, in words about Inventory and not a list', async () => {
    const key = await appKey();
    const kept = storage();
    new EncryptionMemory(kept, 'k').markEncrypted(H);
    const memory = new EncryptionMemory(kept, 'k');
    const transport = encryptingTransport(
      async () => ({
        kind: 'ok' as const,
        answer: answerOf([
          pullOf({ encryption: { state: 'encrypted', epoch: 1, keyring: null, person: P } }),
        ]),
      }),
      { appKey: () => key },
      memory,
      noRows,
    );
    const inventory: Mutation = {
      mutationId: crypto.randomUUID(),
      householdId: H,
      changes: [
        {
          table: 'inventory_item',
          id: ROW,
          create: true,
          fields: { name: 'Zorblax', createdAt: 1 },
        },
      ],
    };
    const request = { version: 2, outbox: [inventory], cursors: { [H]: 3 } };
    await transport(request);
    const second = await transport(request);
    const refused = second.kind === 'ok' ? second.answer.refused : [];
    expect(refused.map((r) => r.mutationId)).toEqual([inventory.mutationId]);
    expect(refused[0]?.sentence).toMatch(/Inventory/);
    expect(refused[0]?.sentence).not.toMatch(/list/i);
  });

  it('uses a copy of a list’s keys the server has not taken yet', async () => {
    const key = await appKey();
    const groceries = await deriveListKeyring(newKeyring(), LIST);
    const kept = storage();
    addPending(kept, {
      household: H,
      list: LIST,
      person: P,
      record: await wrapListKeyring(key, groceries, { person: P, list: LIST }),
    });
    const memory = new EncryptionMemory(kept, 'k');
    expect((await memory.listKeyring(H, LIST, key))?.[1]).toEqual(groceries[1]);
  });
});

describe('a moved group’s pull', () => {
  it('opens each row under its list’s keys, and leaves the whole page out if one value is another row’s', async () => {
    const ring = await deriveListKeyring(newKeyring(), LIST);
    const ringOf = async (list: string) => (list === LIST ? ring : undefined);
    const own = await encryptMutation(mutation('bread'), ringOf, noRows);
    const name = String(own?.changes[0]?.fields.name);
    const pull = pullOf({ products: [{ id: ROW, listId: LIST, name: '', encrypted: { name } }] });
    expect((await openPull(ringOf, pull))?.products[0]?.name).toBe('bread');
    const elsewhere = pullOf({
      products: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          listId: LIST,
          name: '',
          encrypted: { name },
        },
      ],
    });
    expect(await openPull(ringOf, elsewhere)).toBeUndefined();
  });
});
