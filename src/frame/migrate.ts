/**
 * The sidebar's remembered choices moved when the frame became `@sovereignfs/ui`'s: Shopper kept them under `shopper.sidebar` and the design system keeps an
 * app's under `sv.sidebar.<app>`, in the same shape (`{ home: { state, shown }, page: { state, shown } }`). A person's choice on this device is carried across once, so
 * that a sidebar they had hidden or narrowed is still, and the old key is gone. Pure, with the storage given; anything not what was written is the design system's to
 * read defensively (`parseSidebarStored`), and a choice already made under the new key is never overwritten.
 */
export const OLD_SIDEBAR_KEY = 'shopper.sidebar';
export const NEW_SIDEBAR_KEY = 'sv.sidebar.shopper';

export function migrateSidebar(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
): void {
  try {
    const old = storage?.getItem(OLD_SIDEBAR_KEY);
    if (old === null || old === undefined) return;
    if (storage?.getItem(NEW_SIDEBAR_KEY) === null) storage.setItem(NEW_SIDEBAR_KEY, old);
    storage?.removeItem(OLD_SIDEBAR_KEY);
  } catch {
    // Blocked or private: nothing was kept, and the default stands.
  }
}
