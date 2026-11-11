import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING } from '../src/access/test-support';
import { type TestAuth, makeAuth } from '../src/auth/test-support';
import { type Database, openDatabase } from '../src/db/client';
import { dbAll } from '../src/db/exec';
import { runMigrations } from '../src/db/migrate';
import { appTable } from '../src/db/tables';
import { testTarget } from '../src/db/test-support';
import { householdsOf, membersOf } from '../src/households/households';
import { liveInvitations } from '../src/households/invitations';
import { SEEDS, isLocalDatabase, removeSeed, runSeed, type SeedContext } from './seed';

const { leg, config } = testTarget();

let auth: TestAuth;
let app: Database;
beforeAll(async () => {
  // The sessions' store first, which starts the stores from empty; then the app's beside it.
  auth = await makeAuth();
  app = await openDatabase(config, 'app');
  await runMigrations(app);
});
afterAll(async () => {
  await app.close();
  await auth.close();
});

const context = (): SeedContext => ({
  stores: { app, auth: auth.database },
  settings: auth.settings,
  ring: TEST_RING,
  now: Date.UTC(2026, 10, 1, 9, 0, 0),
});

/** Every table the seed writes, as counts, to see that a second run changes nothing. */
async function snapshot(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of [
    'person',
    'household',
    'member',
    'category',
    'list',
    'item',
    'product',
    'invitation',
    'alias',
    'tombstone',
    'applied_mutation',
  ]) {
    const rows = await dbAll<{ n: number | string }>(
      app,
      sql`SELECT COUNT(*) AS n FROM ${appTable(app, table)}`,
    );
    out[table] = Number(rows[0]?.n ?? 0);
  }
  const users = await dbAll<{ n: number | string }>(
    auth.database,
    sql`SELECT COUNT(*) AS n FROM ${auth.database.dialect === 'postgres' ? sql.raw('"shopper_auth"."user"') : sql.raw('"user"')}`,
  );
  out.user = Number(users[0]?.n ?? 0);
  return out;
}

describe(`the development seed (${leg})`, () => {
  it('shows every screen populated: shared and own households, open, bought, cleared and archived items, a link waiting, someone who left, and a fold', async () => {
    const { people } = await runSeed(context());
    const { one, two, three } = people;

    // Three accounts, each with a household of its own; Seed's is shared with Seed Two, and Seed Three has gone from it.
    const mine = await householdsOf(app, TEST_RING, one.accountId);
    expect(mine.map((h) => h.id)).toEqual([one.household]);
    expect((await householdsOf(app, TEST_RING, two.accountId)).map((h) => h.id).sort()).toEqual(
      [one.household, two.household].sort(),
    );
    expect((await householdsOf(app, TEST_RING, three.accountId)).map((h) => h.id)).toEqual([
      three.household,
    ]);
    const members = await membersOf(app, TEST_RING, one.household, one.accountId);
    expect(members?.map((m) => [m.name, m.role])).toEqual([
      ['Seed', 'admin'],
      ['Seed Two', 'member'],
    ]);
    const leftRow = await dbAll<{ left_at: number | null }>(
      app,
      sql`SELECT left_at FROM ${appTable(app, 'member')} WHERE household_id = ${one.household} AND person_id = ${three.personId}`,
    );
    expect(leftRow[0]?.left_at).not.toBeNull();

    // Lists: Groceries, Hardware store, Party supplies, and one archived.
    const lists = await dbAll<{ archived_at: number | null }>(
      app,
      sql`SELECT archived_at FROM ${appTable(app, 'list')} WHERE household_id = ${one.household}`,
    );
    expect(lists).toHaveLength(4);
    expect(lists.filter((l) => l.archived_at !== null)).toHaveLength(1);

    // Items: open, bought, cleared; and the one Seed Three added is still there under their name.
    const items = await dbAll<{
      bought_at: number | null;
      cleared_at: number | null;
      deleted_at: number | null;
      added_by: string;
    }>(
      app,
      sql`SELECT bought_at, cleared_at, deleted_at, added_by FROM ${appTable(app, 'item')} WHERE household_id = ${one.household}`,
    );
    expect(
      items.filter((i) => i.bought_at === null && i.cleared_at === null).length,
    ).toBeGreaterThan(8);
    expect(
      items.filter((i) => i.bought_at !== null && i.cleared_at === null).length,
    ).toBeGreaterThanOrEqual(2);
    expect(items.filter((i) => i.cleared_at !== null).length).toBe(2);
    expect(items.some((i) => i.added_by === three.personId)).toBe(true);
    expect(items.some((i) => i.added_by === two.personId)).toBe(true);

    // A product and an item that two people made at once, folded into one and recorded as an alias.
    const aliases = await dbAll(
      app,
      sql`SELECT * FROM ${appTable(app, 'alias')} WHERE household_id = ${one.household}`,
    );
    expect(aliases.length).toBeGreaterThanOrEqual(1);

    // A link waiting.
    expect(
      await liveInvitations(app, TEST_RING, {
        household: one.household,
        accountId: one.accountId,
        now: context().now,
      }),
    ).toHaveLength(1);

    // The others have a list of their own, with something on it.
    for (const who of [two, three]) {
      const own = await dbAll(
        app,
        sql`SELECT 1 AS one FROM ${appTable(app, 'item')} WHERE household_id = ${who.household}`,
      );
      expect(own.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('changes nothing the second time, nor the third', async () => {
    const before = await snapshot();
    expect((await runSeed(context())).created).toBe(false);
    expect(await snapshot()).toEqual(before);
    await runSeed(context());
    expect(await snapshot()).toEqual(before);
  });

  it('is taken away with the accounts, the households nobody else is in, and nothing else, and can be made again', async () => {
    // Something that is not the seed's, which must be as it was.
    const bystander = await runSeedBystander();
    expect(await removeSeed(context())).toBe(SEEDS.length);
    for (const seed of SEEDS) {
      const found = await dbAll(
        auth.database,
        sql`SELECT id FROM ${auth.database.dialect === 'postgres' ? sql.raw('"shopper_auth"."user"') : sql.raw('"user"')} WHERE email = ${seed.email}`,
      );
      expect(found, seed.email).toHaveLength(0);
    }
    expect(await removeSeed(context())).toBe(0);
    expect(await householdsOf(app, TEST_RING, bystander.accountId)).toHaveLength(1);
    // And again.
    const again = await runSeed(context());
    expect(again.created).toBe(true);
    expect(
      await membersOf(app, TEST_RING, again.people.one.household, again.people.one.accountId),
    ).toHaveLength(2);
  });
});

describe('where the seed is allowed to run', () => {
  it('is local only: a file, or a service on this machine, and nothing else', () => {
    expect(
      isLocalDatabase({ dialect: 'sqlite', form: 'file', path: 'x.db', authPath: 'y.db' }),
    ).toBe(true);
    expect(
      isLocalDatabase({ dialect: 'postgres', url: 'postgres://u@localhost:5432/db', poolMax: 1 }),
    ).toBe(true);
    expect(
      isLocalDatabase({ dialect: 'postgres', url: 'postgres://u@db.example.com/db', poolMax: 1 }),
    ).toBe(false);
    expect(
      isLocalDatabase({
        dialect: 'sqlite',
        form: 'sqld',
        url: 'http://sqld:8080',
        adminUrl: 'http://sqld:8081',
      }),
    ).toBe(false);
    expect(
      isLocalDatabase({
        dialect: 'sqlite',
        form: 'sqld',
        url: 'http://localhost:8080',
        adminUrl: 'http://127.0.0.1:8081',
      }),
    ).toBe(true);
  });
});

/** An account that is not the seed's, with its household, made as sign-up makes one. */
async function runSeedBystander() {
  const { somebody } = await import('../src/access/test-support');
  return somebody(app, 'Bystander');
}
