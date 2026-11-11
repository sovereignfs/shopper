'use client';

import { useCallback, useEffect, useState } from 'react';
import { Avatar, Button, ConfirmDialog, CopyButton, Dialog } from '@sovereignfs/ui';
import { type ListData } from '../local/listview';
import { useLocal } from '../local/react';
import { callOperation } from '../local/ops';
import type { MemberRow } from '../local/rows';
import styles from './ShareDialog.module.css';

type Found = Extract<ListData, { found: true }>;

interface Link {
  readonly id: string;
  readonly by: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly canRevoke: boolean;
}

const day = (at: number): string =>
  new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' });

/**
 * **Sharing** (DESIGN.md §16.9, §7.3): a dialog at `?share=1`, opened by **Share** on a list and from a household's section in the sidebar. It says first that
 * the people you share with see and edit every list here (sharing is not per list), then lists the people (an Admin marked; an address only where the
 * reader may see it, which the device was given and no more). **Invite** makes a link, shown once with Copy, and says that anyone holding it can join and
 * that it expires in 14 days; the live links are listed with who made them and Revoke; a Member can Leave and the Admin can Remove, each after a
 * confirmation. The people are read from the device, so offline the dialog shows what it held; **every change is an online operation** (`/api/ops`) and
 * says so when there is no network, changing nothing.
 */
export function ShareDialog({ data, onClose }: { data: Found; onClose: () => void }) {
  const { client } = useLocal();
  const { household, members, me } = data;
  const admin = household.role === 'admin';
  const [links, setLinks] = useState<Link[] | null>(null);
  const [linksNote, setLinksNote] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    { kind: 'leave' } | { kind: 'remove'; member: MemberRow } | null
  >(null);

  const load = useCallback(async () => {
    const answer = await callOperation({ op: 'invite.list', household: household.id });
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
  }, [household.id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    setBusy(true);
    setMessage(null);
    const answer = await callOperation({ op: 'invite.create', household: household.id });
    setBusy(false);
    if (!answer.ok) return setMessage(answer.message);
    const made = answer.result as { path: string; expiresAt: number };
    setFresh({ url: `${window.location.origin}${made.path}`, expiresAt: made.expiresAt });
    void load();
  }

  async function revoke(id: string) {
    setMessage(null);
    const answer = await callOperation({
      op: 'invite.revoke',
      household: household.id,
      invitation: id,
    });
    if (!answer.ok) setMessage(answer.message);
    void load();
  }

  async function confirmed() {
    if (!confirm) return;
    setBusy(true);
    setMessage(null);
    const answer =
      confirm.kind === 'leave'
        ? await callOperation({ op: 'member.leave', household: household.id })
        : await callOperation({
            op: 'member.remove',
            household: household.id,
            person: confirm.member.personId,
          });
    setBusy(false);
    if (!answer.ok) {
      setConfirm(null);
      return setMessage(answer.message);
    }
    if (confirm.kind === 'leave') {
      // The household goes from this device at its next sync: start over from the front address, which opens a list that is still theirs.
      window.location.assign('/');
      return;
    }
    setConfirm(null);
    void client?.sync();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title="Share"
      aria-label={`Share ${household.label}`}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.lead}>People you share with see and edit every list here.</p>

        <section aria-label="People">
          <h3 className={styles.heading}>People</h3>
          <ul className={styles.people}>
            {members.map((member) => (
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
                {admin && !member.self && member.role !== 'admin' ? (
                  <button
                    type="button"
                    className={styles.quiet}
                    aria-label={`Remove ${member.name}`}
                    onClick={() => setConfirm({ kind: 'remove', member })}
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
                Anyone holding this link can join, and it expires on {day(fresh.expiresAt)}. It is
                shown once: make another to share again.
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

        {me && !admin ? (
          <button
            type="button"
            className={styles.quiet}
            onClick={() => setConfirm({ kind: 'leave' })}
          >
            Leave {household.label}
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'leave' ? `Leave ${household.label}?` : 'Remove this person?'}
        message={
          confirm?.kind === 'leave'
            ? 'You will no longer see these lists. What you added stays here under your name.'
            : confirm?.kind === 'remove'
              ? `${confirm.member.name} will no longer see these lists. What they added stays here under their name.`
              : null
        }
        confirmLabel={confirm?.kind === 'leave' ? 'Leave' : 'Remove'}
        destructive
        pending={busy}
        onConfirm={() => void confirmed()}
      />
    </Dialog>
  );
}
