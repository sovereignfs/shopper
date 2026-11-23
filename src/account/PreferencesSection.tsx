'use client';

import { useEffect, useState } from 'react';
import { SegmentedControl } from '@sovereignfs/ui';
import { coreLink } from '../auth/core-links';
import { readView, type View, writeView } from '../lists/view-preference';
import { chooseTheme, readTheme, type ThemeChoice } from '../theme/preferences';
import { NotificationsSection } from './NotificationsSection';
import { ThisDeviceSection } from './ThisDeviceSection';
import styles from './Account.module.css';

/**
 * Settings, Preferences (RFC 0005, DESIGN.md §17): how a list shows its items by default, this device, notifications, and, **running alone,** how Shopper
 * looks. Hosted by a Sovereign instance, appearance, language and notifications are Sovereign's, and this says so and goes there (`core`): Shopper keeps no
 * copy of them. What is chosen here about how this device draws things is kept in this browser (`src/lists/view-preference.ts`, `src/theme/preferences.ts`).
 */
export function PreferencesSection({ core }: { core: string | null }) {
  return (
    <div className={styles.panel}>
      <ListsPreference />
      {core === null ? (
        <AppearancePreference />
      ) : (
        <div className={styles.group}>
          <h2>Appearance, language and notifications</h2>
          <p className={styles.muted}>
            These are Sovereign’s, the same in every app you use there.{' '}
            <a href={coreLink(core, '/preferences')}>Change them in Sovereign</a>.
          </p>
        </div>
      )}
      <ThisDeviceSection />
      <NotificationsSection />
    </div>
  );
}

/** Whether a list opens by aisle or in the order added: the device's, and the one the list's own menu changes. */
function ListsPreference() {
  const [view, setView] = useState<View>('aisle');
  // Read after the page is in the browser: the server renders nothing of what this device kept.
  useEffect(() => setView(readView(window.localStorage) ?? 'aisle'), []);
  return (
    <div className={styles.group}>
      <h2>Lists</h2>
      <p className={styles.muted}>How a list shows its items when you open it.</p>
      <SegmentedControl
        aria-label="Show items"
        value={view}
        onChange={(next) => {
          setView(next);
          writeView(window.localStorage, next);
        }}
        options={[
          { value: 'aisle', label: 'By aisle' },
          { value: 'added', label: 'In the order added' },
        ]}
      />
    </div>
  );
}

/** Light, dark, or the system's, applied at once and kept in this browser. */
function AppearancePreference() {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  useEffect(() => setTheme(readTheme(window.localStorage)), []);
  return (
    <div className={styles.group}>
      <h2>Appearance</h2>
      <p className={styles.muted}>Kept on this device.</p>
      <SegmentedControl
        aria-label="Theme"
        value={theme}
        onChange={(next) => {
          setTheme(next);
          chooseTheme(
            next,
            document.documentElement,
            window.matchMedia('(prefers-color-scheme: dark)').matches,
            window.localStorage,
          );
        }}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </div>
  );
}
