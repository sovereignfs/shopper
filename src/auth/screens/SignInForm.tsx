'use client';

import { type FormEvent, useState } from 'react';
import { authClient } from '../client';
import { nextQuery } from '../next';
import { messageFor } from '../messages';
import {
  AuthButton,
  AuthDivider,
  AuthError,
  AuthField,
  AuthFooter,
  AuthForm,
  AuthLink,
  Input,
} from '@sovereignfs/ui';

/**
 * Email and password (`local`), and/or Sovereign, which takes the person away to sign in there and back (DESIGN.md §15). No message says whether an address
 * has an account: a wrong address and a wrong password read the same. `failure` is what went wrong on the way back from Sovereign, if anything.
 */
export function SignInForm({
  local,
  sovereign,
  failure: returned = null,
  next = null,
}: {
  local: { canSignUp: boolean; canReset: boolean } | undefined;
  sovereign: boolean;
  failure?: string | null;
  /** Where to go once signed in: an invitation's page (`src/auth/next.ts`), kept through the round trip. */
  next?: string | null;
}) {
  const canSignUp = local?.canSignUp ?? false;
  const canReset = local?.canReset ?? false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(returned);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: failure } = await authClient.signIn.email({ email, password });
    if (failure) {
      setBusy(false);
      setError(messageFor(failure));
      return;
    }
    // A full navigation, not a client-side one: `/` is a different page now that there is a session, and the server decides which.
    window.location.assign(next ?? '/');
  }

  async function onSovereign(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    // On success the browser is sent to Sovereign, so there is nothing to do after the call; a person who comes back with a failure lands on this page
    // again with the reason.
    const { error: failure } = await authClient.signIn.social({
      provider: 'sovereign',
      callbackURL: next ?? '/',
      errorCallbackURL: '/sign-in',
    });
    if (failure) {
      setBusy(false);
      setError(messageFor(failure, 'Signing in with Sovereign did not work. Try again.'));
    }
  }

  const sovereignButton = (
    <AuthButton
      type={local ? 'button' : 'submit'}
      variant={local ? 'secondary' : 'primary'}
      onClick={local ? () => void onSovereign() : undefined}
      loading={busy}
      disabled={busy}
    >
      Sign in with Sovereign
    </AuthButton>
  );

  if (!local)
    return (
      <AuthForm onSubmit={(event) => void onSovereign(event)}>
        {error ? <AuthError>{error}</AuthError> : null}
        {sovereignButton}
      </AuthForm>
    );

  return (
    <>
      <AuthForm onSubmit={(event) => void onSubmit(event)}>
        <AuthField label="Email">
          {(field) => (
            <Input
              {...field}
              type="email"
              name="email"
              autoComplete="username"
              required
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </AuthField>
        <AuthField label="Password">
          {(field) => (
            <Input
              {...field}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </AuthField>
        {error ? <AuthError>{error}</AuthError> : null}
        <AuthButton type="submit" loading={busy}>
          Sign in
        </AuthButton>
      </AuthForm>
      {sovereign ? (
        <>
          <AuthDivider />
          {sovereignButton}
        </>
      ) : null}
      {canReset ? (
        <AuthFooter>
          <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
        </AuthFooter>
      ) : null}
      {canSignUp ? (
        <AuthFooter>
          New here? <AuthLink href={`/sign-up${nextQuery(next)}`}>Create account</AuthLink>
        </AuthFooter>
      ) : null}
    </>
  );
}
