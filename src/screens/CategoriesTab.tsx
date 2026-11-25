'use client';

import { useRef, useState } from 'react';
import { DndContext, type DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  Badge,
  Button,
  DragHandleRow,
  Icon,
  IconPicker,
  Input,
  useCommitOnEnterOrBlur,
} from '@sovereignfs/ui';
import {
  deleteCategory,
  hideCategory,
  makeCategory,
  setCategoryIcon,
  showCategory,
} from '../actions/categories';
import type { Env } from '../actions/env';
import type { Mutation } from '../actions/format';
import type { CategoryRow } from '../actions/rows';
import { starterCategory } from '../catalog/categories';
import { GROCERY_ICONS } from '../catalog/icons';
import { type CategoryLine, lastPosition, linesOf, nameTaken } from '../inventory/categories';
import { copyKeysOf, moveCategoryEverywhere, renameCategoryEverywhere } from '../keys/copies';
import { reorderedPosition } from '../lists/view';
import type { InventoryData } from '../local/inventory-view';
import { useLocal } from '../local/react';
import { ownerCategoriesOf } from '../local/store';
import { VERTICAL_AUTOSCROLL, spokenDrag, useDragClickGuard, useReorderSensors } from '../ui/dnd';
import styles from './CategoriesTab.module.css';
import { useUndo } from './Undo';

const env = (): Env => ({ now: Date.now(), newId: () => crypto.randomUUID() });

/**
 * **The Categories tab of Inventory** (DESIGN.md §16.8, §8.3): the aisle order as a list to drag (a handle at the left, and by the keyboard Space lifts a row, the arrows move it
 * and Space puts it down, said aloud by name and place), each with its icon, a name that is **written as it is left**, **Hide** (or **Show**; _Other_ is never hidden) and, for a
 * category of the person's own, **Delete** with Undo; _Add category_ at the end. A starter category is renamed, hidden and moved and never deleted, and a name emptied is the
 * usual one again. A rename also renames the category's copies on the lists the person is Admin of, and a drop moves the copies on their own lists (`renameCategoryEverywhere`,
 * `moveCategoryEverywhere`, the same functions the tests call).
 *
 * **Everything goes through one line of writes,** each from the row as the device holds it when its turn comes, so that a name left as Delete is pressed is written before the delete
 * and cannot land after it and make the row again.
 */
export function CategoriesTab({ data }: { data: InventoryData }) {
  const { client, keysOf } = useLocal();
  const offerUndo = useUndo();
  const lines = linesOf(data.categories, data.entries);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState('');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const sensors = useReorderSensors();
  const guard = useDragClickGuard();

  const copyKeys = copyKeysOf(keysOf);

  /** A task, run when every one before it has ended: one that fails is said, and never stops the ones after it. */
  function enqueue(task: () => Promise<void>) {
    queue.current = queue.current
      .then(task)
      .catch(() => setProblem('Could not save that. Try again.'));
  }

  /** The rows of the group as the device holds them now, for the task whose turn it is. */
  const rowsNow = async () =>
    client ? await client.read((db) => ownerCategoriesOf(db, data.household)) : [];

  function change(id: string, make: (row: CategoryRow) => Mutation | null) {
    enqueue(async () => {
      const row = (await rowsNow()).find((each) => each.id === id);
      const mutation = row ? make(row) : null;
      if (mutation && client) await client.commit(mutation);
    });
  }

  const rename = (id: string, typed: string | null) =>
    enqueue(async () => {
      if (!client) return;
      const row = (await rowsNow()).find((each) => each.id === id);
      if (!row) return;
      await renameCategoryEverywhere(client.db, copyKeys, env(), row, typed, (mutation) =>
        client.commit(mutation),
      );
    });

  function drop(event: DragEndEvent) {
    guard.end();
    const { active, over } = event;
    if (!over || active.id === over.id || !client) return;
    const position = reorderedPosition(
      lines.map((line) => line.category),
      String(active.id),
      String(over.id),
    );
    if (position === null) return;
    const id = String(active.id);
    enqueue(async () => {
      const row = (await rowsNow()).find((each) => each.id === id);
      if (!row) return;
      await moveCategoryEverywhere(client.db, copyKeys, env(), row, position, (mutation) =>
        client.commit(mutation),
      );
    });
  }

  function remove(line: CategoryLine) {
    enqueue(async () => {
      if (!client) return;
      const row = (await rowsNow()).find((each) => each.id === line.category.id);
      const mutation = row ? deleteCategory(env(), row) : null;
      if (!mutation) return;
      const undo = await client.commit(mutation);
      offerUndo(`Deleted the category ${line.category.name}`, () => {
        if (undo) return void client.commit(undo);
      });
    });
  }

  function add() {
    const typed = name.trim();
    if (typed === '') return;
    if (nameTaken(data.categories, typed)) {
      setProblem('You have a category with that name already.');
      return;
    }
    setProblem(null);
    setName('');
    enqueue(async () => {
      if (!client) return;
      const rows = await rowsNow();
      // Asked again at its turn: the same name twice in one instant is one category.
      if (nameTaken(rows, typed)) return;
      await client.commit(
        makeCategory(env(), { householdId: data.household, name: typed, last: lastPosition(rows) }),
      );
    });
  }

  const spoken = spokenDrag((id) => {
    const at = lines.findIndex((line) => line.category.id === id);
    const line = lines[at];
    return line
      ? { noun: 'category', name: line.category.name, position: at + 1, total: lines.length }
      : undefined;
  });

  return (
    <section className={styles.tab} aria-label="Categories">
      <p className={styles.lede}>
        The order of the aisles: lists and shopping mode group what you add in this order. Drag a
        category to move it; a category of your own also moves where it is on your lists.
      </p>
      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
      <DndContext
        accessibility={spoken}
        id="inventory-categories"
        sensors={sensors}
        autoScroll={VERTICAL_AUTOSCROLL}
        collisionDetection={closestCenter}
        onDragStart={guard.begin}
        onDragEnd={drop}
        onDragCancel={guard.end}
      >
        <SortableContext
          items={lines.map((line) => line.category.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className={styles.lines}>
            {lines.map((line) => (
              <SortableLine
                key={line.category.id}
                line={line}
                onRename={(typed) => {
                  if (typed !== null && nameTaken(data.categories, typed, line.category.id)) {
                    setProblem('You have a category with that name already.');
                    return;
                  }
                  setProblem(null);
                  rename(line.category.id, typed);
                }}
                onIcon={(icon) =>
                  change(line.category.id, (row) => setCategoryIcon(env(), row, icon))
                }
                onToggle={() =>
                  change(line.category.id, (row) =>
                    row.hidden ? showCategory(env(), row) : hideCategory(env(), row),
                  )
                }
                onDelete={() => remove(line)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <form
        className={styles.add}
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          aria-label="New category"
          placeholder="New category"
          value={name}
          maxLength={100}
          onChange={(event) => {
            setName(event.target.value);
            setProblem(null);
          }}
        />
        <Button type="submit" size="sm" disabled={name.trim() === ''}>
          <Icon name="plus" size="sm" aria-hidden />
          <span className={styles.label}>Add category</span>
        </Button>
      </form>
    </section>
  );
}

function SortableLine({
  line,
  onRename,
  onIcon,
  onToggle,
  onDelete,
}: {
  line: CategoryLine;
  /** A name left: `null` for a starter category's usual name again. */
  onRename: (name: string | null) => void;
  onIcon: (icon: string) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { category } = line;
  const sortable = useSortable({ id: category.id });
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const typed = draft.trim();
    setDraft(null);
    // Emptied: a starter category has its usual name again; one of the person's own keeps the name it has. Left as it was: a category of their own still asks after its copies, which
    // is how a rename made while the keys were locked reaches them once they are not; nothing is written for what is the same.
    if (typed === '') return category.starterKey === null ? undefined : onRename(null);
    if (typed === category.name && category.starterKey !== null) return;
    onRename(typed);
  };
  const handlers = useCommitOnEnterOrBlur(commit);
  const style = {
    transform: sortable.transform
      ? `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`
      : undefined,
    transition: sortable.transition,
  };
  const usual = category.starterKey === null ? undefined : starterCategory(category.starterKey);
  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className={sortable.isDragging ? styles.dragging : undefined}
    >
      <DragHandleRow
        handleProps={{
          ...sortable.attributes,
          ...sortable.listeners,
          'aria-label': `Move ${category.name}`,
        }}
        isDragging={sortable.isDragging}
        className={styles.handleRow}
      >
        <div className={`${styles.line} ${category.hidden ? styles.hidden : ''}`}>
          {/* Before the name: the icon is what the name is of. The design system's panel opens on the side with room, rightwards from here. */}
          <IconPicker
            className={styles.picker}
            aria-label={`Icon of ${category.name}`}
            value={line.icon}
            onChange={onIcon}
            options={GROCERY_ICONS}
          />
          <Input
            aria-label={`Name of ${category.name}`}
            className={styles.name}
            value={draft ?? category.name}
            maxLength={100}
            onChange={(event) => setDraft(event.target.value)}
            {...handlers}
          />
          <span className={styles.count}>
            {line.count === 1 ? '1 item' : `${line.count} items`}
          </span>
          {/* Two places, always: Hide (or Show) in the first and Delete in the second, so that the name is as wide in every row, one with neither (Other) too. */}
          <span className={styles.actions}>
            {line.canHide ? (
              <Button
                className={styles.hide}
                variant="ghost"
                size="sm"
                aria-label={`${category.hidden ? 'Show' : 'Hide'} ${category.name}`}
                onClick={onToggle}
              >
                <Icon name={category.hidden ? 'eye' : 'eye-off'} size="sm" aria-hidden />
              </Button>
            ) : null}
            {line.canDelete ? (
              <Button
                className={styles.delete}
                variant="ghost"
                size="sm"
                aria-label={`Delete ${category.name}`}
                onClick={onDelete}
              >
                <Icon name="trash-2" size="sm" aria-hidden />
              </Button>
            ) : null}
          </span>
          {/* What a row has only sometimes goes under the name, a line of its own, so that it never takes width from the name. */}
          {category.hidden || (line.renamed && usual) ? (
            <span className={styles.notes}>
              {category.hidden ? (
                <Badge size="xs" uppercase={false}>
                  Hidden
                </Badge>
              ) : null}
              {line.renamed && usual ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Use the usual name for ${category.name}`}
                  onClick={() => onRename(null)}
                >
                  Usual name
                </Button>
              ) : null}
            </span>
          ) : null}
        </div>
      </DragHandleRow>
    </li>
  );
}
