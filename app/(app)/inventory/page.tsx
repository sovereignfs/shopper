import { InventoryScreen } from '@/src/screens/InventoryScreen';

/**
 * **Inventory** (DESIGN.md §16.8, RFC 0006): the person's own items and the starter's, in the app's frame, linked from the sidebar and from Home. The screen reads the device, so
 * it opens offline; the page holds nothing and decides nothing (what is read and written is checked by the server on sync, as for every screen).
 */
export default function Inventory() {
  return <InventoryScreen />;
}
