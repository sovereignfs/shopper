'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, CheckableListRow, Dialog, EmptyState, Icon, useLongPress } from '@sovereignfs/ui';
import type { Env } from '../actions/env';
import { clearBought, tickItem, untickItem } from '../actions/items';
import type { Mutation } from '../actions/format';
import type { ItemRow } from '../actions/rows';
import { type ListData, listViewOf } from '../local/listview';
import { useLocal, useLocalQuery } from '../local/react';
import { boughtItems, groupByAisle, openItems, quantityLabel } from '../lists/view';
import { AddField } from './AddField';
import { EditedItem, useItemParam } from './ItemEditor';
import { iconOf } from './ListScreen';
import { shopEntry } from './shop-entry';
import { useUndo } from './Undo';
import { useWakeLock } from './wake-lock';
import styles from './ShopScreen.module.css';

type Found = Extract<ListData, { found: true }>;

const env = (): Env => ({ now: Date.now(), newId: () => crypto.randomUUID() });

/**
 * **Shopping mode** (DESIGN.md §11, in 0.1.0's light form, §2.2): the screen for the shop, made for one hand, a moving body and no signal. Rows of at least
 * 56 px, in the household's aisle order, **the whole row ticking**; a ticked row drops into **In basket** and a toast offers Undo; the line under the title
 * says "12 to get · 3 in basket"; the add field is the list's own, with _Already in basket_ for what is in the trolley; a long press opens the item
 * (8.4); **Finish shopping** offers to clear what was bought and goes back to the list. The screen stays on where the browser can (`useWakeLock`) and the
 * device pulls every ten seconds while it is open (`holdFresh`). No shop, price or total: those are 7.6. Everything is read from the device and written to
 * it, so it works with no network once it is open, and leaving without finishing changes nothing.
 */
export function ShopScreen({ id }: { id: string }) {
  const found = useLocalQuery((db) => listViewOf(db, id), [id]);
  const { holdFresh } = useLocal();
  useWakeLock();
  useEffect(() => holdFresh(), [holdFresh]);
  const data = found.data;
  if (!data) return <div className={styles.page} aria-busy="true" />;
  if (!data.found)
    return data.synced ? (
      <EmptyState
        icon="shopping-basket"
        heading="That list is not here"
        description="It may have been deleted, or it is not one of yours."
        action={<Link href="/">Back to your lists</Link>}
      />
    ) : (
      <div className={styles.page} aria-busy="true" />
    );
  return <Shopping data={data} />;
}

function Shopping({ data }: { data: Found }) {
  const { client } = useLocal();
  const router = useRouter();
  const offerUndo = useUndo();
  const editing = useItemParam();
  const { list, items, categories, me } = data;
  const [basket, setBasket] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showBasket, setShowBasket] = useState(true);
  const open = openItems(items);
  const bought = boughtItems(items);

  async function change(mutation: Mutation | null, message: string) {
    if (!mutation || !client) return;
    const undo = await client.commit(mutation);
    if (undo) offerUndo(message, async () => void (await client.commit(undo)));
  }
  const tick = (item: ItemRow) =>
    me && change(tickItem(env(), item, me), `In basket: ${item.name}`);
  const untick = (item: ItemRow) =>
    change(untickItem(env(), item), `Back on the list: ${item.name}`);

  /** Back to the list: by history when shopping was opened from it (which needs no network), else by its address. */
  const leave = () => (shopEntry.wasFromList() ? router.back() : router.push(`/l/${list.id}`));
  async function finish(clear: boolean) {
    setFinishing(false);
    if (clear) await change(clearBought(env(), bought), `Cleared ${bought.length} bought`);
    leave();
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={leave}
          aria-label={`Back to ${list.name}`}
        >
          <Icon name="chevron-left" aria-hidden />
        </button>
        <div className={styles.title}>
          <h1>{list.name}</h1>
          <p role="status" className={styles.progress}>
            {open.length} to get · {bought.length} in basket
          </p>
        </div>
      </header>

      <div className={styles.add}>
        <AddField data={data} change={change} basket={basket} />
        <label className={styles.basketOption}>
          <input type="checkbox" checked={basket} onChange={(e) => setBasket(e.target.checked)} />
          Already in basket
        </label>
      </div>

      {open.length === 0 ? (
        <p className={styles.note}>
          {bought.length > 0 ? 'Everything is in the basket.' : `Nothing on ${list.name}.`}
        </p>
      ) : (
        groupByAisle(open, categories).map((group) => (
          <section key={group.key} aria-label={group.category?.name ?? 'Other'}>
            <h2 className={styles.category}>{group.category?.name ?? 'Other'}</h2>
            <ul className={styles.rows}>
              {group.items.map((item) => (
                <li key={item.id}>
                  <ShopRow
                    item={item}
                    data={data}
                    checked={false}
                    onToggle={() => void tick(item)}
                    onHold={() => editing.open(item.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {bought.length > 0 ? (
        <section aria-label="In basket" className={styles.basket}>
          <button
            type="button"
            className={styles.basketToggle}
            aria-expanded={showBasket}
            onClick={() => setShowBasket(!showBasket)}
          >
            In basket ({bought.length})
            <Icon name={showBasket ? 'chevron-up' : 'chevron-down'} aria-hidden />
          </button>
          {showBasket ? (
            <ul className={styles.rows}>
              {bought.map((item) => (
                <li key={item.id} className={styles.dropped}>
                  <ShopRow
                    item={item}
                    data={data}
                    checked
                    onToggle={() => void untick(item)}
                    onHold={() => editing.open(item.id)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className={styles.finish}>
        <Button size="lg" onClick={() => (bought.length === 0 ? leave() : setFinishing(true))}>
          Finish shopping
        </Button>
      </div>

      {finishing ? (
        <Dialog
          open
          size="sm"
          title="Finish shopping"
          aria-label="Finish shopping"
          onClose={() => setFinishing(false)}
          footer={
            <div className={styles.finishActions}>
              <Button variant="secondary" onClick={() => void finish(false)}>
                Keep
              </Button>
              <Button onClick={() => void finish(true)}>Clear</Button>
            </div>
          }
        >
          <p>
            Clear {bought.length} bought {bought.length === 1 ? 'item' : 'items'} from {list.name}?
          </p>
        </Dialog>
      ) : null}
      {editing.id !== null ? (
        <EditedItem id={editing.id} data={data} close={editing.close} change={change} />
      ) : null}
    </div>
  );
}

function ShopRow({
  item,
  data,
  checked,
  onToggle,
  onHold,
}: {
  item: ItemRow;
  data: Found;
  checked: boolean;
  onToggle: () => void;
  onHold: () => void;
}) {
  const press = useLongPress({ onLongPress: onHold });
  const quantity = quantityLabel(item);
  return (
    <div {...press}>
      <CheckableListRow
        className={styles.row}
        checked={checked}
        onCheckedChange={onToggle}
        label={item.name}
        icon={<Icon name={iconOf(item, data)} aria-hidden />}
        trailing={quantity ? <span className={styles.quantity}>{quantity}</span> : undefined}
      />
    </div>
  );
}
