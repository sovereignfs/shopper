'use client';

import Link from 'next/link';
import { EmptyState } from '@sovereignfs/ui';
import { useLocalQuery } from '../local/react';
import { hasSynced } from '../local/store';
import styles from './ListScreen.module.css';

/**
 * A list, from the device (DESIGN.md §16.5). This is its place and its header: the name, as the device has it. The items, the add field, Bought and the menu
 * are drawn into it by the tasks that follow (8.2 and 8.3). A list the device does not have says so, once the device has heard from the server; until then it
 * says nothing, since a device that has never synced has nothing to show and the list may be about to arrive.
 */
export function ListScreen({ id }: { id: string }) {
  const found = useLocalQuery(
    async (db) => ({ list: (await db.get('list', id)) ?? null, synced: await hasSynced(db) }),
    [id],
  );
  if (!found.data) return <div className={styles.page} aria-busy="true" />;
  const { list, synced } = found.data;
  if (!list || list.deletedAt !== null)
    return synced ? (
      <EmptyState
        icon="list-todo"
        heading="That list is not here"
        description="It may have been deleted, or it is not one of yours."
        action={<Link href="/">Back to your lists</Link>}
      />
    ) : (
      <div className={styles.page} aria-busy="true" />
    );
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{list.name}</h1>
      </header>
      <EmptyState
        icon="list-todo"
        heading={`Nothing on ${list.name}`}
        description="Items can be added here once this screen is finished."
      />
    </div>
  );
}
