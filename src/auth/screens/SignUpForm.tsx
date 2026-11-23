'use client';

import { useState } from 'react';
import { addressOf, kitPath, shopperVault } from '../../keys/vault-client';
import { authClient } from '../client';
import { messageFor } from '../messages';
import { nextQuery } from '../next';
import { SignUpForm as DesignSystemSignUpForm } from '@sovereignfs/ui';

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
      setSentTo(email);
      return;
    }
    // Signed in now: the keys are made here, and the kit is shown before anything else.
    await vault.afterSignIn(derived.secret);
    window.location.assign(kitPath(next));
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
