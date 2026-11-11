'use client';

import { useState } from 'react';
import { AuthButton, AuthError } from '@sovereignfs/ui';

/** Where the next page starts, once someone has joined: the household's first list (`HomeScreen` reads it once and forgets it). */
export const JOINED_KEY = 'shopper.joined';

/**
 * The button on the invitation page for someone signed in (DESIGN.md §7.3): it accepts the link, and then opens Shopper on the household's lists, which the
 * device has at its first sync. A person already in the household is told so and nothing changes; a limit is said in its sentence; a link that has stopped
 * working says what the page says.
 */
export function AcceptInvite({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [already, setAlready] = useState(false);

  function go(household: string) {
    try {
      window.localStorage.setItem(JOINED_KEY, household);
    } catch {
      // Storage that is blocked: the front address opens the last list, as it does.
    }
    window.location.assign('/');
  }

  async function accept() {
    setBusy(true);
    setError(null);
    let answer: Response;
    try {
      answer = await fetch('/api/invite/accept', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    } catch {
      setBusy(false);
      return setError('This needs a connection. Try again when you are back online.');
    }
    const body = (await answer.json().catch(() => ({}))) as {
      status?: string;
      household?: string;
      message?: string;
    };
    if (answer.ok && body.household) {
      if (body.status === 'already') {
        setBusy(false);
        return setAlready(true);
      }
      return go(body.household);
    }
    setBusy(false);
    if (answer.status === 409 && body.message) return setError(body.message);
    if (answer.status === 429) return setError('Too many tries. Wait a few minutes.');
    if (answer.status === 401) return setError('You have been signed out. Sign in again.');
    setError('This link does not work any more. Ask whoever sent it for a new one.');
  }

  if (already)
    return (
      <p role="status">
        You are already in this household.{' '}
        <button type="button" onClick={() => window.location.assign('/')}>
          Go to your lists
        </button>
      </p>
    );
  return (
    <>
      {error ? <AuthError>{error}</AuthError> : null}
      <AuthButton type="button" loading={busy} onClick={() => void accept()}>
        Join
      </AuthButton>
    </>
  );
}
