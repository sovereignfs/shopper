'use client';

import { useState } from 'react';
import { authClient } from '../client';
import { messageFor } from '../messages';
import { ForgotPasswordForm } from '@sovereignfs/ui';

/**
 * Asks for a reset link: the design system's `ForgotPasswordForm`, as core renders it (RFC 0005). **The answer is the same whether or not the
 * address has an account** (DESIGN.md §6), so the page cannot be used to find out.
 */
export function ForgotForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | undefined>(undefined);

  async function onSubmit(email: string) {
    setBusy(true);
    setError(null);
    const { error: failure } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    setBusy(false);
    if (failure && failure.status === 429) return setError(messageFor(failure));
    // Whatever came of it, the same words.
    setSentTo(email);
  }

  return (
    <ForgotPasswordForm
      sentTo={sentTo}
      error={error ?? undefined}
      pending={busy}
      onSubmit={(email) => void onSubmit(email)}
      signInHref="/sign-in"
    />
  );
}
