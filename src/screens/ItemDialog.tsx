'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  FormField,
  IconPicker,
  Input,
  QuantityStepper,
  Select,
  Textarea,
  Toggle,
} from '@sovereignfs/ui';
import type { Env } from '../actions/env';
import { deleteItem, editItem, type ItemEdit } from '../actions/items';
import type { Mutation } from '../actions/format';
import type { ItemRow } from '../actions/rows';
import { GROCERY_ICONS, isGroceryIcon } from '../catalog/icons';
import { addQuantity, isQuantity, subtractQuantity } from '../quantity/decimal';
import { UNITS, isUnit, stepFor, type Unit } from '../quantity/units';
import type { ListData } from '../local/listview';
import styles from './ItemDialog.module.css';

type Found = Extract<ListData, { found: true }>;

const env = (): Env => ({ now: Date.now(), newId: () => crypto.randomUUID() });

/** The shorter the better in a sentence: "12 Nov 2026, 14:03". */
const when = (at: number): string =>
  new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * **An item** (DESIGN.md §16.7, §9.4): a dialog at `?item=<id>` — full-screen on a phone, as the design system adapts it. Name, quantity (the stepper
 * moves it by the unit's step, in exact decimals) with its unit, category, icon, note, which list of the household it is on, and **Remember for next time**
 * (on), which teaches the product the category, icon and unit. **Save** sends only the fields that differ; **Delete** is a quiet action that takes it off
 * at once with Undo. Everything is read from the device and written to it, so every field saves with no network. Who added it and, if bought, who bought
 * it are at the foot.
 */
export function ItemDialog({
  data,
  item,
  onClose,
  change,
}: {
  data: Found;
  item: ItemRow;
  onClose: () => void;
  change: (mutation: Mutation | null, message: string) => Promise<void>;
}) {
  const product = data.products.find((each) => each.id === item.productId);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [unit, setUnit] = useState<Unit | null>(item.unit);
  const [categoryId, setCategoryId] = useState(item.categoryId ?? '');
  const [icon, setIcon] = useState(item.icon);
  const [note, setNote] = useState(item.note ?? '');
  const [listId, setListId] = useState(item.listId);
  const [remember, setRemember] = useState(true);

  const step = stepFor(unit, product?.defaultQuantity ?? item.quantity);
  const categories = data.categories.filter(
    (category) =>
      category.deletedAt === null && (!category.hidden || category.id === item.categoryId),
  );
  const iconNow = icon && isGroceryIcon(icon) ? icon : null;
  const nameOk = name.trim() !== '';

  function save() {
    if (!nameOk) return;
    const trimmed = note.trim();
    const edit: ItemEdit = {
      name: name.trim(),
      quantity,
      unit,
      categoryId: categoryId === '' ? null : categoryId,
      icon,
      note: trimmed === '' ? null : trimmed,
      listId,
    };
    const mutation = editItem(env(), item, edit, remember && product ? { product } : undefined);
    onClose();
    void change(mutation, `Saved ${name.trim()}`);
  }

  function remove() {
    const mutation = deleteItem(env(), item);
    onClose();
    void change(mutation, `Deleted ${item.name}`);
  }

  const addedBy = data.names[item.addedBy];
  const boughtBy = item.boughtBy ? data.names[item.boughtBy] : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title="Item"
      aria-label={`Item: ${item.name}`}
      footer={
        <div className={styles.footer}>
          <button type="button" className={styles.delete} onClick={remove}>
            Delete
          </button>
          <span className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!nameOk}>
              Save
            </Button>
          </span>
        </div>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <FormField label="Name">
          {(field) => (
            <Input
              {...field}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>
        <div className={styles.row}>
          <FormField label="Quantity">
            {(field) => (
              <QuantityStepper
                id={field.id}
                aria-label="Quantity"
                value={Number(quantity)}
                step={Number(step)}
                min={0}
                onChange={(next) => {
                  // The stepper counts in numbers; the quantity is kept in exact decimals, so only its direction is taken from it.
                  const moved =
                    next > Number(quantity)
                      ? addQuantity(quantity, step)
                      : subtractQuantity(quantity, step);
                  if (moved !== undefined && isQuantity(moved)) setQuantity(moved);
                }}
              />
            )}
          </FormField>
          <FormField label="Unit">
            {(field) => (
              <Select
                {...field}
                value={unit ?? ''}
                onChange={(e) => setUnit(isUnit(e.target.value) ? e.target.value : null)}
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
            <Select {...field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
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
              value={iconNow}
              onChange={setIcon}
              options={GROCERY_ICONS}
              triggerLabel={name.trim() || item.name}
            />
          )}
        </FormField>
        <FormField label="Note">
          {(field) => (
            <Textarea
              {...field}
              value={note}
              rows={3}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </FormField>
        {data.lists.length > 1 ? (
          <FormField label="List">
            {(field) => (
              <Select {...field} value={listId} onChange={(e) => setListId(e.target.value)}>
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
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
