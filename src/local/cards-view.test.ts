import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { CardRow } from '../actions/rows';
import { type LocalDatabase, deleteLocal, localName, openLocal } from './db';
import { cardViewOf, cardsScreenOf } from './cards-view';

/**
 * What the Cards screens read from the device (task 24.3, DESIGN.md §16.14): the person's own cards, in the order they put them, then those shared with them, each with the reader's place on it
 * and whose it is; a card the device does not have, or one deleted, is not there.
 */
const names: string[] = [];
const opened: LocalDatabase[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await deleteLocal('', name);
});

const card = (
  id: string,
  household: string,
  position: string,
  over: Partial<CardRow> = {},
): CardRow => ({
  id,
  householdId: household,
  shop: `Shop ${id}`,
  number: '1',
  kind: 'qr',
  code: 'x',
  icon: null,
  color: null,
  holder: null,
  note: null,
  position,
  deletedAt: null,
  createdAt: 1,
  seq: 1,
  ...over,
});
const person = (
  cardId: string,
  personId: string,
  role: 'admin' | 'member',
  self: boolean,
  name: string,
) => ({
  cardId,
  personId,
  householdId: 'h',
  name,
  email: null,
  role,
  joinedAt: 1,
  leftAt: null,
  self,
  seq: 1,
});

async function device() {
  const name = localName(`cards-view-${crypto.randomUUID()}`);
  names.push(name);
  const db = await openLocal('', name);
  opened.push(db);
  await db.put('household', {
    id: 'mine',
    label: 'Mine',
    own: true,
    role: 'admin',
    seq: 1,
    cursor: 1,
  });
  await db.put('household', {
    id: 'theirs',
    label: 'Theirs',
    own: false,
    role: 'member',
    seq: 1,
    cursor: 1,
  });
  return db;
}

describe('the cards a device shows', () => {
  it('are the person’s own in the order they put them, then those shared with them with whose they are, and the reader’s place on each', async () => {
    const db = await device();
    await db.put('card', card('c2', 'mine', 'a2'));
    await db.put('card', card('c1', 'mine', 'a1'));
    await db.put('card', card('s1', 'theirs', 'a1'));
    await db.put('card_member', person('c1', 'p-me', 'admin', true, 'Me'));
    await db.put('card_member', person('c2', 'p-me', 'admin', true, 'Me'));
    await db.put('card_member', person('s1', 'p-ada', 'admin', false, 'Ada'));
    await db.put('card_member', person('s1', 'p-me', 'member', true, 'Me'));
    const data = await cardsScreenOf(db);
    expect(data.household).toBe('mine');
    expect(data.own.map((view) => [view.card.id, view.role, view.by, view.people])).toEqual([
      ['c1', 'admin', null, 1],
      ['c2', 'admin', null, 1],
    ]);
    expect(data.shared.map((view) => [view.card.id, view.role, view.by, view.people])).toEqual([
      ['s1', 'member', 'Ada', 2],
    ]);
    expect(data.last).toBe('a2');
  });

  it('leaves out a deleted card, and a card whose person left, and has none to put a new card after when there are none', async () => {
    const db = await device();
    expect((await cardsScreenOf(db)).last).toBeNull();
    await db.put('card', card('gone', 'mine', 'a1', { deletedAt: 5 }));
    await db.put('card', card('kept', 'mine', 'a2'));
    await db.put('card_member', { ...person('kept', 'p-old', 'admin', false, 'Old'), leftAt: 3 });
    await db.put('card_member', person('kept', 'p-me', 'admin', true, 'Me'));
    const data = await cardsScreenOf(db);
    expect(data.own.map((view) => view.card.id)).toEqual(['kept']);
    expect(data.own[0]?.people).toBe(1);
    expect(await cardViewOf(db, 'gone')).toBeUndefined();
    expect(await cardViewOf(db, 'nothing')).toBeUndefined();
    expect((await cardViewOf(db, 'kept'))?.role).toBe('admin');
  });

  it('does not say a place before the device has the card’s people', async () => {
    const db = await device();
    await db.put('card', card('bare', 'mine', 'a1'));
    expect((await cardViewOf(db, 'bare'))?.role).toBeNull();
  });

  it('has no own group before the device has one, and then offers nothing to add a card to', async () => {
    const name = localName(`cards-view-${crypto.randomUUID()}`);
    names.push(name);
    const db = await openLocal('', name);
    opened.push(db);
    const data = await cardsScreenOf(db);
    expect(data.household).toBeUndefined();
    expect(data.own).toEqual([]);
  });
});
