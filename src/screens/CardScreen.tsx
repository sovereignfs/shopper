'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, ConfirmDialog, EmptyState, Icon } from '@sovereignfs/ui';
import { canChange } from '../actions/cards';
import { KIND_LABELS } from '../cards/codes';
import { callOperation } from '../local/ops';
import { useLocal, useLocalQuery } from '../local/react';
import { cardViewOf } from '../local/cards-view';
import { CardForm } from './CardForm';
import { CardShareDialog } from './CardShareDialog';
import { useQueryParam } from './ItemEditor';
import styles from './CardScreen.module.css';
import { CodeView } from './CodeView';
import { useTitle } from './title';
import { useWakeLock } from './wake-lock';

/**
 * **A card, full screen** (DESIGN.md §16.14, RFC 0007), at `/cards/<id>`: its code as large as the screen lets it be and the number in text beneath it, **the screen kept on** while it is shown
 * (`useWakeLock`), **read from the device and so offline**. Its Admin changes, shares (at `?share=1`, RFC 0007) and deletes it from here (sharing and deleting are online operations, deleting asks first); a
 * Member shows it, sees none of those, and can leave it, which asks first and takes the card from their devices.
 * A card the device does not have, which is also one that another person owns, is said to be not here.
 */
export function CardScreen({ id }: { id: string }) {
  const { client } = useLocal();
  const router = useRouter();
  const view = useLocalQuery((db) => cardViewOf(db, id), [id]);
  const [editing, setEditing] = useState(false);
  const sharing = useQueryParam('share');
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const card = view.data?.card;
  useTitle(card ? [card.shop, 'Loyalty cards'] : ['Loyalty cards']);
  useWakeLock();
  if (!view.ready) return <div className={styles.page} aria-busy="true" />;
  if (!card || !view.data)
    return (
      <div className={styles.page}>
        <EmptyState
          icon="wallet-cards"
          heading="That card is not here"
          description="It may have been deleted, or it is not one you are on."
          action={
            <Link href="/cards">
              <Button variant="secondary" size="sm">
                Back to your cards
              </Button>
            </Link>
          }
        />
      </div>
    );
  const mine = canChange(view.data.role ?? undefined);

  async function remove() {
    if (!card || !client) return;
    setWorking(true);
    setProblem(null);
    const done = await callOperation({
      op: 'card.delete',
      household: card.householdId,
      card: card.id,
    });
    setWorking(false);
    if (!done.ok) {
      setConfirming(false);
      setProblem(done.message);
      return;
    }
    // The device learns of it at once rather than at the next interval, and goes back to the cards.
    await client.sync().catch(() => undefined);
    router.push('/cards');
  }

  async function leave() {
    if (!card || !client) return;
    setWorking(true);
    setProblem(null);
    const done = await callOperation({
      op: 'card.member.leave',
      household: card.householdId,
      card: card.id,
    });
    setWorking(false);
    if (!done.ok) {
      setLeaving(false);
      setProblem(done.message);
      return;
    }
    // The card goes from this device at once rather than at the next interval, and so does the group if it was all they had of it.
    await client.sync().catch(() => undefined);
    router.push('/cards');
  }

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <Link href="/cards">
          <Button variant="ghost" size="sm">
            <Icon name="chevron-left" size="sm" aria-hidden />
            <span>Cards</span>
          </Button>
        </Link>
        {mine ? (
          <div className={styles.barActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => sharing.open('1')}
              aria-label="Share"
            >
              <Icon name="users" size="sm" aria-hidden />
              <span>Share</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        ) : null}
      </div>
      <header className={styles.head}>
        <h1 className={styles.title}>{card.shop}</h1>
        {card.holder ? <p className={styles.sub}>{card.holder}</p> : null}
        <p className={styles.sub}>
          {KIND_LABELS[card.kind]}
          {!view.data.own && view.data.by ? ` · From ${view.data.by}` : ''}
        </p>
      </header>
      <CodeView
        kind={card.kind}
        code={card.code}
        label={`${card.shop}: ${KIND_LABELS[card.kind]}`}
      />
      <p className={styles.number} aria-label="Number">
        {card.number}
      </p>
      {card.note ? <p className={styles.note}>{card.note}</p> : null}
      {problem ? <Alert variant="error">{problem}</Alert> : null}
      {mine ? (
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
            Delete this card…
          </Button>
        </div>
      ) : view.data.role === 'member' ? (
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={() => setLeaving(true)}>
            Leave this card…
          </Button>
        </div>
      ) : null}
      {mine && sharing.value === '1' ? (
        <CardShareDialog card={card} onClose={sharing.close} />
      ) : null}
      {editing ? (
        <CardForm
          household={card.householdId}
          last={null}
          card={card}
          onClose={() => setEditing(false)}
        />
      ) : null}
      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Leave this card?"
        message={
          <>
            <strong>{card.shop}</strong> will no longer be on your devices. You can have it again if
            its owner sends you a new link. It needs a connection.
          </>
        }
        confirmLabel={working ? 'Leaving…' : 'Leave the card'}
        destructive
        pending={working}
        onConfirm={() => void leave()}
      />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this card?"
        message={
          <>
            <strong>{card.shop}</strong> will be deleted for everyone who has it. It needs a
            connection.
          </>
        }
        confirmLabel={working ? 'Deleting…' : 'Delete the card'}
        destructive
        pending={working}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
