# Epic 23: Home and Inventory

## Status

⏳ In Progress. Workstream 0002, before phase 2 (leg 6): the design (23.1) is done and approved by the owner (2026-11-23); Home (23.2) is done (0.7.0, 2026-11-24); Inventory (23.3 to 23.5) is next.

## Overview

[RFC 0006](../rfcs/0006-home-and-inventory.md): `/` opens **Home**, with Continue for the last list, a tile for every list and what can be said at a
glance; **Inventory** is a person's own library of what they buy, shown together with the starter catalog, layered over it, never shared, feeding
suggestions first, and where "what is at home" will live.

## Related

[RFC 0006](../rfcs/0006-home-and-inventory.md) · [workstream 0002](../workstreams/0002-frame-home-cards.md) · `DESIGN.md` §8, §16.4, §16.8, §22.2 ·
[epic 4](catalog.md) (4.7 brought forward) · [epic 8](screens.md) (8.5, 8.6 replaced) · [epic 13](pantry.md) (13.1 to 13.3 re-homed)

## Tasks

#### ✅ 23.1 — The design

**Goal:** `DESIGN.md` says what RFC 0006 builds. **Depends on:** 22.1.

**Technical:** §4 (Home, Inventory; "catalog" as a list's), §8 (Inventory beside a list's catalog; layering; suggestions' sources), §9.7 (All lists as
Home's), §13.1 (`inventory_item`'s name and note, a person's category name), §16.3 (`/inventory`), §16.4 (Home), §16.8 (Inventory as the catalog
screen), §20 (`inventory_item`, `list_category`), §22.2 (the pantry and staples on Inventory); `AGENTS.md`'s words and the one path's list of tables; 8.5, 8.6 and 13.1
to 13.3 pointing here.

**Accepts when:** no document says `/` opens the last list, or that the catalog screen is per list.

**Done as:** `DESIGN.md` says what RFC 0006 builds:

- §2.1 (the landing page, light inventory and recurring items carried as Home and Inventory), §2.3's rows, §3's first journey (Home), §4 (**Home**,
  **Inventory**, the starter catalog and categories, and the words).
- §5.2 (**Inventory is its account's alone**, `ownerOf` in the statement), §7.1 (the group holds it), §7.6 (a limit for it).
- §8.1 (a person's Inventory beside a list's catalog), §8.2 (a list's product made from the Inventory item; tidied from an item's panel), §8.3
  rewritten (a person's own categories, encrypted under keys nobody else holds; `list_category`, a list's copy), §8.5 (Inventory first; a hidden
  entry never offered; recurring items first in the empty field), §8.6 (the starter as a layer), §8.7 (an Inventory item's name key) and a new
  **§8.8 Inventory**.
- §9.7 (All lists as Home's tiles), §12.1 to §12.4 (the store, what syncs, **the pull hands an `inventory_item` to its account alone**, folding),
  §13.1 to §13.3 (what is encrypted and under which keys; the group's Inventory keys, given to nobody; the name key).
- §16.1, §16.3 (`/` is Home, `/inventory`, no `/all` or `/catalog`), §16.4 rewritten as **Home**, §16.8 rewritten as **Inventory**.
- §18.1 (Inventory in the export), §19 (deleted with the person, whatever their group), §20.3 (`inventory_item`, `list_category`, a person's own
  category's name) and the device's store, §22.1 and §22.2 (the pantry, staples and repeating items on Inventory), §25 (four points for the owner's
  review), §26 (two rows).
- `AGENTS.md`: Inventory's rule of access, the one path's tables, the device's store and the words. 8.5, 8.6, 4.7 and 13.1 to 13.3 already pointed
  here.

Beyond the RFC, each settled with the owner at the leg's review (§26): a limit for Inventory; Inventory in a group still sealed by the server; an item on a shared list pointing at
the list's copy of a category; phase 2's view of every open item not built.

#### ✅ 23.2 — Home

**Goal:** `/` opens Home. **Design:** RFC 0006, "Home". **Depends on:** 23.1, 22.3, 22.11.

**Technical:** `src/screens/HomeScreen.tsx` becomes Home: Continue (`landingListOf`), the list tiles (own, shared, archived behind a toggle; icon,
colour, open count, `AvatarStack` when 16.3 is released, initials until), At a glance computed on the device; an invitation's arrival still opens its
list; the title `Home · Shopper`. Replaces 8.5.

**Accepts when:** a signed-in `/` shows Home with Continue on the last list, offline; a new account's Continue is its _Groceries_ with the line; a
person arriving by an invitation lands on its list.

**Done as (0.7.0, 2026-11-24):** `homeOf(db, now)` (`src/local/home.ts`, pure of React, tested with the device) reads Home from what the device holds, and stores nothing: **Continue** is
`landingListOf`'s list (the last used, if it is still there and not archived, else the first) as a tile with its open count, with the new-account line ("Add what you need. To shop with
others, press Share.") while that list has never had an item (`fresh`); a **tile** for every list, the person's own household's under _My lists_ and the others under _Shared with me_
(`HomeTile`: the list, its open count, whether the server has answered for it, whose it is, and who is on it, in the order they joined, when more than one is); **archived** lists behind Home's
own toggle (their tiles say "(archived)" and carry no count); and **_At a glance_** by `glanceOf` (pure, tested on its own): the open items across the lists, those ticked in the last seven
days (cleared ones too), and the three products bought most (the same name on two lists is one, the first spelling kept). `HomeScreen` draws them with the design system's `Card`,
`AvatarStack` (16.3 is in ui 0.107.0, so no initials stand in for it) and `Button`, each tile one link (`::after` stretched over it, so who is on the list is not a second target), and
sets the title `Home · Shopper`. **Someone who has just accepted an invitation** is taken to that list with `router.replace('/l/<id>')`, once the device has it (before, the list was
drawn at `/`). **Found on the way, a leg 5 bug:** a client reads the page the proxy rewrites `/` to, `/home`, and not `/` (Next's docs, "Avoid hydration mismatch with rewrites"), so
the sidebar's Home row was never marked current and the front address was kept as a page and not as `home`; `addressOf` (`src/frame/page-kind.ts`) says it once and the frame uses it.
**Left out:** _What happened_, _Trips and spending_ and _Running low_ (notices 9.2, trips 7.x, the pantry 13.x: the design says when); Home's link to Inventory and Inventory's row in
the sidebar and the footer (23.4). **For `sovereign`:** `AppFrame` draws no `main` landmark, so a page in it has none (a screen-reader user cannot jump to the content); Home's tests find
its content from its heading for that reason. Tests: `home.test.ts` (the read model on the device: nothing before households, Continue and `fresh`, the last list used and an archived one
skipped, counts and the week's, own before shared with whose and who is on it; and `glanceOf` alone), `page-kind.test.ts`, and `e2e/home.spec.ts` in both browsers (a new account's Home,
counts and Continue following the last list, archived behind the toggle, offline, and the phone's footer). The e2e `signUp` helper now goes on from Home to the list (`home: true` stays), as
most specs want the list; `frame.spec.ts`'s remembered-per-kind test is on Home and the list.

#### ⏳ 23.3 — Inventory: the data

**Goal:** a person's own items and their changes to the starter, kept in their group and read by them alone. **Design:** RFC 0006, "The data".
**Depends on:** 23.1.

**Technical:** `inventory_item` on both dialects (`household_id`, `starter_key`, encrypted `name` and `note`, its name key under a key derived from the
group's, `category_id`, `icon`, `unit`, `quantity`, `recurring`, `hidden`), written through `src/actions/` and `src/sync/apply.ts`, folded by name key;
a person's own categories (4.7's adding, renaming and hiding, brought forward; the name encrypted under the group's derived key) and
`list_category`, a list's copy of each it uses (its name under the list's keys, made when an item of it is first put on the list, renamed with it on
the person's own lists); the pull excludes `inventory_item` for anyone but the
group's own account, in the statement; a new name on a list makes an item, marked once; `People.deletePerson`, the export and the import; §13.1's
registry test.

**Accepts when:** a person on a shared list reads the name of a category its items use and of no other of the owner's; a starter entry renamed shows the new name and keeps the entry's key; a hidden entry is offered nowhere; a person on one of the
group's lists pulls no `inventory_item` (seen to fail with the condition removed); the property tests hold with Inventory rows.

**Built so far (0.7.0, 2026-11-24), staged so that no commit holds a table someone else can reach:** this task is more than the table. It is three synced tables (`inventory_item`, a person's
own categories, a list's copies of them), Inventory's own keys, the household's move into encryption, and the pull's exclusion, so it goes in steps, each green on its own.

- **Step 1, done (`e758ac5`):** the generic apply path no longer lets an unruled table through (`checkListAccess` ended in `return undefined`, so a new table was writable by anyone `memberOf`
  let in: it now refuses, with a test seen to fail against the old ending), and the name-key fold's scope is the table spec's (`nameScope`: a list's catalog, or the whole group).
- **Steps 2 and 3, done, plain mode only:** `inventory_item` on both dialects (`0018_add_inventory_item`, generated; one row per name key and one override per starter entry, by unique
  indexes) and `SHOPPER_LIMIT_INVENTORY_ITEMS` (5000; a new setting, in `.env.example` and the README, and no change to the Dockerfile, `compose.yml` or the manifest). **Owner only,
  in the statement** (`ownerOf`): a person on one of the group's lists, and a stranger, are refused as not found for a make, a change and a delete, and the pull hands a row to its group's own
  account alone, **with the tombstones and aliases a fold or a delete leaves**, which are of no list and would otherwise have gone to every member: each condition is seen to fail when removed (rows,
  aliases, tombstones, the owner check on writes, the export's, and the deletion's). The server seals `name` and `note`, makes the name key under a label of its own
  (`shopper:inventory-name-key:v1`, never a product's), folds the same name made twice (and a second override of a starter entry whatever either was renamed to, or the unique index would refuse
  it for good: a poison mutation), restores a deleted row that is made again, never changes a row's starter entry, and counts the limit. **A flag travels as 0 or 1** (DESIGN.md §12.2) and is the
  dialect's boolean in the column. `People.deletePerson` deletes a person's Inventory **whether or not their group stays for a list that passed on**, with what folds of it left; the readable export holds
  their own and none of anyone else's; key rotation recomputes the name key (from the starter entry's name for an override that keeps it). On the device: an IndexedDB store (version 4, nothing reset), the
  pull merge, a fold's re-pointing (what waits in the outbox follows the row that stands), flags as booleans, undo; `src/actions/inventory.ts` (make, override a starter entry, change, hide, restore,
  delete) and `src/catalog/inventory.ts` (the starter catalog layered under the person's rows: a renamed entry keeps its key, a hidden one is offered nowhere, a deleted override shows the starter as it is).
  The property test of the order of arrival holds with Inventory rows, flags included. **Run on all three databases (file, PostgreSQL 16, sqld), each 106 files and 844 tests,** and the browser suite on Chromium (none of its 149 tests failed). **WebKit, on a quiet machine: 141 passed, 6 skipped, 2 failed,** both flakes that are not this change's: `keys.spec.ts:8` (the locked key, known) and `device.spec.ts:286` (resetting the device: apparently a race in
  the test: its poll can pass on the household from before the reset, and the read after it finds it cleared), which failed 3 of 6 runs on this build and 3 of 8 on the commit before it. A first run on
  a machine in swap pressure (load about 80) had failed 93 of WebKit's tests on timeouts and was thrown away. The device store was also opened in real WebKit, fresh at version 4 and upgraded from
  version 3, keeping its data and the booleans.
- **Left to do, so 23.3 is not ✅:** (4) **encrypted mode.** A group that has moved to device encryption (which every account made in a browser is) takes no Inventory yet: apply refuses it as
  unsupported, and the household's move (`src/keys/server/move.ts`) does not carry Inventory. Needs the group's Inventory keys (`shopper:inventory-key:v1`, given to nobody), the device's name key
  under them, values bound to the group in place of a list (`checkBoundToList` an explicit rule, not a bypass), and the move to take a group's Inventory with it. **Until it lands nothing in a browser
  writes Inventory.** (5) **A person's own categories and `list_category`:** categories are still the group's and fixed; the pull gives every member every category (`1 = 1`) and unseals a renamed one with
  the ring, so own categories need their names filtered for non-owners, an item's `categoryId` held to a starter category or a `list_category` of its own list (`checkReferences` accepts any live category of
  the group today), and §20.3's `list_category.category_id` read for whether it points into another person's group (which would break the same-group rule: raise it with the owner, do not code around it).
  (6) **A new name on a list makes an Inventory item, marked once** (a separate mutation to the person's own group, beside the list's), and the property tests over categories. **The data-layer
  tests ran on PostgreSQL and sqld for the first time in this leg** (before, only the `file:` database).
- **Not built, not forgotten:** the importer (epic 12's; there is none yet in this repository), so 23.3's "imported" waits for it, and the household move's Inventory with step 4.

#### 📋 23.4 — Inventory: the screen

**Goal:** `/inventory`. **Design:** RFC 0006, "The screen". **Depends on:** 23.3, 22.6, 22.11.

**Technical:** the person's items and the starter's, searchable, grouped by category, filtered by recurring or once and by mine, starter or hidden; an
item in the right column (name, category, icon, unit, quantity, note, recurring, hide or restore, _Add to a list_); _+ Add item_; the Categories tab
(4.7's aisle order by `DragHandleRow`). Linked from the sidebar and from Home. Replaces 8.6.

**Accepts when:** an item made, changed, hidden and restored offline reaches a second device of the same person; _Add to a list_ adds it with its
category, icon and unit; a keyboard reaches everything.

#### 📋 23.5 — Inventory in suggestions

**Goal:** what a person has made their own comes first when they add. **Design:** RFC 0006, "Suggestions". **Depends on:** 23.3.

**Technical:** `src/catalog/suggest.ts` with Inventory as its first source, then the list's products, then the person's other lists'; hidden starter
entries excluded; recurring items not on the list first in _Often bought_; a list's new product made from the Inventory item; "Remember for next time"
offering to update the Inventory item.

**Accepts when:** a renamed starter entry is suggested by its new name and not its old; a recurring item missing from a list is offered first with an
empty field; the suggestion tests and property tests pass.
