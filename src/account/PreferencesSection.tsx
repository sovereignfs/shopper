'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, FormField, SegmentedControl, Select } from '@sovereignfs/ui';
import { authClient } from '../auth/client';
import { coreLink } from '../auth/core-links';
import { LOCALES, timeZones, type Regional } from '../format/regional';
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
export function PreferencesSection({
  core,
  regional,
}: {
  core: string | null;
  /** The account's time zone and language, which running alone are chosen here. */
  regional: Regional;
}) {
  return (
    <div className={styles.panel}>
      <ListsPreference />
      {core === null ? (
        <>
          <AppearancePreference />
          <RegionalPreference regional={regional} />
        </>
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

/** How a language and region are named to the person, in their own language where the platform can. */
function localeLabel(tag: string): string {
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
    return name ? `${name} (${tag})` : tag;
  } catch {
    return tag;
  }
}

/**
 * The time zone and the language and region dates are written in, **kept on the account** (so every device has them) through `@sovereignfs/auth`, which checks
 * them. Not chosen, they are the browser's own. Needs a connection, and says so when there is none; core's are core's, so this is only for running alone.
 */
function RegionalPreference({ regional }: { regional: Regional }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // What is shown is what was chosen, at once; the server's answer follows with the refresh.
  const [zone, setZone] = useState(regional.timeZone ?? '');
  const [tag, setTag] = useState(regional.locale ?? '');
  const zones = timeZones();
  // What the account has that is not in the lists (a language core or an older Shopper kept) is still shown, so that choosing nothing else changes nothing.
  const tags =
    regional.locale && !LOCALES.includes(regional.locale) ? [regional.locale, ...LOCALES] : LOCALES;
  const names =
    regional.timeZone && !zones.includes(regional.timeZone) ? [regional.timeZone, ...zones] : zones;

  async function save(change: { timezone: string | null } | { locale: string | null }) {
    setProblem(null);
    setSaved(false);
    try {
      const result = await authClient.updateUser(change);
      if (result.error) return setProblem('That could not be saved. Check it and try again.');
      setSaved(true);
      // Every date on the page is written with what the account says.
      router.refresh();
    } catch {
      setProblem('This needs a connection. Try again when you are back online.');
    }
  }

  return (
    <div className={styles.group}>
      <h2>Time zone and language</h2>
      <p className={styles.muted}>
        How dates are written. Kept on your account; the browser’s own until you choose.
      </p>
      {problem ? <Alert variant="error">{problem}</Alert> : null}
      {saved ? <Alert variant="success">Saved.</Alert> : null}
      <FormField label="Time zone">
        {(field) => (
          <Select
            {...field}
            value={zone}
            onChange={(event) => {
              setZone(event.target.value);
              void save({ timezone: event.target.value || null });
            }}
          >
            <option value="">This browser’s</option>
            {names.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField label="Language and region">
        {(field) => (
          <Select
            {...field}
            value={tag}
            onChange={(event) => {
              setTag(event.target.value);
              void save({ locale: event.target.value || null });
            }}
          >
            <option value="">This browser’s</option>
            {tags.map((each) => (
              <option key={each} value={each}>
                {localeLabel(each)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
    </div>
  );
}
