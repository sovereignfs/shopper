'use client';

import { useState } from 'react';
import { AuthButton, AuthError } from '@sovereignfs/ui';
import { wrapCardKeyring, wrapListKeyring } from '../keys/household';
import { addPending, addPendingCard } from '../keys/pending';
import { KeyPrompt } from '../keys/KeyPrompt';
import { forgetLinkSecret, readLinkSecret } from '../keys/KeepLinkSecret';
import { useKeys } from '../keys/keys';
import { openCardFromLink, openFromLink } from '../keys/link';
import { callOperation } from '../local/ops';

/** Where the next page starts, once someone has joined: the household's first list (`HomeScreen` reads it once and forgets it). */
export const JOINED_KEY = 'shopper.joined';

/**
 * The button on the invitation page for someone signed in (DESIGN.md §7.3): it accepts the link, and then opens Shopper on the household's lists, which the
 * device has at its first sync. A person already in the household is told so and nothing changes; a limit is said in its sentence; a link that has stopped
 * working says what the page says. **A link to a card** (RFC 0007) is the same page and the same call: the card's keys are kept under the person's own key
 * (`card.key.mine`, waiting in the browser if it does not get through, as a list's do), and what opens is the person's cards, **never the group's lists**, which
 * they are not on.
 */
export function AcceptInvite({
  token,
  encrypted = false,
  kind = 'list',
}: {
  token: string;
  encrypted?: boolean;
  kind?: 'list' | 'card';
}) {
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
        `Open the whole link you were sent, in this browser: its end, after #, is what opens the ${kind}.`,
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
      list?: string;
      card?: string;
      message?: string;
      person?: string;
      wrappedKey?: string | null;
    };
    if (answer.ok && body.household) {
      if (body.status === 'already') {
        setBusy(false);
        return setAlready(true);
      }
      // The list's keys, from the link, kept under this person's own key (RFC 0004). The link gives them once: if keeping them does not get through, the
      // copy waits in this browser and is sent again (`pending.ts`), and the device uses it meanwhile.
      if (body.wrappedKey && secret && body.person && body.list && keys.current.state === 'open') {
        const ring = await openFromLink(body.wrappedKey, secret, body.list);
        if (ring) {
          const record = await wrapListKeyring(keys.current.key, ring, {
            person: body.person,
            list: body.list,
          });
          const entry = {
            household: body.household,
            list: body.list,
            person: body.person,
            record,
          };
          const kept = await callOperation({
            op: 'list.key.mine',
            household: entry.household,
            list: entry.list,
            record,
          }).catch(() => ({ ok: false }));
          if (!kept.ok) addPending(window.localStorage, entry);
        }
      }
      if (body.card) {
        // The card's keys, from the link, kept under this person's own key: the link gives them once, and a copy that does not get through waits in this browser.
        if (body.wrappedKey && secret && body.person && keys.current.state === 'open') {
          const ring = await openCardFromLink(body.wrappedKey, secret, body.card);
          if (ring) {
            const record = await wrapCardKeyring(keys.current.key, ring, {
              person: body.person,
              card: body.card,
            });
            const entry = {
              household: body.household,
              card: body.card,
              person: body.person,
              record,
            };
            const kept = await callOperation({
              op: 'card.key.mine',
              household: entry.household,
              card: entry.card,
              record,
            }).catch(() => ({ ok: false }));
            if (!kept.ok) addPendingCard(window.localStorage, entry);
          }
        }
        forgetLinkSecret(token);
        // The person's cards, where the one just added is, once the device has pulled it: they are on no list of the group it is in.
        window.location.assign('/cards');
        return;
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
        {kind === 'card' ? 'You already have this card.' : 'You are already on this list.'}{' '}
        <button
          type="button"
          onClick={() => window.location.assign(kind === 'card' ? '/cards' : '/')}
        >
          {kind === 'card' ? 'Go to your cards' : 'Go to your lists'}
        </button>
      </p>
    );
  return (
    <>
      {encrypted ? <KeyPrompt /> : null}
      {error ? <AuthError>{error}</AuthError> : null}
      {/* An encrypted list opens only with this person's key, which is still being opened right after signing up or in: Join waits for it rather than
          saying to unlock what is about to open. */}
      <AuthButton
        type="button"
        loading={busy || (encrypted && keys.current.state === 'checking')}
        onClick={() => void accept()}
      >
        {kind === 'card' ? 'Add the card' : 'Join'}
      </AuthButton>
    </>
  );
}
