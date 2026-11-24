'use client';

import { Icon, useAppSidebar } from '@sovereignfs/ui';
import { pageKind } from './page-kind';
import { usePathname } from 'next/navigation';
import styles from './ArchivedToggle.module.css';

/**
 * The toggle for the archived lists (RFC 0005, DESIGN.md §16.2), under the sidebar's blocks: they are behind it, so that they are not in the way. It is **not a row of a
 * block** because the design system's rows close the phone's drawer on any click (a row is somewhere to go), and showing a list of lists is not going anywhere. On a
 * rail only its icon shows, named by its words.
 */
export function ArchivedToggle({
  count,
  shown,
  onToggle,
}: {
  count: number;
  shown: boolean;
  onToggle: () => void;
}) {
  const sidebar = useAppSidebar('shopper', pageKind(usePathname()));
  if (count === 0) return null;
  const words = shown ? 'Hide archived' : `Archived (${count})`;
  const rail = sidebar.state === 'rail';
  return (
    <button
      type="button"
      className={`${styles.toggle} ${rail ? styles.rail : ''}`}
      aria-expanded={shown}
      aria-label={rail ? words : undefined}
      title={rail ? words : undefined}
      onClick={onToggle}
    >
      <Icon name="archive" size="sm" aria-hidden />
      {rail ? null : <span>{words}</span>}
    </button>
  );
}
