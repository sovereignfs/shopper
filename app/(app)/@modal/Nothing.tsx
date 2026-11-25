/**
 * What the settings dialog's slot (`@modal`, RFC 0005) draws over every page of the signed-in area that is not Settings: nothing. A slot keeps what it showed when a client
 * navigation goes to an address it does not match, **so the dialog would stay open over the next page** (a list from the drawer, shopping mode) unless the slot matches that
 * address and draws nothing (Next's docs, "Closing the modal").
 *
 * **One page for each address of the area, never a catch-all.** Next's strict route matching (on by default since 16.4) requires every address a slot matches to be one the
 * layout's other slots match too, so a catch-all here claims every address in the app, the visitor's front page, sign-in and sign-up among them, which are outside this area and
 * served with a 404 (in `pnpm dev`; a production build serves them). The slot has a page for exactly the addresses of `app/(app)`, and a test (`src/access/modal-slot.test.ts`)
 * keeps it so: a page added to the area needs its counterpart here, a one-line file that re-exports this.
 */
export function Nothing() {
  return null;
}
