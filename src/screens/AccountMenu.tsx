'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { turnOffPush } from '@sovereignfs/pwa/client';
import { UserMenu } from '@sovereignfs/ui';
import { useAccount } from '../account/AccountProvider';
import { useKeys } from '../keys/keys';
import { useLocal, useLocalQuery } from '../local/react';
import { failedCount } from '../local/store';
import styles from './AccountMenu.module.css';

/** How long signing out waits for this device's push to be turned off. */
const PUSH_OFF_MS = 3_000;

/**
 * The avatar menu at the right of the header: who the person is (name and address) and _Sign out_. Settings is the other entry. Signing out leaves the
 * device (`src/local/signout.ts`): it tries to send what is waiting, asks before it throws away what it cannot, ends the session, deletes this account's
 * working copy from the device and returns to the front address.
 */
export function AccountMenu({
  name,
  email,
  picture,
}: {
  name: string;
  email: string;
  /** Core's picture of the person in suite mode (RFC 0005); without one, their initials. */
  picture?: string | undefined;
}) {
  const router = useRouter();
  // The name is the one Settings last saved, before the server is asked again.
  const shown = useAccount().name ?? name;
  const { leave } = useLocal();
  const keys = useKeys();
  // What the server refused and the person has not yet seen to: a mark on the avatar and an entry in its menu (DESIGN.md §12.5).
  const refused = useLocalQuery(failedCount).data ?? 0;
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    // This device takes no more pushes for the account (RFC 0002): the server forgets it first, and the browser gives it up. Only where notifications were
    // granted, since there can be no subscription otherwise, and asking a browser's push manager is not free: in WebKit it can take the page with it. Never
    // throws, and waits a few seconds at most: the server forgets a device whose account has no session anyway, when a push to it fails.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted')
      await Promise.race([
        turnOffPush(),
        new Promise((resolve) => setTimeout(resolve, PUSH_OFF_MS)),
      ]);
    // Where to go afterwards, asked while the session is still there: core's sign-out for a session that came from core (auth.md §8).
    const throughCore = await fetch('/api/account/sign-out', { cache: 'no-store' })
      .then(async (reply) =>
        reply.ok ? ((await reply.json()) as { url: string | null }).url : null,
      )
      .catch(() => null);
    // Not left: the person kept their unsent changes, or the server could not be reached to end the session. Either way they are as they were.
    if ((await leave()).status !== 'left') return setLeaving(false);
    // What this browser keeps of the key goes too (RFC 0001); with the session gone it opened nothing anyway.
    await keys.forget();
    window.location.assign(throughCore ?? '/');
  }

  return (
    <span className={styles.wrap}>
      <UserMenu
        name={shown}
        email={email}
        {...(picture ? { avatarUrl: picture } : {})}
        size="sm"
        aria-label="User menu"
        items={[
          { label: 'Settings', icon: 'settings', onSelect: () => router.push('/settings') },
          ...(refused > 0
            ? [
                {
                  label: `Couldn't sync (${refused})`,
                  icon: 'alert-triangle' as const,
                  onSelect: () => router.push('/settings/preferences'),
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
