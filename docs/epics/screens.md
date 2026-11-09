# Epic 8: Screens

## Status

📋 Planned.

## Overview

The interface of `DESIGN.md` §16, reading and writing the device's store (epic 6), so that every screen here works offline unless the design says it
needs the server. One responsive tree: the same routes and decisions at every width, only rendering forked. Shopping mode and the trips history are in
epic 7.

## Related

[`DESIGN.md`](../../DESIGN.md) §9.7, §16, §17, §23

## Tasks

#### 📋 8.1 — The shell and its places

**Goal:** the sidebar filled, the header live. **Design:** §16.2, §16.3. **Depends on:** 6.2, 3.3.

**Technical:** the sidebar from the device's store: _Add item_ (the current list, or a list picker), All lists, Trips, Catalog for the household in
view, each household with its dot, gear and lists with open counts, _New list_, the own household last, _New household_ (an online dialog: name,
colour, currency); archived lists behind each household's menu; `/households` for the phone; the avatar menu with Couldn't sync's mark; the clock mark
component for unsynced rows.

**Accepts when:** a person with two households and five lists moves between them by keyboard and pointer; counts update as items are ticked; the shell
renders from the device with the network off.

#### 📋 8.2 — A list

**Goal:** the daily screen. **Design:** §16.5, §9.5, §9.6. **Depends on:** 8.1, 5.5.

**Technical:** `/l/<id>`: header with Shop, the menu (Shop several lists, Clear bought, view by aisle or added, settings); the add field's place
(8.3); open items by category in aisle order with `CheckableListRow` (icon, name, quantity and unit, note's first line, price, "added by" on a shared
household), whole-row tick, a pencil to edit; drag to reorder within a category with `DragHandleRow` and the keyboard; Bought (n) collapsed with who
ticked, and Clear bought; undo toasts; the trip banner; the empty state with often-bought chips; `/l/<id>/settings` (name, clearing rule, move,
archive, delete); the last list recorded on the device and in `account_settings`.

**Accepts when:** a list is used end to end offline; ticking and editing are separate targets; drag-and-drop and its keyboard way reorder and sync;
the empty state offers often-bought products.

#### 📋 8.3 — Adding

**Goal:** the add field. **Design:** §16.6, §8.5. **Depends on:** 8.2, 4.4.

**Technical:** `SuggestionInput` fed by `suggest.ts` and `parse.ts` (once 4.5 is in): icon, name, quantity and unit per suggestion, "On the list · n"
with _+1_, "Add _text_" last; Enter takes the first; the field stays focused and empty after adding; often-bought chips with nothing typed. A gap in
`SuggestionInput` for any of this is raised in `sovereign` (epic 16), not patched here.

**Accepts when:** a list of ten items is typed with the keyboard alone; an open product is bumped, not duplicated; what the parser understood shows
before adding.

#### 📋 8.4 — An item

**Goal:** the item's dialog. **Design:** §16.7, §9.4. **Depends on:** 8.2.

**Technical:** `Dialog` at `?item=<id>`: name, `QuantityStepper` with the unit `Select`, category, `IconPicker`, note, `CurrencyInput` price with the
unit price under it, list (within the household), "Remember for next time", Save, Delete as a quiet text action, and its history (added by, bought by,
trip) at the foot.

**Accepts when:** every field saves offline and syncs; "Remember for next time" changes the next add; the dialog is full-screen on a phone and
keyboard-complete.

#### 📋 8.5 — All lists

**Goal:** every open item, everywhere. **Design:** §9.7. **Depends on:** 8.2.

**Technical:** `/all`, grouped by household then category in each household's order, each item tagged with its list; ticking, editing and deleting as
on a list; adding asks which list.

**Accepts when:** an item ticked here is ticked on its list and in the person's trip for that household; the view works offline.

#### 📋 8.6 — The catalog

**Goal:** tidying what Shopper remembers. **Design:** §16.8. **Depends on:** 8.1, 5.6.

**Technical:** `/h/<id>/catalog` with Products (searchable, by category; open one to edit, merge or delete) and Categories (the aisle order with
`DragHandleRow`, rename, icon, hide, add).

**Accepts when:** a product is renamed, merged and deleted from here; reordering categories changes every list's grouping on every device after sync.

#### 📋 8.7 — Household settings

**Goal:** the household's page. **Design:** §16.9. **Depends on:** 8.1, 3.2.

**Technical:** `/h/<id>/settings`: name, colour, currency (Admins; currency change explains that amounts are relabelled, not converted); People with
roles and an Admin's menu, `AvatarStack` (once 16.3 is in), Invite and live invitations (wired by 3.4); Shops (rename, delete); Leave; Delete
household behind a confirmation naming what goes; the own household without People, Leave or Delete. Online operations say so offline and change
nothing.

**Accepts when:** a Member sees no Admin controls; offline, the page shows what it held and changes nothing.

#### 📋 8.8 — The phone

**Goal:** the same app on a phone. **Design:** §16.11. **Depends on:** 8.3, 16.5.

**Technical:** `MobileFooter` (Lists and All lists left of the launcher, Trips and Catalog right); the floating Add on a list (16.5); full-width lists
with a back link to Lists; dialogs full-screen; touch targets as the design system requires; long-press on a row to edit.

**Accepts when:** every journey of §3 that does not need an instance passes in Playwright at a phone's width.
