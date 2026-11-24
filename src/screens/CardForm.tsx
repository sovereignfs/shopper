'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ColorPicker,
  Dialog,
  FormField,
  IconPicker,
  Input,
  Select,
  Textarea,
} from '@sovereignfs/ui';
import { changeCard, makeCard } from '../actions/cards';
import { after } from '../actions/position';
import type { CardRow } from '../actions/rows';
import { CARD_ICONS, cardColorOf, cardIconOf } from '../cards/appearance';
import { KINDS_IN_ORDER, KIND_LABELS, checkCard, guessKind } from '../cards/codes';
import { type CodeKind, isCodeKind } from '../cards/kinds';
import { MAX_NAME_LENGTH, isName } from '../catalog/name';
import { LIST_SWATCHES } from '../lists/appearance';
import { useLocal } from '../local/react';
import styles from './CardForm.module.css';

/**
 * **Adding a card, and changing one** (DESIGN.md §7.7, §16.14): a shop, a number and the kind of code it is, **checked as it is typed** (`checkCard`: a check digit added or refused, a
 * character the kind has not), and, for a QR code, what it holds; then a colour, an icon, the name on the card and a note. Typing is always a way: scanning (24.4) fills the same fields. **It
 * writes to the device at once** (`makeCard`, `changeCard`), with no network; a card is made in the person's own group, once it has moved to device encryption (a card is every field a ciphertext,
 * and the server refuses one before), which the form says instead of making a card that would wait for ever.
 */
export function CardForm({
  household,
  last,
  card,
  initial,
  onClose,
  onDone,
}: {
  /** The person's own group, for a new card. */
  household: string;
  /** The position of their last card, which a new one goes after. */
  last: string | null;
  /** The card being changed; none for a new one. */
  card?: CardRow;
  /** What a scan or a link already says (24.4): a new card starts from it. */
  initial?: { kind?: CodeKind; number?: string; code?: string };
  onClose: () => void;
  /** Told of the card that was made (its id) or changed. */
  onDone?: (id: string) => void;
}) {
  const { client, keysOf } = useLocal();
  const [shop, setShop] = useState(card?.shop ?? '');
  const [number, setNumber] = useState(card?.number ?? initial?.number ?? '');
  const [kind, setKind] = useState<string>(card?.kind ?? initial?.kind ?? '');
  const [chosen, setChosen] = useState(card !== undefined || initial?.kind !== undefined);
  const [code, setCode] = useState(
    card
      ? card.kind === 'qr' && card.code !== card.number
        ? card.code
        : ''
      : (initial?.code ?? ''),
  );
  const [color, setColor] = useState<string | null>(card?.color ?? null);
  const [icon, setIcon] = useState<string | null>(card?.icon ?? null);
  const [holder, setHolder] = useState(card?.holder ?? '');
  const [note, setNote] = useState(card?.note ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Whether the group has moved to device encryption, which a card needs (known once the device has heard the group's keys).
  const [ready, setReady] = useState<boolean | null>(card ? true : null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (card) return;
    let current = true;
    void keysOf(household).then((keys) => current && setReady(keys.encrypted));
    return () => {
      current = false;
    };
  }, [card, household, keysOf]);

  // The kind starts from what the number looks like, until the person chooses one.
  const shownKind = chosen ? kind : number.trim() === '' ? '' : guessKind(number);
  const effectiveKind = isCodeKind(shownKind) ? shownKind : '';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    const name = shop.trim();
    if (!isName(name)) return setProblem('Name the shop or brand the card is from.');
    const checked = checkCard({
      kind: effectiveKind,
      number,
      code: effectiveKind === 'qr' ? code : undefined,
    });
    if (!checked.ok) return setProblem(checked.problem);
    if (holder.trim() !== '' && !isName(holder.trim()))
      return setProblem(`The name on the card can have at most ${MAX_NAME_LENGTH} characters.`);
    if (!isCodeKind(effectiveKind)) return;
    setBusy(true);
    const env = { now: Date.now(), newId: () => crypto.randomUUID() };
    if (card) {
      const mutation = changeCard(env, card, {
        shop: name,
        number: checked.number,
        kind: effectiveKind,
        code: checked.code,
        color,
        icon,
        holder: holder.trim() === '' ? null : holder.trim(),
        note: note.trim() === '' ? null : note.trim(),
      });
      if (mutation) await client.commit(mutation);
      onDone?.(card.id);
    } else {
      const mutation = makeCard(env, {
        householdId: household,
        position: after(last),
        shop: name,
        number: checked.number,
        kind: effectiveKind,
        code: checked.code,
        icon,
        color,
        holder: holder.trim() === '' ? null : holder.trim(),
        note: note.trim() === '' ? null : note.trim(),
      });
      await client.commit(mutation);
      onDone?.(mutation.changes[0]?.id ?? '');
    }
    onClose();
  }

  const title = card ? 'Change the card' : 'Add a card';
  return (
    <Dialog open onClose={onClose} size="md" title={title} aria-label={title}>
      <form ref={form} className={styles.form} onSubmit={(event) => void submit(event)}>
        {ready === false ? (
          <Alert variant="info">
            Cards can be kept once your lists are encrypted on this device, which happens when you
            first open Shopper after signing up. Try again in a moment.
          </Alert>
        ) : null}
        <FormField label="Shop or brand">
          {(field) => (
            <Input
              {...field}
              value={shop}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setShop(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Number">
          {(field) => (
            <Input
              {...field}
              value={number}
              inputMode="text"
              autoComplete="off"
              disabled={busy}
              onChange={(event) => {
                setNumber(event.target.value);
                setProblem(null);
              }}
            />
          )}
        </FormField>
        <FormField label="Kind of code">
          {(field) => (
            <Select
              {...field}
              value={effectiveKind}
              disabled={busy}
              onChange={(event) => {
                setKind(event.target.value);
                setChosen(true);
                setProblem(null);
              }}
            >
              {effectiveKind === '' ? <option value="">Choose a kind</option> : null}
              {KINDS_IN_ORDER.map((each) => (
                <option key={each} value={each}>
                  {KIND_LABELS[each]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {effectiveKind === 'qr' ? (
          <FormField label="What the QR code holds (if not the number)">
            {(field) => (
              <Input
                {...field}
                value={code}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setCode(event.target.value)}
              />
            )}
          </FormField>
        ) : null}
        <div className={styles.look}>
          <div>
            <span className={styles.label}>Icon</span>
            <IconPicker
              aria-label="Icon"
              value={cardIconOf(icon)}
              options={CARD_ICONS}
              onChange={(next) => setIcon(next)}
            />
          </div>
          <div>
            <span className={styles.label}>Colour</span>
            <ColorPicker
              aria-label="Colour"
              customLabel="Choose another colour"
              allowNone
              noneLabel="Default colour"
              swatches={LIST_SWATCHES}
              value={color === null ? null : cardColorOf(color)}
              onChange={setColor}
            />
          </div>
        </div>
        <FormField label="Name on the card (optional)">
          {(field) => (
            <Input
              {...field}
              value={holder}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setHolder(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Note (optional)">
          {(field) => (
            <Textarea
              {...field}
              value={note}
              rows={2}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </FormField>
        {problem ? <Alert variant="error">{problem}</Alert> : null}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || ready === false}>
            {card ? 'Save the card' : 'Add the card'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
