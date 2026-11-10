import type { Metadata } from 'next';
import { EmptyState } from '@sovereignfs/ui';

export const metadata: Metadata = { title: { absolute: 'Shopper' } };

/**
 * What someone signed in sees at the front address (DESIGN.md §16.4): the proxy answers `/` with this page for a request that has a session cookie, and
 * the address stays `/`. It is to open **the last list the person used** (on the device, then in `account_settings`), or their first household's first
 * list; those are task 8.2's, and until then this says so.
 */
export default function Home() {
  return (
    <EmptyState icon="list-todo" heading="Your lists" description="The lists are not here yet." />
  );
}
