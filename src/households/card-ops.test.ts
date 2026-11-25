import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOT_FOUND, TEST_RING, callAs, somebody, type Someone } from '../access/test-support';
import { addCardMember } from '../cards/members';
import type { Database } from '../db/client';
import { dbGet, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import { applyMutation } from '../sync/apply';
import { deleteCard } from './card-ops';
import { OPERATIONS } from './ops';

/**
 * `card.delete` (task 24.2, DESIGN.md §7.7, §12.8): a card's Admin's online operation. **The statement carries the Admin condition itself**, so it is called here directly, as the
 * dispatcher's early refusal would let nobody through: a Member of the card, a person on a list of its group and a stranger change nothing, and are told it is not theirs.
 */
const { leg } = testTarget();
let database: Database;
let ada: Someone;
let grace: Someone;
let heidi: Someone;
let card = '';
const cipher = (id: string) => `e2.1.${id}.${id}.${'A'.repeat(24)}`;
const count = async (table: string) =>
  Number(
    (
      await dbGet<{ n: number | string }>(
        database,
        sql`SELECT COUNT(*) AS n FROM ${appTable(database, table)} WHERE card_id = ${card}`,
      )
    )?.n,
  );
const run = (who: Someone, id = card) =>
  deleteCard.run(
    {
      database,
      ring: TEST_RING,
      accountId: who.accountId,
      personId: who.personId,
      household: ada.household,
      now: 1,
    },
    { card: id },
  );

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  heidi = await somebody(database, 'Heidi');
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
  );
  card = crypto.randomUUID();
  const made = await applyMutation(
    {
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
    },
    ada.accountId,
    {
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: [
        {
          table: 'card',
          id: card,
          create: true,
          fields: {
            shop: cipher(card),
            number: cipher(card),
            kind: cipher(card),
            code: cipher(card),
            position: 'a1',
            createdAt: 1,
          },
        },
      ],
    },
  );
  expect(made.status).toBe('applied');
  await addCardMember(database, {
    household: ada.household,
    card,
    person: grace.personId,
    role: 'member',
    seq: 1,
    now: 1,
  });
  await dbRun(
    database,
    sql`INSERT INTO ${appTable(database, 'card_key')} (card_id, person_id, household_id, epoch, record, created_at)
        VALUES (${card}, ${grace.personId}, ${ada.household}, 1, 'cr1.x.y', 1)`,
  );
});
afterAll(async () => database.close());

describe(`deleting a card (${leg})`, () => {
  it('is refused by the statement itself for anyone who is not its Admin, and changes nothing', async () => {
    for (const who of [grace, heidi]) {
      const refused = await run(who);
      expect(refused.ok).toBe(false);
      expect(await count('card_member')).toBe(2);
      expect(await count('card_key')).toBe(1);
    }
    expect(
      Number(
        (
          await dbGet<{ n: number | string }>(
            database,
            sql`SELECT COUNT(*) AS n FROM ${appTable(database, 'card')} WHERE id = ${card}`,
          )
        )?.n,
      ),
    ).toBe(1);
  });

  it('reads as not found through the door for anyone who is not its Admin, and for a card that is not the group’s or not there', async () => {
    for (const who of [grace, heidi])
      expect(
        await callAs(database, OPERATIONS, who, {
          op: 'card.delete',
          household: ada.household,
          card,
        }),
      ).toEqual(NOT_FOUND);
    for (const other of [crypto.randomUUID(), 'not-an-id'])
      expect(
        await callAs(database, OPERATIONS, ada, {
          op: 'card.delete',
          household: ada.household,
          card: other,
        }),
      ).toEqual(NOT_FOUND);
    // Another group's household named with this card: the card is not that group's.
    expect(
      await callAs(database, OPERATIONS, ada, {
        op: 'card.delete',
        household: grace.household,
        card,
      }),
    ).toEqual(NOT_FOUND);
  });

  it('deletes the card, its people and every copy of its keys for its Admin, once', async () => {
    expect((await run(ada)).ok).toBe(true);
    expect(await count('card_member')).toBe(0);
    expect(await count('card_key')).toBe(0);
    expect((await run(ada)).ok).toBe(false);
  });
});
