'use client';

import { type FormEvent, useState } from 'react';
import { addressOf, kitPath, shopperVault } from '../../keys/vault-client';
import { authClient } from '../client';
import { messageFor } from '../messages';
import { AuthButton, AuthError, AuthField, AuthForm, Input } from '@sovereignfs/ui';

/** Name, email and password. Without email there is nothing to confirm, so the account is made and the person is signed in. */
export function SignUpForm({
  minLength,
  vaultId,
  mail = false,
  next = null,
}: {
  minLength: number;
  /** The vault's id, which the password is derived with (RFC 0001). */
  vaultId: string;
  mail?: boolean;
  /** Where to go once the account is made: an invitation's page (`src/auth/next.ts`). */
  next?: string | null;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The length is checked here: the server is sent the derived value, never the password (RFC 0001).
    if (password.length < minLength) {
      setError(`The password must be at least ${minLength} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const vault = shopperVault(vaultId);
    const derived = await vault.derive(password, addressOf(email));
    const { error: failure } = await authClient.signUp.email({
      name,
      email,
      password: derived.signIn,
    });
    if (failure) {
      setBusy(false);
      setError(messageFor(failure));
      return;
    }
    // With mail the account is not signed in until the link in the message is used; without it the person is signed in at once.
    if (mail) {
      setBusy(false);
      setSent(true);
      return;
    }
    // Signed in now: the keys are made here, and the kit is shown before anything else.
    await vault.afterSignIn(derived.secret);
    window.location.assign(kitPath(next));
  }

  if (sent)
    return (
      <p role="status">
        Check your email: a link was sent to {email}. Open it to confirm the address and sign in.
      </p>
    );

  return (
    <AuthForm onSubmit={(event) => void onSubmit(event)}>
      <AuthField label="Name">
        {(field) => (
          <Input
            {...field}
            name="name"
            autoComplete="name"
            required
            disabled={busy}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </AuthField>
      <AuthField label="Email">
        {(field) => (
          <Input
            {...field}
            type="email"
            name="email"
            autoComplete="email"
            required
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </AuthField>
      <AuthField
        label="Password"
        hint={`At least ${minLength} characters. A few random words is a good one.`}
      >
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
        Create account
      </AuthButton>
    </AuthForm>
  );
}
