import { coreSubOf, userIdForSub } from '@sovereignfs/auth/core';
import type { Database } from '@sovereignfs/auth/database';

/**
 * A Sovereign identity is its `sub`, kept by `@sovereignfs/auth` as the account id of the account's sign-in through core (DESIGN.md §15.1,
 * auth.md §9): it is looked up only for what needs it, a notice or an export from core (§15.2). The account it belongs to is what everything
 * of a person is owned by.
 */

/** The account a Sovereign identity is linked to, or null: nobody here has signed in with it (or the account has since been deleted). */
export async function accountOfSub(authStore: Database, sub: string): Promise<string | null> {
  return (await userIdForSub(authStore, sub)) ?? null;
}

/** The `sub` an account is linked to on the core, or null when it signed in another way: where a notification to the person is addressed. */
export async function subOfAccount(authStore: Database, accountId: string): Promise<string | null> {
  return (await coreSubOf(authStore, accountId)) ?? null;
}
