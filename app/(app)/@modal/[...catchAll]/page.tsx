/**
 * Nothing is over any other page: a slot keeps what it showed when a client navigation goes to a route it does not match, so **the settings dialog would stay open
 * over the next page** (a list from the drawer, shopping mode) unless the slot matches that route and draws nothing (Next's docs, "Closing the modal").
 */
export default function Nothing() {
  return null;
}
