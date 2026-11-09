# Epic 13: Pantry and routines (phase 2)

## Status

📋 Planned. Detailed at the start of phase 2, after 0.1.0; what is here is the outline each task starts from.

## Overview

Phase 2, release 0.2.0 (`DESIGN.md` §22.1): what is at home and running low, the things always wanted, items that come back on their own, lists saved
as templates, shops with an aisle order learned from how people walk them, prices per shop and over time, insights, and Push. Every new table syncs
through the one path, is sealed where it names something, and is handled by deletion, export and import.

## Related

[`DESIGN.md`](../../DESIGN.md) §22.1 · Tusk's recurrence (its `DESIGN.md` §12) · Tally's `DESIGN.md` §21.4 (Push)

## Tasks

#### 📋 13.1 — The pantry and low points

**Goal:** what is at home, and what is running low. **Design:** §22.1. **Depends on:** 12.4.

**Technical:** on a product, kept at home, an amount on hand (decimal, in the product's unit) and a low point; on hand increased when a line for it is
bought, changed by hand ("used up", "have 2"); a household's choice of list for low items, offered or added automatically; a Pantry tab in the
catalog.

**Accepts when:** buying raises on hand; reaching the low point offers or adds the product to the chosen list on every device, once.

#### 📋 13.2 — Staples

**Goal:** what is always wanted, one action away. **Design:** §22.1. **Depends on:** 12.4.

**Technical:** a staple flag on products; the empty add field offers missing staples first; _Add staples_ on a list adds every missing one at its
default quantity, in one mutation, folding with what is open.

**Accepts when:** _Add staples_ adds exactly the missing ones and never a duplicate.

#### 📋 13.3 — Repeating items

**Goal:** an item that comes back on its own. **Design:** §22.1. **Depends on:** 12.4.

**Technical:** a rule per product and list (Tusk's rule format, as Ledger and Tally copy it): every N days or weeks, on a weekday; the server's job
adds the item, idempotent on `(rule, occurrence)` with a derived item id so a device doing the same offline makes the same item; folded with an open
one.

**Accepts when:** a weekly rule adds the item once a week, on the server or on an offline device, never twice.

#### 📋 13.4 — Templates

**Goal:** a list saved and reused. **Design:** §22.1. **Depends on:** 12.4.

**Technical:** a template (name, products with quantities) saved from a list; applied to a list in one action, adding what is missing at the
template's quantities and bumping what is there to at least them.

**Accepts when:** applying a template twice changes nothing the second time.

#### 📋 13.5 — Shops with their own aisle order

**Goal:** each shop in the order people walk it. **Design:** §22.1. **Depends on:** 12.4.

**Technical:** a shop's category order, learned by a pure function from its last trips' lines (for each pair of categories, which was ticked first
more often; a stable order from that), applied when shopping mode starts there, correctable by dragging (a correction kept and learned from); a shop
with too few trips uses the household's order.

**Accepts when:** fixtures of tick orders give the expected aisle order; a dragged correction is kept and survives further learning.

#### 📋 13.6 — Prices per shop and over time

**Goal:** what something costs where. **Design:** §22.1. **Depends on:** 13.5.

**Technical:** a product's last unit price per shop, from trip lines; the price offered from the shop being shopped; a product's prices over time on
its catalog page, from its lines.

**Accepts when:** the price offered in shopping mode is the shop's own when known, else the last anywhere.

#### 📋 13.7 — Insights

**Goal:** looking back with numbers. **Design:** §22.1. **Depends on:** 13.6, 16.6.

**Technical:** `src/insights/` (pure, over the device's trips and lines): spending by month and by category, most bought products, who shopped how
often, a product's price over time; charts from `@sovereignfs/ui` (16.6), each with a table of the same figures; older trips fetched online for ranges
past 180 days.

**Accepts when:** every figure matches a hand-worked seed, with its chart and table.

#### 📋 13.8 — Push notifications

**Goal:** notices reach a phone. **Design:** §22.1, §14.3. **Depends on:** 12.4.

**Technical:** as Tally's §21.4: `SHOPPER_VAPID_PRIVATE_KEY` in `generate`, the public key derived; `push_subscription` per device; the Push channel
in `notice_pref`; sent by a job with claims; on iPhone only once added to the home screen, which Settings says.

**Accepts when:** a notice reaches a subscribed browser once; unsubscribing stops it; deletion removes the subscriptions.

#### 📋 13.9 — Release 0.2.0

**Goal:** phase 2 published. **Depends on:** 13.1–13.8.

**Technical:** a security review of what phase 2 added (`docs/security/0.2.0.md`); the release as 12.4; hosting updated as 12.5.

**Accepts when:** `ghcr.io/sovereignfs/shopper:0.2.0` is published and hosted.
