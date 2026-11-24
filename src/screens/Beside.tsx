'use client';

import type { ReactNode } from 'react';
import { ThreeColumnLayout, useIsMobile } from '@sovereignfs/ui';
import styles from './ItemEditor.module.css';

/**
 * **A panel beside a page** (RFC 0005, DESIGN.md §16.7, §16.8): the page and, while there is a panel, the panel in the right column of `ThreeColumnLayout` (360px, the design
 * system's), pushing the page narrower; where there is no room, and on a phone, **the panel is the whole area in place of the page**, which is rendered, not navigated: the
 * address is the same. It holds no data and decides nothing: what the panel is, and when it is open, are the screen's. A rendering choice only (`no-fork.test.ts`). The item of a list
 * does the same with its own data (`ItemBeside`); the Inventory screen's entry is placed here.
 */
export function Beside({
  panel,
  children,
}: {
  /** The panel, given whether it is drawn as a page (a back arrow at its left) or as a column (a close button at its right); `null` for none. */
  panel: ((mobile: boolean) => ReactNode) | null;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  const open = panel ? panel(mobile) : null;
  if (open && mobile) return <>{open}</>;
  return (
    <div className={styles.layout} {...(open ? { 'data-item-open': '' } : {})}>
      <ThreeColumnLayout sidebarHidden>
        <div />
        <div className={styles.main}>{children}</div>
        {open}
      </ThreeColumnLayout>
    </div>
  );
}
