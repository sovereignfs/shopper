import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { genericOAuth } from 'better-auth/plugins';
import type { Database } from '../db/client';
import type { Mailer } from '../mail/mailer';
import { resetMessage, verificationMessage } from '../mail/templates';
import * as postgresAuth from '../db/schema/postgres/auth';
import * as sqliteAuth from '../db/schema/sqlite/auth';
import {
  type AuthSettings,
  SIGNUP_CLOSED,
  SOVEREIGN_PROVIDER_ID,
  SOVEREIGN_SCOPES,
} from './config';
import { countUsers } from './users';

/**
 * Sign-in (DESIGN.md §15) on better-auth, stored in the auth store through its Drizzle adapter. Built from settings and a database and nothing
 * global, so a test can make one against any of the three databases (`test-support.ts`); the server makes the one it serves (`server.ts`).
 *
 * In 0.1.0 a local account signs in with an email and a password; passkeys and the authenticator app are phase 2 (task 2.8), and linking a core
 * account to a local one is task 2.9.
 */
export interface AuthDependencies {
  settings: AuthSettings;
  /** What the app calls itself, for the places a person sees it. */
  name: string;
  /** The auth store's database. */
  database: Database;
  /**
   * Where mail goes, if there is any. **With a mailer an address is verified before the first sign-in (the link signs in) and a forgotten password is reset by
   * a single-use link that ends every other session; without one, neither exists** and the routes that would do them are not mounted (`app/api/auth`).
   */
  mailer?: Mailer | undefined;
  /**
   * Run once an account has been made, whichever way: the app's own records of it (its person, and its household, tasks 3.1 and 3.3). It lives in the
   * app store, which is another database, so it is not in the account's transaction: a failure is not told to the person, and **the records are made
   * again, idempotently, whenever a session is checked** (`src/auth/session.ts`).
   */
  onAccountCreated?:
    ((account: { id: string; name: string; email: string }) => Promise<void>) | undefined;
}

/** The prefix of better-auth's cookies, so that ours do not collide with another app's on localhost. */
export const COOKIE_PREFIX = 'shopper';

/**
 * How recently a session must have been made for the things that ask for a fresh one: deleting an account that has no password to ask for. Ten
 * minutes: long enough to do them after signing in, short enough that a session left open is not enough.
 */
export const FRESH_SESSION_SECONDS = 10 * 60;

export function createAuth({
  settings,
  name,
  database,
  mailer,
  onAccountCreated,
}: AuthDependencies) {
  const schema = database.dialect === 'postgres' ? postgresAuth : sqliteAuth;
  const { local, sovereign } = settings;
  // Mail is for the password's account: an address is verified, and a password reset, only where there is a password.
  const mail = local ? mailer : undefined;

  return betterAuth({
    appName: name,
    secret: settings.secret,
    baseURL: settings.url,
    trustedOrigins: [settings.url],
    database: drizzleAdapter(database.db, {
      provider: database.dialect === 'postgres' ? 'pg' : 'sqlite',
      schema,
    }),
    // Without mail there is nothing to verify an address with, so sign-up is immediate and signs the person in.
    emailAndPassword: {
      enabled: local,
      minPasswordLength: settings.passwordMinLength,
      // With mail, a new account is signed in by the link it is sent and not before; without it, at once.
      autoSignIn: mail === undefined,
      requireEmailVerification: mail !== undefined,
      ...(mail
        ? {
            // A reset link is good once and for an hour, and using it ends every session of the account.
            resetPasswordTokenExpiresIn: 60 * 60,
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
              // Not awaited by the request (a slow mail server would tell a visitor which addresses have accounts by how long it takes) and a failure is not told to them.
              void mail.send(resetMessage(name, user.email, url)).catch(() => undefined);
            },
          }
        : {}),
    },
    ...(mail
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => {
              void mail.send(verificationMessage(name, user.email, url)).catch(() => undefined);
            },
          },
        }
      : {}),
    account: {
      // A Sovereign login is matched to an account by its `sub`, never by an email address that happens to be a local account's (DESIGN.md §15.1). Linking
      // is a later task (2.9): until then a Sovereign login whose address is a local account's is refused (`account_not_linked`), and nothing is ever linked
      // at sign-in.
      accountLinking: {
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        // Unlinking can never leave an account with no way to sign in: its last one stays.
        allowUnlinkingAll: false,
        // Sovereign's contract is that `email` is verified, which is what linking asks of a provider.
        ...(sovereign ? { trustedProviders: [SOVEREIGN_PROVIDER_ID] } : {}),
      },
      // What core hands over is not used after sign-in; what is kept is kept encrypted.
      encryptOAuthTokens: true,
    },
    // A session is fresh for ten minutes (`FRESH_SESSION_SECONDS`), for the few things that ask for it.
    session: { freshAge: FRESH_SESSION_SECONDS },
    // Counted in the database, not in memory, so that a limit holds across every process.
    rateLimit: { enabled: true, storage: 'database' },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: settings.url.startsWith('https:'),
      // better-auth skips its origin check when NODE_ENV is "test", which would let a test pass on behaviour production does not have. Say
      // so, so that the two are the same.
      disableOriginCheck: false,
    },
    databaseHooks: {
      user: {
        create: {
          // One policy for every way an account can come to be (DESIGN.md §6.3), here and not in a route, so that it holds for all of them. That a
          // sign-in through core always gets an account, whatever this says, is task 2.3's.
          before: async () => {
            if (settings.signUp === 'open') return;
            if ((await countUsers(database)) > 0) {
              // With a code, so that a refusal can be told apart from any other 403.
              throw new APIError('FORBIDDEN', {
                message: 'Sign-up is closed on this instance.',
                code: SIGNUP_CLOSED,
              });
            }
          },
          after: async (user) => {
            // Never the account's failure: the sign-up has happened, and the next request makes what is missing.
            await onAccountCreated?.({ id: user.id, name: user.name, email: user.email }).catch(
              () =>
                console.error(
                  '[shopper] an account was made and its records were not (they will be)',
                ),
            );
          },
        },
      },
    },
    plugins: [
      ...(sovereign
        ? [
            genericOAuth({
              config: [
                {
                  providerId: SOVEREIGN_PROVIDER_ID,
                  discoveryUrl: `${sovereign.issuer}/.well-known/openid-configuration`,
                  // The profile comes from the ID token, so this refuses to run on one that cannot be checked against the issuer's keys: a discovery
                  // document without them is not a reason to trust whatever the token endpoint says.
                  requireIdTokenVerification: true,
                  clientId: sovereign.clientId,
                  clientSecret: sovereign.clientSecret,
                  authentication: 'basic',
                  scopes: SOVEREIGN_SCOPES,
                  pkce: true,
                  // Signing out of Shopper does not sign the person out of core, which is their account for other things as well.
                  disableProviderLogout: true,
                  // Core's contract is `sub`, `email` and `name`; a missing name is not a reason to refuse.
                  mapProfileToUser: (profile: Record<string, unknown>) => ({
                    name:
                      typeof profile.name === 'string' && profile.name.trim() !== ''
                        ? profile.name
                        : String(profile.email ?? '').split('@')[0] || 'Sovereign user',
                    emailVerified: profile.emailVerified === true,
                  }),
                },
              ],
            }),
          ]
        : []),
      // Must be last: it turns cookies set while handling a Server Action into real ones.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
