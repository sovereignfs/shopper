'use client';

import { type FormEvent, useState } from 'react';
import { addressOf, shopperVault } from '../../keys/vault-client';
import { authClient } from '../client';
import { messageFor } from '../messages';
import { AuthButton, AuthError, AuthField, AuthForm, Input } from '@sovereignfs/ui';

/**
 * Chooses a new password with the token from the link. It is good once; using it ends every other session of the account. The new password is derived
 * with the account's address, which the page found from the token (RFC 0001), and it cannot open the encrypted lists: the recovery kit does, once, at
 * the next sign-in.
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
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const token =
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('token') ?? '');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return setError('This link is not good any more. Ask for a new one.');
    if (password.length < minLength)
      return setError(`The password must be at least ${minLength} characters.`);
    setBusy(true);
    setError(null);
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
      <p role="status">
        Your password is changed, and you are signed out everywhere else.{' '}
        <a href="/sign-in">Sign in</a> with it, and have your recovery kit to hand: your lists are
        encrypted, and the kit opens them the first time.
      </p>
    );
  return (
    <AuthForm onSubmit={(event) => void onSubmit(event)}>
      <AuthField label="New password" hint={`At least ${minLength} characters.`}>
        {(field) => (
          <Input
            {...field}
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={minLength}
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </AuthField>
      {error ? <AuthError>{error}</AuthError> : null}
      <AuthButton type="submit" loading={busy}>
        Change my password
      </AuthButton>
    </AuthForm>
  );
}
