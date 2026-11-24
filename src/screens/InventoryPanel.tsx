'use client';

import Link from 'next/link';
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
} from '../actions/inventory';
import type { InventoryRow } from '../actions/rows';
import { GROCERY_ICONS, isGroceryIcon } from '../catalog/icons';
import { type InventoryEntry, entryNamed, layerInventory } from '../catalog/inventory';
import { categoryOfEntry } from '../inventory/screen';
import { categoryOnList } from '../keys/copies';
import { planAddFromInventory } from '../lists/adding';
import { listViewOf } from '../local/listview';
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
  const { client, keysOf } = useLocal();
  const offerUndo = useUndo();
  const [name, setName] = useState<string | null>(null);
  const [target, setTarget] = useState<string>('');
  const [added, setAdded] = useState<{ list: string; message: string } | null>(null);
  const [addProblem, setAddProblem] = useState<string | null>(null);
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

  /** A task, run when every one before it has ended: a task that fails is the person's to see on the next read, and never stops the ones after it. */
  function enqueue(task: () => Promise<void>) {
    queue.current = queue.current.then(task).catch(() => undefined);
  }

  /** The values a change gives, for an entry of the starter that has no row yet: what is cleared (`null`) is what the starter already has, so it makes nothing. */
  const given = (fields: InventoryFields): InventoryFields =>
    Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null));

  /** One change to this entry, from the row as the device holds it now. A starter entry's first change makes its override. */
  async function apply(fields: InventoryFields & { name?: string | null }) {
    if (!client) return;
    const row = rowOfEntry(await client.read(inventoryOf), entry);
    let mutation = null;
    if (row) mutation = changeInventoryItem(env(), row, fields);
    else if (entry.starterKey !== null) {
      const { name: renamed, ...rest } = fields;
      const wanted = given(rest);
      if (typeof renamed === 'string' || Object.keys(wanted).length > 0)
        mutation = overrideStarterEntry(env(), {
          householdId: data.household,
          starterKey: entry.starterKey,
          ...(typeof renamed === 'string' ? { name: renamed } : {}),
          ...wanted,
        });
    }
    if (mutation) await client.commit(mutation);
  }

  /** One change to this entry, made when its turn comes: **a delete is in the same line**, so that a field written as it was left cannot land after it and make the row again. */
  const write = (fields: InventoryFields & { name?: string | null }) =>
    enqueue(() => apply(fields));

  /** Whether another entry of Inventory has the name already, which the server would refuse: said, and nothing written. Read in the line too, from the device as it is then. */
  const rename = (typed: string) =>
    enqueue(async () => {
      if (!client) return;
      const found = entryNamed(layerInventory(await client.read(inventoryOf)), typed);
      const already = found !== undefined && found.key !== entry.key;
      setProblem(already ? 'Inventory has that name already.' : null);
      if (!already) await apply({ name: typed });
    });

  const commitName = () => {
    const typed = (name ?? entry.name).trim();
    setName(null);
    if (typed === '' || typed === entry.name) {
      setProblem(null);
      return;
    }
    rename(typed);
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

  /** The list _Add to a list_ adds to: the one chosen, if it is still there, else the list used last, else the first. */
  const chosen = data.lists.some((each) => each.id === target)
    ? target
    : (data.landing ?? data.lists[0]?.id ?? '');

  /**
   * **Add to a list** (§16.8): this item added to the list chosen, with its category as it is on that list (`categoryOnList`: a copy of one of the person's own is made there, in the
   * same change) and its icon, unit and quantity; one more of it when the list has it open. **In the line of writes, and read when its turn comes:** a name or a quantity left as
   * Add is pressed is written first, and it is that item, from the device, that is added, never the one this panel was drawn with.
   */
  function addToList() {
    if (!client || chosen === '') return;
    setAdded(null);
    enqueue(async () => {
      try {
        const now = layerInventory(await client.read(inventoryOf)).find(
          (each) => each.key === entry.key,
        );
        const view = await listViewOf(client.db, chosen);
        if (!now) return setAddProblem('That item is not in Inventory any more.');
        // A list whose people the device has not heard of yet cannot be added to: who adds is one of them.
        if (!view.found || !view.me)
          return setAddProblem('That list is not ready on this device yet.');
        const category = await categoryOnList(
          client.db,
          {
            encrypted: async (household) => (await keysOf(household)).encrypted,
            ringOf: async (household, list) => (await keysOf(household, list)).ring,
          },
          env(),
          { entry: now, list: view.list },
        );
        const planned = planAddFromInventory(
          env(),
          {
            list: view.list,
            products: view.products,
            items: view.items,
            categories: view.categories,
            me: view.me,
          },
          now,
          category,
        );
        if (!planned) return setAddProblem('That item has no name to add.');
        if ('refused' in planned) return setAddProblem(planned.refused);
        setAddProblem(null);
        const undo = await client.commit(planned.mutation);
        const message = `${planned.message} to ${view.list.name}`;
        setAdded({ list: view.list.id, message });
        offerUndo(message, () => {
          if (undo) return void client.commit(undo);
        });
      } catch {
        // What the device could not write is said, not swallowed: the line of writes goes on.
        setAddProblem('Could not add it. Try again.');
      }
    });
  }

  const shownCategory = categoryOfEntry(entry, data.categories);
  const categoryIcon = shownCategory?.icon;
  const iconNow = entry.icon && isGroceryIcon(entry.icon) ? entry.icon : null;
  const shownIcon = iconNow ?? (categoryIcon && isGroceryIcon(categoryIcon) ? categoryIcon : null);
  const categories = data.categories.filter(
    (category) => !category.hidden || category.id === entry.categoryId,
  );

  /** Deletes an item of their own, or takes back what was changed of a starter entry, with Undo. In the line of writes, after whatever was written as it was left. */
  const remove = () =>
    enqueue(async () => {
      if (!client) return;
      const row = rowOfEntry(await client.read(inventoryOf), entry);
      const mutation = row ? deleteInventoryItem(env(), row) : null;
      if (!mutation) return;
      const undo = await client.commit(mutation);
      onClose();
      offerUndo(entry.mine ? `Deleted ${entry.name}` : `Took back changes to ${entry.name}`, () => {
        if (undo) return void client.commit(undo);
      });
    });

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
                <option value="">{entry.mine ? 'None' : 'As the starter has it'}</option>
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
        <section className={styles.add} aria-label="Add to a list">
          <h3>Add to a list</h3>
          {data.lists.length === 0 ? (
            <p className={styles.note}>You have no list to add to yet.</p>
          ) : (
            <>
              <FormField label="List">
                {(field) => (
                  <Select
                    {...field}
                    value={chosen}
                    onChange={(event) => {
                      setTarget(event.target.value);
                      setAdded(null);
                      setAddProblem(null);
                    }}
                  >
                    {data.lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.by ? `${list.name} (shared by ${list.by})` : list.name}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <div className={styles.actions}>
                <Button variant="secondary" size="sm" onClick={addToList}>
                  Add to list
                </Button>
                {addProblem ? (
                  <span className={styles.problem} role="alert">
                    {addProblem}
                  </span>
                ) : null}
                {added ? (
                  <span className={styles.added} role="status">
                    {added.message} · <Link href={`/l/${added.list}`}>Open list</Link>
                  </span>
                ) : null}
              </div>
            </>
          )}
        </section>
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
            <Button variant="secondary" size="sm" onClick={() => write({ hidden: false })}>
              Show again
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => write({ hidden: true })}>
              Hide
            </Button>
          )}
          {rowOfEntry(data.rows, entry) ? (
            <button type="button" className={styles.delete} onClick={remove}>
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
