/**
 * How a list shows its items by default (Settings, Preferences; RFC 0005): **by aisle** or **in the order added**. It is about how this device draws a list, so it
 * is kept in this browser, as the theme is, and is not sent anywhere; an address's `?view=added` still decides for that page, and choosing the other in the list's
 * menu is the same preference. Pure, with the storage given, so that it is tested with none.
 */
export type View = 'aisle' | 'added';

export const VIEW_KEY = 'shopper:list-view';

/** What a stored value means: only the two are views, and anything else is none chosen. */
export const viewOf = (value: string | null | undefined): View | null =>
  value === 'added' || value === 'aisle' ? value : null;

export function readView(storage: Pick<Storage, 'getItem'> | undefined): View | null {
  try {
    return viewOf(storage?.getItem(VIEW_KEY));
  } catch {
    return null;
  }
}

/** Keeps the choice; without storage (a private window) it lasts for the page. */
export function writeView(storage: Pick<Storage, 'setItem'> | undefined, view: View): void {
  try {
    storage?.setItem(VIEW_KEY, view);
  } catch {
    // Not kept.
  }
}
