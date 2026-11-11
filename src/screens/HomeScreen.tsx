'use client';

import { EmptyState } from '@sovereignfs/ui';
import { landingListOf } from '../local/listview';
import { useLocalQuery } from '../local/react';
import { ListScreen } from './ListScreen';
import styles from './ListScreen.module.css';

/**
 * The front page of someone signed in (DESIGN.md §16.4): **the list they used last**, or their own household's first, drawn here and with the address left
 * at `/`. Nothing before the device has households (a first load), and a sentence when it has and none has a list.
 */
export function HomeScreen() {
  const landing = useLocalQuery(landingListOf).data;
  if (landing === undefined) return <div className={styles.page} aria-busy="true" />;
  if (landing === null)
    return (
      <EmptyState
        icon="list-todo"
        heading="No lists yet"
        description="Make one with New list, in the sidebar."
      />
    );
  return <ListScreen id={landing} />;
}
