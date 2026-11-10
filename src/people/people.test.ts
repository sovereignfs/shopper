import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ringOf } from '../crypto/keys';
import type { Database } from '../db/client';
import { openDatabase } from '../db/client';
import { dbAll } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { createAuth } from '../auth/auth';
import type { AuthSettings } from '../auth/config';
import { TestClient } from '../auth/test-support';
import { ensurePerson, personById, personOfAccount, updatePerson } from './people';
import { asSeenBy, canSeeEmail } from './visibility';

const { leg } = testTarget();
const ring = ringOf(Buffer.alloc(32, 5));
if (!ring) throw new Error('no ring');
const PLANTED_NAME = 'PLANTED-Thulana-Perera';
const PLANTED_EMAIL = 'planted-thulana@example.com';

let database: Database;
beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
});
afterAll(async () => database.close());

describe(`persons (${leg})`, () => {
  it('make one person for an account, whoever asks and however often, and read it back', async () => {
    const account = { id: 'acct-1', name: 'Ada', email: 'ada@example.com' };
    const first = await ensurePerson(database, ring, account);
    const again = await ensurePerson(database, ring, account);
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({
      accountId: 'acct-1',
      kind: 'account',
      name: 'Ada',
      email: 'ada@example.com',
      deleted: false,
    });
    expect(await personOfAccount(database, ring, 'acct-1')).toEqual(first);
    expect(await personById(database, ring, first.id)).toEqual(first);
    expect(await personOfAccount(database, ring, 'nobody')).toBeUndefined();
  });

  it('make exactly one when two ask at once', async () => {
    const account = { id: 'acct-race', name: 'Race', email: 'race@example.com' };
    const people = await Promise.all(
      Array.from({ length: 6 }, () => ensurePerson(database, ring, account)),
    );
    expect(new Set(people.map((p) => p.id)).size).toBe(1);
    const rows = await dbAll<{ n: number | string }>(
      database,
      sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'person')} WHERE account_id = 'acct-race'`,
    );
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('keep the name and the email out of the database, whole row and all', async () => {
    await ensurePerson(database, ring, {
      id: 'acct-sealed',
      name: PLANTED_NAME,
      email: PLANTED_EMAIL,
    });
    const rows = await dbAll<Record<string, unknown>>(
      database,
      sql`SELECT * FROM ${appTable(database, 'person')}`,
    );
    const text = JSON.stringify(rows);
    expect(text).not.toContain(PLANTED_NAME);
    expect(text).not.toContain(PLANTED_EMAIL);
    expect(text).not.toContain('Thulana');
    expect(text).not.toContain('planted-thulana');
  });

  it('follow a change of name or email, and lose none of two made at once', async () => {
    await ensurePerson(database, ring, { id: 'acct-edit', name: 'Old', email: 'old@example.com' });
    await Promise.all([
      updatePerson(database, ring, 'acct-edit', { name: 'New' }),
      updatePerson(database, ring, 'acct-edit', { email: 'new@example.com' }),
    ]);
    expect(await personOfAccount(database, ring, 'acct-edit')).toMatchObject({
      name: 'New',
      email: 'new@example.com',
    });
    expect(await updatePerson(database, ring, 'no-such-account', { name: 'x' })).toBeUndefined();
  });
});

describe('who sees an email', () => {
  it('is the person themselves and an Admin they share a household with, and no one else', () => {
    const base = { viewerAccountId: 'a', targetAccountId: 'b', adminOfSharedHousehold: false };
    expect(canSeeEmail(base)).toBe(false);
    expect(canSeeEmail({ ...base, adminOfSharedHousehold: true })).toBe(true);
    expect(canSeeEmail({ ...base, targetAccountId: 'a' })).toBe(true);
    // Someone with no account is nobody's own.
    expect(canSeeEmail({ ...base, targetAccountId: null })).toBe(false);
  });

  it('gives the name to everyone and the email to whom it is allowed', () => {
    const person = { name: 'Thulana', email: 'thulana@example.com' };
    expect(asSeenBy(person, false)).toEqual({ name: 'Thulana', email: null });
    expect(asSeenBy(person, true)).toEqual(person);
  });
});

describe(`an account's person is made with the account (${leg})`, () => {
  it('has exactly one person for each account that signs up, and the sign-up does not fail without it', async () => {
    // The auth store beside the app store, migrated, and not reset (the stores are shared on sqld and PostgreSQL).
    const authDatabase = await openDatabase(testTarget().config, 'auth');
    await runMigrations(authDatabase);
    const settings: AuthSettings = {
      url: 'http://localhost:3000',
      secret: 'test-secret-'.padEnd(40, 'x'),
      signUp: 'open',
      passwordMinLength: 10,
      local: true,
      sovereign: undefined,
    };
    let fail = false;
    const auth = createAuth({
      settings,
      name: 'Shopper',
      database: authDatabase,
      onAccountCreated: async (account) => {
        if (fail) throw new Error('the app store is down');
        await ensurePerson(database, ring, account);
      },
    });
    const client = new TestClient(auth, settings.url).from('10.9.9.9');
    const made = await client.post('/api/auth/sign-up/email', {
      name: 'Grace',
      email: 'grace@example.com',
      password: 'correct horse battery',
    });
    expect(made.status).toBe(200);
    const id = made.body.user.id as string;
    expect(await personOfAccount(database, ring, id)).toMatchObject({
      name: 'Grace',
      email: 'grace@example.com',
    });

    // The app store failing does not fail the sign-up, and the person is made by the next call.
    fail = true;
    const second = await client.from('10.9.9.10').post('/api/auth/sign-up/email', {
      name: 'Lin',
      email: 'lin@example.com',
      password: 'correct horse battery',
    });
    expect(second.status).toBe(200);
    const secondId = second.body.user.id as string;
    expect(await personOfAccount(database, ring, secondId)).toBeUndefined();
    fail = false;
    await ensurePerson(database, ring, { id: secondId, name: 'Lin', email: 'lin@example.com' });
    expect(await personOfAccount(database, ring, secondId)).toMatchObject({ name: 'Lin' });
    await authDatabase.close();
  });
});
