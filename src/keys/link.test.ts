import { describe, expect, it } from 'vitest';
import { deriveListKeyring, newKeyring, openField, sealField } from './household';
import { newLinkSecret, openFromLink, wrapForLink } from './link';

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
