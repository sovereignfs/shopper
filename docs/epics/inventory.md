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
- **Step 4, done: encrypted mode.** A group that has moved to device encryption (which every account made in a browser is) now takes Inventory, and the household's move carries it, **in the same
  change** (taking encrypted Inventory while the move skipped it would have left a moved group with sealed rows and its content lost). **Keys:** `deriveInventoryKeyring(group, household)` (HKDF,
  `shopper:inventory-key:v1`, the group's id), from the group's own keyring alone (`EncryptionMemory.inventoryKeyring`, never from a copy of a list's keys that a link gave), so no link carries it and
  no list's keys open it (a test derives it apart from the code, with the label, and shows `deriveListKeyring(group, household)` opening nothing of it). **Values** are
  `e2.<epoch>.<household>.<row>.<ciphertext>`: the group in the place of a list, the table in the document id. **Name key:** `deviceInventoryNameKey` is `listNameKey` over the Inventory keys with
  the group's id, so a product's key of the same name differs; the device makes it with every make and every name, **`null` too** (an override given back to the starter's name has the starter
  entry's), and the validator asks for it exactly then (`derive` never runs in an encrypted group, so the server takes it as sent: a name key with no name, or a name with no key, is not taken).
  **On the server:** `checkBoundToList` has an explicit rule for `inventory_item` (the slot is the group; a value for a list, for another group, or an Inventory value put into an item is refused as not
  found), `checkNamed` keeps a row of the person's own named (what `derive` did in a group the server seals), the owner-only rule is unchanged, and the pull already carried the ciphertext. **The move:**
  the manifest lists the group's Inventory with each row's starter entry; the input has an `inventory_item` array (`default([])`, so a cached shell from before still moves a group with none, and a
  group with some refuses it as incomplete); each row must carry a name key and a value bound to the group and its own row; the real `Mover` seals them. A rotation leaves an encrypted row and
  the name key its device made alone (it has no envelope; a test seeds a sealed row beside them). **Seen to fail when removed:** the binding rule, `checkNamed`, the validator's rule, the move's
  binding, its name-key requirement and its table (server); the Inventory keys' label, the Mover's table, the pull's opening, the name key of a `null` name and the Mover's duplicate check (device).
  **Run on, all green:** `pnpm run verify`; the unit suite on a file database, PostgreSQL 16 and sqld (108 files, 865 tests and 4 skipped each); the browser suite on Chromium and WebKit on a quiet machine
  (292 passed, 6 skipped, none failed, 10.8 minutes), `keys.spec.ts:40` (a new account's group moves through the real route, with the new input) among them. The device tests drive the real `Mover` and the real transport against the server (made before the move, opened on a second device, renamed, given back, two devices folding with the
  note opening through the alias, a guest's device holding none, an entry this version does not have), and the order-of-arrival property holds with ciphertext notes and flags.
  **Decisions to know:** (a) an override of a starter entry this version does not have is refused **on the device** into Couldn't sync with a sentence of its own (the name key cannot be made),
  and the Mover leaves a group alone while a row has one, or two rows come to one name key (a catalog that differs between the server and a cached shell would otherwise fail the move on every
  attempt); (b) a mutation with a ciphertext and no name key is valid in the form a sealed household takes, so the server **holds** it (as it holds any plain-valid mutation) and does not refuse it; a
  device always sends the key; (c) **the move's body is capped at 2 MiB** (`MAX_BODY`), shared with the rest: a group at its limits for products and Inventory together may not fit, and the Mover then
  waits ("later") without saying why, which is an open question for the owner and no worse than it was for products; (d) a person whose own group has a shared list does not move (existing rule,
  §13.7), so their Inventory stays sealed by the server with the rest.
- **Left to do, so 23.3 is not ✅:** (5) **A person's own categories and `list_category`**, in two parts, **settled with the owner on 2026-11-24:** a list's copy says what it copies by a **source key**
  (an HMAC the device makes under the list's keys from the category's id, unique on the list), **not by `category_id`**, which on a shared list would aim at a row of another person's group (DESIGN.md
  §8.3, §20.3, decision 15). **5a, own categories, in two commits.** **Reads and references closed, done:** a pull gives anyone but the group's own account the starter rows by their code's names and nothing of the owner's
  own categories: no row, no name they gave a starter, no ciphertext and no tombstone (it gave every member every category, `1 = 1`), each condition seen to fail when removed, in a group the server seals
  and in one that has moved; an item's and a product's `categoryId` is a `starter_category` (it accepted any live category of the group), so a person's own category is never what a list says, while the
  person's own Inventory may name one. **Writes, to do:** `category` becomes a synced table, written only by the group's own account (make, rename, hide, put in order, delete an own one; a starter
  category renamed, hidden or moved, never deleted, `other` never hidden), its name sealed by the server or, in a moved group, encrypted for the group under the Inventory keys, and carried by the
  household's move in the same commit; a limit, `SHOPPER_LIMIT_HOUSEHOLD_CATEGORIES`; the export, `People.deletePerson` and the device (its screens offer a starter category until the copies exist).
  **5b, `list_category`:** the table with its source key, an item's `categoryId` held to a starter category or
  a copy on its own list, and how a group the server still seals makes a source key (it has no list keys), how the move re-keys one, and an item that changes list. Two devices can make one own category
  twice: §20.3 gives `category` no name key, so nothing folds them.
  (6) **A new name on a list makes an Inventory item, marked once** (a separate mutation to the person's own group, beside the list's), and the property tests over categories. **The data-layer
  tests ran on PostgreSQL and sqld for the first time in this leg** (before, only the `file:` database).
- **Not built, not forgotten:** the importer (epic 12's; there is none yet in this repository), so 23.3's "imported" waits for it. **Step 5's new synced tables enter the household's move in the same
  commit** (a person's own categories and `list_category` are content its device encrypts too): a test holds the manifest to `SYNCED_TABLES`, so a table added without its move fails it. An Inventory
  change whose keys are missing would land in Couldn't sync with the list sentence ("That list is not shared with you any more"); it cannot happen yet (a device that does not hold the group cannot
  make the change, and a locked key holds it), so its own sentence waits for the screen (23.4).

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
