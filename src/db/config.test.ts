import { describe, expect, it } from 'vitest';
import {
  DatabaseConfigError,
  describeConfig,
  resolveDatabaseConfig,
  resolveDatabaseSettings,
} from './config';

const noFile = (): string => {
  throw new Error('no file');
};

describe('resolveDatabaseConfig', () => {
  it('defaults to SQLite through an sqld service', () => {
    expect(resolveDatabaseConfig({})).toEqual({
      dialect: 'sqlite',
      form: 'sqld',
      url: 'http://sqld:8080',
      adminUrl: 'http://sqld:8081',
    });
  });

  it('treats an empty SHOPPER_DB_DIALECT as unset, and ignores case and spaces', () => {
    expect(resolveDatabaseConfig({ SHOPPER_DB_DIALECT: '' })).toMatchObject({
      dialect: 'sqlite',
      form: 'sqld',
    });
    expect(resolveDatabaseConfig({ SHOPPER_DB_DIALECT: ' SQLD ' })).toMatchObject({
      dialect: 'sqlite',
      form: 'sqld',
    });
  });

  it('reads an sqld URL and its admin URL, without a trailing slash', () => {
    expect(
      resolveDatabaseConfig({
        SHOPPER_DB_DIALECT: 'sqld',
        SHOPPER_SQLD_URL: 'http://localhost:28080/',
        SHOPPER_SQLD_ADMIN_URL: 'http://localhost:28081/',
      }),
    ).toEqual({
      dialect: 'sqlite',
      form: 'sqld',
      url: 'http://localhost:28080',
      adminUrl: 'http://localhost:28081',
    });
  });

  it.each([
    ['file:/data/shopper.db', '/data/shopper.db', '/data/shopper_auth.db'],
    ['file:///data/shopper.db', '/data/shopper.db', '/data/shopper_auth.db'],
    ['file:./data/shopper.db', './data/shopper.db', './data/shopper_auth.db'],
    ['file:shopper.db', 'shopper.db', 'shopper_auth.db'],
  ])(
    'reads the file %s with SHOPPER_DB_DIALECT=sqlite, and puts the auth database beside it',
    (url, path, authPath) => {
      expect(
        resolveDatabaseConfig({ SHOPPER_DB_DIALECT: 'sqlite', SHOPPER_SQLITE_URL: url }),
      ).toEqual({
        dialect: 'sqlite',
        form: 'file',
        path,
        authPath,
      });
    },
  );

  it.each(['file:', 'file:///', 'file::memory:', 'file:/data/'])(
    'refuses the file URL %s',
    (url) => {
      expect(() =>
        resolveDatabaseConfig({ SHOPPER_DB_DIALECT: 'sqlite', SHOPPER_SQLITE_URL: url }),
      ).toThrow(DatabaseConfigError);
    },
  );

  it('requires a file for sqlite, and refuses an address there', () => {
    expect(() => resolveDatabaseConfig({ SHOPPER_DB_DIALECT: 'sqlite' })).toThrow(
      /requires SHOPPER_SQLITE_URL/,
    );
    expect(() =>
      resolveDatabaseConfig({
        SHOPPER_DB_DIALECT: 'sqlite',
        SHOPPER_SQLITE_URL: 'http://sqld:8080',
      }),
    ).toThrow(/SHOPPER_DB_DIALECT=sqld/);
  });

  it('refuses an sqld URL that is not http(s), and says where a file goes', () => {
    expect(() => resolveDatabaseConfig({ SHOPPER_SQLD_URL: 'libsql://example.turso.io' })).toThrow(
      /SHOPPER_SQLD_URL/,
    );
    expect(() => resolveDatabaseConfig({ SHOPPER_SQLD_URL: 'file:/data/shopper.db' })).toThrow(
      /SHOPPER_SQLITE_URL/,
    );
    expect(() => resolveDatabaseConfig({ SHOPPER_SQLD_URL: 'not a url' })).toThrow(
      /SHOPPER_SQLD_URL is not a valid URL/,
    );
  });

  it('refuses an admin URL that is not http(s)', () => {
    expect(() => resolveDatabaseConfig({ SHOPPER_SQLD_ADMIN_URL: 'ftp://sqld:8081' })).toThrow(
      /SHOPPER_SQLD_ADMIN_URL/,
    );
  });

  it('reads PostgreSQL, with a default pool size', () => {
    expect(
      resolveDatabaseConfig({
        SHOPPER_DB_DIALECT: 'postgres',
        SHOPPER_POSTGRES_URL: 'postgres://u:p@db:5432/shopper',
      }),
    ).toEqual({
      dialect: 'postgres',
      url: 'postgres://u:p@db:5432/shopper',
      poolMax: 10,
    });
  });

  it('reads the PostgreSQL address from a file, as an instance gives a secret', () => {
    const config = resolveDatabaseConfig(
      { SHOPPER_DB_DIALECT: 'postgres', SHOPPER_POSTGRES_URL_FILE: '/run/secrets/db' },
      (path) => (path === '/run/secrets/db' ? 'postgres://u:p@db:5432/shopper\n' : noFile()),
    );
    expect(config).toMatchObject({ dialect: 'postgres', url: 'postgres://u:p@db:5432/shopper' });
  });

  it('refuses the PostgreSQL address given both ways, as for every secret', () => {
    expect(() =>
      resolveDatabaseConfig(
        {
          SHOPPER_DB_DIALECT: 'postgres',
          SHOPPER_POSTGRES_URL: 'postgres://plain/tasks',
          SHOPPER_POSTGRES_URL_FILE: '/x',
        },
        () => 'postgres://from-file/tasks',
      ),
    ).toThrow(/SHOPPER_POSTGRES_URL is set together with SHOPPER_POSTGRES_URL_FILE/);
  });

  it('requires SHOPPER_POSTGRES_URL for PostgreSQL, and it must be a postgres URL, without repeating it', () => {
    expect(() => resolveDatabaseConfig({ SHOPPER_DB_DIALECT: 'postgres' })).toThrow(
      /SHOPPER_POSTGRES_URL/,
    );
    expect(() =>
      resolveDatabaseConfig({ SHOPPER_DB_DIALECT: 'postgres', SHOPPER_POSTGRES_URL: 'http://db' }),
    ).toThrow(/postgres:\/\//);
    const bad = () =>
      resolveDatabaseConfig({
        SHOPPER_DB_DIALECT: 'postgres',
        SHOPPER_POSTGRES_URL: 'hunter2 is not a url',
      });
    expect(bad).toThrow(/SHOPPER_POSTGRES_URL is not a valid URL/);
    expect(bad).not.toThrow(/hunter2/);
  });

  it('does not infer the dialect from a URL', () => {
    // A PostgreSQL URL with the default dialect is a mistake to report, not a hint.
    const config = resolveDatabaseConfig({ SHOPPER_POSTGRES_URL: 'postgres://u:p@db/tasks' });
    expect(config).toMatchObject({ dialect: 'sqlite', form: 'sqld' });
  });

  it('refuses an unknown dialect', () => {
    expect(() => resolveDatabaseConfig({ SHOPPER_DB_DIALECT: 'mysql' })).toThrow(
      /SHOPPER_DB_DIALECT must be "sqld", "sqlite" or "postgres"/,
    );
  });

  it('takes the pool size and CA file for PostgreSQL, and ignores a bad pool size', () => {
    const base = {
      SHOPPER_DB_DIALECT: 'postgres',
      SHOPPER_POSTGRES_URL: 'postgres://u:p@db/tasks',
    };
    expect(
      resolveDatabaseConfig({ ...base, SHOPPER_POSTGRES_POOL_MAX: '12', PGSSLROOTCERT: '/ca.pem' }),
    ).toMatchObject({
      poolMax: 12,
      sslRootCertPath: '/ca.pem',
    });
    for (const bad of ['0', '-3', 'many', '2.5', '']) {
      expect(resolveDatabaseConfig({ ...base, SHOPPER_POSTGRES_POOL_MAX: bad })).toMatchObject({
        poolMax: 10,
      });
    }
  });
});

describe('resolveDatabaseSettings', () => {
  it('waits 30 seconds for a database that is starting, and has no migrations folder of its own, unless told', () => {
    expect(resolveDatabaseSettings({})).toMatchObject({
      connectTimeoutMs: 30_000,
      migrationsDir: undefined,
    });
    expect(
      resolveDatabaseSettings({
        SHOPPER_DB_CONNECT_TIMEOUT_MS: '5000',
        SHOPPER_MIGRATIONS_DIR: ' /app/migrations ',
      }),
    ).toMatchObject({ connectTimeoutMs: 5000, migrationsDir: '/app/migrations' });
  });

  it('ignores a bad timeout rather than trusting it', () => {
    for (const bad of ['0', '-1', 'soon', '']) {
      expect(resolveDatabaseSettings({ SHOPPER_DB_CONNECT_TIMEOUT_MS: bad })).toMatchObject({
        connectTimeoutMs: 30_000,
      });
    }
  });
});

describe('describeConfig', () => {
  it('never prints a password', () => {
    const text = describeConfig(
      resolveDatabaseConfig({
        SHOPPER_DB_DIALECT: 'postgres',
        SHOPPER_POSTGRES_URL: 'postgres://shopper:hunter2@db:5432/app',
      }),
    );
    expect(text).toBe('postgres db:5432/app');
    expect(text).not.toContain('hunter2');
  });

  it('describes the SQLite forms', () => {
    expect(describeConfig(resolveDatabaseConfig({}))).toBe('sqlite via sqld at http://sqld:8080');
    expect(
      describeConfig(
        resolveDatabaseConfig({ SHOPPER_DB_DIALECT: 'sqlite', SHOPPER_SQLITE_URL: 'file:/d/f.db' }),
      ),
    ).toBe('sqlite file /d/f.db');
  });
});
