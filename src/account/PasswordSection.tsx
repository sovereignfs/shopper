'use client';

import { type FormEvent, useState } from 'react';
import { addressOf, shopperVault } from '../keys/vault-client';
import { authClient } from '../auth/client';
import { messageFor } from '../auth/messages';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import styles from './Account.module.css';

/**
 * Settings, Sign-in, Password (DESIGN.md §17): change it, asking for the current one. **Changing it ends every other session** of the account. An account
 * that came in through Sovereign alone has no password, and Sovereign has its own: it says so, and offers nothing. Needs a connection, and says so when
 * there is none.
 */
export function PasswordSection({
  hasPassword,
  minLength,
  email,
  vaultId,
}: {
  hasPassword: boolean;
  minLength: number;
  /** The account's address and the vault's id, which both passwords are derived with (RFC 0001). */
  email: string;
  vaultId: string;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!hasPassword)
    return (
      <div className={styles.group}>
        <h2>Password</h2>
        <p className={styles.muted}>
          You sign in through Sovereign, which has its own password and ways of signing in.
        </p>
      </div>
    );

  const mismatch = again !== '' && again !== next;
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mismatch || next.length < minLength) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      // Both are derived here (RFC 0001). The new one is given its way into the keys beside the old before the change is asked for, and the old one's
      // goes once the server has said yes, so that a change that fails leaves the keys as they were.
      const vault = shopperVault(vaultId);
      const was = await vault.derive(current, addressOf(email));
      const will = await vault.derive(next, addressOf(email));
      const prepared = await vault.prepareChange(was.secret, will.secret);
      const { error: failure } = await authClient.changePassword({
        currentPassword: was.signIn,
        newPassword: will.signIn,
        revokeOtherSessions: true,
      });
      if (prepared) await vault.finishChange(prepared, !failure);
      if (failure) {
        setError(messageFor(failure));
        return;
      }
      setCurrent('');
      setNext('');
      setAgain('');
      setSaved(true);
    } catch {
      setError('This needs a connection. Try again when you are back online.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.group}>
      <h2>Password</h2>
      <form onSubmit={onSubmit} className={styles.form} aria-label="Change password">
        {error ? <Alert variant="error">{error}</Alert> : null}
        {saved ? (
          <Alert variant="success">Your password is changed. Other devices are signed out.</Alert>
        ) : null}
        <FormField label="Current password" required>
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              disabled={busy}
            />
          )}
        </FormField>
        <FormField
          label="New password"
          required
          hint={`At least ${minLength} characters. A few random words is a good one.`}
        >
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="new-password"
              minLength={minLength}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              disabled={busy}
            />
          )}
        </FormField>
        <FormField
          label="New password again"
          required
          error={mismatch ? 'The two are not the same.' : undefined}
        >
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(event) => setAgain(event.target.value)}
              disabled={busy}
            />
          )}
        </FormField>
        <div>
          <Button
            type="submit"
            loading={busy}
            disabled={current === '' || next.length < minLength || mismatch || again === ''}
          >
            Change password
          </Button>
        </div>
      </form>
    </div>
  );
}
