'use client';

import { localVault } from '@sovereignfs/sdk/local-vault';

/**
 * Shopper's vault in the page (RFC 0001, sdk §9.5): `localVault` over Shopper's own routes. The password is derived here and never sent; what the
 * server gets is the sign-in value, and the secret stays in the browser to open the keys once the server has said yes.
 */
export const CLIENT_ID = 'shopper';

export type Vault = ReturnType<typeof localVault>;

export function shopperVault(vaultId: string): Vault {
  return localVault({
    clientId: CLIENT_ID,
    vaultId,
    path: '/api/keys/vault',
    secretPath: '/api/keys/secret',
  });
}

/** The address a password is derived with: the one signed in with, as better-auth keeps it. The same at every sign-in, or the keys would not open. */
export const addressOf = (email: string): string => email.trim().toLowerCase();

/** Where a page goes once the keys are set up: the kit first, if it is still to be kept. */
export function kitPath(next: string | null): string {
  return `/keys/kit${next ? `?next=${encodeURIComponent(next)}` : ''}`;
}
