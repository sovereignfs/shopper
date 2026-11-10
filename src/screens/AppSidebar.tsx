'use client';

import { Icon } from '@sovereignfs/ui';
import { site } from '@/src/site';
import { useSidebar } from '../ui/useSidebar';
import styles from './AppSidebar.module.css';

/** What the sidebar holds, and what the phone's drawer holds too: the places, and the lists of each household the person is in (task 8.1). */
function NavigationContent() {
  return (
    <ul className={styles.places}>
      <li>
        <p className={styles.empty}>Your lists will be here.</p>
      </li>
    </ul>
  );
}

/** The navigation as the phone's drawer shows it: the same places by the same addresses, full width, with no rail and no collapse. */
export function DrawerNavigation() {
  return (
    <nav className={styles.drawerNav} aria-label={site.name}>
      <NavigationContent />
    </nav>
  );
}

/**
 * The app's sidebar (DESIGN.md §16.2), at the left of every signed-in page. **This is its frame:** the places and the lists of each household the
 * person is in are drawn into it by task 8.1, from the device's store, and **an entry is here only when its page is**, since a link to a page that is
 * not there is worse than none. It is full or a rail of icons, as the person left it on this device, and is not drawn on a phone, whose navigation is
 * a drawer.
 */
export function AppSidebar() {
  const sidebar = useSidebar();
  if (!sidebar.available || sidebar.state === 'hidden') return null;
  const rail = sidebar.state === 'rail';

  return (
    <nav
      className={`${styles.sidebar} ${rail ? styles.rail : ''}`}
      aria-label={site.name}
      data-sidebar={sidebar.state}
    >
      <NavigationContent />
      <button
        type="button"
        className={styles.collapse}
        aria-label={rail ? 'Widen the sidebar' : 'Narrow the sidebar'}
        title={rail ? 'Widen the sidebar' : 'Narrow the sidebar'}
        onClick={sidebar.toggleRail}
      >
        <Icon name={rail ? 'panel-left-open' : 'panel-left-close'} aria-hidden />
      </button>
    </nav>
  );
}
