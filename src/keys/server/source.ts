import { accountHasPassword } from '../../auth/password';
import { authSettings } from '../../auth/server';
import { getConfig } from '../../config/current';
import { getAuthStore } from '../../db/boot';
import { subOfAccount } from '../../sovereign/identity';
import { getVaultId } from './vault';

/**
 * Where an account's key comes from (RFC 0001, DESIGN.md §13.2), decided by how it signs in and never by the instance or the viewport: an account with
 * a password keeps its keys in Shopper's vault, and one that came through core alone gets the app key from core. `sub` is what the keys are bound
 * to: the account's id in the vault, core's `sub` through core. What the page needs is handed to it, read for each request, never built into it.
 */
export type KeySource =
  | { readonly kind: 'vault'; readonly sub: string; readonly vaultId: string }
  | {
      readonly kind: 'core';
      readonly sub: string;
      readonly core: string;
      readonly clientId: string;
      readonly returnTo: string;
    };

export async function keySourceOf(accountId: string): Promise<KeySource | undefined> {
  if (await accountHasPassword(accountId))
    return { kind: 'vault', sub: accountId, vaultId: await getVaultId() };
  const sovereign = authSettings()?.sovereign;
  const url = getConfig().url;
  if (!sovereign || !url) return undefined;
  // Core's `sub` is the account id of the account's sign-in through core, as better-auth keeps it (DESIGN.md §15.1), the one place it is recorded.
  const sub = await subOfAccount(await getAuthStore(), accountId);
  if (!sub) return undefined;
  return {
    kind: 'core',
    sub,
    core: sovereign.issuer,
    clientId: sovereign.clientId,
    returnTo: `${url.replace(/\/+$/, '')}/keys/return`,
  };
}
