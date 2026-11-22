'use client';

import { type FormEvent, useState } from 'react';
import { signInWithPassword } from '@sovereignfs/auth/client';
import { kitPath, shopperVault } from '../../keys/vault-client';
import { authClient, deriveWith, passwordMoveWhile } from '../client';
import { nextQuery } from '../next';
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
  /** With local sign-in: the vault's id, which the password is derived with, and whether 0.1.0 passwords can still move (auth.md §8.1). */
  local: { canSignUp: boolean; canReset: boolean; vaultId: string; moving: boolean } | undefined;
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
  /** Signed in with an address not yet confirmed: the page offers a new link, which signing in never sends (auth.md §4). */
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  /** After a reset the new password does not open the keys: the kit does, once, and the password opens them again after. */
  const [locked, setLocked] = useState<CryptoKey | null>(null);
  const [kit, setKit] = useState('');

  // A full navigation, not a client-side one: `/` is a different page now that there is a session, and the server decides which.
  const go = (to: string) => window.location.assign(to);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!local) return;
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

  async function onResend() {
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
    if (!local || !locked) return;
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

  function onSovereign(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    // The browser goes to Sovereign through the package's route (auth.md §8); a person who comes back with a failure lands on this page
    // again with the reason.
    go(`/api/auth/sign-in/sovereign?returnTo=${encodeURIComponent(next ?? '/')}`);
  }

  const sovereignButton = (
    <AuthButton
      type={local ? 'button' : 'submit'}
      variant={local ? 'secondary' : 'primary'}
      onClick={local ? () => onSovereign() : undefined}
      loading={busy}
      disabled={busy}
    >
      Sign in with Sovereign
    </AuthButton>
  );

  if (!local)
    return (
      <AuthForm onSubmit={(event) => onSovereign(event)}>
        {error ? <AuthError>{error}</AuthError> : null}
        {sovereignButton}
      </AuthForm>
    );

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
        {unconfirmed && canReset ? (
          <AuthButton
            type="button"
            variant="secondary"
            disabled={busy || resent}
            onClick={() => void onResend()}
          >
            {resent ? 'A new link is on its way' : 'Send the link again'}
          </AuthButton>
        ) : null}
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
