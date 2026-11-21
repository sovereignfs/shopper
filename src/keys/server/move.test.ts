import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../../access/test-support';
import type { Mutation, SyncedTable } from '../../actions/format';
import { canonicalName } from '../../catalog/canonical';
import type { Database } from '../../db/client';
import { dbAll, dbGet } from '../../db/exec';
import { runMigrations } from '../../db/migrate';
import { appTable } from '../../db/tables';
import { freshDatabase, testTarget } from '../../db/test-support';
import type { Limits } from '../../limits/config';
import { applyMutation } from '../../sync/apply';
import { pullHousehold } from '../../sync/pull';
import {
  type Keyring,
  householdNameKey,
  newKeyring,
  openField,
  sealField,
  wrapKeyring,
} from '../household';
import { type Manifest, moveHousehold, moveManifest } from './move';

const { leg } = testTarget();
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
};
const MARKER = 'MARKERmv4';
let database: Database;
let ada: Someone;
let grace: Someone;
let lin: Someone;
const deps = () => ({ database, ring: TEST_RING });

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
});
afterAll(async () => database.close());

/** What a device does with a manifest: every row's content encrypted for it, and each product's name key. */
async function answer(ring: Keyring, household: string, manifest: Manifest, appKey: CryptoKey) {
  const rows = {} as Record<
    SyncedTable,
    { id: string; fields: Record<string, string | null>; nameKey?: string }[]
  >;
  for (const table of ['list', 'item', 'product'] as const) {
    rows[table] = [];
    for (const row of manifest.rows[table]) {
      const fields: Record<string, string | null> = {};
      for (const [field, value] of Object.entries(row.fields))
        fields[field] =
          value === null
            ? null
            : await sealField(ring, { household, table, row: row.id, field }, value);
      rows[table].push({
        id: row.id,
        fields,
        ...(table === 'product'
          ? {
              nameKey: await householdNameKey(
                ring,
                household,
                canonicalName(row.fields.name ?? ''),
              ),
            }
          : {}),
      });
    }
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
    expect(await moveManifest(deps(), ada.household, grace.accountId)).toBeUndefined();
    expect(await moveManifest(deps(), lin.household, lin.accountId)).toBeUndefined();
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
    for (const table of ['list', 'item', 'product']) {
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
    const item = pulled?.items[0] as { id: string; encrypted?: Record<string, string> } | undefined;
    expect(
      await openField(
        ring,
        { household: ada.household, table: 'item', row: item?.id ?? '', field: 'note' },
        item?.encrypted?.note ?? '',
      ),
    ).toBe(`barista ${MARKER}`);
    // The marker is in no row of any table, as text, base64 or hex (18.12).
    const tables = await dbAll<{ name: string }>(
      database,
      database.dialect === 'postgres'
        ? sql`SELECT table_name AS name FROM information_schema.tables WHERE table_schema IN ('shopper', 'public')`
        : sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
    );
    const forms = [
      MARKER,
      Buffer.from(MARKER).toString('base64'),
      Buffer.from(MARKER).toString('hex'),
    ];
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
    // Moved once: not again.
    expect(await moveManifest(deps(), ada.household, ada.accountId)).toBeUndefined();
  });
});
