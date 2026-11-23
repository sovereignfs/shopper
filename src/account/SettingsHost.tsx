'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SettingsDialog } from '@sovereignfs/ui';
import { useTitle } from '../screens/title';
import { type AccountSection, sectionOf } from './query';

const SECTIONS: {
  id: AccountSection;
  label: string;
  icon: 'user' | 'shield' | 'sliders-horizontal' | 'database';
}[] = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'security', label: 'Security', icon: 'shield' },
  { id: 'preferences', label: 'Preferences', icon: 'sliders-horizontal' },
  { id: 'data', label: 'Data', icon: 'database' },
];

/**
 * **Settings** (RFC 0005, DESIGN.md §17): the design system's dialog with a side navigation, each section the server rendered for this mode and handed in.
 * **Which section is shown is the address's** (`/settings/<section>`; `/settings` alone names none, which is the first on a wide screen and the sections
 * alone on a phone, so that nothing about the route depends on the viewport), so a reload, Back and Forward all agree. Opened from a page it is over that page
 * (`close` is `back`, which the intercepting route uses); loaded directly it is over Home (`close` is `home`, since Back there would leave Shopper). A section
 * is chosen in place and written to the address with the browser's own history, so that no round trip is made and Back does not walk through the sections.
 */
export function SettingsHost({
  close,
  panels,
}: {
  close: 'back' | 'home';
  panels: Record<AccountSection, ReactNode>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const active = sectionOf(/^\/settings\/([^/]+)\/?$/.exec(pathname)?.[1]);
  const label = SECTIONS.find((entry) => entry.id === active)?.label;
  // A dialog is the page's title over whatever is under it, which may not have opened its name yet.
  useTitle(label ? [label, 'Settings'] : ['Settings'], { over: true });

  return (
    <SettingsDialog
      open
      onClose={() => (close === 'back' ? router.back() : router.replace('/'))}
      title="Settings"
      size="fixed"
      active={active}
      backLabel="Back to the sections"
      onSelect={(id) => {
        const next = SECTIONS.find((entry) => entry.id === id)?.id;
        window.history.replaceState(null, '', next ? `/settings/${next}` : '/settings');
      }}
      groups={[
        {
          id: 'settings',
          sections: SECTIONS.map((entry) => ({
            id: entry.id,
            label: entry.label,
            icon: entry.icon,
            content: panels[entry.id],
          })),
        },
      ]}
    />
  );
}
