import { confirmPassword, readSession } from '@sovereignfs/auth/server';
import { accountRoute } from '@/src/access/route';
import { authSettings, getAuth } from '@/src/auth/server';
import { getConfig } from '@/src/config/current';
import { getAuthStore, getDatabase } from '@/src/db/boot';
import { RateLimiter } from '@/src/limits/rate';
import { personRecords } from '@/src/portability/records';
import { readableExport } from '@/src/portability/readable-route';
import packageJson from '../../../../package.json';

// A person's readable export (RFC 0005): their records, for their browser to open, after the password again. The account is the session's.
export const dynamic = 'force-dynamic';

export const POST = accountRoute(async ({ request, accountId }) => {
  const database = await getDatabase();
  return readableExport(request, accountId, {
    local: authSettings()?.local === true,
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
    records: (id) => personRecords(database, getConfig().encryption, id),
  });
});
