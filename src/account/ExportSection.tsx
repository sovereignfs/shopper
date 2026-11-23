'use client';

import { useState } from 'react';
import { useKeys } from '../keys/keys';
import { addressOf, shopperVault } from '../keys/vault-client';
import {
  exportFileName,
  exportFileText,
  openServed,
  type ServedRecords,
} from '../portability/readable';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import styles from './Account.module.css';

/**
 * Settings, Data, Download my data (RFC 0005, "A readable export"). **Made here, in the browser:** the server confirms who is asking (the password
 * again, which this derives and never sends) and serves the person's records as it holds them; this opens what was encrypted for the person with the
 * keys this browser holds, and writes one `.json` file that nothing leaves the page to make. In suite mode the confirmation is a fresh sign-in at
 * core, which waits for a release, so for now this says that core's own export holds Shopper's part.
 */
export function ExportSection({
  suite,
  email,
  vaultId,
}: {
  /** Suite mode: the person signs in through core. */
  suite: boolean;
  email: string;
  vaultId: string;
}) {
  const keys = useKeys();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<{ unopened: number } | null>(null);
  const [working, setWorking] = useState(false);

  if (suite)
    return (
      <div className={styles.group}>
        <h2>Download my data</h2>
        <p className={styles.muted}>
          Your Sovereign account’s export holds Shopper’s part, with what you wrote still encrypted:
          take it from your Sovereign account. A readable file made here comes in a coming release.
        </p>
      </div>
    );

  async function download() {
    setWorking(true);
    setProblem(null);
    setDone(null);
    try {
      if (keys.current.state !== 'open') {
        return setProblem(
          'Your lists are locked on this device. Unlock them first, then try again.',
        );
      }
      // The password is derived here and never sent (RFC 0001).
      const sent = (await shopperVault(vaultId).derive(password, addressOf(email))).signIn;
      const reply = await fetch('/api/account/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: sent }),
      });
      if (reply.status === 403) return setProblem('That is not your password.');
      if (reply.status === 429)
        return setProblem('That was tried too many times. Wait a few minutes.');
      if (!reply.ok)
        return setProblem('That could not be done. Nothing was downloaded: try again.');
      const served = (await reply.json()) as {
        head: { version: string; takenAt: string };
        records: ServedRecords[];
      };
      const file = await openServed(served.records, keys.current.key, served.head);
      const url = URL.createObjectURL(
        new Blob([exportFileText(file)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(served.head.takenAt);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPassword('');
      setDone({ unopened: file.unopened });
      setOpen(false);
    } catch {
      setProblem('That needs a connection.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.group}>
      <h2>Download my data</h2>
      {!open ? (
        <>
          <p className={styles.muted}>
            Your lists, items, products and categories, and the people on your lists by name, as one
            file you can read. It is not encrypted: keep it somewhere safe.
          </p>
          {done ? (
            <p role="status" className={styles.hint}>
              {done.unopened === 0
                ? 'Your data was downloaded.'
                : `Your data was downloaded. ${done.unopened} ${done.unopened === 1 ? 'value' : 'values'} could not be opened on this device and ${done.unopened === 1 ? 'is' : 'are'} empty in the file.`}
            </p>
          ) : null}
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Download my data…
            </Button>
          </div>
        </>
      ) : (
        <form
          className={styles.form}
          aria-label="Download my data"
          onSubmit={(event) => {
            event.preventDefault();
            void download();
          }}
        >
          <p>
            The file is made on this device and is readable by anyone who has it. Type your password
            to say it is you.
          </p>
          {problem ? <Alert variant="error">{problem}</Alert> : null}
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
          <div className={styles.row}>
            <Button type="submit" disabled={working || password === ''}>
              {working ? 'Making the file…' : 'Download'}
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
