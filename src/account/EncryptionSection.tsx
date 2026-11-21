'use client';

import { useEffect, useState } from 'react';
import { useKeys } from '../keys/keys';
import { useLocal, useLocalQuery } from '../local/react';
import { householdsOf } from '../local/store';
import styles from './Account.module.css';

/**
 * Settings, Encryption (RFC 0001, DESIGN.md §17): what is protected, in a person's words, for each household; how this account's key is kept; and
 * "not yet audited", as every place Shopper describes it says. A household with others in it is still sealed by the server (amendment 2), and says so.
 */
export function EncryptionSection() {
  const { keysOf } = useLocal();
  const keys = useKeys();
  const households = useLocalQuery(householdsOf).data ?? [];
  const [states, setStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void (async () => {
      const next: Record<string, boolean> = {};
      for (const household of households)
        next[household.id] = (await keysOf(household.id)).encrypted;
      setStates(next);
    })();
  }, [households, keysOf]);

  return (
    <div className={styles.group}>
      <h2>Encryption</h2>
      <p>
        What you write into Shopper (the names of lists and items, notes) is encrypted on this
        device before it is sent, with a key only the people in your household hold. Whoever runs
        this server cannot read it in the database or in a backup. It does not protect you from
        someone who controls the server and changes the app it sends.{' '}
        <strong>Not yet audited.</strong>
      </p>
      <ul aria-label="Your households">
        {households.map((household) => (
          <li key={household.id}>
            <strong>{household.label}</strong>:{' '}
            {states[household.id]
              ? 'only its people can read it.'
              : 'not yet: it has more than one person in it, and this server still seals it with its own key until each of them can be given the household’s key.'}
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        {keys.kind === 'core'
          ? 'Your key is kept by Sovereign. Your recovery kit and the passkeys that unlock it are there, on its Security page.'
          : keys.kind === 'vault'
            ? 'Your key is unlocked by your password. If you forget it, your recovery kit is the only way back to your lists.'
            : 'This device has no way to your key.'}
      </p>
    </div>
  );
}
