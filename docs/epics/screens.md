# Epic 8: Screens

## Status

📋 Planned.

## Overview

The interface of `DESIGN.md` §16, reading and writing the device's store (epic 6), so that every screen here works offline unless the design says it
needs the server. One responsive tree: the same routes and decisions at every width, only rendering forked. Shopping mode and the trips history are in
epic 7.

**0.1.0's screens** are the shell, a list, adding, an item, the phone, and the dialog for sharing. **Phase 2 adds** all lists, the catalog, household
settings, prices on items and the phone's Add button. 0.1.0 needs nothing built in `@sovereignfs/ui` first.

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §9.7, §16, §17, §23

## Tasks

#### ✅ 8.1 — The shell and its places

**Goal:** the sidebar filled, the header live. **Design:** §16.2, §16.3. **Depends on:** 6.2, 3.3.

**Technical:** the sidebar from the device's store: _Add item_ (the current list, or a list picker); a section for each household the person is in,
the first (their own, "My lists") on top, each with its lists and open counts and _New list_; archived lists behind each section's menu; the avatar
menu (name and email, Settings, Sign out, a way back to core when one is set) with Couldn't sync's mark; the clock mark component for unsynced rows;
full or a rail, remembered on the device. All lists, Trips and Catalog, the household dots and gears and _New household_ join with the tasks that
build them (8.5, 7.5, 8.6, 8.9, 3.8).

**Accepts when:** a person in two households with five lists moves between them by keyboard and pointer; counts update as items are ticked; the shell
renders from the device with the network off.

**Done as:** **Sidebar:** `src/screens/ListsNav.tsx` draws, from the device (`src/local/places.ts`, `placesOf`), each household the person is in, their own first and called "My lists" (`householdLabel`), with its lists in order, each with **how many items are open** and a small clock where the server has not answered for the list yet (`seq` 0), then _New list_. Every list is a link to `/l/<id>`, so the keyboard and a pointer take the same way, and the one open is marked `aria-current`. **New list** puts a field where the button was; Enter makes the list at once on the device (`makeList`, positioned after every list of the household, archived too) and opens it, Escape or an empty name puts the button back. Archived lists are behind an _Archived (n)_ toggle in each section. The sidebar is full or a rail (a letter for each list and a plus; the plus widens it, since a name cannot be typed in a rail), remembered on the device as before; the phone's drawer holds the same and closes when a list is chosen; the page the service worker keeps has no working copy and draws none (`useLocalOptional`). **Pages:** `/l/<id>` (`app/(app)/l/[id]/page.tsx`, in `src/access/routes.ts`) holds nothing of the list and `ListScreen` reads it from the device: its name for now (8.2 fills it), "That list is not here" once the device has synced and does not have it (which is also what a list of another household reads as), nothing before; an address that is not an id is the page that is not there. `/` shows the lists as plain links, which is where a phone starts, until 8.2 opens the last list. Also fixed: `src/zod-jitless.ts`. Zod probes `new Function` to decide whether to compile its schemas, which the page's policy forbids, so every page that loaded the validators raised a `script-src eval` violation; they are imported first in `src/actions/{format,validate}.ts` and `src/sync/protocol.ts`, and `recordViolations` moved to `e2e/helpers.ts` so that the new tests check for it. 5 tests of `placesOf` on the device on all three databases (own household first, two households, counts that move as items are added, ticked, undone and synced, the clock mark, archived lists and the next position) and 6 browser tests in Chromium and WebKit (`e2e/lists.spec.ts`: the sidebar from the device with no violation, a list made and opened and marked, Escape and an empty name, the keyboard and a missing list, the sidebar with the network cut, and a phone's drawer). Left out: _Add item_ (8.3, since there is no add field to take it to); All lists, Trips, Catalog, the household dots and gears and _New household_, which join with their tasks; a way back to core in the avatar menu (2.3, when a core is set); `/l/<id>` and the front page opened with no network, since the worker answers no signed-in address yet (6.5), so the sidebar is shown with the network cut but a list followed with none is not; the clock mark is a few lines in `ListsNav` and not yet a component, because lists are the only thing it marks until items are shown (8.2).

#### 📋 8.2 — A list

**Goal:** the daily screen. **Design:** §16.5, §9.5, §9.6. **Depends on:** 8.1, 5.5.

**Technical:** `/l/<id>`: header with **Shop** and **Share** (8.7), the menu (Clear bought, view by aisle or added, list settings); the add field's
place (8.3); open items by category in aisle order with `CheckableListRow` (icon, name, quantity and unit, note's first line, "added by" when the
household has more than one member), whole-row tick, a pencil to edit; drag to reorder within a category with `DragHandleRow` and the keyboard;
Bought (n) collapsed with who ticked, and Clear bought; undo toasts; the empty state with often-bought chips; `/l/<id>/settings` (name, archive,
delete; the clearing rule and moving come with 7.2 and 3.6); the last list recorded on the device and in `account_settings`.

**Accepts when:** a list is used end to end offline; ticking and editing are separate targets; drag-and-drop and its keyboard way reorder and sync;
the empty state offers often-bought products.

#### 📋 8.3 — Adding

**Goal:** the add field. **Design:** §16.6, §8.5. **Depends on:** 8.2, 4.4.

**Technical:** `SuggestionInput` fed by `suggest.ts` (and `parse.ts` once 4.5 is in): icon, name, quantity and unit per suggestion, "On the list · n"
with _+1_, "Add _text_" last; Enter takes the first; the field stays focused and empty after adding; often-bought chips with nothing typed. A gap in
`SuggestionInput` for any of this is raised in `sovereign` (epic 16), not patched here.

**Accepts when:** a list of ten items is typed with the keyboard alone; an open product is bumped, not duplicated.

#### 📋 8.4 — An item

**Goal:** the item's dialog. **Design:** §16.7, §9.4. **Depends on:** 8.2.

**Technical:** `Dialog` at `?item=<id>`: name, `QuantityStepper` with the unit `Select`, category, `IconPicker`, note, list (within the household),
"Remember for next time", Save, Delete as a quiet text action, and its history (added by, bought by) at the foot. No price: 8.10 adds it.

**Accepts when:** every field saves offline and syncs; "Remember for next time" changes the next add; the dialog is full-screen on a phone and
keyboard-complete.

#### 📋 8.5 — All lists (phase 2)

**Goal:** every open item, everywhere. **Design:** §9.7. **Depends on:** 8.2.

**Technical:** `/all`, grouped by household then category in each household's order, each item tagged with its list; ticking, editing and deleting as
on a list; adding asks which list; "All lists" in the sidebar and on the phone's footer.

**Accepts when:** an item ticked here is ticked on its list; the view works offline.

#### 📋 8.6 — The catalog (phase 2)

**Goal:** tidying what Shopper remembers. **Design:** §16.8. **Depends on:** 8.1, 5.6, 4.7.

**Technical:** `/h/<id>/catalog` with Products (searchable, by category; open one to edit, merge or delete) and Categories (the aisle order with
`DragHandleRow`, rename, icon, hide, add); "Catalog" in the sidebar and on the phone's footer.

**Accepts when:** a product is renamed, merged and deleted from here; reordering categories changes every list's grouping on every device after sync.

#### 📋 8.7 — Sharing: who is on your lists

**Goal:** the dialog for sharing. **Design:** §16.9 (0.1.0), §7.3. **Depends on:** 8.1, 3.4, 3.5.

**Technical:** a `Dialog` at `?share=1`, opened by **Share** on a list and from the household's section in the sidebar: the people in the household
(`Avatar` and name, the Admin marked; an Admin also sees emails, by the one visibility function of 3.1); **Invite** makes a link (3.4) shown once
with `CopyButton` and a sentence that anyone holding it can join and that it expires in 14 days; live invitations listed with who made them and
**Revoke** (a link is stored only as a hash, so it cannot be shown again: making a new one is how to share again); a Member's **Leave**; the Admin's **Remove** behind a confirmation; the
sentence "People you share with see and edit every list here" at the top, so nobody is surprised that sharing is not per list. Online operations say
so offline and change nothing.

**Accepts when:** journey 3 of §3 passes through this dialog; a Member sees no Remove or Revoke of others'; offline, the dialog shows what it held
and changes nothing; the sentence is there.

#### 📋 8.8 — The phone

**Goal:** the same app on a phone. **Design:** §16.11. **Depends on:** 8.3.

**Technical:** `MobileFooter` (Lists left of the launcher, Settings right); full-width lists with a back link to Lists; dialogs full-screen; touch
targets as the design system requires; long-press on a row to edit; the add field at the top of a list, always, since the floating Add is 8.11.

**Accepts when:** every journey of §3 that 0.1.0 holds and that does not need an instance passes in Playwright at a phone's width.

#### 📋 8.9 — Household settings (phase 2)

**Goal:** the household's page, in full. **Design:** §16.9. **Depends on:** 8.7, 3.8, 3.9, 16.3.

**Technical:** `/h/<id>/settings`: name, colour, currency (Admins; currency change explains that amounts are relabelled, not converted); People with
roles and an Admin's menu, `AvatarStack`, Invite (by email too, with 3.10) and live invitations; Shops (rename, delete); Leave; Delete household
behind a confirmation naming what goes; the dialog of 8.7 stays as the quick way in from a list. Online operations say so offline and change nothing.

**Accepts when:** a Member sees no Admin controls; offline, the page shows what it held and changes nothing.

#### 📋 8.10 — Prices in the item and the lists (phase 2)

**Goal:** what things cost, where it is typed. **Design:** §16.7, §10.4. **Depends on:** 7.1, 8.4.

**Technical:** `CurrencyInput` (or `MoneyInput`, if published, 16.7) in the item's dialog with the unit price under it; the price on the list's rows;
the offered price from the product's last unit price (4.9); a price set on a bought item updates its trip line.

**Accepts when:** a price saves offline and syncs; the next add of the product offers the price in its unit and none in another unit.

#### 📋 8.11 — The phone's Add button (phase 2)

**Goal:** Add under the thumb. **Design:** §16.11. **Depends on:** 8.8, 16.5.

**Technical:** the floating action button above `MobileFooter` on a list, opening and focusing the add field; hidden in shopping mode.

**Accepts when:** on a phone's width the button opens the add field with the keyboard up and clears the footer and the safe areas.
