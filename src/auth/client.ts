'use client';

import {
  SIGN_IN_CLIENT,
  SIGN_IN_USER_FIELDS,
  signInClientPlugins,
  type PasswordMove,
} from '@sovereignfs/auth/client';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { addressOf, shopperVault } from '../keys/vault-client';

/** better-auth in the browser, on `@sovereignfs/auth`'s client (auth.md §2): it never follows a redirect by itself. */
export const authClient = createAuthClient({
  ...SIGN_IN_CLIENT,
  plugins: [...signInClientPlugins(), inferAdditionalFields({ user: { ...SIGN_IN_USER_FIELDS } })],
});

/**
 * The sign-in value and the key secret, made in the page from the password and the address with the vault's id (RFC 0001): the same
 * derivation `@sovereignfs/auth` makes, so every password Shopper has stored since 0.2.0 still opens. The password never leaves the browser.
 */
export function deriveWith(vaultId: string) {
  const vault = shopperVault(vaultId);
  return (password: string, email: string) => vault.derive(password, addressOf(email));
}

/**
 * Moving a 0.1.0 password (auth.md §8.1): only while one can still move, which the page was told (`moving`), and only after an answer that
 * is a wrong password, the page sends the password and the sign-in value once to the package's route, which opens no session.
 */
export function passwordMoveWhile(moving: boolean): PasswordMove {
  return {
    moving: () => Promise.resolve(moving),
    previous: (password) => Promise.resolve(password),
    send: async (body) => {
      await fetch('/api/auth/sv/move-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      }).catch(() => undefined);
    },
  };
}
