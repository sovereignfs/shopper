# Epic 7: Trips and shopping

## Status

📋 Planned.

## Overview

What happens in the shop: shopping mode is the screen made for the aisle, ticking records what was bought, finishing clears it, and the trips history
is what a household looks back on.

**0.1.0 has shopping mode in its light form (7.3):** the screen for the aisle, with no trips, no shops, no prices and no totals. A tick sets the
item's own bought fields (5.5) and the basket is the list's bought items. **Trips, shops and prices arrive in phase 2** (7.1, 7.2, 7.6, 7.4, 7.5), as
an addition: ticking then also writes a trip line, and nothing 0.1.0 wrote has to change.

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §9.5, §10, §11, §12.4

## Tasks

#### 📋 7.1 — Trips and trip lines (phase 2)

**Goal:** ticking records what was bought, where and for how much. **Design:** §10.1, §10.2, §10.4. **Depends on:** 5.5, 4.9, 3.8.

**Technical:** `trip`, `trip_line`, `shop` (§20.3) and the item's `price` and `trip_id` by new migrations; the household's `currency` from 3.8;
actions tick (now opening the person's trip in the household if none is open, with a device-made id; writing the item's bought fields and a trip
line copying product, name, quantity, unit, category, price, list id and name), untick (clearing them and deleting the line), edit a line, set a
trip's shop (making one if typed new) and receipt total, delete a trip (its shopper or an Admin; its lines go, items stay bought without a trip);
the server's checks (one open trip per person per household, folding a second tick through 5.3); apply updates the product's last unit price when a
priced item is bought; **suggestions (4.4) now rank by the decayed count of the last 180 days of trip lines**; the sync's snapshot carries trips of
the last 180 days (6.1); the new tables are added to deletion (2.5), the registry test, the seed and export. Items ticked before this lands have no
trip, as an item whose trip was deleted has none.

**Accepts when:** a tick makes exactly one line and an untick removes it; two devices ticking one item end with one line, the first's; editing a
bought item's price updates its line; a trip's total is its lines' sum, or the receipt total when typed; suggestions still rank as 4.4's fixtures
say for a household with no lines.

#### 📋 7.2 — Finishing trips and clearing (phase 2)

**Goal:** trips end and lists tidy themselves. **Design:** §9.5, §10.1. **Depends on:** 7.1, 1.6.

**Technical:** action finish (the trip's finish time; clearing each list it bought from whose rule is "when I finish shopping"); the clearing rules
(`on_finish`, `manual`, `after_day`) in the list's settings, **`on_finish` the default for lists made from now on and `manual` kept on the lists
that exist**; _Clear bought_ as before; a job finishing trips six hours after their last tick (at that time, deleting an empty one) and clearing
`after_day` lists nobody opened; the same rules applied by a device that notices first, made idempotent by the field merge; `trip_finished` notices
once 9.2 is in.

**Accepts when:** finishing clears bought items from lists set to clear on finish and not from others; an abandoned trip finishes on its own at its
last tick; two devices finishing one trip clear once.

#### 📋 7.3 — Shopping mode

**Goal:** the screen for the shop. **Design:** §11 (0.1.0 as §2.2 words it), §23. **Depends on:** 8.2.

**Technical:** `/shop?h=&l=` (one list in 0.1.0; the address is the one phase 2 keeps): rows of at least 56 px (`CheckableListRow`), in aisle order,
**the whole row ticking**, a ticked row dropping into **In basket** (the list's bought items, the same rows its list shows) with a short animation and
a toast with _Undo_; progress ("12 to get · 3 in basket"); the add field of 8.3, with "Already in basket" putting an item straight into the basket;
a long press on a row opens the item's dialog (8.4); **Finish shopping** asks "Clear 3 bought items from Groceries?" with _Clear_ and _Keep_, and
returns to the list; leaving without finishing changes nothing; the Screen Wake Lock held while visible and released when hidden, nothing said where
the browser lacks it; **the sync loop pulls every 10 seconds, or the operator's interval if that is shorter, while the screen is open**; the footer
hidden. No shop, price, total or "shopping too": those are 7.6.

**Accepts when:** journeys 6 and 7 of §3, as §2.2 words them for 0.1.0, pass in Playwright with the network off throughout shopping mode; the wake
lock is requested where supported and nothing breaks where not; the screen is usable with a keyboard and a screen reader announces each row's state.

#### 📋 7.4 — Shopping several lists (phase 2)

**Goal:** one walk through the shop for several lists. **Design:** §11.2. **Depends on:** 7.6.

**Technical:** "Shop several lists" in a list's menu choosing lists of the same household; their items merged into one aisle order, each tagged with
its list; the choice in the address; finishing clears each list by its own rule.

**Accepts when:** two lists shopped together show one aisle order with tags; a reload keeps the choice; each list clears by its own rule on finish.

#### 📋 7.5 — The trips history (phase 2)

**Goal:** looking back. **Design:** §10.5. **Depends on:** 7.1, 8.1.

**Technical:** `/h/<id>/trips` by month (who, shop, date, lines, total), filterable to the person's own; `/h/<id>/trips/<id>` with lines by category,
each editable, the shop and receipt total, Add again per line (to a chosen list, as an add action), delete; trips older than 180 days fetched online
by a paged read and said so offline; "Trips" in the sidebar and on the phone's footer.

**Accepts when:** journey 9 of §3 passes; Add again puts the product on the list with its last quantity; an old trip offline says it needs a
connection.

#### 📋 7.6 — Shopping mode, with trips (phase 2)

**Goal:** the shop, remembered. **Design:** §11.1, §11.3. **Depends on:** 7.3, 7.2, 8.10.

**Technical:** shopping mode opens the person's trip; the shop asked for on start (from the household's shops by most used, or new), remembered;
the running total and "Sam is shopping too" from other members' open trips; long press opens a thumb-sized sheet for price and quantity, in place
of 7.3's dialog; Finish shopping's summary (bought with total and a receipt-total field, what is left, the shop) and confirm, which finishes the
trip (7.2); leaving without finishing keeps the trip, with a banner on the list ("You're shopping at Lidl · 3 in basket · Finish").

**Accepts when:** journeys 6 to 8 of §3 pass as written in Playwright with the network off throughout shopping mode; finishing writes a trip with its
lines and clears by the list's rule; the banner shows on a list while the trip is open.
