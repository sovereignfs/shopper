import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOT_FOUND, TEST_RING, callAs, join, somebody, type Someone } from '../access/test-support';
import { env as actionEnv, list as listRow } from '../actions/test-support';
import { archiveList, makeList, renameList, reorderList, restoreList } from '../actions/lists';
import type { Mutation } from '../actions/format';
import { unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import type { Limits } from '../limits/config';
import { applyMutation, type ApplyResult } from '../sync/apply';
import { ensureFirstList } from './households';
import { OPERATIONS } from './ops';

const { leg } = testTarget();
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
};

let database: Database;
let ada: Someone;
let grace: Someone;
let lin: Someone;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  lin = await somebody(database, 'Lin');
  await join(database, ada.household, grace);
});
afterAll(async () => database.close());

const deps = (limits: Limits = LIMITS) => ({ database, ring: TEST_RING, limits });
const lists = (household: string) =>
  dbAll<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'list')} WHERE household_id = ${household} ORDER BY position`,
  );
const ok = (r: ApplyResult) => {
  if (r.status === 'refused') throw new Error(`refused: ${r.reason}: ${r.sentence}`);
  return r;
};
/** The action's mutation, with a mutation id and ids that are the household's own to make. */
const live = (m: Mutation | null, household: string): Mutation => {
  if (!m) throw new Error('nothing to say');
  return {
    ...m,
    householdId: household,
    mutationId: crypto.randomUUID(),
    changes: m.changes.map((c) => ({ ...c, id: c.create ? crypto.randomUUID() : c.id })),
  };
};

describe(`a household's first list (${leg})`, () => {
  it('is made with the household: Groceries, sealed, first, manual, at its first counter', async () => {
    const rows = await lists(ada.household);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      position: 'a0',
      clearing: 'manual',
      seq: 1,
      archived_at: null,
      deleted_at: null,
    });
    expect(unsealRow('list', String(row?.id), String(row?.sealed), TEST_RING)).toEqual({
      name: 'Groceries',
    });
    expect(JSON.stringify(row)).not.toContain('Groceries');
  });

  it('is given to a household that never had a list, once, and not to one whose lists were all deleted', async () => {
    const old = await somebody(database, 'Old');
    await dbAll(
      database,
      sql`DELETE FROM ${appTable(database, 'list')} WHERE household_id = ${old.household} RETURNING id`,
    );
    expect(await ensureFirstList(database, TEST_RING, old.household)).toBe(true);
    expect(await ensureFirstList(database, TEST_RING, old.household)).toBe(false);
    expect(await lists(old.household)).toHaveLength(1);

    const gone = await somebody(database, 'Gone');
    const id = String((await lists(gone.household))[0]?.id);
    await dbAll(
      database,
      sql`DELETE FROM ${appTable(database, 'list')} WHERE id = ${id} RETURNING id`,
    );
    await dbAll(
      database,
      sql`INSERT INTO ${appTable(database, 'tombstone')} (household_id, table_name, id, seq, created_at) VALUES (${gone.household}, 'list', ${id}, 2, 1) RETURNING id`,
    );
    expect(await ensureFirstList(database, TEST_RING, gone.household)).toBe(false);
    expect(await lists(gone.household)).toHaveLength(0);
  });
});

describe(`the actions on lists, applied (${leg})`, () => {
  it('make, rename, reorder, archive and restore a list, offline-made and merged field by field, by any member', async () => {
    const e = actionEnv();
    const made = ok(
      await applyMutation(
        deps(),
        grace.accountId,
        live(
          makeList(e, { householdId: ada.household, name: 'Pharmacy', position: 'a1' }),
          ada.household,
        ),
      ),
    );
    const id = made.changed[0]?.id ?? '';
    const row = () =>
      dbGet<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${appTable(database, 'list')} WHERE id = ${id}`,
      );
    const model = () =>
      listRow({ id, householdId: ada.household, name: 'Pharmacy', position: 'a1' });

    ok(
      await applyMutation(
        deps(),
        ada.accountId,
        live(renameList(e, model(), 'Chemist'), ada.household),
      ),
    );
    ok(
      await applyMutation(
        deps(),
        ada.accountId,
        live(reorderList(e, model(), 'a2'), ada.household),
      ),
    );
    ok(await applyMutation(deps(), grace.accountId, live(archiveList(e, model()), ada.household)));
    let now = await row();
    expect(unsealRow('list', id, String(now?.sealed), TEST_RING)).toEqual({ name: 'Chemist' });
    expect(now).toMatchObject({ position: 'a2', clearing: 'manual' });
    expect(now?.archived_at).toBe(e.now);
    ok(
      await applyMutation(
        deps(),
        ada.accountId,
        live(restoreList(e, { ...model(), archivedAt: 1 }), ada.household),
      ),
    );
    now = await row();
    expect(now?.archived_at).toBeNull();
  });

  it('refuse a list past the household’s limit, with its sentence, and a list for a household that is not the account’s', async () => {
    const owner = await somebody(database, 'Few');
    const small = { ...LIMITS, householdLists: 2 };
    const e = actionEnv();
    ok(
      await applyMutation(
        deps(small),
        owner.accountId,
        live(
          makeList(e, { householdId: owner.household, name: 'Two', position: 'a1' }),
          owner.household,
        ),
      ),
    );
    const over = await applyMutation(
      deps(small),
      owner.accountId,
      live(
        makeList(e, { householdId: owner.household, name: 'Three', position: 'a2' }),
        owner.household,
      ),
    );
    expect(over).toEqual({
      status: 'refused',
      reason: 'limit',
      sentence:
        'A household can have at most 2 lists, archived ones included, and this one has them all.',
    });
    expect(
      await applyMutation(
        deps(),
        lin.accountId,
        live(
          makeList(e, { householdId: ada.household, name: 'Sneaky', position: 'a9' }),
          ada.household,
        ),
      ),
    ).toMatchObject({ reason: 'not_found' });
  });
});

describe(`deleting a list for good (${leg})`, () => {
  const make = async (archived: boolean) => {
    const e = actionEnv();
    const made = ok(
      await applyMutation(
        deps(),
        ada.accountId,
        live(
          makeList(e, { householdId: ada.household, name: 'Temp', position: 'b0' }),
          ada.household,
        ),
      ),
    );
    const id = made.changed[0]?.id ?? '';
    if (archived)
      ok(
        await applyMutation(
          deps(),
          ada.accountId,
          live(archiveList(e, listRow({ id, householdId: ada.household })), ada.household),
        ),
      );
    return id;
  };
  const exists = async (id: string) =>
    (await dbGet(database, sql`SELECT id FROM ${appTable(database, 'list')} WHERE id = ${id}`)) !==
    undefined;
  const seq = async () =>
    Number(
      (
        await dbGet<{ seq: number | string }>(
          database,
          sql`SELECT seq FROM ${appTable(database, 'household')} WHERE id = ${ada.household}`,
        )
      )?.seq,
    );

  it('is an Admin’s, for an archived list: the row goes, a tombstone stays at the counter it went at', async () => {
    const id = await make(true);
    const before = await seq();
    expect(
      await callAs(database, OPERATIONS, ada, {
        op: 'list.delete',
        household: ada.household,
        list: id,
      }),
    ).toEqual({ status: 200, body: { ok: true } });
    expect(await exists(id)).toBe(false);
    expect(await seq()).toBe(before + 1);
    const tomb = await dbGet<{ seq: number | string }>(
      database,
      sql`SELECT seq FROM ${appTable(database, 'tombstone')} WHERE household_id = ${ada.household} AND table_name = 'list' AND id = ${id}`,
    );
    expect(Number(tomb?.seq)).toBe(before + 1);
    // A change to it now reads as not found.
    expect(
      await applyMutation(deps(), ada.accountId, {
        mutationId: crypto.randomUUID(),
        householdId: ada.household,
        changes: [{ table: 'list', id, fields: { name: 'x' } }],
      }),
    ).toMatchObject({ reason: 'not_found' });
  });

  it('is refused, with a sentence and nothing changed, for a list that is not archived', async () => {
    const id = await make(false);
    const before = await seq();
    const reply = await callAs(database, OPERATIONS, ada, {
      op: 'list.delete',
      household: ada.household,
      list: id,
    });
    expect(reply).toMatchObject({
      status: 409,
      body: {
        error: 'refused',
        message: 'Only an archived list can be deleted for good: archive it first.',
      },
    });
    expect(await exists(id)).toBe(true);
    expect(await seq()).toBe(before);
  });

  it('is not a Member’s, an outsider’s or a list of another household’s: all not found', async () => {
    const id = await make(true);
    expect(
      await callAs(database, OPERATIONS, grace, {
        op: 'list.delete',
        household: ada.household,
        list: id,
      }),
    ).toEqual(NOT_FOUND);
    expect(
      await callAs(database, OPERATIONS, lin, {
        op: 'list.delete',
        household: ada.household,
        list: id,
      }),
    ).toEqual(NOT_FOUND);
    expect(
      await callAs(database, OPERATIONS, lin, {
        op: 'list.delete',
        household: lin.household,
        list: id,
      }),
    ).toMatchObject({ status: 409 });
    expect(await exists(id)).toBe(true);
  });
});
