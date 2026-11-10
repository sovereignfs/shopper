import type { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import styles from './AppFrame.module.css';

/**
 * Below the header of every signed-in page (DESIGN.md §16.2): the app's sidebar, then the page. The page has the rest of the width and scrolls on its
 * own, so that the sidebar stays where it is.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <AppSidebar />
      <div className={styles.page}>{children}</div>
    </div>
  );
}
