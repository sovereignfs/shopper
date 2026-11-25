import { describe, expect, it } from 'vitest';
import {
  deriveCardKeyring,
  deriveListKeyring,
  newKeyring,
  openField,
  sealField,
} from './household';
import {
  newLinkSecret,
  openCardFromLink,
  openFromLink,
  wrapCardForLink,
  wrapForLink,
} from './link';

const GROCERIES = '11111111-1111-4111-8111-111111111111';
const HARDWARE = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';

describe('a list’s keys in a link', () => {
  it('open with the link’s secret for its list, and with nothing else', async () => {
    const ring = newKeyring();
    const secret = newLinkSecret();
    const wrapped = await wrapForLink(ring, secret, GROCERIES);
    expect(wrapped).toMatch(/^lk2\./);
    expect((await openFromLink(wrapped, secret, GROCERIES))?.[1]).toEqual(ring[1]);
    expect(await openFromLink(wrapped, newLinkSecret(), GROCERIES)).toBeUndefined();
    expect(await openFromLink(wrapped, secret, HARDWARE)).toBeUndefined();
  });

  it('carry what opens that list, and nothing that opens another list of the group (RFC 0004)', async () => {
    const group = newKeyring();
    const secret = newLinkSecret();
    const link = await wrapForLink(await deriveListKeyring(group, GROCERIES), secret, GROCERIES);
    const given = await openFromLink(link, secret, GROCERIES);
    if (!given) throw new Error('the link did not open');
    const milk = await sealField(
      await deriveListKeyring(group, GROCERIES),
      { list: GROCERIES, table: 'item', row: ROW, field: 'name' },
      'Oat milk',
    );
    const screws = await sealField(
      await deriveListKeyring(group, HARDWARE),
      { list: HARDWARE, table: 'item', row: ROW, field: 'name' },
      'Screws',
    );
    expect(
      await openField(given, { list: GROCERIES, table: 'item', row: ROW, field: 'name' }, milk),
    ).toBe('Oat milk');
    expect(
      await openField(given, { list: HARDWARE, table: 'item', row: ROW, field: 'name' }, screws),
    ).toBeUndefined();
  });
});

const TESCO = '44444444-4444-4444-8444-444444444444';
const BOOTS = '55555555-5555-4555-8555-555555555555';

describe('a card’s keys in a link', () => {
  it('open with the link’s secret for its card, and with nothing else, under a prefix of their own', async () => {
    const ring = newKeyring();
    const secret = newLinkSecret();
    const wrapped = await wrapCardForLink(ring, secret, TESCO);
    expect(wrapped).toMatch(/^ck2\./);
    expect((await openCardFromLink(wrapped, secret, TESCO))?.[1]).toEqual(ring[1]);
    expect(await openCardFromLink(wrapped, newLinkSecret(), TESCO)).toBeUndefined();
    expect(await openCardFromLink(wrapped, secret, BOOTS)).toBeUndefined();
  });

  it('are never a list’s, and a list’s are never a card’s, whatever the secret and the id', async () => {
    const ring = newKeyring();
    const secret = newLinkSecret();
    const card = await wrapCardForLink(ring, secret, TESCO);
    const list = await wrapForLink(ring, secret, TESCO);
    expect(await openFromLink(card, secret, TESCO)).toBeUndefined();
    expect(await openCardFromLink(list, secret, TESCO)).toBeUndefined();
    // Even with the prefix changed to the other's, the record is bound to what it was made for.
    expect(await openFromLink(`lk2.${card.slice('ck2.'.length)}`, secret, TESCO)).toBeUndefined();
    expect(
      await openCardFromLink(`ck2.${list.slice('lk2.'.length)}`, secret, TESCO),
    ).toBeUndefined();
  });

  it('carry what opens that card, and nothing that opens another card of the group, or a list', async () => {
    const group = newKeyring();
    const secret = newLinkSecret();
    const link = await wrapCardForLink(await deriveCardKeyring(group, TESCO), secret, TESCO);
    const given = await openCardFromLink(link, secret, TESCO);
    if (!given) throw new Error('the link did not open');
    const number = await sealField(
      await deriveCardKeyring(group, TESCO),
      { list: TESCO, table: 'card', row: TESCO, field: 'number' },
      '5901234123457',
    );
    const other = await sealField(
      await deriveCardKeyring(group, BOOTS),
      { list: BOOTS, table: 'card', row: BOOTS, field: 'number' },
      '1234',
    );
    const asList = await sealField(
      await deriveListKeyring(group, TESCO),
      { list: TESCO, table: 'item', row: TESCO, field: 'name' },
      'Oat milk',
    );
    expect(
      await openField(given, { list: TESCO, table: 'card', row: TESCO, field: 'number' }, number),
    ).toBe('5901234123457');
    expect(
      await openField(given, { list: BOOTS, table: 'card', row: BOOTS, field: 'number' }, other),
    ).toBeUndefined();
    expect(
      await openField(given, { list: TESCO, table: 'item', row: TESCO, field: 'name' }, asList),
    ).toBeUndefined();
  });
});
