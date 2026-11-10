# Epic 5: Lists and items

## Status

📋 Planned.

## Overview

The one write path for everything a household shops with: an action makes a mutation, the server applies it field by field, folds duplicates, and
stamps it with the household's counter. Then the things it writes: lists, items and products. The shape is Tusk's Desk (field-level changes, ids made
by the device), with Tally's counter per group, here per household (`DESIGN.md` §12.3).

**In 0.1.0 ticking sets the item's own bought fields** and clearing hides it; trips and trip lines (7.1) and editing and merging products (5.6) are
phase 2.

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §8.2, §9, §12.2–§12.5, §20.3 · Tusk's `DESIGN.md` §8.2–§8.4 · Tally's `docs/epics/expenses.md`

## Tasks

#### ✅ 5.1 — Actions and validators

**Goal:** every recorded action as a pure function from intent to a mutation. **Design:** §12.2. **Depends on:** 4.1, 4.2, 4.6.

**Technical:** `src/actions/`: one module per action (add item, edit item fields, tick, untick, delete, restore, move within a list or to another list
of the household, clear bought, make, rename, reorder, archive and restore a list); each takes the rows it needs and the time, and returns a mutation
with device-made UUIDs and only the changed fields; `src/actions/validate.ts`, one module run by the browser before queueing and by the server before
applying (shapes, sizes, decimal quantities, known units, references within the household). The actions of products (5.6), categories (4.7) and trips
(7.1) arrive with their tasks.

**Accepts when:** each action has unit tests; the validators refuse every malformed case in a table; nothing in `src/actions/` imports from the server
or the browser.

**Done as:** `src/actions/`, new and pure. `rows.ts` is the rows as a device holds them (lists, products and items, camelCase, sealed fields in the clear, and `itemState`: open, bought, cleared or deleted); `format.ts` is **the one definition of a mutation** (`Change`, `Mutation`, `FIELDS`: for each synced table the fields it has, each with its shape, and which a create needs; a field not named is refused, so a device cannot send what only the server sets, such as a product's name key or how often it was bought; categories have no entry in 0.1.0); `position.ts` (fractional keys, with the tie broken by id); `env.ts` (the time and `newId` are parameters); `items.ts` (add, add to an open item, edit with "remember for next time", tick, untick, delete, restore, move, clear bought and its undo) and `lists.ts` (make, rename, reorder, archive, restore), each returning a mutation of **only the fields that differ** or `null` when it would say nothing; and `validate.ts`, **the one validator** the browser runs before it queues and the server before it applies: shape, ids, tables, each field's shape, that a create has what it needs, that no row is named twice, and a limit on size; a problem names the field and never the value. It cannot check what needs the database (that what a field names is the household's own), which apply does in the statement (5.2). The actions are grouped in two modules rather than one each. `zod` (3.2) is what the shapes are written in. **Tests (64):** each action, that every mutation an action makes passes the validator, a table of 39 malformed mutations each refused with its reason, ids and positions, and that nothing in `src/actions` imports the server, the browser, a store, a clock or the random source.

#### ✅ 5.2 — Applying a mutation, field by field

**Goal:** the server's one write path. **Design:** §12.3, §12.4, §12.5. **Depends on:** 5.1, 3.2.

**Technical:** `src/sync/apply.ts`: in one short transaction, check membership in the statement, validate, increment `household.seq`, for each change
unseal the row, merge only the sent fields, stamp each in `fseq` and the row's `seq`, seal it again, record the mutation id in `applied_mutation`; an
edit to a deleted row restores it (§12.4); a refusal names a reason from a fixed list with its sentence; a replayed mutation writes nothing and
answers as before. Copied in shape from Tusk's Desk apply, with the counter per household.

**Accepts when:** two mutations changing different fields of one row both stand; the same field, the later wins; a replay writes nothing; a mutation
for a household the account is not in is refused; property tests over random interleavings from several devices end with the same rows in any arrival
order the counter allows.

**Done as:** `src/sync/apply.ts` (`applyMutation`), `merge.ts` (the pure field-by-field merge, shared with the device in 6.2), `tables.ts` (a description of each synced table, so that applying is one piece of code; products only until 5.4 and 5.5 add lists and items) and `refusal.ts` (a fixed list of reasons, each with a sentence; every permission refusal is `not_found`), with the `applied_mutation` table (migration `0005`) and its deletion by account. In one transaction: the household's counter is stepped **by the statement that says the account is an active member** (zero rows is not found, and the whole mutation rolls back, counter and record included); each change's row is read with the household in the statement; **a reference must be the household's own** (a category, a list, a product, a person who has been in it); an id that is another household's row, to change or to make, is not found; the sealed envelope is opened, the sent fields merged and sealed again, each changed field stamped in `fseq` and the row with the new `seq`; a product's name key is derived from its name; the product limit is checked at creation; an edit restores a deleted row; a change that changes nothing writes nothing. **A mutation sent again is answered as it was and writes nothing,** also when sent five times at once. Until 5.3 a second product with a name the household has is refused as `duplicate`. **Seen on all three databases:** replays, outsiders, former members, other households' rows and references, rollback of a half-refused mutation, limits and their sentence, restoring, and a property over random interleavings of two members' changes, in which the rows equal what the pure merge says and the counter is one for each mutation.

#### ✅ 5.3 — Folding and aliases

**Goal:** the same product, or the same item, made twice becomes one. **Design:** §9.3, §12.4. **Depends on:** 5.2.

**Technical:** `src/sync/fold.ts`, inside apply's transaction: a product created with a name key the household already has becomes an alias of the
existing one, with its sent fields merged in where the existing has none; an item created for a product already open on the same list folds into it
(the larger quantity, notes joined with a line break, the earlier `added_by`); **a tick of an item that is already bought is folded: the first tick
stands, and the second changes nothing**; each fold writes `alias (table, from_id, to_id)` and a tombstone for the folded id; later changes naming an
alias are re-pointed before applying; pull hands aliases to devices (6.1), which re-point what they hold. With trips (7.1), a folded tick also makes
no trip line.

**Accepts when:** two devices adding _milk_ offline to one list end with one item and one alias; two making _Oat milk_ end with one product and every
item pointing at it; two ticking one item end with the first's tick; an edit sent to an alias lands on its target; property tests hold that no
household has two products with one name key or two open items for one product on one list (unless made by "Add another anyway"); a product made at the limit of products of a household is refused with the limit's sentence, in apply's transaction.

**Done as:** `src/sync/fold.ts` and the `alias` and `tombstone` tables (migration `0006`, both household tables, ids only; both in `HOUSEHOLD_TABLES` and `deletePerson`'s decisions). **A product created for a name the household already has is not made: it is folded into the existing one,** in the mutation's transaction, which takes the fields it has nothing in from what was sent (`foldProductFields`: note, category, icon, default quantity and unit, and the later `lastAddedAt`) and keeps what it has, records an alias from the new id to the old and a tombstone for the new id at the mutation's `seq`, and **does not count against the product limit**; `applyMutation` returns the `folds` so the device re-points. **A later change naming a folded id is applied to what it became** (`resolveAlias`, a chain followed up to eight hops), before it is applied. A rename to a taken name is not folded but refused as `duplicate`, with the merge to be offered (5.6). **The item half of this task, an item made for a product already open on the list and a second tick, needs the item table and is part of 5.5** (its "Accepts when" now says so), as is the re-pointing of an item's `productId`, whose code is in `apply` and is tested there. Pull handing aliases to devices is 6.1. **Seen on all three databases** (24 sync tests): two members adding one name end with one product, one alias and one tombstone at the mutation's counter; a change to the folded id lands on the survivor; a fold is a replay when sent again; and a property over many makes at once never leaves two products of one name key, every alias resolving to a live row.

#### ✅ 5.4 — Lists

**Goal:** a household's lists. **Design:** §9.1. **Depends on:** 5.2.

**Technical:** `list` (§20.3); actions make, rename, reorder (fractional position), archive, restore; **the clearing rule is `manual` in 0.1.0** (the
column exists, and 7.2 adds the others); delete for good as an Admin's online operation on an archived list (`/api/ops`), removing its items by
`list_id`; 3.3 makes _Groceries_ with the household; an item added to an archived list restores it; one added to a list deleted for good is refused.

**Accepts when:** every action works offline and syncs; deleting for good is refused for a list not archived and for a Member; a list made at the limit of lists of a household is refused with the limit's sentence, in apply's transaction, and reaches Couldn't sync when it came from a device.

**Done as:** `list` (`DESIGN.md` §20.3, the columns of 0.1.0) with the migration `0007_list`, the index by `(household_id, seq)`, and the list in `SEALED`, `SEALED_TABLES`, `HOUSEHOLD_TABLES`, `deletePerson`'s decisions and `src/sync/tables.ts`, so that **make, rename, reorder, archive and restore (5.1's actions) are applied by the one path**, merged field by field, with the list limit checked at creation and its sentence. **_Groceries_ is made with the household,** sealed, first and manual, in `createHousehold`'s transaction, and `ensureFirstList` gives one to a household that never had a list (no list row and no list tombstone, so that one whose people deleted every list is not given one back), stepping the counter only when it made one. `src/households/list-ops.ts`: **`list.delete`**, an Admin's online operation on an archived list through `/api/ops`: the statement that steps the household's counter carries the Admin condition, the row goes, a tombstone stays at that counter, and a list that is not archived is refused with "Only an archived list can be deleted for good: archive it first" with nothing changed; a Member, an outsider and a list of another household read as not found (the operation is in `src/access/routes.ts`). **Its items are removed by 5.5, which adds the item table to it.** An item added to an archived list restoring it, and to one deleted for good being refused (a reference to a row that is not there), are 5.5's, on the same path. A create now takes the table's defaults for a field it did not say (a list's clearing rule is not set to null). **Seen on all three databases** (410 tests).

#### 📋 5.5 — Items, ticking and clearing

**Goal:** items on a list, bought and cleared. **Design:** §9.2–§9.6. **Depends on:** 5.3, 5.4.

**Technical:** `item` (§20.3, the columns of 0.1.0: no price, no trip); add (with the product found or made by name key, defaults from the product or
the starter entry), "Add another anyway" (a flag that skips folding), edit fields, "Remember for next time" writing category, icon and unit to the
product in the same mutation, move within or across the household's lists, delete and restore, position by fractional key with ties by id;
**tick and untick** (`bought_at`, `bought_by`; apply keeps the product's `times_bought` and `last_bought_at` in step, and an untick undoes them);
**clear bought** (`cleared_at`, for every bought item of a list), with an undo; apply keeps `last_added_at`.

**Accepts when:** adding an open product offers _+1_ on the device and the server never keeps two open items for it on one list; "Remember for next
time" changes the next add; position ties order the same on every device; ticking, unticking and clearing work offline and a cleared item is gone
from every device after sync; a product's `times_bought` follows its ticks; an item added to a list at its limit of open items is refused with the limit's sentence, which names the list, in apply's transaction; **two devices adding the same product to one list offline end with one item and one alias** (the larger quantity, notes joined, the earlier adder), **and two ticking one item end with the first's tick**, both folds being the item half of 5.3, written here with the table they need; a change naming a folded product's id as an item's `productId` is re-pointed to the product it became.

#### 📋 5.6 — Products: editing and merging (phase 2)

**Goal:** the catalog tidied by hand. **Design:** §8.2, §16.8. **Depends on:** 5.3.

**Technical:** product actions: edit (name, which changes its name key, refused if it would clash, with "Merge into _the other_" offered; category,
icon, default unit and quantity, note, barcode in phase 4), merge (every item and trip line of one re-pointed at the other, the merged one an alias,
in one mutation), delete (refused while it has open items; its trip lines keep their names).

**Accepts when:** a rename to an existing name is refused with the merge offered; a merge leaves no item or line pointing at the merged product on any
device after sync; a delete with open items is refused.
