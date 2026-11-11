import { describe, expect, it } from 'vitest';
import { parseIdentity } from './identity';

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
