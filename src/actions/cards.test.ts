import { describe, expect, it } from 'vitest';
import { canChange, changeCard, makeCard, moveCard } from './cards';
import { validateMutation } from './validate';
import type { CardRow } from './rows';
import { env } from './test-support';

/** The actions on loyalty cards (task 24.2, 24.3, DESIGN.md §7.7): what they make, only what differs, and what the screen offers. */
const HOUSEHOLD = '10000000-0000-4000-8000-000000000001';
const card = (over: Partial<CardRow> = {}): CardRow => ({
  id: '90000000-0000-4000-8000-000000000001',
  householdId: HOUSEHOLD,
  shop: 'Tesco',
  number: '5901234123457',
  kind: 'ean13',
  code: '5901234123457',
  icon: null,
  color: null,
  holder: null,
  note: null,
  position: 'a1',
  deletedAt: null,
  createdAt: 1,
  seq: 1,
  ...over,
});

describe('making a card', () => {
  it('is a create in the person’s own group with what the card needs, and only the optional fields that were given', () => {
    const made = makeCard(env(), {
      householdId: HOUSEHOLD,
      position: 'a5',
      shop: 'Boots',
      number: '77',
      kind: 'code128',
      code: '77',
      color: '#2563eb',
      icon: null,
      holder: '',
      note: undefined,
    });
    expect(made.householdId).toBe(HOUSEHOLD);
    expect(made.changes).toHaveLength(1);
    expect(made.changes[0]).toMatchObject({ table: 'card', create: true });
    expect(made.changes[0]?.fields).toEqual({
      shop: 'Boots',
      number: '77',
      kind: 'code128',
      code: '77',
      color: '#2563eb',
      position: 'a5',
      createdAt: 1_800_000_000_000,
    });
    // What it says is a mutation the validators take.
    expect(validateMutation(made).ok).toBe(true);
  });

  it('is refused by the validators for a kind that is not one, and for an empty shop or number', () => {
    const bad = (over: Record<string, unknown>) =>
      validateMutation({
        mutationId: '90000000-0000-4000-8000-0000000000aa',
        householdId: HOUSEHOLD,
        changes: [
          {
            table: 'card',
            id: '90000000-0000-4000-8000-0000000000bb',
            create: true,
            fields: {
              shop: 'x',
              number: '1',
              kind: 'qr',
              code: 'x',
              position: 'a1',
              createdAt: 1,
              ...over,
            },
          },
        ],
      }).ok;
    expect(bad({})).toBe(true);
    expect(bad({ kind: 'pdf417' })).toBe(false);
    expect(bad({ shop: '' })).toBe(false);
    expect(bad({ number: '' })).toBe(false);
    expect(bad({ code: 'x'.repeat(1001) })).toBe(false);
    expect(bad({ color: 'blue' })).toBe(false);
  });
});

describe('changing a card', () => {
  it('says only what differs, so that what someone else changed in another field is not written over', () => {
    const changed = changeCard(env(), card(), { shop: 'Tesco Clubcard', number: '5901234123457' });
    expect(changed?.changes[0]).toMatchObject({
      table: 'card',
      id: card().id,
      fields: { shop: 'Tesco Clubcard' },
    });
    expect(changed?.changes[0]?.create).toBeUndefined();
    expect(changeCard(env(), card(), { shop: 'Tesco', note: null })).toBeNull();
    expect(changeCard(env(), card(), {})).toBeNull();
  });

  it('clears an icon, a colour, the name on the card and a note with null, and sets them', () => {
    const had = card({ icon: 'gift', color: '#dc2626', holder: 'Ada', note: 'x' });
    expect(
      changeCard(env(), had, { icon: null, color: null, holder: null, note: null })?.changes[0]
        ?.fields,
    ).toEqual({ icon: null, color: null, holder: null, note: null });
    expect(changeCard(env(), card(), { holder: 'Grace' })?.changes[0]?.fields).toEqual({
      holder: 'Grace',
    });
  });

  it('puts a card in a place, and says nothing for the place it has', () => {
    expect(moveCard(env(), card(), 'a0')?.changes[0]?.fields).toEqual({ position: 'a0' });
    expect(moveCard(env(), card(), 'a1')).toBeNull();
  });
});

describe('what the screen offers', () => {
  it('changes and deletes for a card’s Admin alone, and for nobody before the device knows the card’s people', () => {
    expect(canChange('admin')).toBe(true);
    expect(canChange('member')).toBe(false);
    expect(canChange(undefined)).toBe(false);
  });
});
