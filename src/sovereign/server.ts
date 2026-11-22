import { coreNotices, type CoreNoticeOptions } from '@sovereignfs/auth/core';
import type { Database as AuthStore } from '@sovereignfs/auth/database';
import { sdkTokenStore } from '../auth/sdk-stores';
import { authSettings, getAuth } from '../auth/server';
import { getConfig } from '../config/current';
import type { KeyRing } from '../crypto/keys';
import type { Database } from '../db/client';
import { getAuthDatabase, getAuthStore, getDatabase } from '../db/boot';
import { type Limiter, RateLimiter } from '../limits/rate';
import { accountOfSub } from './identity';
import { guarded } from './notices';
import { deletePerson } from './people';

export type Notices = {
  backChannelLogout(request: Request): Promise<Response>;
  accountDeleted(request: Request): Promise<Response>;
};

/** What the notices act on: the stores, the sign-in, core's address and Shopper's own deletion. */
export type NoticeWiring = {
  auth: CoreNoticeOptions['auth'];
  authStore: AuthStore;
  database: Database;
  authDatabase: Database;
  ring: KeyRing;
  coreUrl: string;
  clientId: string;
  limiter?: Limiter | undefined;
  fetch?: typeof fetch;
};

/**
 * Core's notices for Shopper (`notices.ts`): the package's `coreNotices` on the auth store, with Shopper's deletion of a person (DESIGN.md
 * §15.2) and the person's refresh token dropped, behind Shopper's guards. The server makes it once (`noticeHandlers`); a test makes its own.
 */
export function buildNotices(wiring: NoticeWiring): Notices {
  const { authStore, database, authDatabase, ring } = wiring;
  const handlers = coreNotices({
    database: authStore,
    auth: wiring.auth,
    coreUrl: wiring.coreUrl,
    clientId: wiring.clientId,
    ...(wiring.fetch ? { fetch: wiring.fetch } : {}),
    // Everything of the person here goes, before the notice is answered. A person nobody here knows (never signed in, or already deleted:
    // core sends a deletion until it is answered) is done.
    onAccountDeleted: async (sub) => {
      const accountId = await accountOfSub(authStore, sub);
      if (accountId !== null)
        await deletePerson({ database, authDatabase, ring, now: Date.now }, accountId);
    },
    // The person's refresh token, for a notice that names the whole person (sdk §5.1).
    dropRefreshToken: async (sub) => {
      await sdkTokenStore(
        () => Promise.resolve(authStore),
        () => ring,
      ).delete?.(sub);
    },
  });
  return {
    backChannelLogout: guarded(handlers.backChannelLogout, wiring.limiter),
    accountDeleted: guarded(handlers.accountDeleted, wiring.limiter),
  };
}

/**
 * This instance's handlers, or undefined when Sovereign sign-in is not set up, when there is nothing to hear from, and the routes answer
 * 404. Made once, so the limiter's counts are one process's.
 */
const KEY = Symbol.for('shopper.sovereign-notices');
type Holder = { [KEY]?: Promise<Notices | undefined> };

export function noticeHandlers(): Promise<Notices | undefined> {
  const store = globalThis as Holder;
  store[KEY] ??= make().catch((error: unknown) => {
    store[KEY] = undefined;
    throw error;
  });
  return store[KEY];
}

async function make(): Promise<Notices | undefined> {
  const sovereign = authSettings()?.sovereign;
  const auth = await getAuth();
  if (!sovereign || !auth) return undefined;
  const database = await getDatabase();
  return buildNotices({
    auth,
    authStore: await getAuthStore(),
    database,
    authDatabase: await getAuthDatabase(),
    ring: getConfig().encryption,
    coreUrl: sovereign.issuer,
    clientId: sovereign.clientId,
    limiter: new RateLimiter(database),
  });
}
