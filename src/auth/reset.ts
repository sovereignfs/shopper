import { sql } from 'drizzle-orm';
import { getAuthDatabase } from '../db/boot';
import { dbGet } from '../db/exec';
import { authTable } from '../db/tables';

/**
 * The address a password-reset link was sent to, while the link is good: the new password is derived with it (RFC 0001). Whoever holds the link was
 * sent it at that address, so it tells them nothing new; a token that is not good gives nothing.
 */
export async function resetAddress(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null;
  const authDatabase = await getAuthDatabase();
  const verification = authTable(authDatabase, 'verification');
  const user = authTable(authDatabase, 'user');
  const row = await dbGet<{ email: string; expires_at: unknown }>(
    authDatabase,
    sql`SELECT u.email, v.expires_at FROM ${verification} v JOIN ${user} u ON u.id = v.value
        WHERE v.identifier = ${`reset-password:${token}`}`,
  );
  if (!row) return null;
  const expires =
    row.expires_at instanceof Date ? row.expires_at.getTime() : Number(row.expires_at);
  return Number.isFinite(expires) && expires > Date.now() ? row.email : null;
}
