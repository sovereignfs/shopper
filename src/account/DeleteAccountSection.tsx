'use client';

import { useEffect, useState } from 'react';
import { authClient } from '../auth/client';
import { messageFor } from '../auth/messages';
import { deleteLocal } from '../local/db';
import { useLocal } from '../local/react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import styles from './Account.module.css';
import { addressOf, shopperVault } from '../keys/vault-client';

interface Preview {
  /** Whether it asks for the password; an account that came in through Sovereign has none, and a session made just now stands in. */
  password: boolean;
  lists: {
    list: string;
    own: boolean;
    outcome: 'passes' | 'deleted' | 'left';
    to: string | null;
  }[];
}

/**
 * Settings, Data, Delete account (DESIGN.md §17, §19). **It says what goes before it asks:** the account and everything personal of it, and of its
 * lists (RFC 0004) how many are deleted because nobody else is on them, which pass to the person on them longest, and how many it simply leaves;
 * that what they added stays on the lists that carry on, under their name. It asks for the password. Other devices find
 * out at their next sync, when their session has ended (task 6.2 also deletes this device's store).
 */
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** What deleting would do to the person's lists, in a sentence each: counted, since a list's name is not the server's to say. */
function sentences(lists: Preview['lists']): string[] {
  const deleted = lists.filter((each) => each.outcome === 'deleted').length;
  const left = lists.filter((each) => each.outcome === 'left').length;
  const to = new Map<string, number>();
  for (const each of lists)
    if (each.outcome === 'passes') {
      const name = each.to ?? 'the person on it longest';
      to.set(name, (to.get(name) ?? 0) + 1);
    }
  return [
    ...(deleted > 0
      ? [
          `${deleted} ${plural(deleted, 'list nobody else is on is', 'lists nobody else is on are')} deleted.`,
        ]
      : []),
    ...[...to].map(
      ([name, n]) =>
        `${n} shared ${plural(n, 'list passes', 'lists pass')} to ${name}, who has been on ${plural(n, 'it', 'them')} longest.`,
    ),
    ...(left > 0
      ? [
          `You leave ${left} shared ${plural(left, 'list', 'lists')}, which ${plural(left, 'carries', 'carry')} on without you.`,
        ]
      : []),
  ];
}

export function DeleteAccountSection({ email, vaultId }: { email: string; vaultId: string }) {
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
      // The password is derived here and never sent (RFC 0001); with none to ask for, nothing is sent.
      const sent =
        password === ''
          ? ''
          : (await shopperVault(vaultId).derive(password, addressOf(email))).signIn;
      const reply = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: sent }),
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
              {sentences(preview.lists).length > 0 ? (
                <ul aria-label="Your lists">
                  {sentences(preview.lists).map((sentence) => (
                    <li key={sentence}>{sentence}</li>
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
