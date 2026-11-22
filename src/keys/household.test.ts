import { describe, expect, it } from 'vitest';
import {
  FIELD_VALUE,
  NAME_KEY,
  boundTo,
  deriveListKeyring,
  listNameKey,
  newKeyring,
  openField,
  sealField,
  unwrapKeyring,
  unwrapListKeyring,
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
