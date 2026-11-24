import type { ReactNode } from 'react';
import { Header } from '@sovereignfs/ui';
import { site } from '../site';
import { Wordmark } from './Wordmark';
import styles from './PlainFrame.module.css';

/**
 * The frame of a page that is for no one in particular (DESIGN.md §16.2): the front page for a visitor, a page that is not found, the shell when it does not know who is
 * signed in. **The design system's `Header` with the app's own wordmark, and the page:** no sidebar, no menu, since there is no person to give them to. The signed-in
 * area's frame is `SignedInFrame`, which is `AppFrame`. This is the shell root (`#sv-app-shell`) that overlays portal into.
 */
export function PlainFrame({ children }: { children: ReactNode }) {
  return (
    <div id="sv-app-shell" className={styles.shell}>
      <Header instanceName={site.name} homeHref="/" brand={<Wordmark name={site.name} />} />
      <div className={styles.main}>{children}</div>
    </div>
  );
}
