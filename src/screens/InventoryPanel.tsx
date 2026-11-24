'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  FormField,
  Icon,
  IconPicker,
  Input,
  Select,
  Textarea,
  Toggle,
  useCommitOnEnterOrBlur,
} from '@sovereignfs/ui';
import type { Env } from '../actions/env';
import {
  type InventoryFields,
  changeInventoryItem,
  deleteInventoryItem,
  makeInventoryItem,
  overrideStarterEntry,
  restoreInventoryItem,
} from '../actions/inventory';
import type { InventoryRow } from '../actions/rows';
import { GROCERY_ICONS, isGroceryIcon } from '../catalog/icons';
import { type InventoryEntry, entryNamed, layerInventory } from '../catalog/inventory';
import { categoryOfEntry } from '../inventory/screen';
import { type InventoryData } from '../local/inventory-view';
import { useLocal } from '../local/react';
import { inventoryOf } from '../local/store';
import { isQuantity } from '../quantity/decimal';
import { UNITS, isUnit, type Unit } from '../quantity/units';
import styles from './InventoryPanel.module.css';
import { useUndo } from './Undo';

const env = (): Env => ({ now: Date.now(), newId: () => crypto.randomUUID() });

/** The row of an Inventory entry: the starter entry's override by its key, or the item of their own by its id; none for a starter entry that has not been changed. */
const rowOfEntry = (
  rows: readonly InventoryRow[],
  entry: InventoryEntry,
): InventoryRow | undefined =>
  entry.starterKey !== null
    ? rows.find((row) => row.starterKey === entry.starterKey && row.deletedAt === null)
    : rows.find((row) => row.id === entry.id && row.deletedAt === null);

/**
 * **An Inventory entry beside the screen** (DESIGN.md §16.8): its name, category, icon, unit, quantity, note, whether it is recurring or once, hide or restore, and delete (or, for a
 * starter entry, take back what was changed). **Nothing has a Save: a field is written as it is left**, as an item's is (§16.7), each as one change of that field. A starter entry
 * the person has not changed has no row, and the first change makes its override; **writes are made one after another, each from the row as the device holds it when its
 * turn comes**, so that two quick changes to an untouched entry (recurring, then hide) are one row and not two, whose fold would keep the first only.
 */
export function InventoryPanel({
  data,
  entry,
  mobile,
  onClose,
}: {
  data: InventoryData;
  entry: InventoryEntry;
  /** Drawn as a page in place of the screen (a back arrow at its left), or as a column (a close button at its right). */
  mobile: boolean;
  onClose: () => void;
}) {
  const { client } = useLocal();
  const offerUndo = useUndo();
  const [name, setName] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);

  /** One change to this entry, made when its turn comes, from the row as the device holds it then. */
  function write(fields: InventoryFields & { name?: string | null }) {
    if (!client) return;
    queue.current = queue.current
      .then(async () => {
        const rows = await client.read(inventoryOf);
        const row = rowOfEntry(rows, entry);
        const mutation = row
          ? changeInventoryItem(env(), row, fields)
          : entry.starterKey !== null
            ? overrideStarterEntry(env(), {
                householdId: data.household,
                starterKey: entry.starterKey,
                ...(typeof fields.name === 'string' ? { name: fields.name } : {}),
                ...Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'name')),
              })
            : null;
        if (mutation) await client.commit(mutation);
      })
      .catch(() => undefined);
  }

  /** Whether another entry of Inventory has the name already, which the server would refuse: said here, and nothing written. */
  async function taken(next: string): Promise<boolean> {
    if (!client) return false;
    const found = entryNamed(layerInventory(await client.read(inventoryOf)), next);
    return found !== undefined && found.key !== entry.key;
  }

  const commitName = () => {
    const typed = (name ?? entry.name).trim();
    setName(null);
    if (typed === '' || typed === entry.name) {
      setProblem(null);
      return;
    }
    void taken(typed).then((already) => {
      setProblem(already ? 'Inventory has that name already.' : null);
      if (!already) write({ name: typed });
    });
  };
  const nameHandlers = useCommitOnEnterOrBlur(commitName);
  const commitNote = () => {
    if (note === null) return;
    const trimmed = note.trim();
    setNote(null);
    write({ note: trimmed === '' ? null : trimmed });
  };
  const commitQuantity = () => {
    if (quantity === null) return;
    const trimmed = quantity.trim();
    setQuantity(null);
    if (trimmed === '') return write({ quantity: null });
    if (isQuantity(trimmed)) {
      setProblem(null);
      write({ quantity: trimmed });
    } else setProblem('That is not a quantity.');
  };

  const shownCategory = categoryOfEntry(entry, data.categories);
  const categoryIcon = shownCategory?.icon;
  const iconNow = entry.icon && isGroceryIcon(entry.icon) ? entry.icon : null;
  const shownIcon = iconNow ?? (categoryIcon && isGroceryIcon(categoryIcon) ? categoryIcon : null);
  const categories = data.categories.filter(
    (category) => !category.hidden || category.id === entry.categoryId,
  );

  async function remove() {
    if (!client) return;
    const rows = await client.read(inventoryOf);
    const row = rowOfEntry(rows, entry);
    const mutation = row ? deleteInventoryItem(env(), row) : null;
    if (!mutation) return;
    const undo = await client.commit(mutation);
    onClose();
    offerUndo(entry.mine ? `Deleted ${entry.name}` : `Took back changes to ${entry.name}`, () => {
      if (undo) return void client.commit(undo);
    });
  }

  function restore() {
    if (!client) return;
    queue.current = queue.current.then(async () => {
      const rows = await client.read(inventoryOf);
      const row = rowOfEntry(rows, entry);
      const mutation = row ? restoreInventoryItem(env(), row) : null;
      if (mutation) await client.commit(mutation);
    });
  }

  return (
    // Escape is a shortcut to the Close button, which is the control; the panel takes focus when it opens, so that a key pressed in it is heard here.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside
      ref={panel}
      className={styles.panel}
      aria-label={`Inventory: ${entry.name}`}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (panel.current?.querySelector('[aria-expanded="true"], [role="dialog"]')) return;
        onClose();
      }}
    >
      <header className={styles.head}>
        {mobile ? (
          <Button variant="ghost" size="sm" aria-label="Back to Inventory" onClick={onClose}>
            <Icon name="chevron-left" size="sm" aria-hidden />
          </Button>
        ) : null}
        <h2>Inventory</h2>
        {mobile ? null : (
          <Button variant="ghost" size="sm" aria-label="Close the entry" onClick={onClose}>
            <Icon name="x" size="sm" aria-hidden />
          </Button>
        )}
      </header>

      <div className={styles.form}>
        <FormField label="Name">
          {(field) => (
            <Input
              {...field}
              value={name ?? entry.name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              {...nameHandlers}
            />
          )}
        </FormField>
        {problem ? (
          <p className={styles.problem} role="alert">
            {problem}
          </p>
        ) : null}
        <FormField label="Category">
          {(field) => (
            <Select
              {...field}
              value={entry.categoryId ?? ''}
              onChange={(event) =>
                write({ categoryId: event.target.value === '' ? null : event.target.value })
              }
            >
              <option value="">{entry.mine ? 'Other' : 'As the starter has it'}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <div className={styles.row}>
          <FormField label="Quantity">
            {(field) => (
              <Input
                {...field}
                value={quantity ?? entry.quantity ?? ''}
                inputMode="decimal"
                onChange={(event) => setQuantity(event.target.value)}
                onBlur={commitQuantity}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitQuantity();
                }}
              />
            )}
          </FormField>
          <FormField label="Unit">
            {(field) => (
              <Select
                {...field}
                value={entry.unit ?? ''}
                onChange={(event) =>
                  write({ unit: isUnit(event.target.value) ? (event.target.value as Unit) : null })
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
        <FormField label="Icon">
          {() => (
            <IconPicker
              aria-label="Icon"
              value={shownIcon}
              onChange={(icon) => write({ icon })}
              options={GROCERY_ICONS}
              triggerLabel={iconNow ? 'Change icon' : 'Choose an icon'}
            />
          )}
        </FormField>
        <FormField label="Note">
          {(field) => (
            <Textarea
              {...field}
              value={note ?? entry.note ?? ''}
              rows={3}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              onBlur={commitNote}
            />
          )}
        </FormField>
        <div className={styles.toggle}>
          <Toggle
            aria-label="Recurring"
            checked={entry.recurring}
            onChange={(recurring) => write({ recurring })}
          />
          <span>
            Recurring
            <small>
              Something you buy again and again, not once. It is offered first when it is not on a
              list.
            </small>
          </span>
        </div>
        <div className={styles.actions}>
          {entry.hidden ? (
            <Button variant="secondary" size="sm" onClick={restore}>
              Show again
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => write({ hidden: true })}>
              Hide
            </Button>
          )}
          {rowOfEntry(data.rows, entry) ? (
            <button type="button" className={styles.delete} onClick={() => void remove()}>
              {entry.mine ? 'Delete' : 'Take back my changes'}
            </button>
          ) : null}
        </div>
        {entry.hidden ? (
          <p className={styles.note}>
            Hidden: it is not offered when you add, until you show it again.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * **A new item of Inventory** (_+ Add item_, §16.8), in the same column: a name, and Add. A name Inventory has already opens that entry instead of making a second (the
 * server would fold the two, and a rename onto a name is refused); a new one is made, marked once, and opened to be filled in.
 */
export function NewEntryPanel({
  data,
  mobile,
  onClose,
  onOpen,
}: {
  data: InventoryData;
  mobile: boolean;
  onClose: () => void;
  onOpen: (key: string) => void;
}) {
  const { client } = useLocal();
  const [name, setName] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    field.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);

  async function add() {
    const typed = name.trim();
    if (typed === '' || !client) return;
    const had = entryNamed(data.entries, typed);
    if (had) {
      setSaid(`Inventory has ${had.name} already.`);
      onOpen(had.key);
      return;
    }
    const mutation = makeInventoryItem(env(), { householdId: data.household, name: typed });
    await client.commit(mutation);
    onOpen(`own:${mutation.changes[0]?.id ?? ''}`);
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside
      ref={panel}
      className={styles.panel}
      aria-label="New item of Inventory"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) onClose();
      }}
    >
      <header className={styles.head}>
        {mobile ? (
          <Button variant="ghost" size="sm" aria-label="Back to Inventory" onClick={onClose}>
            <Icon name="chevron-left" size="sm" aria-hidden />
          </Button>
        ) : null}
        <h2>New item</h2>
        {mobile ? null : (
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <Icon name="x" size="sm" aria-hidden />
          </Button>
        )}
      </header>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <FormField label="Name">
          {(props) => (
            <Input
              {...props}
              ref={field}
              value={name}
              maxLength={200}
              onChange={(event) => {
                setName(event.target.value);
                setSaid(null);
              }}
            />
          )}
        </FormField>
        {said ? (
          <p className={styles.note} role="status">
            {said}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button type="submit" size="sm" disabled={name.trim() === ''}>
            Add item
          </Button>
        </div>
      </form>
    </aside>
  );
}
