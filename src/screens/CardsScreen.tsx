'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, EmptyState, Icon } from '@sovereignfs/ui';
import { startOf } from '../cards/codes';
import type { CodeKind } from '../cards/kinds';
import { useLocalQuery } from '../local/react';
import { type CardView, cardsScreenOf } from '../local/cards-view';
import { CardForm } from './CardForm';
import { CardGlyph } from './CardGlyph';
import { ScanDialog } from './ScanDialog';
import styles from './CardsScreen.module.css';
import { useTitle } from './title';

/**
 * **Loyalty cards** (DESIGN.md §16.14, RFC 0007), the person's own and those shared with them: a grid, each with its icon in its colour and its shop, **read from the device**, so it opens with no
 * network. A card opens full screen (`/cards/<id>`); _Add card_ opens the form (scanning, 24.4, fills the same fields). A card is the person's own when it was made in their own group.
 */
export function CardsScreen() {
  useTitle(['Loyalty cards']);
  const data = useLocalQuery(cardsScreenOf, []).data;
  // The form, empty or started from a scan; and the camera, which hands a code on to the form.
  const [form, setForm] = useState<{ kind?: CodeKind; number?: string; code?: string } | null>(
    null,
  );
  const [scanning, setScanning] = useState(false);
  if (data === undefined) return <div className={styles.page} aria-busy="true" />;
  const none = data.own.length === 0 && data.shared.length === 0;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Loyalty cards</h1>
        {data.household ? (
          <div className={styles.buttons}>
            <Button size="sm" variant="secondary" onClick={() => setScanning(true)}>
              <Icon name="scan-barcode" size="sm" aria-hidden />
              <span className={styles.label}>Scan card</span>
            </Button>
            <Button size="sm" onClick={() => setForm({})}>
              <Icon name="plus" size="sm" aria-hidden />
              <span className={styles.label}>Add card</span>
            </Button>
          </div>
        ) : null}
      </header>
      <p className={styles.lede}>
        The cards you show at a till, kept on your devices and encrypted. Open one to show its code,
        full screen.
      </p>
      {none ? (
        <EmptyState
          icon="wallet-cards"
          heading="No cards yet"
          description="Add a loyalty card by typing its number, and show it at the till from here."
        />
      ) : null}
      <Grid heading="Your cards" views={data.own} />
      <Grid heading="Shared with you" views={data.shared} />
      {scanning ? (
        <ScanDialog
          onFound={(found) => {
            setScanning(false);
            setForm(startOf(found));
          }}
          onType={() => {
            setScanning(false);
            setForm({});
          }}
          onClose={() => setScanning(false)}
        />
      ) : null}
      {form && data.household ? (
        <CardForm
          household={data.household}
          last={data.last}
          initial={form}
          onClose={() => setForm(null)}
        />
      ) : null}
    </div>
  );
}

function Grid({ heading, views }: { heading: string; views: readonly CardView[] }) {
  if (views.length === 0) return null;
  const id = `cards-${heading.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {heading}
      </h2>
      <ul className={styles.grid}>
        {views.map(({ card, by }) => (
          <li key={card.id}>
            <Link className={styles.tile} href={`/cards/${card.id}`}>
              <CardGlyph card={card} size="lg" />
              <span className={styles.shop}>{card.shop}</span>
              {by ? <span className={styles.meta}>From {by}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
