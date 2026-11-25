import { describe, expect, it } from 'vitest';
import {
  FIELD_VALUE,
  NAME_KEY,
  boundTo,
  deriveCardKeyring,
  deriveInventoryKeyring,
  deriveListKeyring,
  deviceInventoryNameKey,
  listNameKey,
  newKeyring,
  openField,
  sealField,
  unwrapCardKeyring,
  unwrapKeyring,
  unwrapListKeyring,
  wrapCardKeyring,
  wrapKeyring,
  wrapListKeyring,
} from './household';

const appKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const H = '11111111-1111-4111-8111-111111111111';
const ROW = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const LIST = '44444444-4444-4444-8444-444444444444';
const LIST2 = '55555555-5555-4555-8555-555555555555';
const target = { list: LIST, table: 'item', row: ROW, field: 'name' };

describe('a group’s keyring', () => {
  it('opens only with the app key it was wrapped under, for the person and group it was wrapped for', async () => {
    const key = await appKey();
    const ring = newKeyring();
    const record = await wrapKeyring(key, ring, { person: 'p1', household: H });
    expect(record).toMatch(/^hk1\./);
    const opened = await unwrapKeyring(key, record, { person: 'p1', household: H });
    expect(opened?.[1]).toEqual(ring[1]);
    expect(
      await unwrapKeyring(await appKey(), record, { person: 'p1', household: H }),
    ).toBeUndefined();
    expect(await unwrapKeyring(key, record, { person: 'p2', household: H })).toBeUndefined();
    expect(await unwrapKeyring(key, record, { person: 'p1', household: OTHER })).toBeUndefined();
    expect(await unwrapKeyring(key, 'nonsense', { person: 'p1', household: H })).toBeUndefined();
  });
});

describe('a list’s keyring (RFC 0004)', () => {
  it('is derived from the group’s, the same every time, different for every list, and not the group’s', async () => {
    const group = newKeyring();
    const one = await deriveListKeyring(group, LIST);
    expect(await deriveListKeyring(group, LIST)).toEqual(one);
    expect((await deriveListKeyring(group, LIST2))[1]).not.toEqual(one[1]);
    expect(one[1]).not.toEqual(group[1]);
    expect((await deriveListKeyring(newKeyring(), LIST))[1]).not.toEqual(one[1]);
  });

  it('opens what was written on its list and nothing written on another list of the group', async () => {
    const group = newKeyring();
    const groceries = await deriveListKeyring(group, LIST);
    const hardware = await deriveListKeyring(group, LIST2);
    const screws = await sealField(hardware, { ...target, list: LIST2 }, 'Screws');
    // Even told it is for Hardware, Groceries' keys do not open it.
    expect(await openField(groceries, { ...target, list: LIST2 }, screws)).toBeUndefined();
    expect(await openField(hardware, { ...target, list: LIST2 }, screws)).toBe('Screws');
  });

  it('wrapped for a person opens only with their key, for them and that list', async () => {
    const key = await appKey();
    const ring = await deriveListKeyring(newKeyring(), LIST);
    const record = await wrapListKeyring(key, ring, { person: 'p1', list: LIST });
    expect(record).toMatch(/^lr1\./);
    expect((await unwrapListKeyring(key, record, { person: 'p1', list: LIST }))?.[1]).toEqual(
      ring[1],
    );
    expect(await unwrapListKeyring(key, record, { person: 'p1', list: LIST2 })).toBeUndefined();
    expect(await unwrapListKeyring(key, record, { person: 'p2', list: LIST })).toBeUndefined();
    // A group's record is not a list's, nor the other way.
    expect(await unwrapKeyring(key, record, { person: 'p1', household: LIST })).toBeUndefined();
  });
});

describe('a field', () => {
  it('round-trips, says what list and row it was encrypted for, and holds no plain text', async () => {
    const ring = newKeyring();
    const value = await sealField(ring, target, 'Oat milk, the marker MK9');
    expect(value).toMatch(FIELD_VALUE);
    expect(value).not.toContain('MK9');
    expect(value.split('.').slice(0, 4)).toEqual(['e2', '1', LIST, ROW]);
    expect(boundTo(value)).toEqual({ list: LIST, row: ROW });
    expect(await openField(ring, target, value)).toBe('Oat milk, the marker MK9');
  });

  it('does not open under another field, table, list or row, nor with another keyring, nor changed', async () => {
    const ring = newKeyring();
    const value = await sealField(ring, target, 'x');
    expect(await openField(ring, { ...target, field: 'note' }, value)).toBeUndefined();
    expect(await openField(ring, { ...target, table: 'list' }, value)).toBeUndefined();
    expect(await openField(ring, { ...target, list: LIST2 }, value)).toBeUndefined();
    expect(await openField(ring, { ...target, row: OTHER }, value)).toBeUndefined();
    expect(await openField(newKeyring(), target, value)).toBeUndefined();
    const changed = value.slice(0, -2) + (value.endsWith('AA') ? 'BB' : 'AA');
    expect(await openField(ring, target, changed)).toBeUndefined();
    // A value that says it is for another list is not opened as this one's.
    const moved = value.replace(LIST, LIST2);
    expect(await openField(ring, target, moved)).toBeUndefined();
  });

  it('opens on the row a fold moved it to, when that row names it as an alias', async () => {
    const ring = newKeyring();
    const value = await sealField(ring, target, 'two pints');
    const folded = { ...target, row: OTHER };
    expect(await openField(ring, folded, value)).toBeUndefined();
    expect(await openField(ring, folded, value, [ROW])).toBe('two pints');
  });

  it('opens a value of an earlier epoch with a keyring that holds it', async () => {
    const first = newKeyring(1);
    const value = await sealField(first, target, 'old');
    const both = { ...first, ...newKeyring(2) };
    expect(await openField(both, target, value)).toBe('old');
    expect((await sealField(both, target, 'new')).split('.')[1]).toBe('2');
  });
});

describe('the name key', () => {
  it('is the same for a name on a list on every epoch, different on another list, and reveals nothing', async () => {
    const ring = newKeyring(1);
    const key = await listNameKey(ring, LIST, 'oat milk');
    expect(key).toMatch(NAME_KEY);
    expect(await listNameKey({ ...ring, ...newKeyring(2) }, LIST, 'oat milk')).toBe(key);
    expect(await listNameKey(ring, LIST2, 'oat milk')).not.toBe(key);
    expect(await listNameKey(ring, LIST, 'oat milks')).not.toBe(key);
    expect(await listNameKey(newKeyring(1), LIST, 'oat milk')).not.toBe(key);
  });
});

describe('a group’s Inventory keyring (§13.2, task 23.3)', () => {
  it('is derived from the group’s, the same every time, for its group alone, and is neither the group’s nor any list’s', async () => {
    const group = newKeyring();
    const inventory = await deriveInventoryKeyring(group, H);
    expect(await deriveInventoryKeyring(group, H)).toEqual(inventory);
    expect((await deriveInventoryKeyring(group, OTHER))[1]).not.toEqual(inventory[1]);
    expect((await deriveInventoryKeyring(newKeyring(), H))[1]).not.toEqual(inventory[1]);
    expect(inventory[1]).not.toEqual(group[1]);
    // Even with the group's id in the place of a list's, the list derivation is another key: nothing a list's keys hold opens it, and it opens nothing of a list's.
    expect((await deriveListKeyring(group, H))[1]).not.toEqual(inventory[1]);
  });

  it('is the HKDF it says it is, so that a wrong label is noticed and not only a round trip', async () => {
    const group = newKeyring();
    const base = await crypto.subtle.importKey('raw', group[1] ?? new Uint8Array(), 'HKDF', false, [
      'deriveBits',
    ]);
    const expected = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(),
          info: new TextEncoder().encode(`shopper:inventory-key:v1|${H}`),
        },
        base,
        256,
      ),
    );
    expect((await deriveInventoryKeyring(group, H))[1]).toEqual(expected);
    // And a list's, which this change must not have moved: its label and its id, as they were.
    const listExpected = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(),
          info: new TextEncoder().encode(`shopper:list-key:v1|${LIST}`),
        },
        base,
        256,
      ),
    );
    expect((await deriveListKeyring(group, LIST))[1]).toEqual(listExpected);
  });

  it('opens a value written for the group and not under a list’s keys, nor a list’s value, and binds it to its row, table and field', async () => {
    const group = newKeyring();
    const inventory = await deriveInventoryKeyring(group, H);
    const at = { list: H, table: 'inventory_item', row: ROW, field: 'name' };
    const value = await sealField(inventory, at, 'Good bin bags');
    expect(boundTo(value)).toEqual({ list: H, row: ROW });
    expect(await openField(inventory, at, value)).toBe('Good bin bags');
    // The list derivation with the group's id, the one a careless call would use, opens nothing of it.
    expect(await openField(await deriveListKeyring(group, H), at, value)).toBeUndefined();
    // Moved to another table, field, row or group, it does not open (an item's, a note's, another row's).
    expect(await openField(inventory, { ...at, table: 'item' }, value)).toBeUndefined();
    expect(await openField(inventory, { ...at, field: 'note' }, value)).toBeUndefined();
    expect(await openField(inventory, { ...at, row: OTHER }, value)).toBeUndefined();
    expect(await openField(inventory, { ...at, list: OTHER }, value)).toBeUndefined();
    // A list's value opens under the list's keys alone, never under the group's Inventory keys.
    const list = await deriveListKeyring(group, LIST);
    const itemValue = await sealField(list, target, 'Oat milk');
    expect(await openField(inventory, target, itemValue)).toBeUndefined();
  });

  it('gives the name key of an Inventory item: the same for a name on every epoch, a group’s own, and never the name key of a product of any list', async () => {
    const group = newKeyring(1);
    const inventory = await deriveInventoryKeyring(group, H);
    const key = await deviceInventoryNameKey(inventory, H, 'oat milk');
    expect(key).toMatch(NAME_KEY);
    const later = { ...group, ...newKeyring(2) };
    expect(
      await deviceInventoryNameKey(await deriveInventoryKeyring(later, H), H, 'oat milk'),
    ).toBe(key);
    expect(await deviceInventoryNameKey(inventory, OTHER, 'oat milk')).not.toBe(key);
    expect(await deviceInventoryNameKey(inventory, H, 'oat milks')).not.toBe(key);
    // A product of the same name on a list with the group's id has another key: they are not folded into each other.
    expect(await listNameKey(await deriveListKeyring(group, H), H, 'oat milk')).not.toBe(key);
  });
});

describe('a card’s keyring (task 24.2, RFC 0007)', () => {
  const CARD = '66666666-6666-4666-8666-666666666666';
  const CARD2 = '77777777-7777-4777-8777-777777777777';
  const person = '88888888-8888-4888-8888-888888888888';
  const where = { list: CARD, table: 'card', row: CARD, field: 'number' };

  it('is derived from the group’s, for the card alone: another card’s keys, a list’s of the same id, the group’s Inventory keys and the group’s own open nothing of it, and it opens none of theirs', async () => {
    const group = newKeyring();
    const card = await deriveCardKeyring(group, CARD);
    expect(await deriveCardKeyring(group, CARD)).toEqual(card);
    const value = await sealField(card, where, 'secret-number');
    expect(await openField(card, where, value)).toBe('secret-number');
    for (const other of [
      await deriveCardKeyring(group, CARD2),
      await deriveListKeyring(group, CARD),
      await deriveInventoryKeyring(group, CARD),
      group,
    ])
      expect(await openField(other, where, value)).toBeUndefined();
    // And the card's keys open a list's value, an Inventory value and the group's value of the same place: none.
    for (const made of [
      await sealField(await deriveListKeyring(group, CARD), where, 'x'),
      await sealField(await deriveInventoryKeyring(group, CARD), where, 'x'),
      await sealField(group, where, 'x'),
    ])
      expect(await openField(card, where, made)).toBeUndefined();
    await expect(deriveCardKeyring(group, 'not-an-id')).rejects.toThrow();
  });

  it('is wrapped under a person’s own key for that person and that card alone, and a list’s wrapper is not a card’s', async () => {
    const key = await appKey();
    const card = await deriveCardKeyring(newKeyring(), CARD);
    const record = await wrapCardKeyring(key, card, { person, card: CARD });
    expect(record.startsWith('cr1.')).toBe(true);
    expect(await unwrapCardKeyring(key, record, { person, card: CARD })).toEqual(card);
    expect(await unwrapCardKeyring(key, record, { person, card: CARD2 })).toBeUndefined();
    expect(await unwrapCardKeyring(key, record, { person: OTHER, card: CARD })).toBeUndefined();
    expect(await unwrapCardKeyring(await appKey(), record, { person, card: CARD })).toBeUndefined();
    const listRecord = await wrapListKeyring(key, card, { person, list: CARD });
    expect(await unwrapCardKeyring(key, listRecord, { person, card: CARD })).toBeUndefined();
    expect(await unwrapListKeyring(key, record, { person, list: CARD })).toBeUndefined();
  });
});
