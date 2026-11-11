'use client';

import { EmptyState } from '@sovereignfs/ui';
import { useEffect, useState } from 'react';
import { joinedLandingOf, landingListOf } from '../local/listview';
import { useLocalQuery } from '../local/react';
import { JOINED_KEY } from './AcceptInvite';
import { ListScreen } from './ListScreen';
import styles from './ListScreen.module.css';

/**
 * The front page of someone signed in (DESIGN.md §16.4): **the list they used last**, or their own household's first, drawn here and with the address left
 * at `/`. Nothing before the device has households (a first load), and a sentence when it has and none has a list.
 */
export function HomeScreen() {
  // Someone who has just accepted an invitation lands on that household's first list, once the device has it; the note is forgotten when it has been used.
  const [joined] = useState(() => {
    try {
      return window.localStorage.getItem(JOINED_KEY);
    } catch {
      return null;
    }
  });
  const found = useLocalQuery(
    async (db) => {
      const there = joined ? await joinedLandingOf(db, joined) : undefined;
      return there
        ? { id: there, fromJoined: true }
        : { id: await landingListOf(db), fromJoined: false };
    },
    [joined],
  ).data;
  const landing = found?.id;
  const used = found?.fromJoined === true;
  useEffect(() => {
    if (!used) return;
    try {
      window.localStorage.removeItem(JOINED_KEY);
    } catch {
      // Nothing to remove from.
    }
  }, [used]);
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
