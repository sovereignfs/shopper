import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetIdentity, parseIdentity } from './identity';

describe('who is remembered on the device', () => {
  it('reads exactly an identity and nothing else', () => {
    expect(parseIdentity('{"id":"a","name":"Ada","email":"ada@example.com"}')).toEqual({
      id: 'a',
      name: 'Ada',
      email: 'ada@example.com',
    });
    for (const bad of [
      null,
      '',
      'nonsense',
      '[]',
      'null',
      '{"id":"","name":"x","email":"y"}',
      '{"id":"a","name":1,"email":"y"}',
      '{"id":"a","name":"x"}',
    ])
      expect(parseIdentity(bad)).toBeNull();
  });

  it('drops anything extra a stored value carries', () => {
    expect(parseIdentity('{"id":"a","name":"x","email":"y","token":"secret"}')).toEqual({
      id: 'a',
      name: 'x',
      email: 'y',
    });
  });
});

describe('leaving a device', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes from it everything kept for the account, the apps the launcher listed too, and nothing kept for another account', () => {
    const data: Record<string, string> = {
      'shopper.me': '{"id":"ada","name":"Ada","email":"ada@example.com"}',
      'shopper.keys': '{}',
      'shopper.encrypted.ada': '["h"]',
      'shopper.apps.ada': '[{"id":"tusk"}]',
      'shopper.apps.grace': '[{"id":"tusk"}]',
      'shopper.encrypted.grace': '["h"]',
    };
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => data[key] ?? null,
        removeItem: (key: string) => void Reflect.deleteProperty(data, key),
      },
    });
    forgetIdentity();
    expect(Object.keys(data).sort()).toEqual(['shopper.apps.grace', 'shopper.encrypted.grace']);
  });
});
