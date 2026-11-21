import { describe, expect, it } from 'vitest';
import { newKeyring } from './household';
import { newLinkSecret, openFromLink, wrapForLink } from './link';

const H = '11111111-1111-4111-8111-111111111111';

describe('a household’s keys in a link', () => {
  it('open with the link’s secret for its household, and with nothing else', async () => {
    const ring = newKeyring();
    const secret = newLinkSecret();
    const wrapped = await wrapForLink(ring, secret, H);
    expect(wrapped).toMatch(/^lk1\./);
    expect((await openFromLink(wrapped, secret, H))?.[1]).toEqual(ring[1]);
    expect(await openFromLink(wrapped, newLinkSecret(), H)).toBeUndefined();
    expect(
      await openFromLink(wrapped, secret, '22222222-2222-4222-8222-222222222222'),
    ).toBeUndefined();
  });
});
