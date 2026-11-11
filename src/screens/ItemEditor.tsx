'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { Mutation } from '../actions/format';
import type { ListData } from '../local/listview';
import { ItemDialog } from './ItemDialog';

type Found = Extract<ListData, { found: true }>;

/**
 * The item whose dialog is open: the address's `?item=<id>` (DESIGN.md §16.7), so that a reload, Back and a link all agree. The other parameters stay.
 * The address is changed with the browser's own history, which Next follows: going through the router would ask the server for the page again, and the
 * dialog must open with no network.
 */
export function useItemParam(): {
  id: string | null;
  open: (id: string) => void;
  close: () => void;
} {
  const params = useSearchParams();
  const pathname = usePathname();
  const to = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id === null) next.delete('item');
    else next.set('item', id);
    const query = next.toString();
    return query === '' ? pathname : `${pathname}?${query}`;
  };
  return {
    id: params.get('item'),
    open: (id) => window.history.pushState(null, '', to(id)),
    close: () => window.history.replaceState(null, '', to(null)),
  };
}

/** The dialog for the item named in the address, if it is on this list; an address naming one that is not (deleted, or another list's) closes itself. */
export function EditedItem({
  id,
  data,
  close,
  change,
}: {
  id: string;
  data: Found;
  close: () => void;
  change: (mutation: Mutation | null, message: string) => Promise<void>;
}) {
  const item = data.items.find((each) => each.id === id && each.deletedAt === null);
  useEffect(() => {
    if (!item) close();
  }, [item, close]);
  return item ? (
    <ItemDialog key={item.id} data={data} item={item} onClose={close} change={change} />
  ) : null;
}
