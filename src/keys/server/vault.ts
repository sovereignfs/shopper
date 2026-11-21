import { AppVault } from '@sovereignfs/sdk/vault';
import type { Database } from '../../db/client';
import { getDatabase } from '../../db/boot';
import { vaultDatabase } from './database';

/**
 * Shopper's own vault (RFC 0001, DESIGN.md §13.2): the SDK's `AppVault` on the app's store, keeping each password account's keys, wrapped, and opening
 * none of them. The records are bound to the account's id (better-auth's), which is the vault's `sub`, and to `CLIENT_ID`, the manifest's prefix.
 */
export const CLIENT_ID = 'shopper';

/** The vault id, for a page that derives a password (`localVault`'s `vaultId`). */
export async function getVaultId(): Promise<string> {
  return (await getVault()).vaultId();
}

const vaults = new WeakMap<Database, AppVault>();

export function vaultOf(database: Database): AppVault {
  let vault = vaults.get(database);
  if (!vault) vaults.set(database, (vault = new AppVault(vaultDatabase(database))));
  return vault;
}

export async function getVault(): Promise<AppVault> {
  return vaultOf(await getDatabase());
}
