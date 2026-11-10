import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { PORTS } from './e2e/ports.ts';

/**
 * Browser tests (`pnpm build && pnpm e2e`): the real app, built, in a real browser. They are where the things a unit test cannot show are shown:
 * a page as a visitor sees it, a policy a browser enforces, a service worker, a network that goes away, a second person on the same list, and a
 * phone's width.
 *
 * One instance of the app runs, on the database form the environment names: a leg of CI sets the variables an operator would set
 * (`SHOPPER_DB_DIALECT` and its address) and this uses them as they are, and with none it is a SQLite file in a directory of its own. The three forms
 * are three runs of this, as the data-layer tests are.
 *
 * Two browsers: Chromium, and WebKit, which is Safari's engine and where iOS's scrolling and compositing differ most. WebKit here is a desktop build:
 * it does not check touch, which the iOS Simulator does, by hand, and says so in the PR.
 *
 * The secret and the key below are for this throwaway instance only.
 */
const PORT = PORTS.app;
const SECRET = 'e2e-only-secret-not-for-anything-real-0123456789';
// Playwright loads this file again in every worker: the first load makes the directory and the others, which inherit the variable, use it.
const directory = process.env.SHOPPER_E2E_DIR ?? mkdtempSync(join(tmpdir(), 'shopper-e2e-'));
process.env.SHOPPER_E2E_DIR = directory;

// Next reads `.env` and `.env.local` and does not override what is already set, so a developer's own settings there would reach this instance.
// Setting a name, even to nothing, keeps it out: an empty value is "not set" to the app.
const BLANK = Object.fromEntries(
  [
    'SHOPPER_URL',
    'SHOPPER_AUTH_LOCAL',
    'SHOPPER_AUTH_SECRET',
    'SHOPPER_AUTH_SIGNUP',
    'SHOPPER_CORE_URL',
    'SHOPPER_CORE_CLIENT_ID',
    'SHOPPER_CORE_CLIENT_SECRET',
    'SHOPPER_CORE_CLIENT_SECRET_FILE',
    'SHOPPER_SMTP_HOST',
    'SHOPPER_WORKER',
    'SHOPPER_ENCRYPTION_KEY',
    'SHOPPER_SYNC_INTERVAL_SECONDS',
  ].map((name) => [name, '']),
);

// With no database named, a file in a directory of its own: the auth database is `shopper_auth.db` beside the app's, and a developer's data is not
// touched.
const database = process.env.SHOPPER_DB_DIALECT
  ? {}
  : { SHOPPER_DB_DIALECT: 'sqlite', SHOPPER_SQLITE_URL: `file:${join(directory, 'shopper.db')}` };

// A directory of its own for the instance that is closed to sign-up: the auth database is `shopper_auth.db` beside the app's, so two instances in one
// directory would share their accounts, and a session cookie (which a port does not separate) would sign a person in on both.
const closedFolder = join(directory, 'closed');
mkdirSync(closedFolder, { recursive: true });

export default defineConfig({
  testDir: 'e2e',
  // One at a time: the instance shares one database, and the tests are quick.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: `node scripts/serve-standalone.mjs ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        ...BLANK,
        ...database,
        SHOPPER_URL: `http://localhost:${PORT}`,
        SHOPPER_AUTH_LOCAL: '1',
        SHOPPER_AUTH_SECRET: SECRET,
        SHOPPER_AUTH_SIGNUP: 'open',
        // A key, as the app refuses to start without one: for this throwaway instance only.
        SHOPPER_ENCRYPTION_KEY: 'e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0',
      } as Record<string, string>,
    },
    {
      command: `node scripts/serve-standalone.mjs ${PORTS.closed}`,
      url: `http://localhost:${PORTS.closed}/api/health`,
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        ...BLANK,
        SHOPPER_DB_DIALECT: 'sqlite',
        SHOPPER_SQLITE_URL: `file:${join(closedFolder, 'shopper.db')}`,
        SHOPPER_URL: `http://localhost:${PORTS.closed}`,
        SHOPPER_AUTH_LOCAL: '1',
        SHOPPER_AUTH_SECRET: SECRET,
        SHOPPER_AUTH_SIGNUP: 'closed',
        SHOPPER_ENCRYPTION_KEY: 'e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0',
      } as Record<string, string>,
    },
  ],
});
