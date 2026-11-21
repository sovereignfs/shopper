'use client';

import { useState } from 'react';
import { AuthButton, AuthError } from '@sovereignfs/ui';
import { wrapKeyring } from '../keys/household';
import { KeyPrompt } from '../keys/KeyPrompt';
import { forgetLinkSecret, readLinkSecret } from '../keys/KeepLinkSecret';
import { useKeys } from '../keys/keys';
import { openFromLink } from '../keys/link';
import { callOperation } from '../local/ops';

/** Where the next page starts, once someone has joined: the household's first list (`HomeScreen` reads it once and forgets it). */
export const JOINED_KEY = 'shopper.joined';

/**
 * The button on the invitation page for someone signed in (DESIGN.md §7.3): it accepts the link, and then opens Shopper on the household's lists, which the
 * device has at its first sync. A person already in the household is told so and nothing changes; a limit is said in its sentence; a link that has stopped
 * working says what the page says.
 */
export function AcceptInvite({ token, encrypted = false }: { token: string; encrypted?: boolean }) {
  const keys = useKeys();
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
    // An encrypted household's lists open only with the keys the link carries (RFC 0001): its secret, and this person's own key to keep them under.
    const secret = encrypted ? readLinkSecret(token) : null;
    if (encrypted && !secret)
      return setError(
        'Open the whole link you were sent, in this browser: its end, after #, is what opens the household’s lists.',
      );
    if (encrypted && keys.current.state !== 'open')
      return setError('Unlock Shopper first, then join.');
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
      person?: string;
      wrappedKey?: string | null;
    };
    if (answer.ok && body.household) {
      if (body.status === 'already') {
        setBusy(false);
        return setAlready(true);
      }
      if (body.wrappedKey && secret && body.person && keys.current.state === 'open') {
        const ring = await openFromLink(body.wrappedKey, secret, body.household);
        if (ring) {
          const record = await wrapKeyring(keys.current.key, ring, {
            person: body.person,
            household: body.household,
          });
          await callOperation({ op: 'household.key.mine', household: body.household, record });
        }
      }
      forgetLinkSecret(token);
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
      {encrypted ? <KeyPrompt /> : null}
      {error ? <AuthError>{error}</AuthError> : null}
      <AuthButton type="button" loading={busy} onClick={() => void accept()}>
        Join
      </AuthButton>
    </>
  );
}
