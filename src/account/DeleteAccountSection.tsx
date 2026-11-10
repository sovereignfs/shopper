'use client';

import { useEffect, useState } from 'react';
import { authClient } from '../auth/client';
import { messageFor } from '../auth/messages';
import { deleteLocal } from '../local/db';
import { useLocal } from '../local/react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import styles from './Account.module.css';

interface Preview {
  /** Whether it asks for the password; an account that came in through Sovereign has none, and a session made just now stands in. */
  password: boolean;
  households: {
    household: string;
    own: boolean;
    outcome: 'passes' | 'deleted' | 'left';
    to: string | null;
  }[];
}

/**
 * Settings, Data, Delete account (DESIGN.md §17, §19). **It says what goes before it asks:** the account and everything personal of it, and for each
 * household whether the Admin role passes to the member who has been in longest, whether it is deleted because nobody else is in it, or whether the person
 * simply leaves; that what they added stays on the lists of a household that carries on, under their name. It asks for the password. Other devices find
 * out at their next sync, when their session has ended (task 6.2 also deletes this device's store).
 */
export function DeleteAccountSection() {
  const { accountId } = useLocal();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const reply = await fetch('/api/account/delete', { cache: 'no-store' });
        if (reply.ok) setPreview((await reply.json()) as Preview);
        else setProblem('This needs a connection.');
      } catch {
        setProblem('This needs a connection.');
      }
    })();
  }, [open]);

  async function remove() {
    setWorking(true);
    setProblem(null);
    try {
      const reply = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (reply.status === 403) {
        const { code } = (await reply.json().catch(() => ({}))) as { code?: string };
        return setProblem(
          code === 'SESSION_NOT_FRESH'
            ? messageFor({ code }, 'Sign in again, and then try this once more.')
            : 'That is not your password.',
        );
      }
      if (reply.status === 429)
        return setProblem('That was tried too many times. Wait a few minutes.');
      if (!reply.ok)
        return setProblem(
          'That could not be done. Nothing was deleted, or it was only partly: try again.',
        );
      // The account is gone, and so is its session on the server; this clears the cookie the browser still holds, so that the front address is the landing
      // page and not a sign-in for an account that does not exist.
      setPassword('');
      await authClient.signOut().catch(() => undefined);
      // The account's lists go from this device with it: there is nothing to send them to.
      await deleteLocal(accountId).catch(() => undefined);
      window.location.assign('/');
    } catch {
      setProblem('That needs a connection.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.group}>
      <h2>Delete account</h2>
      {!open ? (
        <>
          <p className={styles.muted}>
            Deletes your account and everything personal of it. It cannot be undone.
          </p>
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Delete my account…
            </Button>
          </div>
        </>
      ) : (
        <form
          className={styles.form}
          aria-label="Delete account"
          onSubmit={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          <p>This deletes your account and everything of yours that is not shared.</p>
          {preview ? (
            <>
              {preview.households.length > 0 ? (
                <ul aria-label="Your households">
                  {preview.households.map((each) => (
                    <li key={each.household}>
                      <strong>{each.own ? 'Your lists' : 'Shared lists you are in'}</strong>:{' '}
                      {each.outcome === 'deleted'
                        ? 'nobody else is in them, so they are deleted'
                        : each.outcome === 'passes'
                          ? `pass to ${each.to ?? 'the member who has been in longest'}, who has been in them longest, and are theirs from then on`
                          : 'you leave them, and they carry on without you'}
                      .
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className={styles.hint}>
                What you added to lists that carry on stays, shown as “Kasun (left Shopper)” with
                your name and nothing else of you.
              </p>
            </>
          ) : null}
          {problem ? <Alert variant="error">{problem}</Alert> : null}
          {preview && !preview.password ? (
            <p className={styles.hint}>
              You sign in through Sovereign, so there is no password to ask for. This asks that you
              signed in within the last ten minutes: if you did not, sign out, sign in again, and
              come back.
            </p>
          ) : (
            <FormField label="Your password" required>
              {(field) => (
                <Input
                  {...field}
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </FormField>
          )}
          <div className={styles.row}>
            <Button
              type="submit"
              disabled={working || preview === null || (preview.password && password === '')}
            >
              {working ? 'Deleting…' : 'Delete my account for good'}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
