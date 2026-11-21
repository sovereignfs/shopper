import { sql } from 'drizzle-orm';
import { newSessionSecret } from '@sovereignfs/sdk/vault';
import type { Database } from '../../db/client';
import { dbGet, dbRun } from '../../db/exec';
import { authTable } from '../../db/tables';

/**
 * The key secret of one session (RFC 0001, sdk §9.5): made with the session (`src/auth/auth.ts`), or here for a session made before it was, and kept in
 * the session's own row, so it goes when the session goes. Only the session's own account gets it; `undefined` when the session is not that account's.
 */
export async function sessionKeySecret(
  authDatabase: Database,
  sessionId: string,
  accountId: string,
): Promise<string | undefined> {
  const session = authTable(authDatabase, 'session');
  const row = await dbGet<{ key_secret: string | null }>(
    authDatabase,
    sql`SELECT key_secret FROM ${session} WHERE id = ${sessionId} AND user_id = ${accountId}`,
  );
  if (!row) return undefined;
  if (row.key_secret) return row.key_secret;
  const secret = newSessionSecret();
  // Only where none was made in between, by another request of the same session.
  await dbRun(
    authDatabase,
    sql`UPDATE ${session} SET key_secret = ${secret} WHERE id = ${sessionId} AND user_id = ${accountId} AND key_secret IS NULL`,
  );
  const again = await dbGet<{ key_secret: string | null }>(
    authDatabase,
    sql`SELECT key_secret FROM ${session} WHERE id = ${sessionId} AND user_id = ${accountId}`,
  );
  return again?.key_secret ?? undefined;
}
