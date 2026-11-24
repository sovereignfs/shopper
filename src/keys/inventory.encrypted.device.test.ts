import 'fake-indexeddb/auto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Env } from '../actions/env';
import { makeCategory, renameCategory } from '../actions/categories';
import type { Mutation } from '../actions/format';
import {
  changeInventoryItem,
  deleteInventoryItem,
  hideInventoryItem,
  makeInventoryItem,
  overrideStarterEntry,
} from '../actions/inventory';
import { canonicalName } from '../catalog/canonical';
import { starterEntryByKey } from '../catalog/starter';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { SyncClient } from '../local/client';
import { type LocalDatabase, deleteLocal, localName, openLocal } from '../local/db';
import { rowListOf } from '../local/row-list';
import { failedOf, inventoryOf, ownerCategoriesOf } from '../local/store';
import { type Wire, serverTransport } from '../local/test-support';
import type { EndpointDeps } from '../sync/endpoint';
import {
  type Keyring,
  deriveInventoryKeyring,
  deriveListKeyring,
  deviceInventoryNameKey,
  openField,
} from './household';
import { Mover } from './mover';
import { moveHousehold, moveInput, moveManifest } from './server/move';
import { EncryptionMemory, encryptingTransport } from './transport';

/**
 * **A person's Inventory in a group that has moved, on their devices** (task 23.3, step 4; DESIGN.md §13): the device's own transport and the real `Mover`
 * against the server. What was made before the move goes with the group and opens on another device; what is made, renamed and given back to the starter after
 * it reaches a second device; two devices that made one thing become one row, and its second note opens through the alias; nobody else has any of it; and the
 * server holds nothing of it in plain text. The marker is a word that must be in no row.
 */
const { leg } = testTarget();
const MARKER = 'MARKERdev5Basil';
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
    householdCategories: 100,
    accountCards: 100,
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

/** A device as the page makes one (`react.tsx`), its encryption memory its own, over a store that is opened again for each. */
async function deviceOf(who: Someone, key: CryptoKey) {
  const name = localName(`${who.accountId}-${crypto.randomUUID()}`);
  names.push(name);
  const db = await openLocal('', name);
  opened.push(db);
  const wire: Wire = { offline: false, requests: [] };
  const memory = new EncryptionMemory(memoryStore(), `k-${crypto.randomUUID()}`);
  const client = new SyncClient({
    db,
    transport: encryptingTransport(
      serverTransport(deps, who, wire),
      { appKey: () => key },
      memory,
      rowListOf(db),
      undefined,
      async (id) => {
        const item = await db.get('item', id);
        return item ? { name: item.name, note: item.note } : undefined;
      },
      async (id) => (await db.get('inventory_item', id))?.starterKey,
    ),
    now: () => (clock += 1000),
  });
  return { db, wire, client, memory, key };
}
type Dev = Awaited<ReturnType<typeof deviceOf>>;

/** What the page's fetch is to the move routes (`app/api/keys/move/route.ts`), answered by the server's own functions for one account. */
const moveFetch =
  (who: Someone, posted: unknown[] = []): typeof fetch =>
  async (input, init) => {
    const url = new URL(String(input), 'http://shopper.test');
    if (!init?.method || init.method === 'GET') {
      const manifest = await moveManifest(
        { database, ring: TEST_RING },
        url.searchParams.get('household') ?? '',
        who.accountId,
      );
      return manifest
        ? Response.json({ ok: true, ...manifest })
        : Response.json({ ok: false }, { status: 404 });
    }
    const body: unknown = JSON.parse(String(init.body));
    posted.push(body);
    const parsed = moveInput.safeParse(body);
    const household = (body as { household?: string }).household ?? '';
    if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
    const result = await moveHousehold(
      { database, ring: TEST_RING },
      household,
      who.accountId,
      parsed.data,
    );
    return Response.json(result, {
      status: result.ok ? 200 : result.why === 'not-movable' ? 404 : 409,
    });
  };

const inventory = (d: Dev) => d.client.read(inventoryOf);
const shown = async (d: Dev) =>
  (await inventory(d))
    .map((row) => [row.name, row.note, row.starterKey, row.recurring, row.hidden, row.deletedAt])
    .sort((a, b) => String(a[0] ?? a[2]).localeCompare(String(b[0] ?? b[2])));
const categories = (d: Dev, who: Someone) =>
  d.client.read((db) => ownerCategoriesOf(db, who.household));
const serverCategories = (who: Someone) =>
  dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'category')} WHERE household_id = ${who.household} ORDER BY id`,
  );
const serverRows = (who: Someone) =>
  dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'inventory_item')} WHERE household_id = ${who.household} ORDER BY id`,
  );
const ringOf = async (d: Dev, who: Someone): Promise<Keyring> => {
  const group = await d.memory.keyring(who.household, d.key);
  if (!group) throw new Error('no keyring');
  return group;
};

/** A person with Inventory made in plain mode, moved with their group by the real `Mover`, and a device that has seen it move. */
async function moved(name: string) {
  const who = await somebody(database, name);
  const key = await appKey();
  const first = await deviceOf(who, key);
  await first.client.sync();
  const flour = makeInventoryItem(env(), {
    householdId: who.household,
    name: `Oat flour ${MARKER}`,
    note: `strong ${MARKER}`,
    recurring: true,
  });
  await first.client.commit(flour);
  await first.client.commit(
    overrideStarterEntry(env(), { householdId: who.household, starterKey: 'bread', hidden: true }),
  );
  await first.client.commit(
    makeInventoryItem(env(), { householdId: who.household, name: `Old thing ${MARKER}` }),
  );
  // Their categories (§8.3): one of their own, and a name they gave the starter _Produce_.
  await first.client.commit(
    makeCategory(env(), { householdId: who.household, name: `Garden ${MARKER}`, last: null }),
  );
  const produce = (await categories(first, who)).find((row) => row.starterKey === 'produce');
  if (!produce) throw new Error('no starter category');
  await first.client.commit(
    renameCategory(env(), produce, `Fruit and veg ${MARKER}`) ?? (undefined as never),
  );
  await first.client.sync();
  const old = (await inventory(first)).find((row) => row.name === `Old thing ${MARKER}`);
  if (!old) throw new Error('no row');
  await first.client.commit(deleteInventoryItem(env(), old) ?? (undefined as never));
  await first.client.sync();
  const mover = new Mover(first.memory, moveFetch(who));
  expect(await mover.run([who.household], key)).toBe(true);
  await first.client.sync();
  return { who, key, first, flourId: flour.changes[0]?.id ?? '' };
}

describe(`a person’s Inventory in a group that has moved (${leg})`, () => {
  it('goes with the group when it moves: encrypted for the group under its Inventory keys, opened on the device that moved it and on another, and nowhere in plain text', async () => {
    const { who, key, first, flourId } = await moved('Ada-moves');
    const rows = await serverRows(who);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.sealed).toBe('');
      expect(String(row.name_key)).toMatch(/^n3\./);
      expect(JSON.stringify(row)).not.toContain(MARKER);
    }
    // The deleted one is a tombstone's: still a row on the server, encrypted like the rest, and not shown.
    expect(rows.filter((row) => row.deleted_at !== null)).toHaveLength(1);
    const expected = [
      [null, null, 'bread', false, true, null],
      [`Oat flour ${MARKER}`, `strong ${MARKER}`, null, true, false, null],
    ];
    expect(await shown(first)).toEqual(expected);
    // Another device of the account, given only the app key, opens it all from the server.
    const second = await deviceOf(who, key);
    await second.client.sync();
    expect(await shown(second)).toEqual(expected);
    // Their categories went with the group: the two that held a name are ciphertext for the group, no other starter category was touched, and the second device
    // reads the names.
    const named = (await serverCategories(who)).filter((row) => row.encrypted !== null);
    expect(named).toHaveLength(2);
    for (const row of named) {
      expect(row.sealed).toBe('');
      expect(JSON.stringify(row)).not.toContain(MARKER);
    }
    expect(
      (await serverCategories(who)).some((row) => row.sealed !== '' && row.sealed !== null),
    ).toBe(false);
    for (const d of [first, second]) {
      const mine = await categories(d, who);
      expect(mine.find((row) => row.starterKey === 'produce')?.name).toBe(
        `Fruit and veg ${MARKER}`,
      );
      expect(mine.find((row) => row.starterKey === null)?.name).toBe(`Garden ${MARKER}`);
      expect(mine.find((row) => row.starterKey === 'bakery')?.name).toBe('Bakery');
    }
    expect(await failedOf(second.db)).toEqual([]);
    // Derived here, apart from the code under test: the group's Inventory keys open a value the transport wrote, and a list's derivation with the group's id, which is
    // what a careless call would use, does not.
    const group = await ringOf(second, who);
    const stored = rows.find((row) => row.id === flourId);
    const note = (JSON.parse(String(stored?.encrypted)) as Record<string, string>).note ?? '';
    const at = { list: who.household, table: 'inventory_item', row: flourId, field: 'note' };
    expect(await openField(await deriveInventoryKeyring(group, who.household), at, note)).toBe(
      `strong ${MARKER}`,
    );
    expect(
      await openField(await deriveListKeyring(group, who.household), at, note),
    ).toBeUndefined();
    expect(await openField(await deriveListKeyring(group, who.list), at, note)).toBeUndefined();
  });

  it('is made, renamed, given back to the starter’s name and changed offline, and reaches a second device, with the name keys the devices made', async () => {
    const { who, key, first } = await moved('Ada-after');
    const second = await deviceOf(who, key);
    await second.client.sync();
    first.wire.offline = true;
    await first.client.commit(
      makeInventoryItem(env(), {
        householdId: who.household,
        name: `Dish soap ${MARKER}`,
        note: `lemon ${MARKER}`,
      }),
    );
    await first.client.commit(
      overrideStarterEntry(env(), {
        householdId: who.household,
        starterKey: 'rice',
        name: `Brown rice ${MARKER}`,
      }),
    );
    expect((await inventory(first)).find((row) => row.starterKey === 'rice')?.name).toBe(
      `Brown rice ${MARKER}`,
    );
    first.wire.offline = false;
    await first.client.sync();
    await second.client.sync();
    const group = await ringOf(first, who);
    const inventoryRing = await deriveInventoryKeyring(group, who.household);
    const keyOf = (name: string) =>
      deviceInventoryNameKey(inventoryRing, who.household, canonicalName(name));
    const keys = async () =>
      Object.fromEntries(
        (await serverRows(who)).map((row) => [String(row.id), String(row.name_key)]),
      );
    const rice = (await inventory(second)).find((row) => row.starterKey === 'rice');
    if (!rice) throw new Error('no override');
    expect((await keys())[rice.id]).toBe(await keyOf(`Brown rice ${MARKER}`));
    // Given back to the starter's name: the second device says `null`, and the key is the starter entry's, which the server could not read from anything.
    await second.client.commit(
      changeInventoryItem(env(), rice, { name: null }) ?? (undefined as never),
    );
    await second.client.sync();
    await first.client.sync();
    expect((await keys())[rice.id]).toBe(await keyOf(starterEntryByKey('rice')?.name ?? ''));
    for (const d of [first, second]) {
      const row = (await inventory(d)).find((each) => each.id === rice.id);
      expect(row?.name ?? null).toBeNull();
      expect(await failedOf(d.db)).toEqual([]);
    }
    // A hide and an Undo of it are changes with no name: the name key is left as it is.
    const soap = (await inventory(first)).find((row) => row.name === `Dish soap ${MARKER}`);
    if (!soap) throw new Error('no row');
    const before = (await keys())[soap.id];
    await first.client.commit(hideInventoryItem(env(), soap) ?? (undefined as never));
    await first.client.sync();
    await second.client.sync();
    expect((await keys())[soap.id]).toBe(before);
    expect((await inventory(second)).find((row) => row.id === soap.id)?.hidden).toBe(true);
    // Categories after the move: made and given a name offline, encrypted for the group, read on the other device; and the code's name given back as `null`.
    await first.client.commit(
      makeCategory(env(), { householdId: who.household, name: `Shed ${MARKER}`, last: null }),
    );
    const dairy = (await categories(first, who)).find((row) => row.starterKey === 'dairy-eggs');
    if (!dairy) throw new Error('no starter category');
    await first.client.commit(
      renameCategory(env(), dairy, `Milk ${MARKER}`) ?? (undefined as never),
    );
    await first.client.sync();
    await second.client.sync();
    const there = await categories(second, who);
    expect(there.find((row) => row.starterKey === 'dairy-eggs')?.name).toBe(`Milk ${MARKER}`);
    expect(there.some((row) => row.name === `Shed ${MARKER}`)).toBe(true);
    const dairyThere = there.find((row) => row.starterKey === 'dairy-eggs');
    if (!dairyThere) throw new Error('no starter category');
    await second.client.commit(renameCategory(env(), dairyThere, null) ?? (undefined as never));
    await second.client.sync();
    await first.client.sync();
    expect(
      (await categories(first, who)).find((row) => row.starterKey === 'dairy-eggs')?.name,
    ).toBe('Dairy & eggs');
    for (const row of await serverCategories(who))
      expect(JSON.stringify(row)).not.toContain(MARKER);
    for (const d of [first, second]) expect(await failedOf(d.db)).toEqual([]);
    for (const row of await serverRows(who)) expect(JSON.stringify(row)).not.toContain(MARKER);
  });

  it('becomes one row when two devices made the same thing offline, however each spelled it, and the note one of them wrote opens on both', async () => {
    const { who, key, first } = await moved('Ada-twice');
    const second = await deviceOf(who, key);
    await second.client.sync();
    first.wire.offline = true;
    second.wire.offline = true;
    await first.client.commit(
      makeInventoryItem(env(), { householdId: who.household, name: 'Dish Sponges' }),
    );
    await second.client.commit(
      makeInventoryItem(env(), {
        householdId: who.household,
        name: 'dish  sponges',
        note: `green ${MARKER}`,
      }),
    );
    first.wire.offline = false;
    await first.client.sync();
    second.wire.offline = false;
    await second.client.sync();
    await first.client.sync();
    for (const d of [first, second]) {
      const rows = (await inventory(d)).filter((row) => /sponges/i.test(String(row.name)));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.note).toBe(`green ${MARKER}`);
      expect(await failedOf(d.db)).toEqual([]);
    }
    // Two spellings, one row: the three of the group that are not deleted, and the deleted one.
    expect((await serverRows(who)).filter((row) => row.deleted_at === null)).toHaveLength(3);
    expect(await serverRows(who)).toHaveLength(4);
  });

  it('is on no device of anyone else: a person on one of the group’s lists has none of it, and it cannot make a change to the group, and none reaches a row', async () => {
    const { who, first } = await moved('Ada-host');
    expect(await inventory(first)).toHaveLength(2);
    const guest = await somebody(database, 'Guest-of-Ada');
    await join(database, who.household, guest);
    const theirs = await deviceOf(guest, await appKey());
    await theirs.client.sync();
    // Given none of the group's keys (a link to a list gives a list's, never the Inventory's), the guest's device cannot open the group and holds none of it.
    expect(await inventory(theirs)).toEqual([]);
    // It does not even hold the group, so it cannot make a change to it, and nothing it could send reaches a row (the server refuses one that is sent anyway, as not
    // found: `src/sync/inventory.encrypted.test.ts`).
    await expect(
      theirs.client.commit(
        makeInventoryItem(env(), { householdId: who.household, name: `Sneaky ${MARKER}` }),
      ),
    ).rejects.toThrow('does not hold that household');
    await theirs.client.sync();
    expect(await serverRows(who)).toHaveLength(3);
  });

  it('puts a change that names a starter entry this version does not have into Couldn’t sync, with a sentence of its own, and sends what follows it', async () => {
    const { who, first } = await moved('Ada-unknown');
    const stranger: Mutation = {
      mutationId: crypto.randomUUID(),
      householdId: who.household,
      changes: [
        {
          table: 'inventory_item',
          id: crypto.randomUUID(),
          create: true,
          fields: { createdAt: 1, starterKey: 'an-entry-of-a-later-version', hidden: 1 },
        },
      ],
    };
    await first.client.commit(stranger);
    await first.client.commit(
      makeInventoryItem(env(), { householdId: who.household, name: 'After the stranger' }),
    );
    await first.client.sync();
    const failed = await failedOf(first.db);
    expect(failed).toHaveLength(1);
    expect(JSON.stringify(failed[0])).toContain('starter catalog');
    expect(
      (await serverRows(who)).some((row) => row.starter_key === 'an-entry-of-a-later-version'),
    ).toBe(false);
    expect(await serverRows(who)).toHaveLength(4);
  });
});

describe(`the move of an Inventory that cannot be answered for yet (${leg})`, () => {
  /** What the server's manifest says for a group, with the Inventory rows given. */
  const manifestWith = (
    household: string,
    inventoryRows: { id: string; name: string | null; starterKey: string | null }[],
  ) => ({
    ok: true,
    seq: 1,
    person: crypto.randomUUID(),
    rows: {
      list: [],
      item: [],
      product: [],
      inventory_item: inventoryRows.map((row) => ({
        id: row.id,
        list: household,
        fields: { name: row.name, note: null },
        starterKey: row.starterKey,
      })),
    },
  });
  const tried = async (inventoryRows: Parameters<typeof manifestWith>[1]) => {
    const household = crypto.randomUUID();
    const posts: unknown[] = [];
    const memory = new EncryptionMemory(memoryStore(), 'k-cannot');
    const mover = new Mover(memory, async (_input, init) => {
      if (init?.method === 'POST') {
        posts.push(init.body);
        return Response.json({ ok: true });
      }
      return Response.json(manifestWith(household, inventoryRows));
    });
    const moved = await mover.run([household], await appKey());
    return { moved, posts, memory, household, mover };
  };

  it('waits, and sends nothing, for a starter entry this version does not have', async () => {
    const result = await tried([
      { id: crypto.randomUUID(), name: null, starterKey: 'an-entry-of-a-later-version' },
    ]);
    expect(result.moved).toBe(false);
    expect(result.posts).toEqual([]);
    expect(result.memory.isEncrypted(result.household)).toBe(false);
  });

  it('waits, and sends nothing, when two rows come to one name key, which the unique key would refuse on every attempt', async () => {
    const result = await tried([
      { id: crypto.randomUUID(), name: 'Dish Sponges', starterKey: null },
      { id: crypto.randomUUID(), name: 'dish  sponges', starterKey: null },
    ]);
    expect(result.moved).toBe(false);
    expect(result.posts).toEqual([]);
  });

  it('moves a group whose rows are all answerable, and says so', async () => {
    const result = await tried([
      { id: crypto.randomUUID(), name: 'Dish Sponges', starterKey: null },
      { id: crypto.randomUUID(), name: null, starterKey: 'bread' },
    ]);
    expect(result.moved).toBe(true);
    expect(result.posts).toHaveLength(1);
    expect(result.memory.isEncrypted(result.household)).toBe(true);
  });
});
