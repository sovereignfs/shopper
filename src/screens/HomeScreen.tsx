'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvatarStack, Button, Card, EmptyState, Icon } from '@sovereignfs/ui';
import { type Glance, type HomeTile, homeOf } from '../local/home';
import { joinedLandingOf } from '../local/listview';
import { useLocalQuery } from '../local/react';
import { JOINED_KEY } from './AcceptInvite';
import { ListGlyph } from './ListGlyph';
import { useTitle } from './title';
import styles from './HomeScreen.module.css';

const openWords = (open: number): string => (open === 0 ? 'Nothing open' : `${open} open`);

/**
 * **Home** (RFC 0006, DESIGN.md §16.4), where Shopper opens for someone signed in: _Continue_ for the list they used last, a tile for every list (their own, then
 * those shared with them; archived ones behind a toggle) and what can be said at a glance. All of it is read from the device (`homeOf`), so it is there offline and
 * nothing is stored for it. Someone who has just accepted an invitation is taken to that list instead, once the device has it.
 */
export function HomeScreen() {
  useTitle(['Home']);
  const router = useRouter();
  const [archivedShown, setArchivedShown] = useState(false);
  // Someone who has just accepted an invitation lands on that household's first list, once the device has it; the note is forgotten when it has been used.
  const [joined] = useState(() => {
    try {
      return window.localStorage.getItem(JOINED_KEY);
    } catch {
      return null;
    }
  });
  const arrival = useLocalQuery(
    async (db) => (joined ? ((await joinedLandingOf(db, joined)) ?? null) : null),
    [joined],
  ).data;
  useEffect(() => {
    if (!arrival) return;
    try {
      window.localStorage.removeItem(JOINED_KEY);
    } catch {
      // Nothing to remove from.
    }
    router.replace(`/l/${arrival}`);
  }, [arrival, router]);
  const home = useLocalQuery((db) => homeOf(db, Date.now()), []).data;

  // Nothing before the device has households (a first load), and nothing to show while someone is on their way to the list they were invited to.
  if (home === undefined || arrival) return <div className={styles.page} aria-busy="true" />;
  const lists = home.own.length + home.shared.length;
  if (lists === 0 && home.archived.length === 0)
    return (
      <EmptyState
        icon="list-todo"
        heading="No lists yet"
        description="Make one with New list, in the sidebar."
      />
    );
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Home</h1>
        <Link href="/inventory" className={styles.inventory}>
          <Icon name="package" size="sm" aria-hidden />
          <span>Inventory</span>
        </Link>
      </header>
      {home.continue ? <Continue tile={home.continue} fresh={home.fresh} /> : null}
      {home.own.length > 0 ? <TileSection heading="My lists" tiles={home.own} /> : null}
      {home.shared.length > 0 ? <TileSection heading="Shared with me" tiles={home.shared} /> : null}
      {home.archived.length > 0 ? (
        <section className={styles.section} aria-labelledby="home-archived">
          <h2 id="home-archived" className={styles.heading}>
            Archived
          </h2>
          <div>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={archivedShown}
              aria-controls="home-archived-lists"
              onClick={() => setArchivedShown(!archivedShown)}
            >
              <Icon name="archive" size="sm" aria-hidden />
              <span className={styles.toggleLabel}>
                {archivedShown ? 'Hide archived' : `Archived (${home.archived.length})`}
              </span>
            </Button>
          </div>
          {archivedShown ? (
            <ul id="home-archived-lists" className={styles.tiles}>
              {home.archived.map((tile) => (
                <ListTile key={tile.list.id} tile={tile} archived />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {lists > 0 ? <AtAGlance glance={home.glance} /> : null}
    </div>
  );
}

/** _Continue_: the list used last, as a large tile, with the line a new account is given until it has put something on the list. */
function Continue({ tile, fresh }: { tile: HomeTile; fresh: boolean }) {
  return (
    <Card as="div" interactive padding="lg" className={styles.continue}>
      <Link href={`/l/${tile.list.id}`} className={styles.continueLink}>
        <ListGlyph list={tile.list} size="lg" />
        <span className={styles.continueText}>
          <span className={styles.eyebrow}>Continue</span>
          <span className={styles.continueName}>{tile.list.name}</span>
          <span className={styles.meta}>{openWords(tile.open)}</span>
        </span>
        <Icon name="chevron-right" size="md" aria-hidden />
      </Link>
      {fresh ? (
        <p className={styles.line}>Add what you need. To shop with others, press Share.</p>
      ) : null}
    </Card>
  );
}

function TileSection({ heading, tiles }: { heading: string; tiles: readonly HomeTile[] }) {
  const id = `home-${heading.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {heading}
      </h2>
      <ul className={styles.tiles}>
        {tiles.map((tile) => (
          <ListTile key={tile.list.id} tile={tile} />
        ))}
      </ul>
    </section>
  );
}

/** A list's tile: its icon in its colour, its name, how many are open, whose it is when someone shared it, and who is on it. The whole tile is the link. */
function ListTile({ tile, archived = false }: { tile: HomeTile; archived?: boolean }) {
  return (
    <Card as="li" interactive padding="md" className={styles.tile}>
      <Link href={`/l/${tile.list.id}`} className={styles.tileLink}>
        <ListGlyph list={tile.list} size="md" />
        <span className={styles.tileName}>
          {tile.list.name}
          {archived ? <span className={styles.meta}> (archived)</span> : null}
        </span>
      </Link>
      <span className={styles.tileMeta}>
        {archived ? null : <span className={styles.meta}>{openWords(tile.open)}</span>}
        {tile.synced ? null : <span className={styles.meta}>Not synced yet</span>}
        {tile.by ? <span className={styles.meta}>Shared by {tile.by}</span> : null}
      </span>
      {tile.people.length > 0 ? (
        <AvatarStack
          people={tile.people.map((name) => ({ name }))}
          max={4}
          size="sm"
          label="On this list"
        />
      ) : null}
    </Card>
  );
}

/** What the device can say about all the lists at once: open items, what was bought this week, and what is bought most. */
function AtAGlance({ glance }: { glance: Glance }) {
  return (
    <section className={styles.section} aria-labelledby="home-glance">
      <h2 id="home-glance" className={styles.heading}>
        At a glance
      </h2>
      <dl className={styles.glance}>
        <Card padding="md">
          <dt className={styles.eyebrow}>Open items</dt>
          <dd className={styles.figure}>{glance.open}</dd>
        </Card>
        <Card padding="md">
          <dt className={styles.eyebrow}>Bought this week</dt>
          <dd className={styles.figure}>{glance.boughtThisWeek}</dd>
        </Card>
        <Card padding="md">
          <dt className={styles.eyebrow}>Bought most</dt>
          <dd className={styles.most}>
            {glance.mostBought.length === 0
              ? 'Nothing yet'
              : glance.mostBought.map((each) => `${each.name} (${each.times})`).join(', ')}
          </dd>
        </Card>
      </dl>
    </section>
  );
}
