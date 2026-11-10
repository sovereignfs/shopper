'use client';

import Link from 'next/link';
import { placesOf } from '../local/places';
import { useLocalQuery } from '../local/react';
import styles from './ListScreen.module.css';

/**
 * The front page of someone signed in, for now (DESIGN.md §16.4): their lists, as plain links, from the device. It is where a phone starts, whose sidebar is a
 * drawer, and it is replaced by the last list the person used when that is remembered (task 8.2). Making a list is in the sidebar and the drawer, in one place.
 */
export function HomeScreen() {
  const places = useLocalQuery(placesOf).data;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Your lists</h1>
      </header>
      {places === undefined ? (
        <div aria-busy="true" />
      ) : places.length === 0 ? (
        <p className={styles.note} role="status">
          Your lists will be here once this device has loaded them.
        </p>
      ) : (
        places.map(({ household, lists }) => (
          <section key={household.id} className={styles.group} aria-label={household.label}>
            <h2>{household.label}</h2>
            {lists.length === 0 ? (
              <p className={styles.note}>No lists yet. Make one with New list.</p>
            ) : (
              <ul className={styles.links}>
                {lists.map(({ list, open }) => (
                  <li key={list.id}>
                    <Link href={`/l/${list.id}`}>{list.name}</Link>
                    {open > 0 ? <span className={styles.count}>{open} open</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
