import { describe, expect, it } from 'vitest';
import {
  FIELD_VALUE,
  NAME_KEY_V2,
  householdNameKey,
  newKeyring,
  openField,
  sealField,
  unwrapKeyring,
  wrapKeyring,
} from './household';

const appKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const H = '11111111-1111-4111-8111-111111111111';
const ROW = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const target = { household: H, table: 'item', row: ROW, field: 'name' };

describe('a household’s keyring', () => {
  it('opens only with the app key it was wrapped under, for the person and household it was wrapped for', async () => {
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

describe('a field', () => {
  it('round-trips, says what it was encrypted for, and holds no plain text', async () => {
    const ring = newKeyring();
    const value = await sealField(ring, target, 'Oat milk, the marker MK9');
    expect(value).toMatch(FIELD_VALUE);
    expect(value).not.toContain('MK9');
    expect(value.split('.').slice(0, 3)).toEqual(['e1', '1', ROW]);
    expect(await openField(ring, target, value)).toBe('Oat milk, the marker MK9');
  });

  it('does not open under another field, table, household or row, nor with another keyring, nor changed', async () => {
    const ring = newKeyring();
    const value = await sealField(ring, target, 'x');
    expect(await openField(ring, { ...target, field: 'note' }, value)).toBeUndefined();
    expect(await openField(ring, { ...target, table: 'list' }, value)).toBeUndefined();
    expect(await openField(ring, { ...target, household: OTHER }, value)).toBeUndefined();
    expect(await openField(ring, { ...target, row: OTHER }, value)).toBeUndefined();
    expect(await openField(newKeyring(), target, value)).toBeUndefined();
    const changed = value.slice(0, -2) + (value.endsWith('AA') ? 'BB' : 'AA');
    expect(await openField(ring, target, changed)).toBeUndefined();
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
  it('is the same for a name in a household on every epoch, different in another household, and reveals nothing', async () => {
    const ring = newKeyring(1);
    const key = await householdNameKey(ring, H, 'oat milk');
    expect(key).toMatch(NAME_KEY_V2);
    expect(await householdNameKey({ ...ring, ...newKeyring(2) }, H, 'oat milk')).toBe(key);
    expect(await householdNameKey(ring, OTHER, 'oat milk')).not.toBe(key);
    expect(await householdNameKey(ring, H, 'oat milks')).not.toBe(key);
    expect(await householdNameKey(newKeyring(1), H, 'oat milk')).not.toBe(key);
  });
});
