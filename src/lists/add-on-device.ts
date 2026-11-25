import type { Env } from '../actions/env';
import type { Suggestion } from '../catalog/suggest';
import { type CopyKeys, categoryOnList } from '../keys/copies';
import type { LocalDatabase } from '../local/db';
import { listViewOf } from '../local/listview';
import { inventoryContextOf } from '../local/store';
import { type Planned, type Refused, planAdd, routeOf } from './adding';

/**
 * **What adding a suggestion to a list comes to, from what the device holds now** (DESIGN.md §8.5, §16.6): the list, its products and items, the person's Inventory, and, where the
 * add is of an Inventory item the list has no product of, **its category on this list**, which may be a copy of one of the person's own categories made under the list's keys
 * (`categoryOnList`: it waits for the keys only for that, and without them is the guess, so an add is never held). The add field and the often-bought chips call this when an
 * add's turn comes, and the tests call the same function, so that what they prove is what the screen does. `undefined` where the list is not on the device; `null` for no name.
 */
export async function planAddOnDevice(
  db: LocalDatabase,
  keys: CopyKeys,
  env: Env,
  input: { list: string; me: string; suggestion: Suggestion },
): Promise<Planned | Refused | null | undefined> {
  const now = await listViewOf(db, input.list);
  if (!now.found) return undefined;
  const inventory = await inventoryContextOf(db);
  const context = {
    list: now.list,
    products: now.products,
    items: now.items,
    categories: now.categories,
    me: input.me,
    ...(inventory ? { inventory } : {}),
  };
  const route = routeOf(context, input.suggestion);
  const category =
    route?.via === 'inventory'
      ? await categoryOnList(db, keys, env, { entry: route.entry, list: now.list }).catch(
          () => undefined,
        )
      : undefined;
  return planAdd(env, context, input.suggestion, category ? { category } : undefined);
}
