import { CardsScreen } from '@/src/screens/CardsScreen';

/**
 * **Loyalty cards** (DESIGN.md §16.14, RFC 0007): the person's own cards and those shared with them, in the app's frame, linked from the sidebar and the phone's footer. The screen reads the
 * device, so it opens offline; the page holds nothing and decides nothing (what is read and written is checked by the server on sync, as for every screen).
 */
export default function Cards() {
  return <CardsScreen />;
}
