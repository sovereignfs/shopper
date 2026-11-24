/** What the service worker (`source.ts`) and the pages share, with nothing of the worker's package in it, so that a page's bundle does not carry it. */
export const SYNC_TAG = 'shopper-sync';
export const SYNC_MESSAGE = 'shopper-sync';

/**
 * The signed-in addresses the shell answers with no network (DESIGN.md §16.11), as regular expression sources: the front address and `/home` (the last
 * list), a list and its settings, shopping mode and Inventory. **Settings of the account, sign-in and the API are not here**: they are read from the server, and
 * with no network the shell says they need a connection.
 */
export const SHELL_ADDRESSES: readonly string[] = [
  '^\\/(home)?$',
  '^\\/l\\/[0-9a-f-]{36}(\\/settings)?$',
  '^\\/shop$',
  '^\\/inventory$',
];

const SHELL_PATTERNS = SHELL_ADDRESSES.map((source) => new RegExp(source));

/** Whether the shell, opened at `pathname` with no network, has a screen for it; otherwise it says the page needs a connection. */
export function answersOffline(pathname: string): boolean {
  return SHELL_PATTERNS.some((pattern) => pattern.test(pathname));
}
