import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../../access/test-support';
import type { Env } from '../../actions/env';
import { type Mutation, SYNCED_TABLES, type SyncedTable } from '../../actions/format';
import { makeInventoryItem, overrideStarterEntry } from '../../actions/inventory';
import { canonicalName } from '../../catalog/canonical';
import { starterEntryByKey } from '../../catalog/starter';
import type { Database } from '../../db/client';
import { dbAll, dbGet, dbRun } from '../../db/exec';
import { runMigrations } from '../../db/migrate';
import { appTable } from '../../db/tables';
import { freshDatabase, testTarget } from '../../db/test-support';
import type { Limits } from '../../limits/config';
import { applyMutation } from '../../sync/apply';
import { pullHousehold } from '../../sync/pull';
import {
  type Keyring,
  deriveInventoryKeyring,
  deriveListKeyring,
  deviceInventoryNameKey,
  listNameKey,
  newKeyring,
  openField,
  sealField,
  wrapKeyring,
} from '../household';
import { type Manifest, moveHousehold, moveInput, moveManifest } from './move';
import { sealRow } from '../../crypto/sealed';

const { leg } = testTarget();
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
  inventoryItems: 5000,
  householdCategories: 100,
};
const MARKER = 'MARKERmv4';
/** A list's icon and colour, as a person chose them: names a design system might one day have, and a colour no swatch offers. */
const LIST_ICON = 'planted-icon-xq7';
const LIST_COLOR = '#a1b2c3';
let database: Database;
let ada: Someone;
let grace: Someone;
let lin: Someone;
const deps = () => ({ database, ring: TEST_RING });
const deps3 = () => ({ database, ring: TEST_RING, limits: LIMITS });
/** The ids of Ada's Inventory rows. */
const INVENTORY = { flour: '', bread: '', old: '' };
/** The ids of Ada's categories that hold content: one of her own, and a starter she named. */
const CATEGORY = { own: crypto.randomUUID(), produce: '' };

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  lin = await somebody(database, 'Lin');
  await join(database, lin.household, grace);
  const product = crypto.randomUUID();
  const list = await dbGet<{ id: string }>(
    database,
    sql`SELECT id FROM ${appTable(database, 'list')} WHERE household_id = ${ada.household}`,
  );
  const m: Mutation = {
    mutationId: crypto.randomUUID(),
    householdId: ada.household,
    changes: [
      // The list's icon and colour (RFC 0005) are content like its name: they move with it, and the markers are in no table afterwards.
      { table: 'list', id: list?.id ?? '', fields: { icon: LIST_ICON, color: LIST_COLOR } },
      {
        table: 'product',
        id: product,
        create: true,
        fields: { name: `Oat milk ${MARKER}`, createdAt: 1 },
      },
      {
        table: 'item',
        id: crypto.randomUUID(),
        create: true,
        fields: {
          listId: list?.id ?? '',
          productId: product,
          name: `Oat milk ${MARKER}`,
          note: `barista ${MARKER}`,
          quantity: '1',
          position: 'a0',
          addedBy: ada.personId,
          addedAt: 1,
        },
      },
    ],
  };
  const applied = await applyMutation(
    { database, ring: TEST_RING, limits: LIMITS },
    ada.accountId,
    m,
  );
  expect(applied.status).toBe('applied');
  // Ada's Inventory (§8.8): one of her own with a note, an override of a starter entry that keeps its name (hidden), and one she deleted. All are content the move
  // takes into encryption with the group, and the markers must be in no table afterwards.
  const env: Env = { now: 10, newId: () => crypto.randomUUID() };
  const made = [
    makeInventoryItem(env, {
      householdId: ada.household,
      name: `Oat flour ${MARKER}`,
      note: `strong ${MARKER}`,
      recurring: true,
    }),
    overrideStarterEntry(env, { householdId: ada.household, starterKey: 'bread', hidden: true }),
    makeInventoryItem(env, { householdId: ada.household, name: `Old thing ${MARKER}` }),
  ];
  for (const each of made)
    expect((await applyMutation(deps3(), ada.accountId, each)).status).toBe('applied');
  // Her categories: one of her own, and the starter _Produce_ named by her. The other fourteen starter categories have nothing to encrypt, and stay as they are.
  const catSeq = Number(
    (
      await dbGet<{ seq: number | string }>(
        database,
        sql`UPDATE ${appTable(database, 'household')} SET seq = seq + 1 WHERE id = ${ada.household} RETURNING seq`,
      )
    )?.seq,
  );
  await dbRun(
    database,
    sql`INSERT INTO ${appTable(database, 'category')} (id, household_id, starter_key, sealed, icon, position, hidden, seq)
        VALUES (${CATEGORY.own}, ${ada.household}, ${null}, ${sealRow('category', CATEGORY.own, { name: `Hardware ${MARKER}` }, TEST_RING)}, ${'package'}, ${'zz'}, ${false}, ${catSeq})`,
  );
  const produce = await dbGet<{ id: string }>(
    database,
    sql`SELECT id FROM ${appTable(database, 'category')} WHERE household_id = ${ada.household} AND starter_key = ${'produce'}`,
  );
  CATEGORY.produce = produce?.id ?? '';
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'category')} SET sealed = ${sealRow('category', CATEGORY.produce, { name: `Fruit and veg ${MARKER}` }, TEST_RING)}, seq = ${catSeq} WHERE id = ${CATEGORY.produce}`,
  );
  INVENTORY.flour = made[0]?.changes[0]?.id ?? '';
  INVENTORY.bread = made[1]?.changes[0]?.id ?? '';
  INVENTORY.old = made[2]?.changes[0]?.id ?? '';
  expect(
    (
      await applyMutation(deps3(), ada.accountId, {
        mutationId: crypto.randomUUID(),
        householdId: ada.household,
        changes: [{ table: 'inventory_item', id: INVENTORY.old, fields: { deletedAt: 20 } }],
      })
    ).status,
  ).toBe('applied');
});
afterAll(async () => database.close());

/** What a device does with a manifest: every row's content encrypted for it under its list's keys, derived from the group's, and each product's name key. */
async function answer(
  ring: Keyring,
  household: string,
  manifest: Manifest,
  appKey: CryptoKey,
  /** A wrong list for every value, to see it refused. */
  wrongList?: string,
  /** How an Inventory row is answered wrongly, to see it refused: bound to another place, or with no name key. */
  inventory: { slot?: string; omitNameKey?: boolean; withListKeys?: boolean } = {},
  /** The place a category's name is bound to, when it is answered wrongly (a list's, to see it refused). */
  categorySlot?: string,
) {
  const rows = {} as Record<
    SyncedTable,
    { id: string; fields: Record<string, string | null>; nameKey?: string }[]
  >;
  for (const table of ['list', 'item', 'product'] as const) {
    rows[table] = [];
    for (const row of manifest.rows[table]) {
      const list = wrongList ?? row.list;
      const keys = await deriveListKeyring(ring, list);
      const fields: Record<string, string | null> = {};
      for (const [field, value] of Object.entries(row.fields))
        fields[field] =
          value === null ? null : await sealField(keys, { list, table, row: row.id, field }, value);
      rows[table].push({
        id: row.id,
        fields,
        ...(table === 'product'
          ? { nameKey: await listNameKey(keys, list, canonicalName(row.fields.name ?? '')) }
          : {}),
      });
    }
  }
  // An Inventory item is for its group, in the place of a list, under the group's Inventory keys (§13.2).
  const inventoryRing = await deriveInventoryKeyring(ring, household);
  // A category's name is for the group too, under the same keys, with no name key (§8.3).
  rows.category = [];
  for (const row of manifest.rows.category) {
    const fields: Record<string, string | null> = {};
    for (const [field, value] of Object.entries(row.fields))
      fields[field] =
        value === null
          ? null
          : await sealField(
              inventoryRing,
              { list: categorySlot ?? household, table: 'category', row: row.id, field },
              value,
            );
    rows.category.push({ id: row.id, fields });
  }
  const slot = inventory.slot ?? household;
  const keys = inventory.withListKeys ? await deriveListKeyring(ring, slot) : inventoryRing;
  rows.inventory_item = [];
  for (const row of manifest.rows.inventory_item) {
    const fields: Record<string, string | null> = {};
    for (const [field, value] of Object.entries(row.fields))
      fields[field] =
        value === null
          ? null
          : await sealField(
              keys,
              { list: slot, table: 'inventory_item', row: row.id, field },
              value,
            );
    const name = row.fields.name ?? starterEntryByKey(row.starterKey ?? '')?.name ?? '';
    rows.inventory_item.push({
      id: row.id,
      fields,
      ...(inventory.omitNameKey
        ? {}
        : { nameKey: await deviceInventoryNameKey(inventoryRing, household, canonicalName(name)) }),
    });
  }
  return {
    seq: manifest.seq,
    keyring: await wrapKeyring(appKey, ring, { person: manifest.person, household }),
    rows,
  };
}

const appKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

describe(`moving a household (${leg})`, () => {
  it('opens its rows once more for its only member, and for nobody else, nor for a household with others in it', async () => {
    const manifest = await moveManifest(deps(), ada.household, ada.accountId);
    expect(manifest?.rows.item[0]?.fields.note).toBe(`barista ${MARKER}`);
    // Her Inventory, deleted or not, opened with the rest, each row for its group (it has no list) and with its starter entry.
    // Every synced table is moved: one added without its move (a person's own categories, step 5) fails here, and not in a browser, a group at a time.
    expect(Object.keys(manifest?.rows ?? {}).sort()).toEqual([...SYNCED_TABLES].sort());
    const inventory = manifest?.rows.inventory_item ?? [];
    expect(inventory.map((row) => row.id).sort()).toEqual(Object.values(INVENTORY).sort());
    expect(inventory.every((row) => row.list === ada.household)).toBe(true);
    const flour = inventory.find((row) => row.id === INVENTORY.flour);
    expect(flour).toMatchObject({
      starterKey: null,
      fields: { name: `Oat flour ${MARKER}`, note: `strong ${MARKER}` },
    });
    expect(inventory.find((row) => row.id === INVENTORY.bread)).toMatchObject({
      starterKey: 'bread',
      fields: { name: null, note: null },
    });
    // Her categories that hold content, and only those: the one of her own and the starter she named, each for the group. The fourteen others have nothing to move.
    const categories = manifest?.rows.category ?? [];
    expect(categories.map((row) => row.id).sort()).toEqual([CATEGORY.own, CATEGORY.produce].sort());
    expect(categories.every((row) => row.list === ada.household)).toBe(true);
    expect(categories.find((row) => row.id === CATEGORY.own)?.fields.name).toBe(
      `Hardware ${MARKER}`,
    );
    expect(categories.find((row) => row.id === CATEGORY.produce)?.fields.name).toBe(
      `Fruit and veg ${MARKER}`,
    );
    expect(await moveManifest(deps(), ada.household, grace.accountId)).toBeUndefined();
    expect(await moveManifest(deps(), lin.household, lin.accountId)).toBeUndefined();
  });

  it('waits while a link to one of its lists is waiting, which carries no keys, so that whoever uses it can open the list (RFC 0004)', async () => {
    const solo = await somebody(database, 'Solo-link');
    expect(await moveManifest(deps(), solo.household, solo.accountId)).toBeDefined();
    const { createInvitation, revokeInvitation } = await import('../../households/invitations');
    const made = await createInvitation(database, {
      household: solo.household,
      list: solo.list,
      accountId: solo.accountId,
      personId: solo.personId,
      now: Date.now(),
    });
    if (!made.ok) throw new Error(made.refused);
    expect(await moveManifest(deps(), solo.household, solo.accountId)).toBeUndefined();
    expect(
      await revokeInvitation(database, {
        household: solo.household,
        list: solo.list,
        accountId: solo.accountId,
        personId: solo.personId,
        invitation: made.id,
        now: Date.now(),
      }),
    ).toBe(true);
    expect(await moveManifest(deps(), solo.household, solo.accountId)).toBeDefined();
  });

  it('refuses what does not answer for every row, or comes after a change, and changes nothing', async () => {
    const ring = newKeyring();
    const key = await appKey();
    const manifest = await moveManifest(deps(), ada.household, ada.accountId);
    if (!manifest) throw new Error('not movable');
    const full = await answer(ring, ada.household, manifest, key);
    const missing = { ...full, rows: { ...full.rows, item: [] } };
    expect(await moveHousehold(deps(), ada.household, ada.accountId, missing)).toEqual({
      ok: false,
      why: 'incomplete',
    });
    // Each value for its own list's keys (RFC 0004): one encrypted for another list is refused.
    const wrong = await answer(ring, ada.household, manifest, key, crypto.randomUUID());
    expect(await moveHousehold(deps(), ada.household, ada.accountId, wrong)).toEqual({
      ok: false,
      why: 'incomplete',
    });
    // Her Inventory is answered for as the rest is: every row, each value for its group and its own row, under the group's Inventory keys, each with its
    // name key.
    const noInventory = { ...full, rows: { ...full.rows, inventory_item: [] } };
    expect(await moveHousehold(deps(), ada.household, ada.accountId, noInventory)).toEqual({
      ok: false,
      why: 'incomplete',
    });
    for (const [what, bad] of [
      [
        'a list as the place',
        await answer(ring, ada.household, manifest, key, undefined, { slot: ada.list }),
      ],
      [
        'another group as the place',
        await answer(ring, ada.household, manifest, key, undefined, { slot: crypto.randomUUID() }),
      ],
      [
        'no name key',
        await answer(ring, ada.household, manifest, key, undefined, { omitNameKey: true }),
      ],
    ] as const)
      expect(await moveHousehold(deps(), ada.household, ada.accountId, bad), what).toEqual({
        ok: false,
        why: 'incomplete',
      });
    // Her categories are answered for the same way: every one that holds content, each name for the group, and not for a list.
    const noCategories = { ...full, rows: { ...full.rows, category: [] } };
    expect(await moveHousehold(deps(), ada.household, ada.accountId, noCategories)).toEqual({
      ok: false,
      why: 'incomplete',
    });
    const category = await answer(ring, ada.household, manifest, key, undefined, {}, ada.list);
    expect(await moveHousehold(deps(), ada.household, ada.accountId, category)).toEqual({
      ok: false,
      why: 'incomplete',
    });
    const swappedNames = structuredClone(full);
    const [one, two] = swappedNames.rows.category;
    if (!one || !two) throw new Error('needs two categories');
    [one.fields, two.fields] = [two.fields, one.fields];
    expect(await moveHousehold(deps(), ada.household, ada.accountId, swappedNames)).toEqual({
      ok: false,
      why: 'incomplete',
    });
    // A value for another row of the group (its fields swapped with another's) is not for its own.
    const swapped = structuredClone(full);
    const [first, second] = swapped.rows.inventory_item;
    if (!first || !second) throw new Error('needs two rows');
    [first.fields, second.fields] = [second.fields, first.fields];
    expect(await moveHousehold(deps(), ada.household, ada.accountId, swapped)).toEqual({
      ok: false,
      why: 'incomplete',
    });
    expect(
      await moveHousehold(deps(), ada.household, ada.accountId, { ...full, seq: full.seq - 1 }),
    ).toEqual({
      ok: false,
      why: 'stale',
    });
    expect(await moveHousehold(deps(), ada.household, grace.accountId, full)).toEqual({
      ok: false,
      why: 'not-movable',
    });
    const state = await dbGet<{ encryption: string }>(
      database,
      sql`SELECT encryption FROM ${appTable(database, 'household')} WHERE id = ${ada.household}`,
    );
    expect(state?.encryption).toBe('sealed');
    // Nothing of her Inventory changed: still sealed, with its name keys as the server made them.
    const kept = await dbAll<{ sealed: string; name_key: string }>(
      database,
      sql`SELECT sealed, name_key FROM ${appTable(database, 'inventory_item')} WHERE household_id = ${ada.household}`,
    );
    expect(kept).toHaveLength(3);
    expect(kept.every((row) => row.sealed !== '' && !row.name_key.startsWith('n3.'))).toBe(true);
    const namedCategories = await dbAll<{ id: string; sealed: string | null }>(
      database,
      sql`SELECT id, sealed FROM ${appTable(database, 'category')} WHERE household_id = ${ada.household} AND sealed IS NOT NULL AND sealed <> ''`,
    );
    expect(namedCategories).toHaveLength(2);
  });

  it('takes the input of a shell from before Inventory moved when the group has none, and refuses it when the group has some', async () => {
    const ring = newKeyring();
    const key = await appKey();
    // Ada's group has Inventory: an answer with no field for it does not answer for it.
    const manifest = await moveManifest(deps(), ada.household, ada.accountId);
    if (!manifest) throw new Error('not movable');
    const full = await answer(ring, ada.household, manifest, key);
    const { inventory_item: _none, ...old } = full.rows;
    const parsed = moveInput.parse({ ...full, rows: old });
    expect(parsed.rows.inventory_item).toEqual([]);
    expect(await moveHousehold(deps(), ada.household, ada.accountId, parsed)).toEqual({
      ok: false,
      why: 'incomplete',
    });
    // A group with none moves with it.
    const solo = await somebody(database, 'Solo-old-shell');
    const soloManifest = await moveManifest(deps(), solo.household, solo.accountId);
    if (!soloManifest) throw new Error('not movable');
    expect(soloManifest.rows.inventory_item).toEqual([]);
    const soloFull = await answer(ring, solo.household, soloManifest, key);
    const { inventory_item: _empty, ...soloOld } = soloFull.rows;
    const result = await moveHousehold(
      deps(),
      solo.household,
      solo.accountId,
      moveInput.parse({ ...soloFull, rows: soloOld }),
    );
    expect(result.ok).toBe(true);
  });

  it('moves it whole: every row encrypted for itself, nothing left sealed or in plain text, the keyring kept, and the device opens it back', async () => {
    const ring = newKeyring();
    const key = await appKey();
    const manifest = await moveManifest(deps(), ada.household, ada.accountId);
    if (!manifest) throw new Error('not movable');
    const result = await moveHousehold(
      deps(),
      ada.household,
      ada.accountId,
      await answer(ring, ada.household, manifest, key),
    );
    expect(result.ok).toBe(true);
    for (const table of ['list', 'item', 'product', 'inventory_item']) {
      const rows = await dbAll<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${appTable(database, table)} WHERE household_id = ${ada.household}`,
      );
      for (const row of rows) {
        expect(row.sealed, table).toBe('');
        expect(JSON.stringify(row), table).not.toContain(MARKER);
      }
    }
    const pulled = await pullHousehold(database, TEST_RING, ada.accountId, ada.household, 0);
    expect(pulled?.encryption.state).toBe('encrypted');
    expect(pulled?.encryption.keyring).toMatch(/^hk1\./);
    const item = pulled?.items[0] as
      { id: string; listId: string; encrypted?: Record<string, string> } | undefined;
    const target = { list: item?.listId ?? '', table: 'item', row: item?.id ?? '', field: 'note' };
    expect(
      await openField(
        await deriveListKeyring(ring, target.list),
        target,
        item?.encrypted?.note ?? '',
      ),
    ).toBe(`barista ${MARKER}`);
    // The list's icon and colour were moved with its name, and open under the list's keys.
    const moved = pulled?.lists[0] as
      { id: string; encrypted?: Record<string, string> } | undefined;
    const listKeys = await deriveListKeyring(ring, moved?.id ?? '');
    for (const [field, value] of [
      ['icon', LIST_ICON],
      ['color', LIST_COLOR],
    ] as const)
      expect(
        await openField(
          listKeys,
          { list: moved?.id ?? '', table: 'list', row: moved?.id ?? '', field },
          moved?.encrypted?.[field] ?? '',
        ),
      ).toBe(value);
    // Per list (RFC 0004): another list's keys, from the same group, do not open it.
    expect(
      await openField(
        await deriveListKeyring(ring, crypto.randomUUID()),
        target,
        item?.encrypted?.note ?? '',
      ),
    ).toBeUndefined();
    // The marker is in no row of any table, as text, base64 or hex (18.12).
    const tables = await dbAll<{ name: string }>(
      database,
      database.dialect === 'postgres'
        ? sql`SELECT table_name AS name FROM information_schema.tables WHERE table_schema IN ('shopper', 'public')`
        : sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
    );
    const forms = [MARKER, LIST_ICON, LIST_COLOR].flatMap((text) => [
      text,
      Buffer.from(text).toString('base64'),
      Buffer.from(text).toString('hex'),
    ]);
    for (const { name } of tables) {
      if (name === 'household' || name.startsWith('sqlite_') || name.startsWith('__')) continue;
      const qualified =
        database.dialect === 'postgres'
          ? sql.raw(`"${name.startsWith('sv_') ? 'public' : 'shopper'}"."${name}"`)
          : sql.raw(`"${name}"`);
      const rows = await dbAll<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${qualified}`,
      ).catch(() => []);
      const text = JSON.stringify(rows);
      for (const form of forms) expect(text, `${name} holds the marker`).not.toContain(form);
    }
    // Her Inventory is the group's, opened under the group's Inventory keys, derived from the keyring the device made, and under nothing else.
    const inventoryRing = await deriveInventoryKeyring(ring, ada.household);
    const pulledInventory = (pulled?.inventory ?? []) as {
      id: string;
      encrypted?: Record<string, string>;
    }[];
    expect(pulledInventory.map((row) => row.id).sort()).toEqual(Object.values(INVENTORY).sort());
    const flour = pulledInventory.find((row) => row.id === INVENTORY.flour);
    const at = (field: string) => ({
      list: ada.household,
      table: 'inventory_item',
      row: INVENTORY.flour,
      field,
    });
    expect(await openField(inventoryRing, at('name'), flour?.encrypted?.name ?? '')).toBe(
      `Oat flour ${MARKER}`,
    );
    expect(await openField(inventoryRing, at('note'), flour?.encrypted?.note ?? '')).toBe(
      `strong ${MARKER}`,
    );
    // Not under a list's derivation with the group's id, nor under another group's Inventory keys, nor a list's keys of the group.
    for (const wrong of [
      await deriveListKeyring(ring, ada.household),
      await deriveListKeyring(ring, ada.list),
      await deriveInventoryKeyring(ring, crypto.randomUUID()),
      await deriveInventoryKeyring(newKeyring(), ada.household),
    ])
      expect(await openField(wrong, at('name'), flour?.encrypted?.name ?? '')).toBeUndefined();
    // Her categories: the two that held a name are ciphertext now, for the group, opened under the Inventory keys and under nothing else; the fourteen starter
    // categories nobody named were not touched, and a pull is told of the two.
    const categoryRows = await dbAll<{
      id: string;
      sealed: string | null;
      encrypted: string | null;
    }>(
      database,
      sql`SELECT id, sealed, encrypted FROM ${appTable(database, 'category')} WHERE household_id = ${ada.household}`,
    );
    expect(categoryRows.filter((row) => row.sealed !== null && row.sealed !== '')).toEqual([]);
    expect(
      categoryRows
        .filter((row) => row.encrypted !== null)
        .map((row) => row.id)
        .sort(),
    ).toEqual([CATEGORY.own, CATEGORY.produce].sort());
    const pulledCategories = (pulled?.categories ?? []) as {
      id: string;
      encrypted?: Record<string, string>;
    }[];
    const hardware = pulledCategories.find((row) => row.id === CATEGORY.own);
    const categoryAt = (id: string) => ({
      list: ada.household,
      table: 'category',
      row: id,
      field: 'name',
    });
    expect(
      await openField(inventoryRing, categoryAt(CATEGORY.own), hardware?.encrypted?.name ?? ''),
    ).toBe(`Hardware ${MARKER}`);
    expect(
      await openField(
        inventoryRing,
        categoryAt(CATEGORY.produce),
        pulledCategories.find((row) => row.id === CATEGORY.produce)?.encrypted?.name ?? '',
      ),
    ).toBe(`Fruit and veg ${MARKER}`);
    for (const wrong of [
      await deriveListKeyring(ring, ada.household),
      await deriveListKeyring(ring, ada.list),
    ])
      expect(
        await openField(wrong, categoryAt(CATEGORY.own), hardware?.encrypted?.name ?? ''),
      ).toBeUndefined();
    // The name keys are the device's (`n3.`): the override's is the starter entry's name, which the server could not have made from nothing.
    const keys = await dbAll<{ id: string; name_key: string }>(
      database,
      sql`SELECT id, name_key FROM ${appTable(database, 'inventory_item')} WHERE household_id = ${ada.household}`,
    );
    for (const row of keys) expect(row.name_key, row.id).toMatch(/^n3\./);
    expect(keys.find((row) => row.id === INVENTORY.bread)?.name_key).toBe(
      await deviceInventoryNameKey(
        inventoryRing,
        ada.household,
        canonicalName(starterEntryByKey('bread')?.name ?? ''),
      ),
    );
    // Moved once: not again.
    expect(await moveManifest(deps(), ada.household, ada.accountId)).toBeUndefined();
  });
});
