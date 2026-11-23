'use client';

import { type FormEvent, useState } from 'react';
import { signInWithPassword } from '@sovereignfs/auth/client';
import { kitPath, shopperVault } from '../../keys/vault-client';
import { authClient, deriveWith, passwordMoveWhile } from '../client';
import { nextQuery } from '../next';
import {
  AuthButton,
  AuthError,
  AuthField,
  AuthForm,
  Input,
  SignInForm as DesignSystemSignInForm,
} from '@sovereignfs/ui';

/**
 * Standalone mode's sign-in (RFC 0005): the design system's `SignInForm`, as core renders it, with what is Shopper's own around it: deriving the
 * password (it is never sent), opening the vault, and, after a reset, the recovery kit, in the same card. No message says whether an address has
 * an account: a wrong address and a wrong password read the same. Suite mode has no form: its `/sign-in` sends the browser to core.
 */
export function SignInForm({
  local,
  failure: returned = null,
  next = null,
}: {
  /** The vault's id, which the password is derived with, and whether 0.1.0 passwords can still move (auth.md §8.1). */
  local: { canSignUp: boolean; canReset: boolean; vaultId: string; moving: boolean };
  failure?: string | null;
  /** Where to go once signed in: an invitation's page (`src/auth/next.ts`), kept through the round trip. */
  next?: string | null;
}) {
  const { canSignUp, canReset } = local;
  const [error, setError] = useState<string | null>(returned);
  const [busy, setBusy] = useState(false);
  /** Signed in with an address not yet confirmed: the page offers a new link, which signing in never sends (auth.md §4). */
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  /** After a reset the new password does not open the keys: the kit does, once, and the password opens them again after. */
  const [locked, setLocked] = useState<CryptoKey | null>(null);
  const [kit, setKit] = useState('');

  // A full navigation, not a client-side one: `/` is a different page now that there is a session, and the server decides which.
  const go = (to: string) => window.location.assign(to);

  async function onSubmit({ email, password }: { email: string; password: string }) {
    setBusy(true);
    setError(null);
    const vault = shopperVault(local.vaultId);
    // The password is derived here and never sent (RFC 0001): the server gets the sign-in value, through the package's flow, which moves a
    // 0.1.0 password once on the way (auth.md §8.1).
    const result = await signInWithPassword(
      authClient,
      deriveWith(local.vaultId),
      { email, password },
      undefined,
      passwordMoveWhile(local.moving),
    );
    if (result.outcome !== 'signed-in') {
      setBusy(false);
      setUnconfirmed(result.outcome === 'unverified');
      setResent(false);
      // An address not yet confirmed is said by the form itself, beside the way to send the link again.
      if (result.outcome === 'unverified' && canReset) return setError(null);
      setError(
        result.outcome === 'refused'
          ? result.message
          : result.outcome === 'unverified'
            ? 'Open the link we sent to your email address first, then sign in.'
            : result.outcome === 'not-ready'
              ? 'This page could not get ready. Reload it and try again.'
              : 'Signing in did not work. Try again.',
      );
      return;
    }
    const opened = await vault.afterSignIn(result.secret);
    if (opened === 'locked') {
      setBusy(false);
      setLocked(result.secret);
      return;
    }
    go(opened === 'set-up' || (await vault.kitPending()) ? kitPath(next) : (next ?? '/'));
  }

  async function onResend(email: string) {
    setBusy(true);
    // The same answer whether or not the address has an account, so nothing is told here either way.
    await authClient
      .sendVerificationEmail({ email, callbackURL: next ?? '/' })
      .catch(() => undefined);
    setBusy(false);
    setResent(true);
  }

  async function onKit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locked) return;
    setBusy(true);
    setError(null);
    const vault = shopperVault(local.vaultId);
    const result = await vault.unlockWithKit(kit, locked);
    if (result === 'unlocked') return go(next ?? '/');
    setBusy(false);
    setError(
      result === 'mistyped'
        ? 'That is not a recovery kit: check each group against the one you kept.'
        : 'That kit does not open your lists.',
    );
  }

  if (locked)
    return (
      <AuthForm onSubmit={(event) => void onKit(event)}>
        <p>
          Your password was reset, so it cannot open your lists yet: they are encrypted, and only
          your recovery kit can open them now. Type it in, once, and your new password opens them
          from then on.
        </p>
        <AuthField label="Recovery kit">
          {(field) => (
            <Input
              {...field}
              name="kit"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={busy}
              value={kit}
              onChange={(e) => setKit(e.target.value)}
            />
          )}
        </AuthField>
        {error ? <AuthError>{error}</AuthError> : null}
        <AuthButton type="submit" loading={busy}>
          Open my lists
        </AuthButton>
      </AuthForm>
    );

  return (
    <DesignSystemSignInForm
      appName="Shopper"
      error={error ?? undefined}
      pending={busy}
      unverified={unconfirmed && canReset}
      renderUnverified={(email) => (
        <AuthButton
          type="button"
          variant="secondary"
          disabled={busy || resent}
          onClick={() => void onResend(email)}
        >
          {resent ? 'A new link is on its way' : 'Send the link again'}
        </AuthButton>
      )}
      onSubmit={(values) => void onSubmit(values)}
      forgotPasswordHref={canReset ? '/forgot-password' : undefined}
      signUpHref={canSignUp ? `/sign-up${nextQuery(next)}` : undefined}
    />
  );
}
