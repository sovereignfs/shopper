import { HomeScreen } from '@/src/screens/HomeScreen';

/**
 * What someone signed in sees at the front address (DESIGN.md §16.4): the proxy answers `/` with this page for a request that has a session cookie, and the
 * address stays `/`. It is **Home** (RFC 0006): Continue on the last list the person used, a tile for every list, and what can be said at a glance. A client reads
 * this page's path, `/home`, and not the `/` it is at (`addressOf`, `src/frame/page-kind.ts`).
 */
export default function Home() {
  return <HomeScreen />;
}
