'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { Mutation } from '../actions/format';
import type { ListData } from '../local/listview';
import { ThreeColumnLayout, useIsMobile } from '@sovereignfs/ui';
import { ItemPanel } from './ItemPanel';

type Found = Extract<ListData, { found: true }>;

/**
 * A dialog named in the address, `?<name>=<value>` (DESIGN.md §16.7, §16.9), so that a reload, Back and a link all agree. The other parameters stay. The
 * address is changed with the browser's own history, which Next follows: going through the router would ask the server for the page again, and a dialog
 * must open with no network.
 */
export function useQueryParam(name: string): {
  value: string | null;
  open: (value: string) => void;
  close: () => void;
} {
  const params = useSearchParams();
  const pathname = usePathname();
  const to = (value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(name);
    else next.set(name, value);
    const query = next.toString();
    return query === '' ? pathname : `${pathname}?${query}`;
  };
  return {
    value: params.get(name),
    open: (value) => window.history.pushState(null, '', to(value)),
    close: () => window.history.replaceState(null, '', to(null)),
  };
}

/** The item whose dialog is open: the address's `?item=<id>`. */
export function useItemParam(): {
  id: string | null;
  open: (id: string) => void;
  close: () => void;
} {
  const { value, open, close } = useQueryParam('item');
  return { id: value, open, close };
}

/**
 * **The item beside its list** (RFC 0005): the page (`children`) and, while `?item=<id>` names an item of this list, the item in the right column of
 * `ThreeColumnLayout` (360px, the design system's, as Tusk's card), pushing the page narrower so that another can be opened beside it; **on a phone it is
 * a page of its own in place of the list** (which is rendered, not navigated: the address is the same). An address naming an item that is not on this list
 * (deleted, moved, another list's) closes itself. The panel's content is `ItemPanel`: this only places it.
 */
export function ItemBeside({
  data,
  change,
  children,
}: {
  data: Found;
  change: (mutation: Mutation | null, message: string) => Promise<void>;
  children: ReactNode;
}) {
  const { id, close } = useItemParam();
  const mobile = useIsMobile();
  const item =
    id === null ? undefined : data.items.find((each) => each.id === id && each.deletedAt === null);
  useEffect(() => {
    if (id !== null && !item) close();
  }, [id, item, close]);
  const panel = item ? (
    <ItemPanel
      key={item.id}
      data={data}
      item={item}
      mobile={mobile}
      onClose={close}
      change={change}
    />
  ) : null;
  if (panel && mobile) return panel;
  return (
    <ThreeColumnLayout sidebarHidden>
      <div />
      <div>{children}</div>
      {panel}
    </ThreeColumnLayout>
  );
}
