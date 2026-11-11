'use client';

import type { ReactNode } from 'react';
import { site } from '../site';
import { Drawer, ResponsiveSurface, useIsMobile } from '@sovereignfs/ui';
import { AppShell } from '../ui/AppShell';
import { MobileNavProvider, useMobileNav } from '../ui/mobile-nav';
import { SidebarToggle } from '../ui/SidebarToggle';
import { AppFrame } from './AppFrame';
import { DrawerNavigation } from './AppSidebar';
import { PhoneFooter } from './PhoneFooter';

/**
 * The frame of a signed-in page with nothing in it yet: the header, the sidebar and the page. **It is the one composition**: the signed-in area
 * (task 2.2 onward) and the page the service worker keeps (task 1.12) both make it, with what they have to put in it, so that the app is the same in
 * both. It holds nothing of a person.
 */
export function ShellFrame({
  children,
  account,
}: {
  children: ReactNode;
  /** The person's avatar menu, for a signed-in page; the page the worker keeps has none, since it holds nothing of a person. */
  account?: ReactNode;
}) {
  return (
    <MobileNavProvider>
      <AppShell
        name={site.name}
        toolbar={<SidebarToggle />}
        account={account}
        footer={<ResponsiveSurface web={null} mobile={<PhoneFooter />} />}
      >
        <AppFrame>{children}</AppFrame>
        <NavigationDrawer />
      </AppShell>
    </MobileNavProvider>
  );
}

/** On a phone the header's button opens the navigation in a drawer: the same places by the same addresses, and only what is drawn differs. */
function NavigationDrawer() {
  const nav = useMobileNav();
  const mobile = useIsMobile();
  if (!mobile) return null;
  return (
    <Drawer open={nav.open} onClose={() => nav.setOpen(false)} aria-label="Navigation">
      <DrawerNavigation />
    </Drawer>
  );
}
