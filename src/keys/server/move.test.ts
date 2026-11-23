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
  deriveListKeyring,
  listNameKey,
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
/** A list's icon and colour, as a person chose them: names a design system might one day have, and a colour no swatch offers. */
const LIST_ICON = 'planted-icon-xq7';
const LIST_COLOR = '#a1b2c3';
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
    // Moved once: not again.
    expect(await moveManifest(deps(), ada.household, ada.accountId)).toBeUndefined();
  });
});
