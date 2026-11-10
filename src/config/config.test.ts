import { describe, expect, it } from 'vitest';
import { loadConfig, type Config } from './index';
import { readEnvironment } from './env';

const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');
const SECRET = 'x'.repeat(48);

/** The smallest settings that start the server alone. */
const alone = {
  SHOPPER_URL: 'https://shopper.example.com',
  SHOPPER_AUTH_LOCAL: '1',
  SHOPPER_AUTH_SECRET: SECRET,
  SHOPPER_ENCRYPTION_KEY: KEY,
};

function ok(env: Record<string, string>, readFile?: (path: string) => string): Config {
  const result = loadConfig(env, readFile);
  if (!result.ok) throw new Error(`expected settings to load, got: ${result.problems.join(' ')}`);
  return result.config;
}

function problems(env: Record<string, string>, readFile?: (path: string) => string): string[] {
  const result = loadConfig(env, readFile);
  if (result.ok) throw new Error('expected settings to be refused');
  return [...result.problems];
}

describe('loading the settings', () => {
  it('starts alone with a key, an address and a secret, and defaults the rest', () => {
    const config = ok(alone);
    expect(config.url).toBe('https://shopper.example.com');
    expect(config.worker).toBe(true);
    expect(config.auth).toMatchObject({ local: true, signUp: 'open', passwordMinLength: 10 });
    expect(config.syncIntervalSeconds).toBe(20);
    expect(config.limits).toEqual({
      householdMembers: 20,
      accountHouseholds: 20,
      householdLists: 100,
      listOpenItems: 500,
      householdProducts: 5000,
    });
    expect(config.mail).toBeUndefined();
  });

  it('refuses to start with no encryption key, however the rest is set', () => {
    const { SHOPPER_ENCRYPTION_KEY: _key, ...without } = alone;
    expect(problems(without)).toEqual([expect.stringContaining('SHOPPER_ENCRYPTION_KEY')]);
  });

  it('names every problem at once, and no value', () => {
    const found = problems({
      SHOPPER_URL: 'http://shopper.example.com',
      SHOPPER_AUTH_LOCAL: 'yes',
      SHOPPER_ENCRYPTION_KEY: 'not-a-key-but-secret-looking',
      SHOPPER_WORKER: 'sometimes',
      SHOPPER_SYNC_INTERVAL_SECONDS: '1',
      SHOPPER_LIMIT_LIST_OPEN_ITEMS: '0',
    });
    expect(found.length).toBeGreaterThanOrEqual(5);
    for (const name of [
      'SHOPPER_URL',
      'SHOPPER_AUTH_LOCAL',
      'SHOPPER_ENCRYPTION_KEY',
      'SHOPPER_WORKER',
      'SHOPPER_SYNC_INTERVAL_SECONDS',
      'SHOPPER_LIMIT_LIST_OPEN_ITEMS',
    ]) {
      expect(found.join('\n')).toContain(name);
    }
    expect(found.join('\n')).not.toContain('not-a-key-but-secret-looking');
    expect(found.join('\n')).not.toContain('shopper.example.com');
  });

  it('reads a secret from a file, and refuses both forms or a file for a plain setting', () => {
    const { SHOPPER_AUTH_SECRET: _secret, ...rest } = alone;
    const files: Record<string, string> = { '/run/secrets/auth': `${SECRET}\n` };
    const readFile = (path: string) => {
      const text = files[path];
      if (text === undefined) throw new Error('no such file');
      return text;
    };
    expect(
      ok({ ...rest, SHOPPER_AUTH_SECRET_FILE: '/run/secrets/auth' }, readFile).auth?.secret,
    ).toBe(SECRET);
    expect(
      readEnvironment({ ...alone, SHOPPER_AUTH_SECRET_FILE: '/run/secrets/auth' }, readFile).ok,
    ).toBe(false);
    expect(problems({ ...alone, SHOPPER_URL_FILE: '/x' })).toEqual([
      'SHOPPER_URL_FILE is not read: only a secret can be given as a file.',
    ]);
  });

  it('refuses a short secret, a missing address and sign-in with no secret', () => {
    expect(problems({ ...alone, SHOPPER_AUTH_SECRET: 'short' }).join()).toContain(
      'SHOPPER_AUTH_SECRET must be at least 32',
    );
    const { SHOPPER_URL: _url, ...noUrl } = alone;
    expect(problems(noUrl).join()).toContain('SHOPPER_URL');
    const { SHOPPER_AUTH_SECRET: _secret, ...noSecret } = alone;
    expect(problems(noSecret).join()).toContain('SHOPPER_AUTH_SECRET');
  });

  it('refuses http except on localhost, and a path in the address', () => {
    expect(ok({ ...alone, SHOPPER_URL: 'http://localhost:3007' }).url).toBe(
      'http://localhost:3007',
    );
    expect(problems({ ...alone, SHOPPER_URL: 'http://shopper.example.com' }).join()).toContain(
      'must be https',
    );
    expect(problems({ ...alone, SHOPPER_URL: 'https://shopper.example.com/app' }).join()).toContain(
      'no path',
    );
  });

  it('sign-up is open by default and closed when told, and nothing else', () => {
    expect(ok({ ...alone, SHOPPER_AUTH_SIGNUP: 'closed' }).auth?.signUp).toBe('closed');
    expect(problems({ ...alone, SHOPPER_AUTH_SIGNUP: 'invite' })).toEqual([
      'SHOPPER_AUTH_SIGNUP is open or closed.',
    ]);
  });

  it('takes Sovereign sign-in alone, or refuses part of it', () => {
    const core = {
      SHOPPER_CORE_URL: 'https://sovereign.example.com/',
      SHOPPER_CORE_CLIENT_ID: 'shopper',
      SHOPPER_CORE_CLIENT_SECRET: 'core-secret',
    };
    const { SHOPPER_AUTH_LOCAL: _local, ...coreOnly } = { ...alone, ...core };
    expect(ok(coreOnly).auth).toMatchObject({
      local: false,
      sovereign: { issuer: 'https://sovereign.example.com' },
    });
    const partial = problems({ ...alone, SHOPPER_CORE_URL: core.SHOPPER_CORE_URL });
    expect(partial.join()).toContain(
      'SHOPPER_CORE_CLIENT_ID, SHOPPER_CORE_CLIENT_SECRET are missing',
    );
    expect(partial.join()).not.toContain('core-secret');
  });

  it('checks the key ring: a previous key needs a current one and a different one', () => {
    expect(
      ok({ ...alone, SHOPPER_ENCRYPTION_KEY_PREVIOUS: OTHER_KEY }).encryption.previous,
    ).toBeDefined();
    expect(problems({ ...alone, SHOPPER_ENCRYPTION_KEY_PREVIOUS: KEY }).join()).toContain(
      'is the same key',
    );
    expect(problems({ ...alone, SHOPPER_ENCRYPTION_KEY_PREVIOUS: 'nope' }).join()).toContain(
      'SHOPPER_ENCRYPTION_KEY_PREVIOUS is not a key',
    );
  });

  it('knows a key by its fingerprint and never shows it', () => {
    const { encryption } = ok(alone);
    expect(encryption.current.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(encryption.current.fingerprint)).not.toContain(KEY);
  });

  it('reads mail as a whole or not at all', () => {
    expect(
      ok({
        ...alone,
        SHOPPER_SMTP_HOST: 'smtp.example.com',
        SHOPPER_SMTP_FROM: 'Shopper <s@example.com>',
      }).mail,
    ).toMatchObject({
      port: 587,
      secure: false,
    });
    expect(problems({ ...alone, SHOPPER_SMTP_HOST: 'smtp.example.com' }).join()).toContain(
      'SHOPPER_SMTP_FROM',
    );
    expect(
      problems({
        ...alone,
        SHOPPER_SMTP_HOST: 'smtp.example.com',
        SHOPPER_SMTP_FROM: 's@example.com',
        SHOPPER_SMTP_USER: 'user',
      }).join(),
    ).toContain('both or neither');
  });

  it('reads the limits and the interval, and refuses what is not a count', () => {
    const config = ok({
      ...alone,
      SHOPPER_SYNC_INTERVAL_SECONDS: '60',
      SHOPPER_LIMIT_HOUSEHOLD_MEMBERS: '3',
    });
    expect(config.syncIntervalSeconds).toBe(60);
    expect(config.limits.householdMembers).toBe(3);
    expect(problems({ ...alone, SHOPPER_LIMIT_HOUSEHOLD_LISTS: '1.5' }).join()).toContain(
      'SHOPPER_LIMIT_HOUSEHOLD_LISTS',
    );
    expect(problems({ ...alone, SHOPPER_SYNC_INTERVAL_SECONDS: '601' }).join()).toContain(
      '5 to 600',
    );
  });

  it('a blank setting is no setting', () => {
    expect(ok({ ...alone, SHOPPER_WORKER: '  ', SHOPPER_SMTP_HOST: '' }).worker).toBe(true);
  });
});
