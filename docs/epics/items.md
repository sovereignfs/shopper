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

#### 📋 5.1 — Actions and validators

**Goal:** every recorded action as a pure function from intent to a mutation. **Design:** §12.2. **Depends on:** 4.1, 4.2, 4.6.

**Technical:** `src/actions/`: one module per action (add item, edit item fields, tick, untick, delete, restore, move within a list or to another list
of the household, clear bought, make, rename, reorder, archive and restore a list); each takes the rows it needs and the time, and returns a mutation
with device-made UUIDs and only the changed fields; `src/actions/validate.ts`, one module run by the browser before queueing and by the server before
applying (shapes, sizes, decimal quantities, known units, references within the household). The actions of products (5.6), categories (4.7) and trips
(7.1) arrive with their tasks.

**Accepts when:** each action has unit tests; the validators refuse every malformed case in a table; nothing in `src/actions/` imports from the server
or the browser.

#### 📋 5.2 — Applying a mutation, field by field

**Goal:** the server's one write path. **Design:** §12.3, §12.4, §12.5. **Depends on:** 5.1, 3.2.

**Technical:** `src/sync/apply.ts`: in one short transaction, check membership in the statement, validate, increment `household.seq`, for each change
unseal the row, merge only the sent fields, stamp each in `fseq` and the row's `seq`, seal it again, record the mutation id in `applied_mutation`; an
edit to a deleted row restores it (§12.4); a refusal names a reason from a fixed list with its sentence; a replayed mutation writes nothing and
answers as before. Copied in shape from Tusk's Desk apply, with the counter per household.

**Accepts when:** two mutations changing different fields of one row both stand; the same field, the later wins; a replay writes nothing; a mutation
for a household the account is not in is refused; property tests over random interleavings from several devices end with the same rows in any arrival
order the counter allows.

#### 📋 5.3 — Folding and aliases

**Goal:** the same product, or the same item, made twice becomes one. **Design:** §9.3, §12.4. **Depends on:** 5.2.

**Technical:** `src/sync/fold.ts`, inside apply's transaction: a product created with a name key the household already has becomes an alias of the
existing one, with its sent fields merged in where the existing has none; an item created for a product already open on the same list folds into it
(the larger quantity, notes joined with a line break, the earlier `added_by`); **a tick of an item that is already bought is folded: the first tick
stands, and the second changes nothing**; each fold writes `alias (table, from_id, to_id)` and a tombstone for the folded id; later changes naming an
alias are re-pointed before applying; pull hands aliases to devices (6.1), which re-point what they hold. With trips (7.1), a folded tick also makes
no trip line.

**Accepts when:** two devices adding _milk_ offline to one list end with one item and one alias; two making _Oat milk_ end with one product and every
item pointing at it; two ticking one item end with the first's tick; an edit sent to an alias lands on its target; property tests hold that no
household has two products with one name key or two open items for one product on one list (unless made by "Add another anyway").

#### 📋 5.4 — Lists

**Goal:** a household's lists. **Design:** §9.1. **Depends on:** 5.2.

**Technical:** `list` (§20.3); actions make, rename, reorder (fractional position), archive, restore; **the clearing rule is `manual` in 0.1.0** (the
column exists, and 7.2 adds the others); delete for good as an Admin's online operation on an archived list (`/api/ops`), removing its items by
`list_id`; 3.3 makes _Groceries_ with the household; an item added to an archived list restores it; one added to a list deleted for good is refused.

**Accepts when:** every action works offline and syncs; deleting for good is refused for a list not archived and for a Member.

#### 📋 5.5 — Items, ticking and clearing

**Goal:** items on a list, bought and cleared. **Design:** §9.2–§9.6. **Depends on:** 5.3, 5.4.

**Technical:** `item` (§20.3, the columns of 0.1.0: no price, no trip); add (with the product found or made by name key, defaults from the product or
the starter entry), "Add another anyway" (a flag that skips folding), edit fields, "Remember for next time" writing category, icon and unit to the
product in the same mutation, move within or across the household's lists, delete and restore, position by fractional key with ties by id;
**tick and untick** (`bought_at`, `bought_by`; apply keeps the product's `times_bought` and `last_bought_at` in step, and an untick undoes them);
**clear bought** (`cleared_at`, for every bought item of a list), with an undo; apply keeps `last_added_at`.

**Accepts when:** adding an open product offers _+1_ on the device and the server never keeps two open items for it on one list; "Remember for next
time" changes the next add; position ties order the same on every device; ticking, unticking and clearing work offline and a cleared item is gone
from every device after sync; a product's `times_bought` follows its ticks.

#### 📋 5.6 — Products: editing and merging (phase 2)

**Goal:** the catalog tidied by hand. **Design:** §8.2, §16.8. **Depends on:** 5.3.

**Technical:** product actions: edit (name, which changes its name key, refused if it would clash, with "Merge into _the other_" offered; category,
icon, default unit and quantity, note, barcode in phase 4), merge (every item and trip line of one re-pointed at the other, the merged one an alias,
in one mutation), delete (refused while it has open items; its trip lines keep their names).

**Accepts when:** a rename to an existing name is refused with the merge offered; a merge leaves no item or line pointing at the merged product on any
device after sync; a delete with open items is refused.
