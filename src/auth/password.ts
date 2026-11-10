import { getAuth } from './server';

/**
 * Whether an account has a password: it does if it signed up locally, and not if it came in through Sovereign alone, which has its own (DESIGN.md §15.1).
 * What asks for the password (deleting the account) asks for a recent session in its place, and what changes it is not offered. With no sign-in at all
 * nothing could be proved, so a password is what is asked for.
 */
export async function accountHasPassword(accountId: string): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return true;
  const context = await auth.$context;
  return (await context.internalAdapter.findAccounts(accountId)).some(
    (account) => account.providerId === 'credential',
  );
}
