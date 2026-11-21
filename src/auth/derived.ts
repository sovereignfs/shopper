/**
 * The sign-in value (RFC 0001, sdk §9.5): what a page sends where it sent the password, `svp1.` and 43 base64url characters, derived in the browser from
 * the password and the address (`localVault`'s `derive`). **The server is never sent a password:** a sign-in, sign-up, change, reset or deletion that
 * carries anything else is refused, as a wrong password where it is one. The one exception is a 0.1.0 account moving across, once (`move-password`).
 */
export const DERIVED = /^svp1\.[A-Za-z0-9_-]{43}$/;

export function isDerived(value: unknown): value is string {
  return typeof value === 'string' && DERIVED.test(value);
}

/** The error code of a value that is not derived. */
export const PASSWORD_NOT_DERIVED = 'PASSWORD_NOT_DERIVED';
