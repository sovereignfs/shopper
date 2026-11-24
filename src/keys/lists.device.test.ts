import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, callAs, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import { addItem, editItem } from '../actions/items';
import { makeList } from '../actions/lists';
import type { SyncedTable } from '../actions/format';
import { canonicalName } from '../catalog/canonical';
import type { Database } from '../db/client';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import { OPERATIONS } from '../households/ops';
import { SyncClient } from '../local/client';
import { type LocalDatabase, deleteLocal, localName, openLocal } from '../local/db';
import { failedOf, itemsOf, listsOf, productsOf } from '../local/store';
import { type Wire, serverTransport } from '../local/test-support';
import type { EndpointDeps } from '../sync/endpoint';
import {
  deriveListKeyring,
  listNameKey,
  newKeyring,
  sealField,
  wrapKeyring,
  wrapListKeyring,
} from './household';
import { moveHousehold, moveManifest } from './server/move';
import { EncryptionMemory, encryptingTransport } from './transport';

/**
 * **A list's keys on a device** (RFC 0004, task 21.4): the device's own transport, encrypting and opening, against the server, for a group that has moved.
 * What a move between lists, its Undo, an edit and a move waiting together, and being taken off a list while offline do there.
 */
const { leg } = testTarget();
let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());

const opened: LocalDatabase[] = [];
const names: string[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await deleteLocal('', name);
});

const deps = (): EndpointDeps => ({
  database,
  ring: TEST_RING,
  limits: {
    householdMembers: 20,
    accountHouseholds: 20,
    householdLists: 100,
    listOpenItems: 500,
    householdProducts: 5000,
    inventoryItems: 5000,
  },
  intervalSeconds: 20,
});
let clock = 1_900_000_000_000;
const env = (): Env => ({ now: (clock += 1000), newId: () => crypto.randomUUID() });
const appKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const memoryStore = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

/** A client as the page makes one (`react.tsx`): the same lookups for a row's list and an item's content, over a database that may be opened again. */
function clientOf(db: LocalDatabase, who: Someone, key: CryptoKey, wire: Wire) {
  const memory = new EncryptionMemory(memoryStore(), `k-${who.accountId}`);
  return new SyncClient({
    db,
    transport: encryptingTransport(
      serverTransport(deps, who, wire),
      { appKey: () => key },
      memory,
      async (table: SyncedTable, id: string) => {
        if (table !== 'item' && table !== 'product') return undefined;
        const shadow = await db.get('shadow', [table, id]);
        const row = shadow ? shadow.row : await db.get(table, id);
        const list = (row as { listId?: string | null } | null | undefined)?.listId;
        return typeof list === 'string' ? list : undefined;
      },
      undefined,
      async (id) => {
        const item = await db.get('item', id);
        return item ? { name: item.name, note: item.note } : undefined;
      },
    ),
    now: () => (clock += 1000),
  });
}

async function deviceOf(who: Someone, key: CryptoKey) {
  const name = localName(`${who.accountId}-${crypto.randomUUID()}`);
  names.push(name);
  const db = await openLocal('', name);
  opened.push(db);
  const wire: Wire = { offline: false, requests: [] };
  return { db, wire, client: clientOf(db, who, key, wire) };
}

/** Moves a person's group to content their device encrypts, as `Mover` does, with a second list, Hardware. */
async function encrypted(who: Someone, key: CryptoKey) {
  const made = makeList(env(), { householdId: who.household, name: 'Hardware', position: 'a5' });
  const plain = await deviceOf(who, key);
  await plain.client.sync();
  await plain.client.commit(made);
  await plain.client.sync();
  const manifest = await moveManifest(deps(), who.household, who.accountId);
  if (!manifest) throw new Error('not movable');
  const ring = newKeyring();
  const rows: Record<
    string,
    { id: string; fields: Record<string, string | null>; nameKey?: string }[]
  > = {};
  for (const table of ['list', 'item', 'product'] as const) {
    rows[table] = [];
    for (const row of manifest.rows[table]) {
      const keys = await deriveListKeyring(ring, row.list);
      const fields: Record<string, string | null> = {};
      for (const [field, value] of Object.entries(row.fields))
        fields[field] =
          value === null
            ? null
            : await sealField(keys, { list: row.list, table, row: row.id, field }, value);
      rows[table].push({
        id: row.id,
        fields,
        ...(table === 'product'
          ? { nameKey: await listNameKey(keys, row.list, canonicalName(row.fields.name ?? '')) }
          : {}),
      });
    }
  }
  const moved = await moveHousehold(deps(), who.household, who.accountId, {
    seq: manifest.seq,
    keyring: await wrapKeyring(key, ring, { person: manifest.person, household: who.household }),
    rows: rows as never,
  });
  if (!moved.ok) throw new Error(moved.why);
  return { ring, hardware: made.changes[0]?.id ?? '' };
}

const groceriesOf = async (db: LocalDatabase, who: Someone) => {
  const list = (await listsOf(db, who.household)).find((each) => each.id === who.list);
  if (!list) throw new Error('no Groceries');
  return list;
};

describe(`a list’s keys on a device (${leg})`, () => {
  it('moves an item to another list and back by Undo, encrypted each time for the list it is on', async () => {
    const ada = await somebody(database, 'Ada-move');
    const key = await appKey();
    const { hardware } = await encrypted(ada, key);
    const d = await deviceOf(ada, key);
    await d.client.sync();
    await d.client.commit(
      addItem(env(), {
        list: await groceriesOf(d.db, ada),
        name: 'Torch',
        last: null,
        by: ada.personId,
      }),
    );
    await d.client.sync();
    const torch = (await itemsOf(d.db, ada.list))[0];
    if (!torch) throw new Error('no item');
    const products = await productsOf(d.db, ada.household);
    const undo = await d.client.commit(
      editItem(env(), torch, { listId: hardware }, undefined, {
        product: products.find((each) => each.id === torch.productId),
        products,
      }),
    );
    await d.client.sync();
    expect((await itemsOf(d.db, hardware)).map((each) => each.name)).toEqual(['Torch']);
    // Undo sends the list and the product back, and nothing else: the device sends the name and note again, for Groceries.
    await d.client.commit(undo);
    await d.client.sync();
    expect(await failedOf(d.db)).toEqual([]);
    // Another device of Ada's opens it where it is.
    const other = await deviceOf(ada, key);
    await other.client.sync();
    expect((await itemsOf(other.db, ada.list)).map((each) => each.name)).toEqual(['Torch']);
  });

  it('sends an edit and a move that waited together, each encrypted for the list the item is on at that point', async () => {
    const ada = await somebody(database, 'Ada-wait');
    const key = await appKey();
    const { hardware } = await encrypted(ada, key);
    const d = await deviceOf(ada, key);
    await d.client.sync();
    await d.client.commit(
      addItem(env(), {
        list: await groceriesOf(d.db, ada),
        name: 'Glue',
        last: null,
        by: ada.personId,
      }),
    );
    await d.client.sync();
    d.wire.offline = true;
    const glue = (await itemsOf(d.db, ada.list))[0];
    if (!glue) throw new Error('no item');
    await d.client.commit(editItem(env(), glue, { note: 'the strong one' }));
    const noted = (await itemsOf(d.db, ada.list))[0];
    if (!noted) throw new Error('no item');
    const products = await productsOf(d.db, ada.household);
    await d.client.commit(
      editItem(env(), noted, { listId: hardware }, undefined, {
        product: products.find((each) => each.id === noted.productId),
        products,
      }),
    );
    d.wire.offline = false;
    await d.client.sync();
    expect(await failedOf(d.db)).toEqual([]);
    const other = await deviceOf(ada, key);
    await other.client.sync();
    expect((await itemsOf(other.db, hardware)).map((each) => [each.name, each.note])).toEqual([
      ['Glue', 'the strong one'],
    ]);
  });

  it('puts what waited for a list the person was taken off into Couldn’t sync, after the page is opened again', async () => {
    const ada = await somebody(database, 'Ada-gone');
    const grace = await somebody(database, 'Grace-gone');
    const adaKey = await appKey();
    const graceKey = await appKey();
    const { ring } = await encrypted(ada, adaKey);
    // Grace is given Groceries, and keeps her copy of its keys, as a link does.
    const link = await import('../households/invitations');
    const made = await link.createInvitation(database, {
      household: ada.household,
      list: ada.list,
      accountId: ada.accountId,
      personId: ada.personId,
      now: Date.now(),
      wrappedKey: `lk2.${'a'.repeat(16)}.${'b'.repeat(32)}`,
    });
    if (!made.ok) throw new Error(made.refused);
    const joined = await link.acceptInvitation(database, TEST_RING, {
      token: made.token,
      accountId: grace.accountId,
      limits: deps().limits,
      now: Date.now(),
    });
    if (joined.status !== 'joined') throw new Error(joined.status);
    const record = await wrapListKeyring(graceKey, await deriveListKeyring(ring, ada.list), {
      person: grace.personId,
      list: ada.list,
    });
    expect(
      (
        await callAs(database, OPERATIONS, grace, {
          op: 'list.key.mine',
          household: ada.household,
          list: ada.list,
          record,
        })
      ).status,
    ).toBe(200);
    const g = await deviceOf(grace, graceKey);
    await g.client.sync();
    expect((await listsOf(g.db, ada.household)).map((each) => each.id)).toEqual([ada.list]);

    // Offline, Grace adds; meanwhile she is taken off Groceries, Ada's only list she was on.
    g.wire.offline = true;
    await g.client.commit(
      addItem(env(), {
        list: await groceriesOf(g.db, ada),
        name: 'Pegs',
        last: null,
        by: grace.personId,
      }),
    );
    expect(
      (
        await callAs(database, OPERATIONS, ada, {
          op: 'member.remove',
          household: ada.household,
          list: ada.list,
          person: grace.personId,
        })
      ).status,
    ).toBe(200);

    // The page is opened again: a new client, which has heard of nothing yet, over the same store.
    const wire: Wire = { offline: false, requests: [] };
    const again = clientOf(g.db, grace, graceKey, wire);
    await again.sync();
    await again.sync();
    const failed = await failedOf(g.db);
    expect(failed.map((each) => each.what)).toEqual(['Added Pegs']);
    expect(await again.pending()).toBe(0);
  });
});
