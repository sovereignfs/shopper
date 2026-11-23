'use client';

import { type ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsDialog } from '@sovereignfs/ui';
import { useTitle } from '../screens/title';
import type { AccountSection } from './query';

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
 * Opened from a page it is over that page (`close` is `back`, which the intercepting route uses); loaded directly at its address it is over Home (`close` is
 * `home`, since Back there would leave Shopper). A section is chosen in place and written to the address with the browser's own history, so that no round trip
 * is made and Back does not walk through the sections; each section is also an address of its own (`/settings/<section>`) and a title (`<section> · Settings`).
 */
export function SettingsHost({
  section,
  close,
  panels,
}: {
  section: AccountSection;
  close: 'back' | 'home';
  panels: Record<AccountSection, ReactNode>;
}) {
  const router = useRouter();
  const [active, setActive] = useState<AccountSection | null>(section);
  const label = SECTIONS.find((entry) => entry.id === active)?.label;
  useTitle(label ? [label, 'Settings'] : ['Settings']);

  return (
    <SettingsDialog
      open
      onClose={() => (close === 'back' ? router.back() : router.replace('/'))}
      title="Settings"
      size="fixed"
      active={active}
      backLabel="Back to the sections"
      onSelect={(id) => {
        const next = SECTIONS.find((entry) => entry.id === id)?.id ?? null;
        setActive(next);
        if (next) window.history.replaceState(null, '', `/settings/${next}`);
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
