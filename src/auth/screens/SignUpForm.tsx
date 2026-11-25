'use client';

import { useState } from 'react';
import { addressOf, kitPath, shopperVault } from '../../keys/vault-client';
import { authClient } from '../client';
import { messageFor } from '../messages';
import { nextQuery } from '../next';
import { SignUpForm as DesignSystemSignUpForm } from '@sovereignfs/ui';

/** What a person is told when the account was made and this browser could not make its keys (the next time they open Shopper, it asks for the password to do it). */
const KEYS_NOT_MADE =
  'Your account was made, but this browser could not set up its keys. Open Shopper again and unlock it with your password.';

/**
 * Standalone mode's sign-up (RFC 0005): the design system's `SignUpForm`, as core renders it. Shopper's own is what happens on submit: the password
 * is checked and derived here and never sent (RFC 0001), and the keys are made at once, with the recovery kit shown before anything else. Without
 * email there is nothing to confirm, so the account is made and the person is signed in. Shopper has no legal pages, so no terms are asked for.
 */
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | undefined>(undefined);

  async function onSubmit({
    name,
    email,
    password,
    confirm,
  }: {
    name: string;
    email: string;
    password: string;
    confirm: string;
  }) {
    // The length is checked here: the server is sent the derived value, never the password (RFC 0001).
    if (password.length < minLength) {
      setError(`The password must be at least ${minLength} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords are not the same.');
      return;
    }
    setBusy(true);
    setError(null);
    // Once the account is made, a failure is of another kind: the account is there, and only its keys are not.
    let made = false;
    try {
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
      made = true;
      // With mail the account is not signed in until the link in the message is used; without it the person is signed in at once.
      if (mail) {
        setBusy(false);
        setSentTo(email);
        return;
      }
      // Signed in now: the keys are made here, and the kit is shown before anything else.
      await vault.afterSignIn(derived.secret);
      window.location.assign(kitPath(next));
    } catch {
      // A browser that cannot do one of the things this asks of it (derive the password, make the keys) throws, and the form would stay busy for good.
      // Nothing is logged: what was thrown has nothing in it a person can use, and it must not carry the password.
      setBusy(false);
      setError(made ? KEYS_NOT_MADE : messageFor(null));
    }
  }

  return (
    <DesignSystemSignUpForm
      appName="Shopper"
      passwordHint={`At least ${minLength} characters. A few random words is a good one.`}
      terms={false}
      error={error ?? undefined}
      pending={busy}
      waitingFor={sentTo}
      onSubmit={(values) => void onSubmit(values)}
      signInHref={`/sign-in${nextQuery(next)}`}
    />
  );
}
