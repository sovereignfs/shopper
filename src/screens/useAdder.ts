'use client';

import { useMemo, useRef, useState } from 'react';
import type { Env } from '../actions/env';
import type { Mutation } from '../actions/format';
import { type InventoryEntry, layerInventory } from '../catalog/inventory';
import type { Suggestion } from '../catalog/suggest';
import { copyKeysOf } from '../keys/copies';
import { planAddOnDevice } from '../lists/add-on-device';
import { inBasket } from '../lists/adding';
import type { ListData } from '../local/listview';
import { useLocal, useLocalQuery } from '../local/react';
import { inventoryContextOf } from '../local/store';

type Found = Extract<ListData, { found: true }>;

const env = (): Env => ({ now: Date.now(), newId: () => crypto.randomUUID() });

/**
 * **The person's Inventory as the add field reads it** (DESIGN.md §8.5): the starter catalog with their rows laid over it, from the device and read again when it changes. `undefined`
 * until the device has answered, which is a moment and never a network: the field offers what it always did until then (the starter's entries and the list's products).
 */
export function useInventoryEntries(): readonly InventoryEntry[] | undefined {
  const rows = useLocalQuery(inventoryContextOf, []).data?.rows;
  return useMemo(() => (rows ? layerInventory(rows) : undefined), [rows]);
}

/**
 * **Adding a suggestion to a list**, for the add field and for the often-bought chips (one way, so that both make the same mutation). Adds are done one after another, each from
 * what the device holds **when its turn comes**: typed fast, the second would otherwise be planned from the list as it was drawn before the first was written, and "oat milk" twice
 * would add one more only once; and a suggestion drawn a moment ago may name a product that has been made since (`routeOf` decides again, by name).
 *
 * An Inventory item's category on this list may be a copy of one of the person's own categories, made under the list's keys, so it is worked out here, in the line, for that alone
 * (`categoryOnList`; where the keys are not open it is the guess, and the add is not held). A new name makes an Inventory item of the person's own, after the list's and with
 * nothing said (§8.8): what could not be written for it (a limit, a group the device has not heard of) is not for the person to hear of while they add.
 */
export function useAdder({
  data,
  change,
  basket = false,
  onAdded,
}: {
  data: Found;
  change: (mutation: Mutation | null, message: string) => Promise<void>;
  /** Adds straight into the basket: the item is ticked by the person as it is added. */
  basket?: boolean;
  /** Told when an item has been added (shopping mode closes the field). */
  onAdded?: () => void;
}) {
  const { client, keysOf } = useLocal();
  const { list, me } = data;
  const [refused, setRefused] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  function add(suggestion: Suggestion) {
    if (!client || !me) return;
    queue.current = queue.current.then(async () => {
      const planned = await planAddOnDevice(client.db, copyKeysOf(keysOf), env(), {
        list: list.id,
        me,
        suggestion,
      });
      if (!planned) return;
      if ('refused' in planned) {
        setRefused(planned.refused);
        return;
      }
      setRefused(null);
      const mutation = basket ? inBasket(planned.mutation, me, Date.now()) : planned.mutation;
      await change(mutation, planned.message);
      if (planned.also) await client.commit(planned.also).catch(() => undefined);
      // Written, so whoever opened the field may close it; a refusal leaves it open, with the reason.
      onAdded?.();
    });
  }

  return { add, refused, clearRefused: () => setRefused(null) };
}
