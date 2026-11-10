/**
 * Asks the browser not to evict the working copy when it is short of room (DESIGN.md §12.8): a browser may clear a site's storage, and unsent changes would
 * go with it. It is a request, which the browser may refuse, quietly or after asking the person; nothing depends on the answer, and it is made once the
 * working copy is open and not before. Settings says whether it was granted.
 */
export async function requestPersistence(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = typeof navigator ===
  'undefined'
    ? undefined
    : navigator.storage,
): Promise<boolean> {
  if (!storage?.persist) return false;
  try {
    return (await storage.persisted?.()) === true || (await storage.persist());
  } catch {
    return false;
  }
}
