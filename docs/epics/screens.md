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

**Done as:** **Sidebar:** `src/screens/ListsNav.tsx` draws, from the device (`src/local/places.ts`, `placesOf`), each household the person is in, their own first and called "My lists" (`householdLabel`), with its lists in order, each with **how many items are open** and a small clock where the server has not answered for the list yet (`seq` 0), then _New list_. Every list is a link to `/l/<id>`, so the keyboard and a pointer take the same way, and the one open is marked `aria-current`. **New list** puts a field where the button was; Enter makes the list at once on the device (`makeList`, positioned after every list of the household, archived too) and opens it, Escape or an empty name puts the button back. Archived lists are behind an _Archived (n)_ toggle in each section. The sidebar is full or a rail (a letter for each list and a plus; the plus widens it, since a name cannot be typed in a rail), remembered on the device as before; the phone's drawer holds the same and closes when a list is chosen; the page the service worker keeps has no working copy and draws none (`useLocalOptional`). **Pages:** `/l/<id>` (`app/(app)/l/[id]/page.tsx`, in `src/access/routes.ts`) holds nothing of the list and `ListScreen` reads it from the device: its name for now (8.2 fills it), "That list is not here" once the device has synced and does not have it (which is also what a list of another household reads as), nothing before; an address that is not an id is the page that is not there. `/` showed the lists as plain links until 8.2, which opens the last list there. Also fixed: `src/zod-jitless.ts`. Zod probes `new Function` to decide whether to compile its schemas, which the page's policy forbids, so every page that loaded the validators raised a `script-src eval` violation; they are imported first in `src/actions/{format,validate}.ts` and `src/sync/protocol.ts`, and `recordViolations` moved to `e2e/helpers.ts` so that the new tests check for it. 5 tests of `placesOf` on the device on all three databases (own household first, two households, counts that move as items are added, ticked, undone and synced, the clock mark, archived lists and the next position) and 6 browser tests in Chromium and WebKit (`e2e/lists.spec.ts`: the sidebar from the device with no violation, a list made and opened and marked, Escape and an empty name, the keyboard and a missing list, the sidebar with the network cut, and a phone's drawer). Left out: _Add item_ (8.3, since there is no add field to take it to); All lists, Trips, Catalog, the household dots and gears and _New household_, which join with their tasks; a way back to core in the avatar menu (2.3, when a core is set); `/l/<id>` and the front page opened with no network, which 6.5 has since made work; the clock mark is a few lines in `ListsNav` and not yet a component, because lists are the only thing it marks until items are shown (8.2).

#### ✅ 8.2 — A list

**Goal:** the daily screen. **Design:** §16.5, §9.5, §9.6. **Depends on:** 8.1, 5.5.

**Technical:** `/l/<id>`: header with **Shop** and **Share** (8.7), the menu (Clear bought, view by aisle or added, list settings); the add field's
place (8.3); open items by category in aisle order with `CheckableListRow` (icon, name, quantity and unit, note's first line, "added by" when the
household has more than one member), whole-row tick, a pencil to edit; drag to reorder within a category with `DragHandleRow` and the keyboard;
Bought (n) collapsed with who ticked, and Clear bought; undo toasts; the empty state with often-bought chips; `/l/<id>/settings` (name, archive,
delete; the clearing rule and moving come with 7.2 and 3.6); the last list recorded on the device and in `account_settings`.

**Accepts when:** a list is used end to end offline; ticking and editing are separate targets; drag-and-drop and its keyboard way reorder and sync;

**Done as:** **The page:** `ListScreen` (`src/screens/ListScreen.tsx`) reads the list from the device (`listViewOf`, `src/local/listview.ts`) and writes to it through the actions, so it works with no network and a change shows at once. **Open items** are grouped by category in the household's aisle order, by position within a category, and under _Other_ when the category is gone or hidden (`src/lists/view.ts`, pure and tested: `groupByAisle`, `boughtItems`, and the order added as the other view, kept by `?view=added` and remembered on the device). Each row is a `CheckableListRow` (quantity and unit, the note's first line, "added by" only when the household has more than one member) whose whole row ticks, with the pencil a separate target. **Reordering** is a drag within a category with `DragHandleRow`, or the keyboard (Space to lift, arrows, Space to drop, Escape to let go); it writes **one row**, the position key between the two neighbours (`src/ui/dnd.ts` holds the sensors, auto-scroll and the click that ends a drag, for the catalog to share). **Bought (n)** is collapsed under the open items with who ticked each and _Clear bought_. Tick, untick and clear offer **Undo** for five seconds (`src/screens/Undo.tsx`, a provider in `app/(app)/layout.tsx`). The empty state offers **often-bought products** from the catalog, one tap putting one back. The header menu has _Clear bought_, the view, and _List settings_. **Settings:** `/l/<id>/settings` (`ListSettings.tsx`, in `src/access/routes.ts`): rename, archive and restore (synced changes, so offline) and delete for good, which is an Admin's online operation (`/api/ops`, through `src/local/ops.ts`), offered only for an archived list and saying why when refused. **The front address** `/` now draws the list used last (`landingListOf`: the remembered list if it is still there and not archived, else the first list of the person's own household, else the first of any), and the page of links is gone. 9 browser tests in `e2e/list.spec.ts` (aisle order and counts; tick, Undo, untick, reload and the server; Clear bought with Undo; a list used with the network cut and everything arriving when it is back; the order added by address and remembered; reordering by keyboard writing one row; the empty state; settings; a phone's width), the sidebar test changed for `/`, and unit tests of the view on the device. Left out: **the last list in `account_settings`** (it is kept on the device only, so a new device starts at the first list; the table and its migrations, with `deletePerson` and export, come with the task that first needs the server to know a person's choices); **Shop** and **Share** in the header (7.3, 8.7), **the add field's place** (8.3) and the item's dialog behind the pencil (8.4), each of which joins with its task; the clearing rule and moving a list (7.2, 3.6). Chromium was run here against a browser already installed; WebKit is left to CI.
the empty state offers often-bought products.

**Changed afterwards (the owner's request):** on a list **only the checkbox ticks**, and a tap anywhere else on a row does nothing; the row is a checkbox, the icon and name, what is said of the item, and the pencil, not `CheckableListRow`. Shopping mode (7.3) keeps the whole row as its target. A focused checkbox is ticked by Space, as any checkbox is (Enter no longer ticks). Tested in `e2e/list.spec.ts` (a tap on the name, the quantity and the empty space does nothing; the box and the keyboard tick; a bought item is unticked by its box alone; seen to fail against the old behaviour) and `e2e/shop.spec.ts` (a tap on a name in shopping mode still ticks).

#### ✅ 8.3 — Adding

**Goal:** the add field. **Design:** §16.6, §8.5. **Depends on:** 8.2, 4.4.

**Technical:** `SuggestionInput` fed by `suggest.ts` (and `parse.ts` once 4.5 is in): icon, name, quantity and unit per suggestion, "On the list · n"
with _+1_, "Add _text_" last; Enter takes the first; the field stays focused and empty after adding; often-bought chips with nothing typed. A gap in
`SuggestionInput` for any of this is raised in `sovereign` (epic 16), not patched here.

**Accepts when:** a list of ten items is typed with the keyboard alone; an open product is bumped, not duplicated.

**Done as:** **The field:** `AddField` (`src/screens/AddField.tsx`) sits at the top of every list that is not archived, on the design system's `SuggestionInput`. Typing suggests from `suggest` on the device, each option with its icon, name and its quantity and unit, or "On the list · n" where the product is already open; "Add _text_" is always last (the field's own create row), Enter takes the first, the arrows move, a tap adds. After an add the field is empty and focused. **What an add does** is one pure function, `planAdd` (`src/lists/adding.ts`), which the often-bought chips of the empty state use too: a product open on the list is **bumped** (`addToOpen`) and never doubled, with a sentence when the count is full; a product the household has is added with what it remembers; a starter entry or new text makes the product and the item in one mutation, with the entry's icon, unit and quantity and a category from the entry, else `guessCategory`, else _Other_, resolved to the household's own category so a renamed or reordered aisle is respected. Typed text is found by its **canonical name**, so _OAT MILK_ over _Oat milk_ is the same product and is bumped. **Adds are queued** and each is planned from a fresh read of the device when its turn comes (`listViewOf`): typed fast, a second add was otherwise planned from the list as it was drawn before the first was written. Tests: `src/lists/adding.test.ts` (7: the product's own defaults, the bump, a typed name over an existing one, a starter entry in the household's category, a guess and _Other_, the position after the last of its category, nothing for blanks and a full count, the text beside a suggestion) and `e2e/add.spec.ts` in Chromium (ten items typed with the keyboard alone with the field focused and empty after each; an open product bumped and so said while typing; adding with the network cut and everything reaching the server). Left out: **a quantity typed with the name** ("2 oat milk"), which is 4.5; **the field in shopping mode** (7.3); **the phone's placement** beside the footer (8.8) and the floating Add (8.11); the sidebar's _Add item_ (8.1 left it for here) is not yet made, since the field is always on the list and a list picker for it has no screen to open from. A gap in `SuggestionInput`, to be raised in `sovereign` (epic 16) and not patched here: it opens its suggestions only when the input gains focus, and closes them after a choice, so typing again in the same input shows none and Enter does nothing; `AddField` works round it by giving the field a new key after each add and focusing it in an effect, which should go when the component keeps itself open. WebKit was not run here (its browser is not installed).

#### ✅ 8.4 — An item

**Goal:** the item's dialog. **Design:** §16.7, §9.4. **Depends on:** 8.2.

**Technical:** `Dialog` at `?item=<id>`: name, `QuantityStepper` with the unit `Select`, category, `IconPicker`, note, list (within the household),
"Remember for next time", Save, Delete as a quiet text action, and its history (added by, bought by) at the foot. No price: 8.10 adds it.

**Accepts when:** every field saves offline and syncs; "Remember for next time" changes the next add; the dialog is full-screen on a phone and

**Done as:** **The dialog:** `ItemDialog` (`src/screens/ItemDialog.tsx`), a `Dialog` at `?item=<id>` (full-screen on a phone as the design system adapts it), opened by a **pencil on every row** that is a target of its own beside the whole-row tick (`Edit <name>`, in `Row`); Escape, Cancel and a scrim click close it, and an `?item=` naming an item that is not on the list (deleted, or another list's) closes itself. The address is changed with the browser's own history and not the router, which would ask the server for the page again: the dialog opens with no network, and a reload, Back and a link agree. **Fields:** name; quantity with `QuantityStepper` (its step is the unit's, `stepFor`: one for a counted unit, the product's last quantity for a measured one) and the unit `Select` over the fixed list; category (`Select` over the household's, hidden ones left out unless it is the item's own); `IconPicker` over the grocery set; note; the **list** `Select` within the household (shown when it has more than one list); **Remember for next time** (on) as a `Toggle`; **Save** sends only the fields that differ (`editItem`), and with Remember the product learns category, icon and unit in the same mutation; **Delete** is a quiet text action that deletes at once with Undo; the foot says who added it and when, and, if bought, who and when. The stepper counts in numbers, but the quantity is kept in exact decimals: only the direction is taken from it and the step is added or subtracted with `addQuantity`/`subtractQuantity`. `listViewOf` now also returns the household's lists. Tests: `listview.test.ts` (the lists) and 6 browser tests in Chromium (`e2e/item.spec.ts`: the pencil opens the address and does not tick, every field saves and the server has it; saving with the network cut and the server having it when it is back; Remember for next time making the next add come in the right category and unit; Delete with Undo; an address naming nothing, and Escape; a phone's width, full-screen with Enter saving). Left out: **the price** (8.10); **the item's history of trips** (7.1, there are no trips yet); moving an item to a list of **another household** (3.6); the list `Select` shows only the household's own lists. WebKit was not run here (its browser is not installed).
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

#### ✅ 8.7 — Sharing: who is on your lists

**Goal:** the dialog for sharing. **Design:** §16.9 (0.1.0), §7.3. **Depends on:** 8.1, 3.4, 3.5.

**Technical:** a `Dialog` at `?share=1`, opened by **Share** on a list and from the household's section in the sidebar: the people in the household
(`Avatar` and name, the Admin marked; an Admin also sees emails, by the one visibility function of 3.1); **Invite** makes a link (3.4) shown once
with `CopyButton` and a sentence that anyone holding it can join and that it expires in 14 days; live invitations listed with who made them and
**Revoke** (a link is stored only as a hash, so it cannot be shown again: making a new one is how to share again); a Member's **Leave**; the Admin's **Remove** behind a confirmation; the
sentence "People you share with see and edit every list here" at the top, so nobody is surprised that sharing is not per list. Online operations say
so offline and change nothing.

**Accepts when:** journey 3 of §3 passes through this dialog; a Member sees no Remove or Revoke of others'; offline, the dialog shows what it held
and changes nothing; the sentence is there.

**Done as:** **The dialog:** `ShareDialog` (`src/screens/ShareDialog.tsx`), a `Dialog` at `?share=1` (the address is changed with the browser's own history, as the item's: `useQueryParam` in `ItemEditor.tsx` now serves both), opened by **Share** in a list's header and by **Share** under each household in the sidebar (which opens that household's first list with `?share=1`). It says first "People you share with see and edit every list here." **People** are read from the device (`members` in the list view: those still in, in the order they joined): an avatar and name, "(you)", the Admin marked, and an address only where the device was given it (which the server gives to an Admin for the members, and to anyone for their own). So offline the dialog shows what the device held. **Invite** ("Make a link", `invite.create`) shows the address once in a read-only field with `CopyButton`, the note that anyone holding it can join and the day it expires, and that it is shown once. **Links waiting** (`invite.list`, new, any member's: who made each, when it expires, whether the reader may revoke it; never a link) with **Revoke** where allowed. A Member has **Leave** and the Admin **Remove** (not for themselves or an Admin), each behind a `ConfirmDialog` that says what stays; leaving starts over from the front address, removing syncs so that the list updates. **Every change is an online operation**: with no network the dialog says so in a sentence and changes nothing (`callOperation` now returns an operation's result). Tests: `invitations.test.ts` (`invite.list` as a member and as an outsider, no token in the answer) and 6 browser tests in Chromium (`e2e/share.spec.ts`: the sentence, the people with the Admin's address, a link shown once with its terms, the Admin with no Leave; a second person joining through the link and the Admin seeing them with their address; a Member seeing no Remove for another Member, no address of the Admin's and no Revoke of the Admin's link, and leaving; the Admin removing after a confirmation that can be cancelled, and the Member's device dropping the household; revoking and the link then being the page that does not work; the network cut, showing the people and refusing to make a link with a sentence; the sidebar's Share). The test that a Member is not offered Remove was seen to fail with the Admin gate removed (it first passed without it, since the only other person was the Admin, so it now has a third person). Left out: **the household's name or settings page** (3.8, 8.9); **resend**, **email** and **notices** (3.10, 9.2); **the Admin passing the role** (3.9). WebKit, PostgreSQL and sqld were not run here. In the last full run `e2e/invite.spec.ts` failed once after about 15 s, and passed five runs in a row afterwards: the same kind of intermittent 15-second wait as `e2e/offline.spec.ts` (3.5), cause not found.

#### ✅ 8.8 — The phone

**Goal:** the same app on a phone. **Design:** §16.11. **Depends on:** 8.3.

**Technical:** `MobileFooter` (Lists left of the launcher, Settings right); full-width lists with a back link to Lists; dialogs full-screen; touch
targets as the design system requires; long-press on a row to edit; the add field at the top of a list, always, since the floating Add is 8.11.

**Accepts when:** every journey of §3 that 0.1.0 holds and that does not need an instance passes in Playwright at a phone's width.

**Done as:** **The footer:** `PhoneFooter` (`src/screens/PhoneFooter.tsx`), the design system's `MobileFooter` in `AppShell`'s `footer` slot through `ResponsiveSurface`, so that a wide screen mounts none: **Lists** (opens the navigation drawer, the same places by the same addresses) left of the launcher and **Settings** (a link, marked when it is the page) right. The launcher is the design system's, whose name an app cannot change; here it is a plus that opens a sheet ("What to add") with one tile, _New list_, which opens the drawer where lists are made. **The list on a phone:** a **Lists** button before the title (the same drawer), the add field first on the page, a **long press on a row** opens the item as the pencil does (`useLongPress`, a tap still ticks), and the pencil is 44 px under a coarse pointer. The item's dialog is full-screen from the design system (8.4). No route, address or data depends on width (`src/ui/no-fork.test.ts` still holds, since the footer and the back button are drawn by `ResponsiveSurface` and decide nothing). Tests: `e2e/phone.spec.ts` in Chromium at 375 px (the footer's Lists, launcher and Settings with the page marked; a list used end to end, the add field above the items, a tick, a long press that opens the item, the pencil's size, the dialog the whole width, nothing scrolling sideways; and a wide screen with no footer); the long-press test was seen to fail with the long press switched off. Left out: **a guess at what the launcher should offer**, for the owner to decide: 0.1.0's design names only Lists and Settings beside it, so it carries _New list_ until _Add_ (8.11) replaces it with the floating button; **the iOS Simulator and WebKit**, which check touch that this desktop engine does not; the footer's clearance of the safe areas is the design system's and was not measured on a device.

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
