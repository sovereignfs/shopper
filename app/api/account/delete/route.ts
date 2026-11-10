import { accountRoute } from '@/src/access/route';
import { FRESH_SESSION_SECONDS } from '@/src/auth/auth';
import { accountHasPassword } from '@/src/auth/password';
import { getAuth } from '@/src/auth/server';
import { getConfig } from '@/src/config/current';
import { getAuthDatabase, getDatabase } from '@/src/db/boot';
import { RateLimiter } from '@/src/limits/rate';
import { deleteAccount, deletionPreview, type DeleteDeps } from '@/src/sovereign/delete-account';

// Deleting the account (DESIGN.md §19): what it would do, and doing it with the password. The account is the session's.
export const dynamic = 'force-dynamic';

async function deps(): Promise<DeleteDeps> {
  const database = await getDatabase();
  const authDatabase = await getAuthDatabase();
  return {
    database,
    authDatabase,
    ring: getConfig().encryption,
    limiter: new RateLimiter(database),
    now: Date.now,
    verify: async (request, password) => {
      const auth = await getAuth();
      if (!auth) return false;
      try {
        const result = await auth.api.verifyPassword({
          body: { password },
          headers: request.headers,
        });
        return result.status === true;
      } catch {
        return false;
      }
    },
    hasPassword: accountHasPassword,
    fresh: async (request) => {
      const auth = await getAuth();
      const session = await auth?.api.getSession({ headers: request.headers });
      if (!session) return false;
      return (
        Date.now() - new Date(session.session.createdAt).getTime() < FRESH_SESSION_SECONDS * 1000
      );
    },
  };
}

export const GET = accountRoute(async ({ accountId }) => deletionPreview(accountId, await deps()));
export const POST = accountRoute(async ({ request, accountId }) =>
  deleteAccount(request, accountId, await deps()),
);
