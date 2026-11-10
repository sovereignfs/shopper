'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserMenu } from '@sovereignfs/ui';
import { useLocal } from '../local/react';

/**
 * The avatar menu at the right of the header: who the person is (name and address) and _Sign out_. Settings is the other entry. Signing out leaves the
 * device (`src/local/signout.ts`): it tries to send what is waiting, asks before it throws away what it cannot, ends the session, deletes this account's
 * working copy from the device and returns to the front address.
 */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const { leave } = useLocal();
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    // Not left: the person kept their unsent changes, or the server could not be reached to end the session. Either way they are as they were.
    if ((await leave()).status !== 'left') return setLeaving(false);
    window.location.assign('/');
  }

  return (
    <UserMenu
      name={name}
      email={email}
      size="sm"
      aria-label="User menu"
      items={[
        { label: 'Settings', icon: 'settings', onSelect: () => router.push('/settings') },
        {
          label: leaving ? 'Signing out…' : 'Sign out',
          icon: 'log-out',
          destructive: true,
          onSelect: () => void signOut(),
        },
      ]}
    />
  );
}
