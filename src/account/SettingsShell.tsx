'use client';

import { type ReactNode, useState } from 'react';
import { Icon, type IconName } from '@sovereignfs/ui';
import { type AccountSection } from './query';
import styles from './Account.module.css';

const SECTIONS: { id: AccountSection; label: string; icon: IconName }[] = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'sign-in', label: 'Sign-in', icon: 'shield' },
  { id: 'data', label: 'Data', icon: 'database' },
];

/**
 * Settings (DESIGN.md §17): its sections down the left and the open one on the right. Each is rendered by the server and handed in, so choosing one only
 * shows it; the ones not shown stay mounted, so a half-typed password is not lost by looking at another. A page at `/settings`.
 */
export function SettingsShell({
  initial,
  panels,
}: {
  initial: AccountSection;
  panels: Record<AccountSection, ReactNode>;
}) {
  const [section, setSection] = useState<AccountSection>(initial);
  return (
    <div className={styles.shell}>
      <div className={styles.side}>
        <h1>Settings</h1>
        <nav className={styles.nav} aria-label="Settings sections">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-current={section === entry.id ? 'page' : undefined}
              onClick={() => setSection(entry.id)}
            >
              <Icon name={entry.icon} aria-hidden />
              {entry.label}
            </button>
          ))}
        </nav>
      </div>
      {SECTIONS.map((entry) => (
        <section
          key={entry.id}
          className={styles.panel}
          aria-label={entry.label}
          hidden={section !== entry.id}
        >
          {panels[entry.id]}
        </section>
      ))}
    </div>
  );
}
