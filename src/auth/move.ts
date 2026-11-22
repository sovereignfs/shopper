import { createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { dbGet, dbRun } from '../db/exec';
import { authTable } from '../db/tables';
import type { Limiter, Rule } from '../limits/rate';
import { isDerived } from './derived';

/**
 * **Moving a 0.1.0 password across** (RFC 0001, amendment 1): an account made before Shopper derived passwords in the browser has a hash of the password
 * itself, so its derived value signs nothing in. Once, at its next sign-in, the page sends the password and the derived value together; if the password
 * opens the stored hash and the account has not moved yet, the hash becomes one of the derived value, in one statement that holds only while it has not
 * moved. That is the last time the server is sent that password. The answer is the same whatever happened, so that this says nothing a sign-in would
 * not; the page signs in with the derived value after it, which says whether it worked.
 */
export interface MoveDeps {
  authDatabase: Database;
  limiter: Limiter;
}

/** Five tries an address an hour: as a sign-in's, and no more. */
export const MOVE_RATE: Rule = { limit: 5, windowMs: 60 * 60 * 1000 };

export async function movePassword(
  deps: MoveDeps,
  input: { email: unknown; password: unknown; signIn: unknown },
): Promise<void> {
  const { email, password, signIn } = input;
  if (typeof email !== 'string' || typeof password !== 'string' || !isDerived(signIn)) return;
  if (password === '' || password.length > 256 || isDerived(password)) return;
  const address = email.trim().toLowerCase();
  // The address is counted by a hash, so the counters hold none.
  const key = `move-password:${createHash('sha256').update(address).digest('base64url')}`;
  if (!(await deps.limiter.take(key, MOVE_RATE)).ok) return;

  const user = authTable(deps.authDatabase, 'user');
  const account = authTable(deps.authDatabase, 'account');
  const found = await dbGet<{ id: string; password: string | null }>(
    deps.authDatabase,
    sql`SELECT a.id, a.password FROM ${account} a JOIN ${user} u ON u.id = a.user_id
        WHERE lower(u.email) = ${address} AND a.provider_id = 'credential' AND a.password_derived = ${false}`,
  );
  if (!found?.password) return;
  if (!(await verifyPassword({ hash: found.password, password }))) return;
  await dbRun(
    deps.authDatabase,
    sql`UPDATE ${account} SET password = ${await hashPassword(signIn)}, password_derived = ${true}
        WHERE id = ${found.id} AND password_derived = ${false}`,
  );
}

/** Whether any password account has still to move: only then does the sign-in page offer to (`movePassword`). */
export async function passwordsToMove(authDatabase: Database): Promise<boolean> {
  const account = authTable(authDatabase, 'account');
  return (
    (await dbGet(
      authDatabase,
      sql`SELECT 1 AS one FROM ${account} WHERE provider_id = 'credential' AND password_derived = ${false} LIMIT 1`,
    )) !== undefined
  );
}
