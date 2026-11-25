'use client';

import { useState } from 'react';
import { addressOf, shopperVault } from '../../keys/vault-client';
import { authClient } from '../client';
import { messageFor } from '../messages';
import { AuthFooter, AuthLink, AuthNotice, ResetPasswordForm } from '@sovereignfs/ui';

/**
 * Chooses a new password with the token from the link: the design system's `ResetPasswordForm`, as core renders it (RFC 0005). The link is good
 * once; using it ends every other session of the account. The new password is derived with the account's address, which the page found from the
 * token (RFC 0001), and it cannot open the encrypted lists: the recovery kit does, once, at the next sign-in, which is Shopper's own to say.
 */
export function ResetForm({
  minLength,
  vaultId,
  email,
}: {
  minLength: number;
  vaultId: string;
  /** The address the link was sent to, or nothing for a link that is not, or no longer, good. */
  email: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit({ password, confirm }: { password: string; confirm: string }) {
    if (!email) return;
    if (password.length < minLength)
      return setError(`The password must be at least ${minLength} characters.`);
    if (password !== confirm) return setError('The two passwords are not the same.');
    setBusy(true);
    setError(null);
    // The token is read when the form is sent, in the browser, never while the page renders.
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    const derived = await shopperVault(vaultId).derive(password, addressOf(email));
    const { error: failure } = await authClient.resetPassword({
      newPassword: derived.signIn,
      token,
    });
    setBusy(false);
    if (failure) return setError(messageFor(failure));
    setDone(true);
  }

  if (done)
    return (
      <>
        <AuthNotice>
          Your password is changed, and you are signed out everywhere else. Sign in with it, and
          have your recovery kit to hand: your lists are encrypted, and the kit opens them the first
          time.
        </AuthNotice>
        <AuthFooter>
          <AuthLink href="/sign-in">Sign in</AuthLink>
        </AuthFooter>
      </>
    );
  return (
    <ResetPasswordForm
      passwordHint={`At least ${minLength} characters.`}
      error={error ?? undefined}
      expired={email === null}
      pending={busy}
      onSubmit={(values) => void onSubmit(values)}
      signInHref="/sign-in"
      newLinkHref="/forgot-password"
    />
  );
}
