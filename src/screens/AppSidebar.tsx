'use client';

import { Icon } from '@sovereignfs/ui';
import { site } from '@/src/site';
import { useLocalOptional } from '../local/react';
import { useMobileNav } from '../ui/mobile-nav';
import { useSidebar } from '../ui/useSidebar';
import { ListsNav } from './ListsNav';
import styles from './AppSidebar.module.css';

/**
 * What the sidebar holds, and what the phone's drawer holds too: the households and their lists (task 8.1), from the device. **An entry is here only when its
 * page is**, since a link to a page that is not there is worse than none: All lists, Trips, Catalog and _Add item_ join with the tasks that build them. The page
 * the service worker keeps has no working copy to read, so it holds nothing of a person and draws none.
 */
function NavigationContent({
  rail = false,
  onNavigate,
  widen,
}: {
  rail?: boolean;
  onNavigate?: () => void;
  widen?: () => void;
}) {
  const local = useLocalOptional();
  if (!local) return null;
  return (
    <ListsNav rail={rail} {...(onNavigate ? { onNavigate } : {})} {...(widen ? { widen } : {})} />
  );
}

/** The navigation as the phone's drawer shows it: the same places by the same addresses, full width, with no rail and no collapse. */
export function DrawerNavigation() {
  const nav = useMobileNav();
  return (
    <nav className={styles.drawerNav} aria-label={site.name}>
      <NavigationContent onNavigate={() => nav.setOpen(false)} />
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
      <NavigationContent rail={rail} widen={sidebar.toggleRail} />
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
