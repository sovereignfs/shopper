import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { sovereignSignIn, type SovereignSteps } from '@sovereignfs/auth/core';
import type { Database } from '@sovereignfs/auth/database';
import {
  accountTables,
  createAuthPreset,
  keySecrets,
  movePasswords,
  resolveAuthSettings,
  signUpPolicy,
} from '@sovereignfs/auth/server';
import type { Mailer } from '../mail/mailer';
import { resetMessage, verificationMessage } from '../mail/templates';
import type { AuthSettings } from './config';

/**
 * Sign-in (DESIGN.md §15) on `@sovereignfs/auth` (ADR 0001): better-auth on the package's preset, in the auth store, with Shopper's
 * settings, mail and records. The package holds every rule a sign-in keeps (auth.md §4): the server is sent the sign-in value the page
 * derives and never a password, a session is opened only through better-auth's adapter, and a sign-in through core is matched by its
 * `sub`, never by an address. Built from what it is given and nothing global, so a test makes one against any of the three databases
 * (`test-support.ts`); the server makes the one it serves (`server.ts`).
 */
export interface AuthDependencies {
  settings: AuthSettings;
  /** What the app calls itself, for the places a person sees it. */
  name: string;
  /** The auth store, as the package takes it (`src/auth/store.ts`). */
  database: Database;
  /**
   * Where mail goes, if there is any. **With a mailer an address is verified before the first sign-in and a forgotten password is reset
   * by a single-use link; without one, neither exists** and the routes that would do them are not mounted (`app/api/auth`).
   */
  mailer?: Mailer | undefined;
  /** Core's steps (the SDK's `createSovereign`), when core is a way in. */
  sovereign?: SovereignSteps | undefined;
  /**
   * Run once an account has been made, whichever way: the app's own records of it (its person, and its household, tasks 3.1 and 3.3). It
   * lives in the app store, which is another database, so it is not in the account's transaction: a failure is not told to the person,
   * and **the records are made again, idempotently, whenever a session is checked** (`src/auth/session.ts`).
   */
  onAccountCreated?:
    ((account: { id: string; name: string; email: string }) => Promise<void>) | undefined;
  /** Runs a send without the request waiting for it; a test passes one it can wait on. */
  background?: ((task: Promise<unknown>) => void) | undefined;
}

/**
 * How recently a session must have been made to stand in for a password an account does not have: deleting an account that came in
 * through Sovereign alone (`/api/account/delete`). Shopper's own check, on the session's `createdAt`; better-auth's `freshAge` stays 0.
 */
export const FRESH_SESSION_SECONDS = 10 * 60;

/** The package's settings from Shopper's (`src/auth/config.ts`), which were checked at start-up. */
function packageSettings(settings: AuthSettings, mail: boolean) {
  return resolveAuthSettings(
    {
      url: settings.url,
      authSecret: { reveal: () => settings.secret },
      authTrustedOrigins: [],
      authTrustedProxies: [],
      authCookieDomain: undefined,
      authPasswordMinLength: settings.passwordMinLength,
      authPasswordRequireUppercase: false,
      authPasswordRequireLowercase: false,
      authPasswordRequireNumber: false,
      authPasswordRequireSymbol: false,
      // With mail, an address is verified before the first sign-in; without it, there is nothing to verify it with.
      authRequireEmailVerification: mail,
      authWebauthnRpId: undefined,
      authWebauthnRpName: 'Shopper',
      authWebauthnOrigin: [],
    },
    { prefix: 'SHOPPER', appName: 'Shopper' },
  );
}

export function createAuth({
  settings,
  name,
  database,
  mailer,
  sovereign,
  onAccountCreated,
  background,
}: AuthDependencies) {
  // Mail is for the password's account: an address is verified, and a password reset, only where there is a password.
  const mail = settings.local ? mailer : undefined;
  return betterAuth(
    createAuthPreset({
      appName: name,
      database,
      tables: accountTables(database.family),
      settings: packageSettings(settings, mail !== undefined),
      mail: {
        unavailable: () => Promise.resolve(mail ? undefined : 'This instance sends no mail.'),
        verification: async (to, link) => {
          await mail?.send(verificationMessage(name, to.email, link));
        },
        passwordReset: async (to, link) => {
          await mail?.send(resetMessage(name, to.email, link));
        },
        // Shopper has never written to say an account was made.
        accountCreated: () => Promise.resolve(),
      },
      // One policy for every way an account can come to be (DESIGN.md §6.3); a sign-in through core always gets an account (§15.1).
      registration: signUpPolicy(database, settings.signUp),
      localAccounts: settings.local,
      ...(background ? { background } : {}),
      hooks: {
        userCreated: async (user) => {
          if (!onAccountCreated) return;
          const { rows } = await database.run(
            'SELECT id, name, email FROM users WHERE lower(email) = lower(?)',
            [user.email],
          );
          const made = rows[0];
          if (!made) return;
          // Never the account's failure: the sign-up has happened, and the next request makes what is missing.
          await onAccountCreated({
            id: String(made.id),
            name: String(made.name),
            email: String(made.email),
          }).catch(() =>
            console.error('[shopper] an account was made and its records were not (they will be)'),
          );
        },
      },
      plugins: [
        ...(sovereign ? [sovereignSignIn({ sovereign, database })] : []),
        // A password stored before Shopper derived it (0.1.0) moves at its next sign-in, for 90 days (auth.md §8.1).
        ...(settings.local ? [movePasswords({ database })] : []),
        // The session's key secret for the page's keys (RFC 0001, auth.md §8.1): core's `sub` for a session through core.
        keySecrets({ database, core: sovereign !== undefined }),
        // Last: it turns the cookies a server action sets into the response's.
        nextCookies(),
      ],
    }),
  );
}

export type Auth = ReturnType<typeof createAuth>;
