import { describe, expect, it } from 'vitest';
import {
  addPending,
  addPendingCard,
  dropPending,
  dropPendingCard,
  keepPending,
  keepPendingCards,
  readPending,
  readPendingCards,
} from './pending';

/**
 * **Keys waiting to be kept** (RFC 0004, task 21.4; RFC 0007, task 24.5): a copy that did not get to the server waits in the browser's storage, a list's and a card's apart, each replaced by its
 * own and dropped once the server has it. Storage that is blocked, full or holds something else is no copies and never an error.
 */
const storage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
};
const list = (id: string, record = 'lr1.a.b') => ({
  household: 'h',
  list: id,
  person: 'p',
  record,
});
const card = (id: string, record = 'cr1.a.b') => ({
  household: 'h',
  card: id,
  person: 'p',
  record,
});

describe('copies of a list’s keys waiting', () => {
  it('are kept one to a list, replaced by a newer one, and dropped by the list', () => {
    const s = storage();
    addPending(s, list('one'));
    addPending(s, list('two'));
    addPending(s, list('one', 'lr1.new.copy'));
    expect(readPending(s)).toEqual([list('two'), list('one', 'lr1.new.copy')]);
    dropPending(s, 'two');
    expect(readPending(s)).toEqual([list('one', 'lr1.new.copy')]);
  });

  it('are sent again, and only the ones the server took are forgotten', async () => {
    const s = storage();
    addPending(s, list('one'));
    addPending(s, list('two'));
    await keepPending(s, async (entry) => entry.list === 'one');
    expect(readPending(s).map((each) => each.list)).toEqual(['two']);
  });
});

describe('copies of a card’s keys waiting', () => {
  it('are kept one to a card, replaced by a newer one, and dropped by the card', () => {
    const s = storage();
    addPendingCard(s, card('one'));
    addPendingCard(s, card('two'));
    addPendingCard(s, card('one', 'cr1.new.copy'));
    expect(readPendingCards(s)).toEqual([card('two'), card('one', 'cr1.new.copy')]);
    dropPendingCard(s, 'two');
    expect(readPendingCards(s)).toEqual([card('one', 'cr1.new.copy')]);
  });

  it('are sent again, and only the ones the server took are forgotten', async () => {
    const s = storage();
    addPendingCard(s, card('one'));
    addPendingCard(s, card('two'));
    await keepPendingCards(s, async (entry) => entry.card === 'one');
    expect(readPendingCards(s).map((each) => each.card)).toEqual(['two']);
  });

  it('are kept apart from a list’s: neither reads, replaces or drops the other’s', async () => {
    const s = storage();
    // The same id for a list and a card (they are never, but the storage must not be what says so).
    addPending(s, list('same'));
    addPendingCard(s, card('same'));
    expect(readPending(s)).toEqual([list('same')]);
    expect(readPendingCards(s)).toEqual([card('same')]);
    dropPendingCard(s, 'same');
    expect(readPending(s)).toEqual([list('same')]);
    await keepPending(s, async () => true);
    expect(readPending(s)).toEqual([]);
    expect(readPendingCards(s)).toEqual([]);
    expect(s.map.has('shopper.card-keys.pending')).toBe(true);
    expect(s.map.has('shopper.list-keys.pending')).toBe(true);
  });

  it('are none from storage that is blocked, empty, broken or holds something else', () => {
    expect(readPendingCards(undefined)).toEqual([]);
    const s = storage();
    expect(readPendingCards(s)).toEqual([]);
    s.map.set('shopper.card-keys.pending', '{not json');
    expect(readPendingCards(s)).toEqual([]);
    // A list's entry in a card's place, and a card's entry with a number for its record, are not copies.
    s.map.set(
      'shopper.card-keys.pending',
      JSON.stringify([
        list('x'),
        { household: 'h', card: 'c', person: 'p', record: 7 },
        card('ok'),
      ]),
    );
    expect(readPendingCards(s)).toEqual([card('ok')]);
    addPendingCard(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('full');
        },
      },
      card('x'),
    );
  });
});
