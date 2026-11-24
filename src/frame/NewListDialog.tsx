'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button, Dialog, FormField, Input } from '@sovereignfs/ui';
import { makeList } from '../actions/lists';
import { MAX_NAME_LENGTH, isName } from '../catalog/name';
import type { Place } from '../local/places';
import { useLocal } from '../local/react';
import styles from './NewListDialog.module.css';

/**
 * **_New list_** (RFC 0005, DESIGN.md §16.2): a dialog with a name, opened from the sidebar's row and the drawer's. **Enter makes it,** at once and on the device, and goes
 * to it; Cancel and Escape make nothing. Nothing waits for the network: the list is on the device and in the outbox when this returns. A dialog and not a field in the
 * sidebar, since a rail has no room to type in and the drawer would close under the keyboard.
 */
export function NewListDialog({ place, onClose }: { place: Place; onClose: () => void }) {
  const { client } = useLocal();
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const trimmed = name.trim();
  // The name is what the person came to type, so the dialog opens with focus in it. The dialog moves focus to its own first control once it has mounted its panel, which
  // is after this runs, and when varies by browser (in some it does not: focus stays on what opened it): so this takes it a few times in the first half second, and only
  // from what opened the dialog, from the dialog's own controls or from nowhere, never from something the person has since moved to.
  useEffect(() => {
    const opener = document.activeElement;
    const take = () => {
      const input = form.current?.querySelector('input');
      const now = document.activeElement;
      const panel = form.current?.closest('dialog, [role="dialog"]');
      if (
        input &&
        now !== input &&
        (now === opener || now === document.body || panel?.contains(now) === true)
      )
        input.focus();
    };
    const timers = [0, 60, 200, 500].map((ms) => setTimeout(take, ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  async function make(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy || !isName(trimmed)) return;
    setBusy(true);
    const mutation = makeList(
      { now: Date.now(), newId: () => crypto.randomUUID() },
      { householdId: place.household.id, name: trimmed, position: place.nextPosition },
    );
    await client.commit(mutation);
    const id = mutation.changes[0]?.id ?? null;
    onClose();
    if (id) router.push(`/l/${id}`);
  }

  return (
    <Dialog open onClose={onClose} size="sm" title="New list" aria-label="New list">
      <form ref={form} className={styles.form} onSubmit={(event) => void make(event)}>
        <FormField label="Name of the new list">
          {(field) => (
            <Input
              {...field}
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !isName(trimmed)}>
            Make the list
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
