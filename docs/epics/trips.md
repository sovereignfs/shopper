# Epic 7: Trips and shopping

## Status

📋 Planned.

## Overview

What happens in the shop: ticking puts an item into the person's open trip as a trip line, finishing a trip clears what it bought, shopping mode is
the screen made for the aisle, and the trips history is what a household looks back on. The data (7.1, 7.2) comes with the write path, before any
screen; the screens (7.3–7.5) after a list exists.

## Related

[`DESIGN.md`](../../DESIGN.md) §9.5, §10, §11, §12.4

## Tasks

#### 📋 7.1 — Trips and trip lines

**Goal:** ticking records what was bought. **Design:** §10.1, §10.2, §10.4. **Depends on:** 5.5.

**Technical:** `trip`, `trip_line`, `shop` (§20.3); actions tick (opening the person's trip in the household if none is open, with a device-made id;
writing the item's bought fields and a trip line copying product, name, quantity, unit, category, price, list id and name), untick (clearing them and
deleting the line), edit a line, set a trip's shop (making one if typed new) and receipt total, delete a trip (its shopper or an Admin; its lines go,
items stay bought without a trip); the server's checks (one open trip per person per household, folding a second tick through 5.3); apply updates the
product's last unit price when a priced item is bought.

**Accepts when:** a tick makes exactly one line and an untick removes it; two devices ticking one item end with one line, the first's; editing a
bought item's price updates its line; a trip's total is its lines' sum, or the receipt total when typed.

#### 📋 7.2 — Finishing trips and clearing

**Goal:** trips end and lists tidy themselves. **Design:** §9.5, §10.1. **Depends on:** 7.1, 1.6.

**Technical:** action finish (the trip's finish time; clearing each list it bought from whose rule is "when I finish shopping"); the clearing rules
(`on_finish`, `manual`, `after_day`) and _Clear bought_; a job finishing trips six hours after their last tick (at that time, deleting an empty one)
and clearing `after_day` lists nobody opened; the same rules applied by a device that notices first, made idempotent by the field merge;
`trip_finished` notices once 9.2 is in.

**Accepts when:** finishing clears bought items from lists set to clear on finish and not from others; an abandoned trip finishes on its own at its
last tick; two devices finishing one trip clear once.

#### 📋 7.3 — Shopping mode

**Goal:** the screen for the shop. **Design:** §11.1, §11.3, §11.4, §23. **Depends on:** 8.2, 7.2.

**Technical:** `/shop?h=&l=` (one list here; several in 7.4): rows of at least 56 px (`CheckableListRow`), in aisle order, ticking dropping into In
basket with _Undo_; the shop asked for on start (from the household's shops by most used, or new), remembered; progress and running total; "Sam is
shopping too" from other members' open trips; long-press for price and quantity in a thumb-sized sheet; the add field with "Already in basket"; the
Screen Wake Lock held while visible and released when hidden; the freshest sync setting forced (6.4); Finish shopping's summary (bought with total and
a receipt-total field, left, shop) and confirm; leaving without finishing keeps the trip, with a banner on the list; the footer hidden.

**Accepts when:** journeys 6 to 8 of §3 pass in Playwright with the network off throughout shopping mode; the wake lock is requested where supported
and nothing breaks where not; the screen is usable with a keyboard and a screen reader announces each row's state.

#### 📋 7.4 — Shopping several lists

**Goal:** one walk through the shop for several lists. **Design:** §11.2. **Depends on:** 7.3.

**Technical:** "Shop several lists" in a list's menu choosing lists of the same household; their items merged into one aisle order, each tagged with
its list; the choice in the address; finishing clears each list by its own rule.

**Accepts when:** two lists shopped together show one aisle order with tags; a reload keeps the choice; each list clears by its own rule on finish.

#### 📋 7.5 — The trips history

**Goal:** looking back. **Design:** §10.5. **Depends on:** 7.1, 8.1.

**Technical:** `/h/<id>/trips` by month (who, shop, date, lines, total), filterable to the person's own; `/h/<id>/trips/<id>` with lines by category,
each editable, the shop and receipt total, Add again per line (to a chosen list, as an add action), delete; trips older than 180 days fetched online
by a paged read and said so offline.

**Accepts when:** journey 9 of §3 passes; Add again puts the product on the list with its last quantity; an old trip offline says it needs a
connection.
