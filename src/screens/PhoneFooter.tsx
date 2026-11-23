'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Icon, MobileAppsDrawer, MobileFooter } from '@sovereignfs/ui';
import { useMobileNav } from '../ui/mobile-nav';

/**
 * The phone's footer (DESIGN.md §16.11), in 0.1.0: **Lists | button | Settings**. Lists opens the navigation drawer (the households and their lists, the
 * same places by the same addresses as the sidebar); Settings is a link and says so when it is the page. The button in the middle is the design system's
 * launcher, whose accessible name it chooses and an app cannot change; here it opens a sheet with the one thing a phone needs near the thumb and cannot
 * reach in the header, _New list_, which is made in the drawer where the lists are. The floating Add button above the footer is phase 2 (8.11): the add
 * field is at the top of a list until then.
 *
 * It is the design system's `MobileFooter`, which publishes its own height as `--sv-shell-footer-height` so that dialogs and sheets clear it, and it is
 * `AppShell`'s `footer` slot, drawn on a phone and not beside the sidebar: no route depends on it.
 */
export function PhoneFooter() {
  const pathname = usePathname();
  const nav = useMobileNav();
  const [launcher, setLauncher] = useState(false);
  // Shopping mode has the whole screen (DESIGN.md §16.11): its own Finish shopping is where the footer would be.
  if (pathname === '/shop') return null;
  return (
    <>
      <MobileFooter
        leftIcons={[
          {
            icon: <Icon name="list-todo" aria-hidden />,
            label: 'Lists',
            onClick: () => nav.setOpen(true),
            active: nav.open,
          },
        ]}
        rightIcons={[
          {
            icon: <Icon name="settings" aria-hidden />,
            label: 'Settings',
            href: '/settings',
            active: pathname === '/settings' || pathname.startsWith('/settings/'),
          },
        ]}
        launcherIcon={<Icon name="plus" size="md" aria-hidden />}
        launcherOpen={launcher}
        onOpenApps={() => setLauncher(true)}
      />
      <MobileAppsDrawer
        open={launcher}
        onClose={() => setLauncher(false)}
        aria-label="What to add"
        items={[
          {
            key: 'new-list',
            icon: <Icon name="plus" aria-hidden />,
            label: 'New list',
            onClick: () => {
              setLauncher(false);
              nav.setOpen(true);
            },
          },
        ]}
      />
    </>
  );
}
