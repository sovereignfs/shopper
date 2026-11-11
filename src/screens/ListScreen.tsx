'use client';

import { DndContext, type DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Button,
  CheckableListRow,
  DragHandleRow,
  EmptyState,
  Icon,
  type IconName,
  Menu,
  ResponsiveSurface,
  useLongPress,
} from '@sovereignfs/ui';
import type { Env } from '../actions/env';
import { clearBought, tickItem, untickItem } from '../actions/items';
import type { Mutation } from '../actions/format';
import type { ItemRow } from '../actions/rows';
import { isGroceryIcon } from '../catalog/icons';
import { type Suggestion, suggest } from '../catalog/suggest';
import { planAdd } from '../lists/adding';
import { type ListData, listViewOf, rememberList } from '../local/listview';
import { useLocal, useLocalQuery } from '../local/react';
import {
  type Group,
  boughtItems,
  firstLine,
  groupByAisle,
  inOrderAdded,
  openItems,
  quantityLabel,
  reorderedPosition,
} from '../lists/view';
import { VERTICAL_AUTOSCROLL, spokenDrag, useDragClickGuard, useReorderSensors } from '../ui/dnd';
import styles from './ListScreen.module.css';
import { useMobileNav } from '../ui/mobile-nav';
import { AddField } from './AddField';
import { EditedItem, useItemParam } from './ItemEditor';
import { shopEntry } from './shop-entry';
import { useUndo } from './Undo';

/**
 * A list, from the device (DESIGN.md §16.5): its name and a menu, the open items **by aisle** (or in the order added), each a row that ticks as a whole,
 * and **Bought** beneath, collapsed, with _Clear bought_. Everything is read from the device and written to it, so it works with no network and a change
 * shows at once; ticking, unticking and clearing offer Undo for five seconds. The add field (8.3), the item's own dialog (8.4), Shop and Share (7.3, 8.7) are
 * not here yet, and an entry is here only when its page is.
 *
 */
type View = 'aisle' | 'added';
const VIEW_KEY = 'shopper:list-view';

const env = (): Env => ({ now: Date.now(), newId: () => crypto.randomUUID() });

/** How the list is ordered: the address's `?view=added`, else what this device chose last, else by aisle. A choice is a thing about this screen and is kept here. */
function useView(): [View, (view: View) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [stored, setStored] = useState<View | null>(() => {
    try {
      const value = window.localStorage.getItem(VIEW_KEY);
      return value === 'added' || value === 'aisle' ? value : null;
    } catch {
      return null;
    }
  });
  const param = params.get('view');
  const view: View =
    param === 'added' ? 'added' : param === 'aisle' ? 'aisle' : (stored ?? 'aisle');
  return [
    view,
    (next) => {
      setStored(next);
      try {
        window.localStorage.setItem(VIEW_KEY, next);
      } catch {
        // A private window: the choice lasts for this page.
      }
      router.replace(next === 'added' ? `${pathname}?view=added` : pathname);
    },
  ];
}

export function ListScreen({ id }: { id: string }) {
  const { client } = useLocal();
  const found = useLocalQuery((db) => listViewOf(db, id), [id]);
  const data = found.data;
  const listFound = data?.found === true;
  useEffect(() => {
    if (client && listFound) void rememberList(client.db, id);
  }, [client, listFound, id]);

  if (!data) return <div className={styles.page} aria-busy="true" />;
  if (!data.found)
    return data.synced ? (
      <EmptyState
        icon="list-todo"
        heading="That list is not here"
        description="It may have been deleted, or it is not one of yours."
        action={<Link href="/">Back to your lists</Link>}
      />
    ) : (
      <div className={styles.page} aria-busy="true" />
    );
  return <Loaded data={data} />;
}

type Found = Extract<ListData, { found: true }>;

function Loaded({ data }: { data: Found }) {
  const { client } = useLocal();
  const offerUndo = useUndo();
  const [view, setView] = useView();
  const editing = useItemParam();
  const { list, items, categories, me } = data;
  const open = openItems(items);
  const bought = boughtItems(items);

  /** Commits a change and offers to take it back; a change that would change nothing is none. */
  async function change(mutation: Mutation | null, message: string) {
    if (!mutation || !client) return;
    const undo = await client.commit(mutation);
    if (undo) offerUndo(message, async () => void (await client.commit(undo)));
  }
  const tick = (item: ItemRow) => me && change(tickItem(env(), item, me), `Ticked ${item.name}`);
  const untick = (item: ItemRow) => change(untickItem(env(), item), `Unticked ${item.name}`);
  const clear = () =>
    change(
      clearBought(env(), bought),
      `Cleared ${bought.length} bought ${bought.length === 1 ? 'item' : 'items'}`,
    );

  return (
    <div className={styles.page}>
      <Header
        name={list.name}
        id={list.id}
        householdId={list.householdId}
        shop={list.archivedAt === null}
        view={view}
        setView={setView}
        canClear={bought.length > 0}
        clear={() => void clear()}
      />
      {list.archivedAt !== null ? (
        <p className={styles.note}>
          This list is archived.{' '}
          <Link href={`/l/${list.id}/settings`}>Restore it in its settings</Link> to use it again.
        </p>
      ) : null}
      {list.archivedAt === null ? <AddField data={data} change={change} /> : null}
      {editing.id !== null ? (
        <EditedItem id={editing.id} data={data} close={editing.close} change={change} />
      ) : null}
      {open.length === 0 && bought.length === 0 ? (
        <Empty data={data} change={change} />
      ) : (
        <>
          {open.length === 0 ? (
            <p className={styles.note}>Everything on {list.name} is ticked.</p>
          ) : null}
          {view === 'aisle' ? (
            <ByAisle groups={groupByAisle(open, categories)} data={data} onTick={tick} />
          ) : (
            <ul className={styles.items} aria-label="Items in the order added">
              {inOrderAdded(open).map((item) => (
                <li key={item.id}>
                  <Row item={item} data={data} checked={false} onToggle={() => void tick(item)} />
                </li>
              ))}
            </ul>
          )}
          <Bought items={bought} data={data} onUntick={untick} onClear={() => void clear()} />
        </>
      )}
    </div>
  );
}

function Header({
  name,
  id,
  householdId,
  shop,
  view,
  setView,
  canClear,
  clear,
}: {
  name: string;
  id: string;
  householdId: string;
  shop: boolean;
  view: View;
  setView: (view: View) => void;
  canClear: boolean;
  clear: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  return (
    <header className={styles.header}>
      <ResponsiveSurface web={null} mobile={<BackToLists />} />
      <h1>{name}</h1>
      {shop ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            shopEntry.setFromList(true);
            router.push(`/shop?h=${householdId}&l=${id}`);
          }}
        >
          Shop
        </Button>
      ) : null}
      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        align="right"
        aria-label="List menu"
        trigger={
          <Button
            variant="secondary"
            size="sm"
            aria-label="List menu"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Icon name="ellipsis-vertical" aria-hidden />
          </Button>
        }
        items={[
          { label: 'Clear bought', icon: 'archive', disabled: !canClear, onSelect: clear },
          { type: 'separator' },
          { type: 'label', label: 'Show items' },
          { label: 'By aisle', checked: view === 'aisle', onSelect: () => setView('aisle') },
          {
            label: 'In the order added',
            checked: view === 'added',
            onSelect: () => setView('added'),
          },
          { type: 'separator' },
          {
            label: 'List settings',
            icon: 'settings',
            onSelect: () => router.push(`/l/${id}/settings`),
          },
        ]}
      />
    </header>
  );
}

/** The icon an item shows: its own, else its category's, else the basket. Only the design system's grocery set is ever drawn. */
export function iconOf(item: ItemRow, data: Found): IconName {
  const category = data.categories.find((each) => each.id === item.categoryId);
  for (const key of [item.icon, category?.icon]) if (key && isGroceryIcon(key)) return key;
  return 'shopping-basket';
}

/** Whom an item says it was added by: nobody on a list of one person, and not the reader. */
const addedBy = (item: ItemRow, data: Found): string | null =>
  data.shared && item.addedBy !== data.me ? (data.names[item.addedBy] ?? null) : null;

function Row({
  item,
  data,
  checked,
  onToggle,
  handle,
}: {
  item: ItemRow;
  data: Found;
  checked: boolean;
  onToggle: () => void;
  handle?: { props: React.HTMLAttributes<HTMLButtonElement>; dragging: boolean };
}) {
  const note = firstLine(item.note);
  const quantity = quantityLabel(item);
  const by = checked ? (item.boughtBy && data.names[item.boughtBy]) || null : addedBy(item, data);
  const trailing: ReactNode =
    quantity || note || by ? (
      <span className={styles.meta}>
        {quantity ? <span className={styles.quantity}>{quantity}</span> : null}
        {note ? <span className={styles.note}>{note}</span> : null}
        {by ? (
          <span className={styles.by}>{checked ? `ticked by ${by}` : `added by ${by}`}</span>
        ) : null}
      </span>
    ) : undefined;
  const edit = useItemParam().open;
  // On a phone a long press on the row opens the item, as the pencil does; a tap still ticks (DESIGN.md §16.11).
  const press = useLongPress({ onLongPress: () => edit(item.id) });
  const row = (
    <CheckableListRow
      checked={checked}
      onCheckedChange={onToggle}
      label={item.name}
      icon={<Icon name={iconOf(item, data)} aria-hidden />}
      trailing={
        <>
          {trailing}
          <button
            type="button"
            className={styles.edit}
            aria-label={`Edit ${item.name}`}
            onClick={() => edit(item.id)}
          >
            <Icon name="pencil" aria-hidden />
          </button>
        </>
      }
    />
  );
  const pressed = <div {...press}>{row}</div>;
  return handle ? (
    <DragHandleRow handleProps={handle.props} isDragging={handle.dragging}>
      {pressed}
    </DragHandleRow>
  ) : (
    pressed
  );
}

/** On a phone, a way back to the lists (DESIGN.md §16.11): the drawer that holds them, as the footer's Lists does. Not drawn beside the sidebar. */
function BackToLists() {
  const nav = useMobileNav();
  return (
    <button type="button" className={styles.back} onClick={() => nav.setOpen(true)}>
      <Icon name="chevron-left" aria-hidden />
      Lists
    </button>
  );
}

function SortableRow({
  item,
  data,
  onTick,
}: {
  item: ItemRow;
  data: Found;
  onTick: (item: ItemRow) => void;
}) {
  const sortable = useSortable({ id: item.id });
  const style = {
    transform: sortable.transform
      ? `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`
      : undefined,
    transition: sortable.transition,
  };
  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className={sortable.isDragging ? styles.dragging : undefined}
    >
      <Row
        item={item}
        data={data}
        checked={false}
        onToggle={() => onTick(item)}
        handle={{
          props: {
            ...sortable.attributes,
            ...sortable.listeners,
            'aria-label': `Move ${item.name}`,
          },
          dragging: sortable.isDragging,
        }}
      />
    </li>
  );
}

/**
 * The open items by aisle, a group for each category in the household's order. **A drag moves an item within its category and writes one row**: the key
 * between the two it is dropped between (`reorderedPosition`); by the keyboard it is lifted with Space, moved with the arrows and put down with Space, and
 * what it does is said aloud by name and place.
 */
function ByAisle({
  groups,
  data,
  onTick,
}: {
  groups: Group[];
  data: Found;
  onTick: (item: ItemRow) => void;
}) {
  const { client } = useLocal();
  const sensors = useReorderSensors();
  const guard = useDragClickGuard();
  const spoken = spokenDrag((id) => {
    for (const group of groups) {
      const at = group.items.findIndex((each) => each.id === id);
      const item = group.items[at];
      if (item)
        return {
          noun: 'item',
          name: item.name,
          position: at + 1,
          total: group.items.length,
          inside: group.category?.name ?? 'Other',
        };
    }
    return undefined;
  });

  function onDragEnd(event: DragEndEvent) {
    guard.end();
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const group = groups.find((each) => each.items.some((item) => item.id === active.id));
    // Only within a category: dropping on another category's row is not a move.
    if (!group || !group.items.some((item) => item.id === over.id)) return;
    const position = reorderedPosition(group.items, String(active.id), String(over.id));
    const item = group.items.find((each) => each.id === active.id);
    if (position === null || !item || !client) return;
    void client.commit({
      mutationId: crypto.randomUUID(),
      householdId: item.householdId,
      changes: [{ table: 'item', id: item.id, fields: { position } }],
    });
  }

  return (
    <DndContext
      accessibility={spoken}
      id={`list-${data.list.id}`}
      sensors={sensors}
      autoScroll={VERTICAL_AUTOSCROLL}
      collisionDetection={closestCenter}
      onDragStart={guard.begin}
      onDragEnd={onDragEnd}
      onDragCancel={guard.end}
    >
      {groups.map((group) => (
        <section
          key={group.key}
          className={styles.group}
          aria-label={group.category?.name ?? 'Other'}
        >
          <h2 className={styles.category}>{group.category?.name ?? 'Other'}</h2>
          <SortableContext
            items={group.items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className={styles.items}>
              {group.items.map((item) => (
                <SortableRow key={item.id} item={item} data={data} onTick={onTick} />
              ))}
            </ul>
          </SortableContext>
        </section>
      ))}
    </DndContext>
  );
}

/** Bought, collapsed under the open items, each with who ticked it; _Clear bought_ beside it. */
function Bought({
  items,
  data,
  onUntick,
  onClear,
}: {
  items: ItemRow[];
  data: Found;
  onUntick: (item: ItemRow) => void;
  onClear: () => void;
}) {
  const [shown, setShown] = useState(false);
  if (items.length === 0) return null;
  return (
    <section className={styles.bought} aria-label="Bought">
      <div className={styles.boughtHeader}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={shown}
          onClick={() => setShown(!shown)}
        >
          <Icon name={shown ? 'chevron-down' : 'chevron-right'} aria-hidden />
          Bought ({items.length})
        </button>
        <Button variant="secondary" size="sm" onClick={onClear}>
          Clear bought
        </Button>
      </div>
      {shown ? (
        <ul className={styles.items}>
          {items.map((item) => (
            <li key={item.id}>
              <Row item={item} data={data} checked onToggle={() => onUntick(item)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Nothing on the list: what the household buys most, as chips, so that the first thing is one tap. */
function Empty({
  data,
  change,
}: {
  data: Found;
  change: (mutation: Mutation | null, message: string) => Promise<void>;
}) {
  const { list, products, items, categories, me } = data;
  const often = suggest({ text: '', products, items }).filter(
    (each): each is Suggestion & { productId: string } =>
      each.kind === 'product' && each.productId !== undefined,
  );
  const add = (suggestion: Suggestion & { productId: string }) => {
    if (!me) return;
    const planned = planAdd(env(), { list, products, items, categories, me }, suggestion);
    if (planned && 'mutation' in planned) return change(planned.mutation, planned.message);
  };
  return (
    <div className={styles.empty}>
      <EmptyState
        icon="list-todo"
        heading={`Nothing on ${list.name}`}
        description={
          often.length > 0 ? 'Pick from what you buy often.' : 'Nothing has been added yet.'
        }
      />
      {often.length > 0 ? (
        <section aria-label="Often bought">
          <h2 className={styles.category}>Often bought</h2>
          <ul className={styles.chips}>
            {often.map((each) => (
              <li key={each.productId}>
                <button type="button" className={styles.chip} onClick={() => void add(each)}>
                  {each.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
