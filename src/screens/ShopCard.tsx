'use client';

import { useState } from 'react';
import { Button, Dialog, Icon } from '@sovereignfs/ui';
import type { CardRow } from '../actions/rows';
import { KIND_LABELS } from '../cards/codes';
import { cardsOfList } from '../local/list-cards-view';
import { useLocalQuery } from '../local/react';
import { CardGlyph } from './CardGlyph';
import { CodeView } from './CodeView';
import styles from './ShopCard.module.css';

/**
 * **The card for this shop, one tap from Shopping mode** (DESIGN.md §7.7, §11.1, RFC 0007, task 24.6): the cards the list's Admin linked to it, **read from the device**, so it opens with no
 * network. With none it draws nothing, which is also what a person on the list who is **not on the card** sees: the device has no link for them, since the server gives it to no one else. With
 * one it opens that card; with several it asks which. The card is shown over shopping, the code as large as the dialog lets it be and the number beneath it, and closing it is where the person was.
 */
export function ShopCard({ listId }: { listId: string }) {
  const cards = useLocalQuery((db) => cardsOfList(db, listId), [listId]).data ?? [];
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  if (cards.length === 0) return null;
  const only = cards.length === 1 ? cards[0] : undefined;
  const shown = only ?? cards.find((card) => card.id === chosen);
  const close = () => {
    setOpen(false);
    setChosen(null);
  };
  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => setOpen(true)}
        aria-label={only ? `Show the card ${only.shop}` : 'Show a card'}
      >
        <Icon name="wallet-cards" aria-hidden />
      </button>
      {open ? (
        <Dialog
          open
          onClose={close}
          size="md"
          // A header, not a title: a title is shown on a phone only, and on a desktop the close button would float over the body.
          header={shown ? shown.shop : 'Cards'}
          aria-label={shown ? shown.shop : 'Cards for this list'}
          footer={
            <div className={styles.footer}>
              {!only && shown ? (
                <Button variant="secondary" onClick={() => setChosen(null)}>
                  All cards
                </Button>
              ) : null}
              <Button variant="secondary" onClick={close}>
                Done
              </Button>
            </div>
          }
        >
          {shown ? <Face card={shown} /> : <Choice cards={cards} onChoose={setChosen} />}
        </Dialog>
      ) : null}
    </>
  );
}

function Choice({
  cards,
  onChoose,
}: {
  cards: readonly CardRow[];
  onChoose: (id: string) => void;
}) {
  return (
    <ul className={styles.choices} aria-label="Cards for this list">
      {cards.map((card) => (
        <li key={card.id}>
          <button type="button" className={styles.choice} onClick={() => onChoose(card.id)}>
            <CardGlyph card={card} size="md" />
            <span>{card.shop}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A card as it is shown at a till: its code, its number in text beneath it, and the name on it. */
function Face({ card }: { card: CardRow }) {
  return (
    <div className={styles.face}>
      {card.holder ? <p className={styles.sub}>{card.holder}</p> : null}
      <CodeView
        kind={card.kind}
        code={card.code}
        label={`${card.shop}: ${KIND_LABELS[card.kind]}`}
      />
      <p className={styles.number} aria-label="Number">
        {card.number}
      </p>
    </div>
  );
}
