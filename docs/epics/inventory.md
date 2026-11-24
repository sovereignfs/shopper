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

#### ✅ 23.3 — Inventory: the data

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
- **Step 5, done in four commits (5a twice, 5b twice, below): a person's own categories and `list_category`, settled with the owner on 2026-11-24:** a list's copy says what it copies by a **source key**
  (an HMAC the device makes under the list's keys from the category's id, unique on the list), **not by `category_id`**, which on a shared list would aim at a row of another person's group (DESIGN.md
  §8.3, §20.3, decision 15). **5a, own categories, in two commits.** **Reads and references closed, done:** a pull gives anyone but the group's own account the starter rows by their code's names and nothing of the owner's
  own categories: no row, no name they gave a starter, no ciphertext and no tombstone (it gave every member every category, `1 = 1`), each condition seen to fail when removed, in a group the server seals
  and in one that has moved; an item's and a product's `categoryId` is a `starter_category` (it accepted any live category of the group), so a person's own category is never what a list says, while the
  person's own Inventory may name one. **Writes, done:** `category` is a synced table, written only by the group's own account (make, rename, hide, put in order, delete an own one; a starter category renamed, hidden or
  moved or given the code's name again with `null`, never deleted, `other` never hidden; an own one always has a name), its name sealed by the server or, in a moved group, encrypted for the group under
  the Inventory keys (an explicit binding rule in `checkBoundToList`, no name key), with `SHOPPER_LIMIT_HOUSEHOLD_CATEGORIES` (100, counting the group's live categories, hidden and starter included);
  **in the same commit** the household's move answers for the categories that hold content (a name a person gave a starter, and their own: the manifest and the count use one condition, so the
  fourteen untouched starters and a cached shell move as before), the export gives anyone but the owner the starter rows with no content, `People.deletePerson` deletes the own ones and clears the names
  given to starters (the rows stay with the group), and the device has its rows, its actions (`src/actions/categories.ts`), a pull merged through the shadow as the other tables are (it put them
  straight in), the transport's encryption and opening, and `categoriesOf` giving a list's screens the starter ones while `ownerCategoriesOf` gives the Categories tab all. **Seen to fail when
  removed:** the owner-only rule, the starter-delete and Other rules, the name rule, the group binding, the limit; the pull's condition, name, ciphertext and tombstone; the export's two; the
  deletion's two; the shadow merge, the code's name shown at once and the starter-only list screens; the Mover's table, the transport's encryption and its opening. **Run on, all green:** `pnpm run verify`; the unit suite on a file database, PostgreSQL 16 and sqld (110 files, 887 tests and 4 skipped each); the browser suite on Chromium and WebKit on a quiet
  machine (292 passed, 6 skipped, none failed, 10.8 minutes), `keys.spec.ts:40` among them (an earlier run of the code before one Undo fix had the known WebKit locked-key flake, `keys.spec.ts:8`).
  A category's `icon` is plain, as an item's is.
  **5b, a list's copies of categories: designed with the owner on 2026-11-24 (the bullets below), built in two commits: the server and the device's store, then the device's logic.** **Decisions to know, for 5a:** (a) anyone else on a list
  of a group is still given the owner's order, hidden flags and icons for the starter categories (they are the list's aisle order, §8.3), and not their names; (b) two devices can make one own category
  twice, §20.3 gives `category` no name key; (c) the household's move shares its 2 MiB body (`MAX_BODY`) with the rest, so a group at its limits for products and Inventory may not fit and waits without
  saying why; (d) **Docker impact: none**: `SHOPPER_LIMIT_HOUSEHOLD_CATEGORIES` is in `.env.example` and the README, and no `Dockerfile`, `compose.yml`, `deploy/` file or the manifest lists a limit;
  (e) a device's refusal of a category change (over the limit) reads in Couldn't sync with the limit's own sentence, and the row is taken back.
- **5b, a list's copies of categories, designed with the owner on 2026-11-24, built (commit 1 and commit 2 below).** DESIGN.md §8.3 has the rules; decisions 15 (the source key) and 16 (no copies in a group the server still
  seals) are the owner's two answers. **Data:** `list_category` on both dialects, a migration for each, generated: `id`, `household_id`, `list_id`, `source_key`, `sealed` (always empty, kept so that the one
  apply path writes it as it writes the rest), `encrypted` (the name), `icon`, `position`, `deleted_at`, `seq`, `fseq`; unique on (`list_id`, `source_key`) and indexed on (`household_id`, `seq`); no foreign
  key. **Fields of a change:** `listId` and `sourceKey` (the shape of a name key, `n3.`), both set when it is made and refused on a change; `name` (ciphertext bound to the **list**, the table
  `list_category`, the row and the field, under the list's keys, so that the people on the list read it); `icon`; `position` (a fractional key in the group's one aisle order, so that a copy sorts among
  the starter categories); `deletedAt`. **Made** by anyone on the list (`onList`, which refuses a list that is not theirs as not found); **changed and deleted** by the list's Admin (`listAdminOf`). **Refused in
  a group that has not moved**, with a sentence of its own ("Your own categories can be put on this list once its group is encrypted") under `unsupported`. **How it is reached matters:** the device holds a copy plain, as every row (its name as text, and the source key it made), and a mutation for a sealed group would otherwise be
  validated in its form, valid, and run: the refusal is made in `run`, once the sender is known to be on the list and **before the form is compared with the group's**, so that it is a refusal whichever form
  was sent and not a held mutation (which keeps itself, the item in it and everything after it in the outbox); its test asserts the exact status, reason and sentence in both forms. Plain text sent to a
  group that has moved is held, as for any table, for the device to send again encrypted. **The source key** is `listNameKey` of the category's id over the list's keys (a function of `src/keys/household.ts` of its own): stable across epochs, different on every list, never an id.
  **A deleted copy is made again** (owner, decision 17): a make under a source key the list has, deleted or not, folds into it and restores it, and `category_of_list` accepts a deleted copy as a
  deleted product is accepted (the item shows under _Other_, `view.ts`, until it is restored). **The fold:** a copy made under a source key the list already has is folded into that one, as a product is by its name key (the generic fold reads the key's column from the table's spec: `name_key` today,
  `source_key` for this); its alias and tombstone carry the list (`recordFold`'s `listId`), so that only the list's people are told; an item or a product that names the folded copy is repointed
  (`repointRefs`, for this reference too). **What points at it:** a new reference kind, `category_of_list`, for `item.categoryId` and `product.categoryId`: a starter category of the group, or a live copy whose
  `list_id` is the list the row is on **after** the change; and since `checkReferences` looks only at the fields a change names, **a change of an item's list also checks the category the item has**, so
  that an item cannot be moved onto a list with another list's copy (refused with `otherList()`). **The pull** takes copies in the statement (`onList`) and hands the rows with their `encrypted`; the device
  opens the name under the list's keys in `openPull`, as an item's. **The move:** a sealed group has no copy, and the server refuses one, so the manifest gives an empty list for the table (the manifest
  test holds every synced table to it) and the count is none. **Deleted with its list** where a list's rows go (`list-ops.ts`, `members.ts`, `people.ts`) and with its group (`households/tables.ts`); the
  export gives the list's people its ciphertext; `People.deletePerson` leaves a person's copies on lists of others', as the list's, as it leaves what they added. **Limit:** a list holds at most
  `SHOPPER_LIMIT_HOUSEHOLD_CATEGORIES` copies, counted in the statement for the list, with its own sentence (README, `.env.example` and §7.6 say what the setting counts).
  **The device:** an IndexedDB store `list_category` (version 5, indexes `byList` and `byHousehold`) through the shadow merge; `listCategoriesOf(db, list)`, and a list's categories for its screens as the
  group's starter ones and its live copies in aisle order (`listview.ts`); the actions: `putCategoryOnList` (finds the copy by its source key on the device, or makes it in the same mutation as the item's, and
  gives its id), `renameCopies` (for a category renamed in Inventory, over the lists the person is Admin of), and an Admin's rename, move and delete of a copy; an item's change of list says its category again
  (`editItem`'s `carry`, which commit 2 built where this design said `withContent`: it also makes the copy): a starter category as it was, a copy of the person's own category made on the new list first when the person holds that category, and otherwise the starter category its name
  guesses, or _Other_. A device whose group has not moved offers its lists the starter categories alone.
  **What the tests show, each seen to fail when its protection is removed:** a copy is read by the list's people and by no one else; the Member who made it cannot change it and the Admin can; a copy cannot be
  named by an item of another list, by a product of another, or by an item after a move; a copy in a sealed group is refused; two devices that copied one category fold into one copy and the items repoint;
  **no column of any table in the list's group holds an id or a group of the person's own** (a scan of every table, as the move's marker scan); the guest of a moved group, holding only the list's keys, still
  opens the list when the owner has renamed a starter and has categories of their own (the test 5a left); the order of arrival holds for copies; the manifest test.
  **The device's row-to-list lookup** (`listOf`, which the transport asks for the list a change's values are encrypted under) answers for `item` and `product` only, and is written twice in the
  tests; a copy needs it for an Admin's rename (the change carries no `listId`), or the device would refuse the change with the "not shared with you" sentence. It becomes **one exported function**, used by
  the page and by every device test, answering for `list_category` too, with a test that goes through it.
  **Build order, two commits, each green and neither leaving a table anyone else can reach:** (1) the table and its migrations, the server (spec, validation, access, references and the check on a change of
  list, the fold, the pull, deletion, export, limit, the move's empty answer) **and the device's store and merge** (adding the table to `SYNCED_TABLES` forces the row maps, and a fold's tombstone for a copy
  would otherwise find no store and fail the whole pull), checked in real WebKit as the v4 store was, upgrading from v4 to v5, with their tests: safe alone because only a moved group takes a copy and no
  device makes one yet; (2) the device's logic (transport, the lookup, actions, a list's categories, an item's change of list) with the device tests. **Not in 5b:** the screens (23.4), a new product made from
  an Inventory item and a new name making an Inventory item (step 6), a per-shop aisle order (phase 3). **Decided with the owner (decision 17), as recommended:** a deleted copy is made again; only the
  list's Admin changes a copy; an item moved to another list carries a category of the person's own when the mover holds it, and otherwise takes the starter category its name guesses, or _Other_; two people's
  same-named categories are two copies.
- **5b, commit 1, built: `list_category` on the server and in the device's store.** `list_category` on both dialects (`0019_add_list_category`, generated and held to the schema by CI's check), its spec,
  validation (a copy is held plain on the device and its name encrypted at the sync, like every row: the device's own commit validates plain), access (made by anyone on the list, changed and deleted by its
  Admin, its list and source key never changed), the sealed-group refusal in `run` before the form is compared (both forms seen to be refused, with the exact status, reason and sentence), the binding of
  its name to its list, the fold by source key with its alias carrying the list and a deleted copy restored by a make, `category_of_list` for an item's and a product's `categoryId` (a starter category or a
  copy on the row's list after the change, a deleted copy too, and **a change of an item's list also asks about the category it has**), `repointRefs` for it, a limit per list with its own sentence, the pull
  (`onList`), deletion with the list and with the household, the export, the registries, and the move's input (`list_category` defaults to none; the manifest has none, since none can exist); **and the
  device's store and merge**: version 5 with `byList` and `byHousehold` (opened fresh and upgraded from version 4 in real WebKit, keeping its data), `ListCategoryRow`, the pull through the shadow merge, a
  fold's tombstone and alias taken without failing the pull and pointing what names the folded copy, in the rows and in the changes still waiting, at the one that stands, `forgetCatalog` for a list's copies,
  `forgetHousehold`, and `listCategoriesOf`. **Seen to fail when removed:** the Admin rule, the on-the-list rule, the sealed refusal, the binding to the list, the fold, the fold's list, the restore, the
  reference to another list's copy, the check on a move, the per-list limit; the version 5 store, the merge of copies, the repointing in the rows and in the outbox, the deletion with a list and with a
  household. **A scan of every table in the list's group finds no id of the person's own category or group** (a guard rather than a protection seen to fail: the server never receives the id, so
  it cannot fail today; the protection is that no field of a change carries one). **Someone who joins the list later is handed its copies** (`stampList` now stamps them, seen to fail without: the first
  review found it missing, since every test put its people on the list first). **Deleting a person** deletes the copies of a list nobody else is on and leaves those of a list that passes on, a copy
  made by someone else included; the export gives a copy to the people on its list and to no one on another list of the group. **A make that restores a deleted copy, and an Admin's restore, are
  not counted against the per-list limit** (it counts live rows when a copy is made new). **Run on, all green:** `pnpm run verify`; the unit suite on a file database, PostgreSQL 16 and sqld (112 files, 906 tests and 4 skipped each); the browser suite on Chromium and WebKit on a quiet
  machine (292 passed, 6 skipped, none failed, 10.7 minutes), `keys.spec.ts:40` (a new account's group moves through the real route, now with no `list_category` in its input) on both. Commit 2 adds the device's logic (the transport's encryption and opening of a copy, the one
  exported row-to-list lookup, the actions, a list's categories for its screens, an item's change of list) and the guest-with-list-keys test.
- **5b, commit 2, built: the device's logic for a list's copies.** The transport opens a copy's name under the list's keys in `openPull` and encrypts it at the send, from the **one exported row-to-list lookup**
  (`rowListOf`, `src/local/row-list.ts`, used by the page and by every device test, answering for items, products and copies: an Admin's rename of a copy carries no list, and without it the change was refused with
  the sentence for a list the person has left); `src/keys/household.ts` has `copySourceKey`; the actions (`src/actions/list-categories.ts`: `copyOnList`, which finds a list's live copy by its source key or
  makes one, a deleted copy being made again as a new row under the same key; `putCategoryOnList`; an Admin's `renameCopy`, `moveCopy`, `setCopyIcon`, `deleteCopy`; `renameCopies`, one mutation for each group);
  the key helpers (`src/keys/copies.ts`: `sourceKeyOn`, `copiesOfCategory`, which finds the copies of a category on the lists the person is Admin of by making its source key on each, and
  `carryCategoryOnMove`); a list's categories for its screens (`categoriesOfList`: the group's starter categories and the list's live copies in the one aisle order, a deleted copy falling under _Other_);
  `editItem`'s `carry`, so that **an item that moves takes its category with it** (a starter category as it was, a copy of the list it leaves **carried** when the person moving it holds that category, by a copy
  made on the new list in the same change, otherwise the starter category its name guesses), wired into the item panel's list select (`keysOf` gives the keys of both lists; a browser test moves an item through
  it); and **an Undo leaves a copy alone** (as a product, since a Member's delete of it would be refused and would take the item's own Undo with it). **Seen to fail when removed:** the opening of the pull's
  copies, the lookup's answer for a copy, the source key, the carrying, the carried category in the move, the Undo's leaving of a copy, a list's categories, the finding of a live copy only; and **the guest who
  holds only a list's keys** (the test 5a left) opens the list and keeps receiving it when the owner of a moved group has categories of their own and has named a starter, which fails if the pull gives them every
  category or the ciphertext of a name, since the whole page would be dropped. **The other places a category could cross lists, found by the review and closed:** adding from a suggestion whose product is another list's takes that product's category only if it is one of this list's
  (`planAdd`), else the guess; the product a move makes names the category carried for it, not the old list's copy (`carryCategoryOnMove` carries the item's and the product's, sharing one copy); a refused
  change moved to another list leaves the copies behind, the one it made and any it names, and what named them falls under _Other_ (`remake`; no key is read there, so none is carried); and a copy whose make
  still waits, renamed before either is sent, is found by the lookup from the row the device holds (its list never changes). Each is tested with a copy as the category and seen to fail without its fix.
  **Run on, all green:** `pnpm run verify`; the unit suite on a file database, PostgreSQL 16 and sqld (115 files, 920 tests and 4 skipped each; the first sqld run hit 60-second `beforeAll` timeouts in unrelated
  files on a loaded machine, and passed whole on a fresh container); the browser suite on Chromium and WebKit (293 passed, 6 skipped, 11.2 minutes), the new test that moves an item through the panel and `keys.spec.ts:40`
  on both, and the one failure the known WebKit flake of the locked key (`keys.spec.ts:8`).
- **Step 6, done: a new name makes an Inventory item, and the property tests over categories.** `planAdd` (`src/lists/adding.ts`) now returns, beside the list's mutation, **a separate mutation to the
  reader's own group** (`Planned.also`) that makes an Inventory item, **marked once**, for a name the reader's Inventory does not have: a typed name (not a starter entry's, which the starter layer has) or a
  name taken from another list's product, which brings that product's icon, unit and quantity. "Has" is `inventoryHas` (`src/catalog/inventory.ts`): by canonical name (capitals, spaces and a starter's plural
  do not make a second), an item of their own, a starter entry by its name or an alias, a renamed one, a hidden one; a deleted row is not there (the server folds the make into it and restores it). The own group
  is the one in the device's household store with `own`, whichever group the list is in (`inventoryContextOf`): Grace typing on Ada's list makes the item in Grace's group and none in Ada's, encrypted,
  with no plain text at the server. The add field commits it after the list's and says nothing (a refusal, as for a full Inventory, reads in Couldn't sync as "Added X to Inventory"); the often-bought
  chips add an existing product and make none. **Seen to fail when removed:** the has-check, the own group, the mark, the alias, the deleted row; a browser test types a name and checks the item, once, and
  none for a starter's name. **The readable export** (`src/portability/readable.ts`) now opens a person's own Inventory and categories under the group's Inventory keys (they are bound to the group in the place of a list, and it tried a list's keys, so
  every such value counted as `unopened` and came out `null`: found when this step made the first Inventory item from the browser, by the export test, and tested with the Inventory, a category and a list's copy). **The property tests over categories** (`src/sync/categories.property.test.ts`, with two cases a random run seldom reaches said outright): whatever order of changes the owner and
  a Member of each list send, naming nothing, a starter category, a copy of either list, a deleted copy or the owner's own, **every item and product names a starter category or a copy on its own list**, and
  **every reader is given the category of every item and product they are given, and none of the owner's own categories but the owner**; seen to fail without the reference rule, the own-list rule, the
  check on a move, the pull's category condition and its copy condition. The order-of-arrival properties for categories and copies are in their own tests (5a, 5b). **Run on, all green:** `pnpm run verify`;
  the unit suite on a file database, PostgreSQL 16 and sqld (116 files, 929 tests and 4 skipped each); the browser suite on Chromium and WebKit (296 passed, 6 skipped, none failed, 10.7 minutes), the new test of a typed
  name, the export test (which found the readable export's gap), the item-move test and `keys.spec.ts:40` among them, on both.
- **Done as (23.3, 0.7.0, 2026-11-24): every "Accepts when" holds.** A person on a shared list reads the name of a category its items use (a copy under the list's keys) and of no other of the owner's; a
  starter entry renamed shows the new name and keeps the entry's key; a hidden entry is offered nowhere; a person on one of the group's lists pulls no `inventory_item` (seen to fail with the condition
  removed); the property tests hold with Inventory rows and with categories. **What was left out:** the import, since there is no importer in this repository yet (epic 12's: it takes `inventory_item` and a
  person's own categories when it is built, and the export already holds them); the screens (23.4); Inventory in suggestions, **with §8.8's "a list's new product is made from the adding person's
  Inventory item", which nothing builds yet and 23.5 does** (a new product still takes the starter's or the guess's category, icon and unit); and the points for the owner below. **For the owner:** an add
  undone from its toast leaves the item it made in Inventory (a typo stays there until it is tidied or deleted); a deleted item comes back when its name is added again (the server folds the make into it);
  one new name is two changes where a count is shown ("2 changes could not be sent"), the list's and Inventory's; and a renamed starter entry still counts as having its old name.
- **Not built, not forgotten:** the importer (epic 12's; there is none yet in this repository), so 23.3's "imported" waits for it. **Step 5's new synced tables enter the household's move in the same
  commit** (a person's own categories and `list_category` are content its device encrypts too): a test holds the manifest to `SYNCED_TABLES`, so a table added without its move fails it. An Inventory
  change whose keys are missing would land in Couldn't sync with the list sentence ("That list is not shared with you any more"); it cannot happen yet (a device that does not hold the group cannot
  make the change, and a locked key holds it); its own sentence ("Your Inventory could not be opened on this device…", for a change to Inventory or a category, and not the list's) is added with the screen (23.4).

#### 🚧 23.4 — Inventory: the screen

**Goal:** `/inventory`. **Design:** RFC 0006, "The screen". **Depends on:** 23.3, 22.6, 22.11.

**Technical:** the person's items and the starter's, searchable, grouped by category, filtered by recurring or once and by mine, starter or hidden; an
item in the right column (name, category, icon, unit, quantity, note, recurring, hide or restore, _Add to a list_); _+ Add item_; the Categories tab
(4.7's aisle order by `DragHandleRow`). Linked from the sidebar and from Home. Replaces 8.6.

**Accepts when:** an item made, changed, hidden and restored offline reaches a second device of the same person; _Add to a list_ adds it with its
category, icon and unit; a keyboard reaches everything.

**Built in three parts, each its own commit.** **1 (done):** the route, the read model and the Items tab with an entry beside it. `src/inventory/screen.ts` is the view (pure:
search by name, old starter name and alias; filters; sections in the aisle order, an entry whose category is hidden or deleted under _Other_), `src/local/inventory-view.ts` reads the
device, `src/screens/InventoryScreen.tsx` and `InventoryPanel.tsx` draw it, and `Beside.tsx` places a panel in the right column (the whole page on a phone). The entry is `?entry=<key>`
(`starter:<key>`, `own:<id>` or `new`), an address that names nothing closes itself **after asking the device again** (the screen's copy of what the device holds is read a moment
after a write, and an item just made would otherwise close its own panel). A field is written as it is left; **writes to one entry are made one after another, each from the row the
device holds when its turn comes**, so that two quick changes to an untouched starter entry (recurring, then hide) make one override row and not two, which the fold would keep
the first of. A rename onto a name Inventory has is refused in the panel (checked in the same line, from the device as it is then), a delete is in that line too, so that a field left as the delete is pressed cannot land after it and make the row again, and clearing what the starter fills in (a unit, a quantity) is the starter's value again and makes no row of its own. and _+ Add item_ with a name it has opens that entry. The sidebar's first block and Home link to it, the shell
answers `/inventory` offline, and `src/access/routes.ts` lists the page. **2 (done):** _Add to a list_ (`planAddFromInventory`, pure, in `src/lists/adding.ts`; `categoryOnList` in `src/keys/copies.ts`): the item goes on a list the person is on, one more when the list has it open, else a product made from the item's own fields (name, quantity, unit, icon) with its category as it is on that list: a starter category is that list's group's row (never the id of the person's group), one of their own is the list's copy, made in the same mutation and **first**, and where there can be none (a group the server still seals, keys not open), a hidden or deleted category or none at all, the guess. **What the person set in Inventory wins** over what a product of that name on the list remembers (the owner's decision: the commonest item has such a product, since a name typed on a list makes both): the item takes Inventory's category, icon, unit and quantity and the product is left as it is, while what Inventory has no value for (an empty field, a category it had only the guess for) is the product's, and one more of what is open is still one more. The Inventory note is not carried. It runs in the panel's line of writes and reads the item and the list when its turn comes. Proved on the real server as a Member on another person's list, with controls (the item's own category id used as it is, and the copy last, are each refused). The browser cannot make a category of the person's own until 3, so its end-to-end test is there. **3:** the Categories tab.

#### 📋 23.5 — Inventory in suggestions

**Goal:** what a person has made their own comes first when they add. **Design:** RFC 0006, "Suggestions". **Depends on:** 23.3.

**Technical:** `src/catalog/suggest.ts` with Inventory as its first source, then the list's products, then the person's other lists'; hidden starter
entries excluded; recurring items not on the list first in _Often bought_; a list's new product made from the Inventory item; "Remember for next time"
offering to update the Inventory item.

**Accepts when:** a renamed starter entry is suggested by its new name and not its old; a recurring item missing from a list is offered first with an
empty field; the suggestion tests and property tests pass.
