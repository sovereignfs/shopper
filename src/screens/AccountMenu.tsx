'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserMenu } from '@sovereignfs/ui';
import { useLocal, useLocalQuery } from '../local/react';
import { failedCount } from '../local/store';
import styles from './AccountMenu.module.css';

/**
 * The avatar menu at the right of the header: who the person is (name and address) and _Sign out_. Settings is the other entry. Signing out leaves the
 * device (`src/local/signout.ts`): it tries to send what is waiting, asks before it throws away what it cannot, ends the session, deletes this account's
 * working copy from the device and returns to the front address.
 */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const { leave } = useLocal();
  // What the server refused and the person has not yet seen to: a mark on the avatar and an entry in its menu (DESIGN.md §12.5).
  const refused = useLocalQuery(failedCount).data ?? 0;
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    // Not left: the person kept their unsent changes, or the server could not be reached to end the session. Either way they are as they were.
    if ((await leave()).status !== 'left') return setLeaving(false);
    window.location.assign('/');
  }

  return (
    <span className={styles.wrap}>
      <UserMenu
        name={name}
        email={email}
        size="sm"
        aria-label="User menu"
        items={[
          { label: 'Settings', icon: 'settings', onSelect: () => router.push('/settings') },
          ...(refused > 0
            ? [
                {
                  label: `Couldn't sync (${refused})`,
                  icon: 'alert-triangle' as const,
                  onSelect: () => router.push('/settings?section=device'),
                },
              ]
            : []),
          {
            label: leaving ? 'Signing out…' : 'Sign out',
            icon: 'log-out',
            destructive: true,
            onSelect: () => void signOut(),
          },
        ]}
      />
      {refused > 0 ? (
        <span className={styles.mark} role="img" aria-label="Some changes could not be synced" />
      ) : null}
    </span>
  );
}
