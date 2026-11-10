'use client';

import { useState } from 'react';
import { UserMenu } from '@sovereignfs/ui';
import { authClient } from '../auth/client';

/**
 * The avatar menu at the right of the header: who the person is (name and address) and _Sign out_. Settings joins this menu with task 2.6. Signing out
 * ends the session and returns to the front address. **Task 6.2 makes it leave the device as well:** it tries to send what is waiting, asks before it
 * throws away what it cannot, and deletes this account's store from the device.
 */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    const { error } = await authClient.signOut();
    // A session that is already gone is as signed out as one that was just ended; only a failure to reach the server is a failure.
    if (error && error.status !== 401) {
      setLeaving(false);
      return;
    }
    window.location.assign('/');
  }

  return (
    <UserMenu
      name={name}
      email={email}
      size="sm"
      aria-label="User menu"
      items={[
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
