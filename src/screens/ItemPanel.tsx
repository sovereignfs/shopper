'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  FormField,
  Icon,
  IconPicker,
  Input,
  QuantityStepper,
  Select,
  Textarea,
  Toggle,
  useCommitOnEnterOrBlur,
} from '@sovereignfs/ui';
import type { Env } from '../actions/env';
import { deleteItem, editItem, type ItemEdit } from '../actions/items';
import type { Mutation } from '../actions/format';
import type { ItemRow } from '../actions/rows';
import { GROCERY_ICONS, isGroceryIcon } from '../catalog/icons';
import { addQuantity, isQuantity, subtractQuantity } from '../quantity/decimal';
import { UNITS, isUnit, stepFor, type Unit } from '../quantity/units';
import { carryCategoryOnMove, copyKeysOf } from '../keys/copies';
import { type ListData, listViewOf } from '../local/listview';
import { useFormat } from '../account/AccountProvider';
import { useLocal } from '../local/react';
import styles from './ItemPanel.module.css';

type Found = Extract<ListData, { found: true }>;

const env = (): Env => ({ now: Date.now(), newId: () => crypto.randomUUID() });

/**
 * **An item**, beside its list (RFC 0005, DESIGN.md §16.7, §9.4): the content of the right column that is there while `?item=<id>` is set, and a page of
 * its own on a phone. Name, quantity (the stepper moves it by the unit's step, in exact decimals) with its unit, category, icon, note, which list of the
 * household it is on, and **Remember for next time** (on), which teaches the product the category, icon and unit.
 *
 * **There is no Save: a field is written as it is left** (a choice at once; the name and the note when focus moves on, the name also on Enter), as Tusk's
 * card is, each as one change of that field alone, so that what someone else changed in another field is not written over. Nothing offers Undo for these,
 * since each is one field a person can change back. **Delete** is a quiet action that takes the item off at once, with Undo. Everything is read from the
 * device and written to it, so every field saves with no network. Who added it and, if bought, who bought it are at the foot.
 */
export function ItemPanel({
  data,
  item,
  mobile,
  onClose,
  change,
}: {
  data: Found;
  item: ItemRow;
  /** How it is drawn, which `ItemBeside` decides: a column closed by an X at its right, or a page of its own left by a back arrow at its left (RFC 0005). */
  mobile: boolean;
  onClose: () => void;
  /** Commits a change and offers Undo: used by Delete alone. */
  change: (mutation: Mutation | null, message: string) => Promise<void>;
}) {
  const { client, keysOf } = useLocal();
  // "12 Nov 2026, 14:03", in the time zone and language the person chose.
  const { dateTime: when } = useFormat();
  const product = data.products.find((each) => each.id === item.productId);
  // What is being typed, until it is left: `null` is "what the item says".
  const [name, setName] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const panel = useRef<HTMLElement>(null);

  // Opened, focus moves into the panel; closed, it goes back to what opened it, which is the edit button for a keyboard (a tap leaves it on the page).
  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);

  // What was typed and not yet left is written when the panel goes without a blur: Escape while typing, Back (a phone's gesture), another item opened. It is
  // written against the row **as the device holds it then**, and only if the item is still there, since an edit would otherwise restore one deleted elsewhere.
  const latest = useRef({ name, note, remember, item, client });
  latest.current = { name, note, remember, item, client };
  useEffect(
    () => () => {
      const {
        name: typedName,
        note: typedNote,
        remember: learn,
        item: last,
        client: device,
      } = latest.current;
      const trimmedName = typedName?.trim() ?? '';
      if (!device || (typedName === null && typedNote === null)) return;
      void listViewOf(device.db, last.listId)
        .then(async (now) => {
          if (!now.found) return;
          const fresh = now.items.find((each) => each.id === last.id && each.deletedAt === null);
          if (!fresh) return;
          const product = now.products.find((each) => each.id === fresh.productId);
          const edit: ItemEdit = {
            ...(typedName !== null && trimmedName !== '' ? { name: trimmedName } : {}),
            ...(typedNote !== null
              ? { note: typedNote.trim() === '' ? null : typedNote.trim() }
              : {}),
          };
          const mutation = editItem(
            env(),
            fresh,
            edit,
            learn && product ? { product } : undefined,
            { product, products: now.products },
          );
          if (mutation) await device.commit(mutation);
        })
        // The device may be gone (signed out); what was typed then goes with it.
        .catch(() => undefined);
    },
    [],
  );

  /** Writes one field (or the few a choice sets), and only if it differs; the product learns from it when _Remember_ is on. */
  function save(edit: ItemEdit) {
    const catalog = { product, products: data.products };
    const learn = remember && product ? { product } : undefined;
    if (client && edit.listId !== undefined && edit.listId !== item.listId) {
      // A move to another list takes the item's category with it (§8.3, decision 17): a copy of the list it leaves is carried if the person holds that category, which needs
      // the keys of both lists, so the change is made once they are read.
      const to = edit.listId;
      void carryCategoryOnMove(client.db, copyKeysOf(keysOf), env(), { item, product, to })
        .catch(() => undefined)
        .then((carry) => {
          const mutation = editItem(env(), item, edit, learn, catalog, carry);
          if (mutation) return client.commit(mutation);
        });
      return;
    }
    const mutation = editItem(env(), item, edit, learn, catalog);
    if (mutation) void client?.commit(mutation);
  }

  const shownName = name ?? item.name;
  const commitName = () => {
    const trimmed = (name ?? item.name).trim();
    setName(null);
    // A name cannot be emptied: it goes back to what it was.
    if (trimmed !== '') save({ name: trimmed });
  };
  const nameHandlers = useCommitOnEnterOrBlur(commitName);
  const shownNote = note ?? item.note ?? '';
  const commitNote = () => {
    if (note === null) return;
    const trimmed = note.trim();
    setNote(null);
    save({ note: trimmed === '' ? null : trimmed });
  };

  const step = stepFor(item.unit, product?.defaultQuantity ?? item.quantity);
  const categories = data.categories.filter(
    (category) =>
      category.deletedAt === null && (!category.hidden || category.id === item.categoryId),
  );
  const iconNow = item.icon && isGroceryIcon(item.icon) ? item.icon : null;
  // What the row draws when the item has no icon of its own: its category's (`iconOf`), shown so that the picker never shows a blank.
  const categoryIcon = data.categories.find((each) => each.id === item.categoryId)?.icon;
  const shownIcon = iconNow ?? (categoryIcon && isGroceryIcon(categoryIcon) ? categoryIcon : null);

  function remove() {
    const mutation = deleteItem(env(), item);
    onClose();
    void change(mutation, `Deleted ${item.name}`);
  }

  const addedBy = data.names[item.addedBy];
  const boughtBy = item.boughtBy ? data.names[item.boughtBy] : undefined;

  return (
    // Escape is a shortcut to the Close button, which is the control; the panel itself takes focus when it opens, so that a key pressed in it is heard here.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside
      ref={panel}
      className={styles.panel}
      aria-label={`Item: ${item.name}`}
      tabIndex={-1}
      onKeyDown={(event) => {
        // Escape closes the panel, unless it is what closes a picker's panel that is open over it. The picker does not mark the key as handled, and where a
        // click does not focus a button (Safari) the key does not come from inside it, so an open picker is told by its button saying it is expanded: this
        // runs before the picker's own listener on the document, which is what closes it. What was typed goes with the panel, written as it goes.
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (panel.current?.querySelector('[aria-expanded="true"], [role="dialog"]')) return;
        onClose();
      }}
    >
      <header className={styles.head}>
        {mobile ? (
          <Button variant="ghost" size="sm" aria-label="Back to the list" onClick={onClose}>
            <Icon name="chevron-left" size="sm" aria-hidden />
          </Button>
        ) : null}
        <h2>Item</h2>
        {mobile ? null : (
          <Button variant="ghost" size="sm" aria-label="Close the item" onClick={onClose}>
            <Icon name="x" size="sm" aria-hidden />
          </Button>
        )}
      </header>

      <div className={styles.form}>
        <FormField label="Name">
          {(field) => (
            <Input
              {...field}
              value={shownName}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              {...nameHandlers}
            />
          )}
        </FormField>
        <div className={styles.row}>
          <FormField label="Quantity">
            {(field) => (
              <QuantityStepper
                id={field.id}
                aria-label="Quantity"
                value={Number(item.quantity)}
                step={Number(step)}
                min={0}
                onChange={(next) => {
                  // The stepper counts in numbers; the quantity is kept in exact decimals, so only its direction is taken from it.
                  const moved =
                    next > Number(item.quantity)
                      ? addQuantity(item.quantity, step)
                      : subtractQuantity(item.quantity, step);
                  if (moved !== undefined && isQuantity(moved)) save({ quantity: moved });
                }}
              />
            )}
          </FormField>
          <FormField label="Unit">
            {(field) => (
              <Select
                {...field}
                value={item.unit ?? ''}
                onChange={(event) =>
                  save({ unit: isUnit(event.target.value) ? (event.target.value as Unit) : null })
                }
              >
                <option value="">None</option>
                {UNITS.map((each) => (
                  <option key={each.key} value={each.key}>
                    {each.key}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <FormField label="Category">
          {(field) => (
            <Select
              {...field}
              value={item.categoryId ?? ''}
              onChange={(event) =>
                save({ categoryId: event.target.value === '' ? null : event.target.value })
              }
            >
              <option value="">Other</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Icon">
          {() => (
            <IconPicker
              aria-label="Icon"
              value={shownIcon}
              onChange={(icon) => save({ icon })}
              options={GROCERY_ICONS}
              // The name is in the field above: the trigger says what it does, and stays one short line on a phone.
              triggerLabel={iconNow ? 'Change icon' : 'Choose an icon'}
            />
          )}
        </FormField>
        <FormField label="Note">
          {(field) => (
            <Textarea
              {...field}
              value={shownNote}
              rows={3}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              onBlur={commitNote}
            />
          )}
        </FormField>
        {data.lists.length > 1 ? (
          <FormField label="List">
            {(field) => (
              <Select
                {...field}
                value={item.listId}
                onChange={(event) => save({ listId: event.target.value })}
              >
                {data.lists.map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : null}
        {product ? (
          <div className={styles.remember}>
            <Toggle aria-label="Remember for next time" checked={remember} onChange={setRemember} />
            <span>
              Remember for next time
              <small>The category, icon and unit are used the next time you add it.</small>
            </span>
          </div>
        ) : null}
        <p className={styles.history}>
          Added{addedBy ? ` by ${addedBy}` : ''} {when(item.addedAt)}
          {item.boughtAt !== null
            ? `. Bought${boughtBy ? ` by ${boughtBy}` : ''} ${when(item.boughtAt)}`
            : ''}
          .
        </p>
      </div>

      <footer className={styles.foot}>
        <button type="button" className={styles.delete} onClick={remove}>
          Delete
        </button>
      </footer>
    </aside>
  );
}
