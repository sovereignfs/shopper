import { coreSignedInAt } from '@sovereignfs/auth/core';
import { confirmPassword, readSession } from '@sovereignfs/auth/server';
import { accountRoute } from '@/src/access/route';
import { authSettings, getAuth } from '@/src/auth/server';
import { getConfig } from '@/src/config/current';
import { getAuthStore, getDatabase } from '@/src/db/boot';
import { RateLimiter } from '@/src/limits/rate';
import { personRecords } from '@/src/portability/records';
import { readableExport } from '@/src/portability/readable-route';
import packageJson from '../../../../package.json';

// A person's readable export (RFC 0005): their records, for their browser to open, after the password again, or, hosted by Sovereign, a sign-in at core made in the
// last few minutes. The account is the session's.
export const dynamic = 'force-dynamic';

export const POST = accountRoute(async ({ request, accountId }) => {
  const database = await getDatabase();
  return readableExport(request, accountId, {
    confirmation: authSettings()?.sovereign ? 'core' : 'password',
    limiter: new RateLimiter(database),
    now: Date.now,
    version: packageJson.version,
    // The password again (its sign-in value), through the package, which counts wrong answers per account (auth.md §4, rule 3).
    verify: async (req, password) => {
      const auth = await getAuth();
      if (!auth) return false;
      const session = await readSession(auth, req.headers);
      if (!session) return false;
      return (
        (await confirmPassword(await getAuthStore(), auth, session.user.id, password)) === 'ok'
      );
    },
    // When they last signed in at core on this session: core's claim, kept by the package, and never anything the request says.
    signedInAt: async (req) => {
      const auth = await getAuth();
      if (!auth) return undefined;
      const session = await readSession(auth, req.headers);
      return session ? coreSignedInAt(await getAuthStore(), session.session.id) : undefined;
    },
    records: (id) => personRecords(database, getConfig().encryption, id),
  });
});
