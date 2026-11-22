'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Icon } from '@sovereignfs/ui';
import { makeList } from '../actions/lists';
import { isName, MAX_NAME_LENGTH } from '../catalog/name';
import { type Place, placesOf } from '../local/places';
import { useLocal, useLocalQuery } from '../local/react';
import styles from './ListsNav.module.css';

/**
 * The person's lists (DESIGN.md §16.2, RFC 0004), read from the device, so it is there with no network and its counts move as items are ticked: **Your
 * lists**, with _New list_, and **Shared with you**, the lists others shared, whoever's they are. No group is named: a list is what is shared, by
 * **Share** on the list. Under each its lists with how many items are open; archived lists are behind a toggle. Every list is a link, so the keyboard and a
 * pointer take the same way, and the one open is marked.
 *
 * `rail` draws a letter for each list and a plus; `onNavigate` is told when a link is followed or a list made, which the phone's sheet closes on; `widen`
 * is what _New list_ asks of a rail, which has no room for a name to be typed.
 */
export function ListsNav({
  rail = false,
  onNavigate,
  widen,
}: {
  rail?: boolean;
  onNavigate?: () => void;
  widen?: () => void;
}) {
  const places = useLocalQuery(placesOf).data;
  if (places === undefined)
    return <nav className={styles.nav} aria-busy="true" aria-label="Lists" />;
  if (places.length === 0)
    return (
      <p className={styles.empty} role="status">
        Your lists will be here once this device has loaded them.
      </p>
    );
  const own = places.find((place) => place.household.own);
  const others = places.filter((place) => !place.household.own);
  return (
    // Not a landmark of its own: the sidebar and the sheet that hold it are navigations already.
    <div className={`${styles.nav} ${rail ? styles.rail : ''}`}>
      {own ? (
        <Section
          heading="Your lists"
          lists={own.lists}
          archived={own.archived}
          place={own}
          rail={rail}
          onNavigate={onNavigate}
          widen={widen}
        />
      ) : null}
      {others.some((place) => place.lists.length > 0 || place.archived.length > 0) ? (
        <Section
          heading="Shared with you"
          lists={others.flatMap((place) => place.lists)}
          archived={others.flatMap((place) => place.archived)}
          rail={rail}
          onNavigate={onNavigate}
          widen={widen}
        />
      ) : null}
    </div>
  );
}

function Section({
  heading,
  lists,
  archived: archivedLists,
  place,
  rail,
  onNavigate,
  widen,
}: {
  heading: string;
  lists: Place['lists'];
  archived: Place['archived'];
  /** Where _New list_ makes a list: the person's own, and only there. */
  place?: Place;
  rail: boolean;
  onNavigate: (() => void) | undefined;
  widen: (() => void) | undefined;
}) {
  const [adding, setAdding] = useState(false);
  const [archived, setArchived] = useState(false);

  return (
    <section className={styles.section} aria-label={heading}>
      <h2 className={styles.heading}>{heading}</h2>
      <ul className={styles.lists}>
        {lists.map(({ list, open, synced, by }) => (
          <li key={list.id}>
            <ListLink list={list} open={open} synced={synced} by={by} onNavigate={onNavigate} />
          </li>
        ))}
        {archived
          ? archivedLists.map((list) => (
              <li key={list.id}>
                <ListLink list={list} open={0} synced archived onNavigate={onNavigate} />
              </li>
            ))
          : null}
        {place ? (
          <li>
            {adding && !rail ? (
              <NewListForm
                place={place}
                onDone={(id) => {
                  setAdding(false);
                  if (id) onNavigate?.();
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.action}
                title="New list"
                onClick={() => {
                  if (rail) widen?.();
                  setAdding(true);
                }}
              >
                <Icon name="plus" aria-hidden />
                <span>New list</span>
              </button>
            )}
          </li>
        ) : null}
        {archivedLists.length > 0 && !rail ? (
          <li>
            <button
              type="button"
              className={styles.action}
              aria-expanded={archived}
              onClick={() => setArchived(!archived)}
            >
              <Icon name="archive" aria-hidden />
              <span>{archived ? 'Hide archived' : `Archived (${archivedLists.length})`}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function ListLink({
  list,
  open,
  synced,
  archived = false,
  by = null,
  onNavigate,
}: {
  list: Place['lists'][number]['list'];
  open: number;
  synced: boolean;
  /** Whose list it is, said under its name in Shared with you. */
  by?: string | null;
  archived?: boolean;
  onNavigate: (() => void) | undefined;
}) {
  const here = usePathname() === `/l/${list.id}`;
  return (
    <Link
      href={`/l/${list.id}`}
      className={styles.row}
      title={list.name}
      aria-current={here ? 'page' : undefined}
      onClick={onNavigate}
    >
      <span className={styles.initial} aria-hidden>
        {[...list.name][0]?.toUpperCase()}
      </span>
      <span className={styles.label}>
        <span className={styles.name}>
          {list.name}
          {archived ? ' (archived)' : ''}
        </span>
        {by ? <span className={styles.by}>{by}</span> : null}
      </span>
      {synced ? null : (
        <span className={styles.unsynced} role="img" aria-label="Not synced yet">
          <Icon name="clock" aria-hidden />
        </span>
      )}
      {open > 0 ? (
        <span className={styles.count} aria-label={`${open} open`}>
          {open}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * A list's name, typed where the button was. **Enter makes it**, at once and on the device, and goes to it; Escape, or leaving the field empty, puts the
 * button back. Nothing waits for the network: the list is on the device and in the outbox when this returns.
 */
function NewListForm({ place, onDone }: { place: Place; onDone: (made: string | null) => void }) {
  const { client } = useLocal();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => input.current?.focus(), []);

  async function make(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!client || busy || !isName(trimmed)) return;
    setBusy(true);
    const mutation = makeList(
      { now: Date.now(), newId: () => crypto.randomUUID() },
      { householdId: place.household.id, name: trimmed, position: place.nextPosition },
    );
    await client.commit(mutation);
    const id = mutation.changes[0]?.id ?? null;
    onDone(id);
    if (id) router.push(`/l/${id}`);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void make(event)}>
      <input
        ref={input}
        className={styles.field}
        aria-label="Name of the new list"
        placeholder="Name of the list"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        disabled={busy}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone(null);
        }}
        onBlur={() => {
          if (name.trim() === '' && !busy) onDone(null);
        }}
      />
    </form>
  );
}
