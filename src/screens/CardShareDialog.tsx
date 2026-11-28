'use client';

import { useCallback, useEffect, useState } from 'react';
import { Avatar, Button, ConfirmDialog, CopyButton, Dialog } from '@sovereignfs/ui';
import { useFormat } from '../account/AccountProvider';
import { newLinkSecret, wrapCardForLink } from '../keys/link';
import { callOperation } from '../local/ops';
import { useLocal, useLocalQuery } from '../local/react';
import type { CardRow } from '../actions/rows';
import type { CardMemberRow } from '../local/rows';
import { cardMembersOf } from '../local/store';
import styles from './ShareDialog.module.css';

interface Link {
  readonly id: string;
  readonly by: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly canRevoke: boolean;
}

/**
 * **Sharing a card** (DESIGN.md §7.7, §16.14, RFC 0007): a dialog at `?share=1`, opened by **Share** on a card, **its Admin's alone**. It says first that the people you share the card with can see
 * and show it and nothing else of yours, then lists the card's people (an address only where the reader may see it, which the device was given and no more). **Make a link** makes a link to this
 * card, shown once with Copy, that carries the card's keys and no other's and says that anyone holding it can add the card and that it expires in 14 days; the live links are listed with Revoke, and
 * the Admin can Remove a person, after a confirmation. As a list's dialog (`ShareDialog`): the people are read from the device, so offline it shows what it held; **every change is an online
 * operation** and says so when there is no network, changing nothing.
 */
export function CardShareDialog({ card, onClose }: { card: CardRow; onClose: () => void }) {
  const { dateOnly: day } = useFormat();
  const { client, cardKeysOf } = useLocal();
  const people = useLocalQuery((db) => cardMembersOf(db, card.id), [card.id]).data ?? [];
  const [links, setLinks] = useState<Link[] | null>(null);
  const [linksNote, setLinksNote] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<CardMemberRow | null>(null);

  const load = useCallback(async () => {
    const answer = await callOperation({
      op: 'card.invite.list',
      household: card.householdId,
      card: card.id,
    });
    if (answer.ok && Array.isArray(answer.result)) {
      setLinks(answer.result as Link[]);
      setLinksNote(null);
    } else {
      setLinks(null);
      setLinksNote(
        answer.ok
          ? 'The links could not be read.'
          : `The links waiting are not shown. ${answer.message}`,
      );
    }
  }, [card.householdId, card.id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    setBusy(true);
    setMessage(null);
    // A link to a card carries the card's keys and no other's (RFC 0007), wrapped under a secret that goes in the link after `#`, which no browser sends.
    const keys = await cardKeysOf(card.householdId, card.id);
    if (!keys.ring) {
      setBusy(false);
      return setMessage('Unlock Shopper first: a card is encrypted, and its link carries its key.');
    }
    const secret = newLinkSecret();
    const answer = await callOperation({
      op: 'card.invite.create',
      household: card.householdId,
      card: card.id,
      wrappedKey: await wrapCardForLink(keys.ring, secret, card.id),
    });
    setBusy(false);
    if (!answer.ok) return setMessage(answer.message);
    const made = answer.result as { path: string; expiresAt: number };
    setFresh({
      url: `${window.location.origin}${made.path}#${secret}`,
      expiresAt: made.expiresAt,
    });
    void load();
  }

  async function revoke(id: string) {
    setMessage(null);
    const answer = await callOperation({
      op: 'card.invite.revoke',
      household: card.householdId,
      card: card.id,
      invitation: id,
    });
    if (!answer.ok) setMessage(answer.message);
    void load();
  }

  async function removed() {
    if (!confirm) return;
    setBusy(true);
    setMessage(null);
    const answer = await callOperation({
      op: 'card.member.remove',
      household: card.householdId,
      card: card.id,
      person: confirm.personId,
    });
    setBusy(false);
    setConfirm(null);
    if (!answer.ok) return setMessage(answer.message);
    void client?.sync();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      // A header, not a title: a title is shown on a phone only, and on a desktop the close button would float over the first line of the body.
      header="Share"
      aria-label={`Share ${card.shop}`}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          People you share this card with can see and show it, and nothing else of yours.
        </p>

        <section aria-label="People">
          <h3 className={styles.heading}>People</h3>
          <ul className={styles.people}>
            {people.map((member) => (
              <li key={member.personId} className={styles.person}>
                <Avatar name={member.name} size="sm" />
                <span className={styles.who}>
                  <span>
                    {member.name}
                    {member.self ? ' (you)' : ''}
                    {member.role === 'admin' ? <span className={styles.badge}>Admin</span> : null}
                  </span>
                  {member.email ? <span className={styles.email}>{member.email}</span> : null}
                </span>
                {!member.self && member.role !== 'admin' ? (
                  <button
                    type="button"
                    className={styles.quiet}
                    aria-label={`Remove ${member.name}`}
                    onClick={() => setConfirm(member)}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Invite">
          <h3 className={styles.heading}>Invite</h3>
          <Button onClick={() => void invite()} disabled={busy}>
            Make a link
          </Button>
          {fresh ? (
            <div className={styles.fresh} role="status">
              <input
                className={styles.url}
                readOnly
                value={fresh.url}
                aria-label="Link to share"
                onFocus={(event) => event.currentTarget.select()}
              />
              <CopyButton text={fresh.url} label="Copy link" />
              <p className={styles.note}>
                Anyone holding this link can add this card, and it expires on {day(fresh.expiresAt)}
                . It is shown once: make another to share again.
              </p>
            </div>
          ) : null}
        </section>

        <section aria-label="Links waiting">
          <h3 className={styles.heading}>Links waiting</h3>
          {linksNote ? <p className={styles.note}>{linksNote}</p> : null}
          {links !== null && links.length === 0 ? (
            <p className={styles.note}>No links are waiting.</p>
          ) : null}
          <ul className={styles.people}>
            {(links ?? []).map((link) => (
              <li key={link.id} className={styles.person}>
                <span className={styles.who}>
                  <span>Made by {link.by}</span>
                  <span className={styles.email}>Expires {day(link.expiresAt)}</span>
                </span>
                {link.canRevoke ? (
                  <button
                    type="button"
                    className={styles.quiet}
                    aria-label={`Revoke the link made by ${link.by}, expiring ${day(link.expiresAt)}`}
                    onClick={() => void revoke(link.id)}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {message ? (
          <p className={styles.error} role="alert">
            {message}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Remove this person?"
        // What removing does and does not take back (RFC 0007, DESIGN.md §13.6).
        message={
          confirm
            ? `${confirm.name} will lose this card on their devices when they next sync. What they have already seen or noted stays theirs, and the card’s key is not changed yet.`
            : null
        }
        confirmLabel="Remove"
        destructive
        pending={busy}
        onConfirm={() => void removed()}
      />
    </Dialog>
  );
}
