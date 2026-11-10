import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NOT_FOUND,
  TEST_RING,
  callAs,
  join,
  leave,
  somebody,
  type Someone,
} from '../access/test-support';
import type { Database } from '../db/client';
import { dbAll } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { createHousehold, householdsOf, membersOf, readHousehold } from './households';
import type { Operation } from './ops';

const { leg } = testTarget();
const PLANTED = 'PLANTED-The-Perera-Household';

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
});
afterAll(async () => database.close());

describe(`households and access (${leg})`, () => {
  it('give every account one household of its own, with it as Admin, at its first change', async () => {
    const view = await readHousehold(database, TEST_RING, ada.household, ada.accountId);
    expect(view).toMatchObject({
      id: ada.household,
      own: true,
      role: 'admin',
      seq: 1,
      label: 'My lists',
    });
    expect((await householdsOf(database, TEST_RING, ada.accountId)).map((h) => h.id)).toEqual([
      ada.household,
    ]);
  });

  it('make the first household once, whoever asks and however often, and at once', async () => {
    const again = await createHousehold(database, TEST_RING, {
      creatorPersonId: ada.personId,
      ownOf: ada.accountId,
    });
    expect(again).toBe(ada.household);
    const kai = await somebody(database, 'Kai');
    const ids = await Promise.all(
      Array.from({ length: 5 }, () =>
        createHousehold(database, TEST_RING, {
          creatorPersonId: kai.personId,
          ownOf: kai.accountId,
        }),
      ),
    );
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(kai.household);
    const rows = await dbAll<{ n: number | string }>(
      database,
      sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'member')} WHERE household_id = ${kai.household}`,
    );
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('read as not found by anyone who is not in the household, the same as one that does not exist', async () => {
    expect(
      await readHousehold(database, TEST_RING, ada.household, grace.accountId),
    ).toBeUndefined();
    expect(
      await readHousehold(database, TEST_RING, 'no-such-household', grace.accountId),
    ).toBeUndefined();
    expect(await membersOf(database, TEST_RING, ada.household, grace.accountId)).toBeUndefined();
    expect(
      await membersOf(database, TEST_RING, 'no-such-household', grace.accountId),
    ).toBeUndefined();
    expect((await householdsOf(database, TEST_RING, grace.accountId)).map((h) => h.id)).toEqual([
      grace.household,
    ]);
  });

  it('show a member the household under its owner’s name, and keep a member’s email to themselves and the Admin', async () => {
    await join(database, ada.household, grace);
    const seenByGrace = await readHousehold(database, TEST_RING, ada.household, grace.accountId);
    expect(seenByGrace).toMatchObject({ own: false, role: 'member', label: 'Ada’s lists' });
    // Her own first household is listed first, then the one she joined.
    expect((await householdsOf(database, TEST_RING, grace.accountId)).map((h) => h.id)).toEqual([
      grace.household,
      ada.household,
    ]);

    const byAda = await membersOf(database, TEST_RING, ada.household, ada.accountId);
    expect(byAda?.map((m) => [m.name, m.role, m.email])).toEqual([
      ['Ada', 'admin', ada.email],
      ['Grace', 'member', grace.email],
    ]);
    const byGrace = await membersOf(database, TEST_RING, ada.household, grace.accountId);
    expect(byGrace?.map((m) => [m.name, m.email, m.self])).toEqual([
      ['Ada', null, false],
      ['Grace', grace.email, true],
    ]);
  });

  it('end access when a member leaves, at the next statement', async () => {
    await join(database, ada.household, lin);
    expect(await readHousehold(database, TEST_RING, ada.household, lin.accountId)).toBeDefined();
    await leave(database, ada.household, lin);
    expect(await readHousehold(database, TEST_RING, ada.household, lin.accountId)).toBeUndefined();
    expect(await membersOf(database, TEST_RING, ada.household, lin.accountId)).toBeUndefined();
    // Joining again is the same row.
    await join(database, ada.household, lin);
    expect(await readHousehold(database, TEST_RING, ada.household, lin.accountId)).toBeDefined();
    await leave(database, ada.household, lin);
  });

  it('keep a household’s name out of the database', async () => {
    const owner = await somebody(database, 'Named');
    const id = await createHousehold(database, TEST_RING, {
      creatorPersonId: owner.personId,
      name: PLANTED,
    });
    const rows = await dbAll<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'household')} WHERE id = ${id}`,
    );
    expect(JSON.stringify(rows)).not.toContain('Perera');
    expect((await readHousehold(database, TEST_RING, id, owner.accountId))?.label).toBe(PLANTED);
  });
});

describe(`the operations door (${leg})`, () => {
  const ran: string[] = [];
  const operations: readonly Operation[] = [
    {
      name: 'probe.member',
      who: 'member',
      input: z.object({ n: z.number().int().optional() }),
      run: async ({ household, accountId }) => {
        ran.push(`member ${household} ${accountId}`);
        return { ok: true, result: { n: 1 } };
      },
    },
    {
      name: 'probe.admin',
      who: 'admin',
      input: z.object({}),
      run: async ({ household }) => {
        ran.push(`admin ${household}`);
        return { ok: true };
      },
    },
    {
      name: 'probe.refuses',
      who: 'member',
      input: z.object({}),
      run: async () => ({ ok: false, refused: 'Groceries has 500 items, the most it can hold.' }),
    },
  ];

  it('runs an operation for a member, and an Admin’s for an Admin', async () => {
    expect(
      await callAs(database, operations, grace, { op: 'probe.member', household: ada.household }),
    ).toEqual({
      status: 200,
      body: { ok: true, result: { n: 1 } },
    });
    expect(
      (await callAs(database, operations, ada, { op: 'probe.admin', household: ada.household }))
        .status,
    ).toBe(200);
    expect(ran).toHaveLength(2);
  });

  it('answers a Member at an Admin’s operation, an outsider, an unknown household and an unknown operation with one answer', async () => {
    ran.length = 0;
    const replies = await Promise.all([
      callAs(database, operations, grace, { op: 'probe.admin', household: ada.household }),
      callAs(database, operations, lin, { op: 'probe.member', household: ada.household }),
      callAs(database, operations, lin, { op: 'probe.admin', household: ada.household }),
      callAs(database, operations, grace, { op: 'probe.member', household: 'no-such-household' }),
      callAs(database, operations, ada, { op: 'no.such.operation', household: ada.household }),
      callAs(
        database,
        operations,
        { accountId: 'a-stranger' },
        { op: 'probe.member', household: ada.household },
      ),
    ]);
    for (const reply of replies) expect(reply).toEqual(NOT_FOUND);
    expect(ran).toEqual([]);
  });

  it('refuses what is malformed before anything runs, and says a refusal in a sentence', async () => {
    expect((await callAs(database, operations, ada, { op: 'probe.member' })).status).toBe(400);
    expect(
      (
        await callAs(database, operations, ada, {
          op: 'probe.member',
          household: ada.household,
          n: 'x',
        })
      ).status,
    ).toBe(400);
    expect((await callAs(database, operations, ada, 'not an object' as never)).status).toBe(400);
    expect(
      await callAs(database, operations, ada, { op: 'probe.refuses', household: ada.household }),
    ).toEqual({
      status: 409,
      body: {
        ok: false,
        error: 'refused',
        message: 'Groceries has 500 items, the most it can hold.',
      },
    });
  });
});
