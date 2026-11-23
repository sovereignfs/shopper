import type { Metadata } from 'next';
import { HomeScreen } from '@/src/screens/HomeScreen';

// The front address shows a list until Home (23.2) has a page of its own, so its title is the list's, which only the browser can set; until then, the app's.
export const metadata: Metadata = { title: { absolute: 'Shopper' } };

/**
 * What someone signed in sees at the front address (DESIGN.md §16.4): the proxy answers `/` with this page for a request that has a session cookie, and the
 * address stays `/`. It is to open **the last list the person used**, or their first household's first list; remembering the last list is task 8.2's. Until
 * then it shows the lists, which is also where a phone, whose sidebar is a drawer, starts from.
 */
export default function Home() {
  return <HomeScreen />;
}
