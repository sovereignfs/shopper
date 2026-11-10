# Epic 4: The catalog

## Status

📋 Planned.

## Overview

What a household's Shopper remembers about what it buys, so that adding is one tap and comes right: names and their key, categories and the aisle
order, units, icons, the starter catalog, suggestions, reading "2 oat milk", and the arithmetic of quantities and prices. Almost all of it is pure
(`src/catalog/`, `src/quantity/`), shared by the browser and the server, and runs offline.

**0.1.0 has the catalog that learns and the starter set, with the starter categories fixed** (their order is the aisle order, and nobody edits it
yet), **quantities and no money.** Editing categories (4.7), a larger starter catalog (4.8), reading what is typed (4.5) and money (4.9) are phase 2.

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §8, §9.3, §10.4, §13.2, §16.6

## Tasks

#### ✅ 4.1 — Names and the name key

**Goal:** one product per name in a household, found without reading names. **Design:** §8.7, §13.2. **Depends on:** 1.11.

**Technical:** `src/catalog/name.ts` (pure): trim, collapse spaces, NFKC, root-locale lower case, the starter catalog's plural rule (once 4.3 is in;
until then, none); `name-key.ts` from 1.11 applied to it; the unique index `(household_id, name_key)` on `product`.

**Accepts when:** _Oat Milk_, `oat  milk` and _OAT MILK_ give one key; two households' keys for one name differ; the key changes under a rotated
encryption key and the rotation job recomputes it.

**Done as:** `src/catalog/name.ts` (`normaliseName`: NFKC, white space made one space and trimmed, root-locale lower case; `isName`; the plural rule is left for 4.3 to give it, and until then there is none), `product-key.ts` (`productNameKey`, the name key of the normalised name, from 1.11) and **the `product` table** (`DESIGN.md` §20.3, the columns of 0.1.0) with its migration `0003_product`, the unique index `(household_id, name_key)` and the index by `(household_id, seq)` that pull will use. It is the first synced table, so it also joined `SEALED` (name, note), `SEALED_TABLES` with a `recompute` that gives a rotated key the new name key in the row's own transaction (`recompute` now takes the ring), `HOUSEHOLD_TABLES` and the decisions of `deletePerson`'s test. **Seen on all three databases:** one key for every way of writing a name in a household; keys that differ by household, by name and by instance key; a second product with a name already in the household refused by the index while the same name is free in another; and a rotation that gives every product the new key with the row, twice safely, with the index still holding.

#### 📋 4.2 — Categories, units and icons

**Goal:** a household's categories in its aisle order, the units, and the icons. **Design:** §8.3, §8.4, §9.3. **Depends on:** 3.2.

**Technical:** `category` (§20.3); the starter set (keys, English names, icons) in `src/catalog/categories.ts`, written for every new household by 3.3
and for existing ones by an idempotent job; **in 0.1.0 they are not editable**, and their order is the aisle order; _Other_ undeletable and
unhideable (so that 4.7 has nothing to migrate); position as a fractional key; the unit list in `src/quantity/units.ts` (counted or measured, for the
stepper); icon keys validated against `@sovereignfs/ui`'s set as it is; the category guess (`src/catalog/guess.ts`, pure: starter match, then the
household's most used category for a shared word, then _Other_).

**Accepts when:** a new household has the starter categories in order; the guess picks _Dairy & eggs_ for "goat cheese" with no history and the
household's own choice once it has one.

#### 📋 4.3 — The starter catalog

**Goal:** the common groceries that come right the first time. **Design:** §8.6. **Depends on:** 4.2.

**Technical:** `src/catalog/starter.ts`: **about 150 entries in 0.1.0**, the things most lists hold, each with a stable key, a name, aliases, a
category key, an icon key **from the set `@sovereignfs/ui` already has** (a category's icon where no better one exists) and a default unit and
quantity, as typed data with a schema test (every category and icon exists, no two entries share a normalised name or alias); written by hand and
reviewed by the owner in this task's PR; used by suggestions (4.4), the guess (4.2) and, later, parsing (4.5) and the plugin import's icon mapping
(11.3). English only. It grows to about 400 with grocery icons in 4.8.

**Accepts when:** the schema test passes; every entry's icon is in the released icon set; the owner has approved the list in review.

#### 📋 4.4 — Suggestions

**Goal:** the add field's suggestions, learned from the household. **Design:** §8.5. **Depends on:** 4.3, 5.5.

**Technical:** `src/catalog/suggest.ts` (pure; input: the household's products with their `times_bought`, `last_bought_at` and `last_added_at`, the
list's open items, the typed text, the time): the four tiers (prefix, word prefix, one edit, starter entries without a product); **within a tier,
how many times the household bought it, then when it last did, then when it was last added, then name** (7.1 later gives it the decayed count of the
last 180 days from trip lines, which changes this function and its fixtures only); "On the list · n" for an open match; "Add _text_" last; at most
eight; with empty text, "Often bought" (the most bought products not on the list). Fast enough on a device for 5000 products (a benchmark test).

**Accepts when:** hand-worked fixtures rank as designed; an open match offers _+1_; the empty field offers often-bought products not on the list; the
benchmark answers in under 10 ms on CI's machine for the largest household the limits allow.

#### 📋 4.5 — Reading what is typed (phase 2)

**Goal:** "2 oat milk", "oat milk 2l", "500 g flour" become a name, a quantity and a unit. **Design:** §16.6. **Depends on:** 4.6, 4.3.

**Technical:** `src/catalog/parse.ts` (pure): a leading or trailing number (digits, a decimal comma or point, English number words to twelve, "a
dozen", "half"), an optional unit from the list with its common spellings (`l`, `ltr`, `litre`, `liter`, `kg`, `kilo`), the rest as the name; never
splits a name the starter catalog knows with a number in it (_7 Up_); what it understood returned for the suggestion to show.

**Accepts when:** a table of examples parses as expected, including the ones that must not split.

#### 📋 4.6 — Quantities and units

**Goal:** the arithmetic of how much, with no binary float. **Design:** §9.3. **Depends on:** 1.2.

**Technical:** `src/quantity/` (pure): canonical decimal strings with up to three places, parsed and formatted in the reader's locale, added and
compared as scaled integers (for _+1_ and for folding two items); the unit list and the step for each (counted units by 1, measured by the
product's last quantity). Money is 4.9.

**Accepts when:** property tests hold that adding quantities is exact and that a canonical string parses back to itself; a decimal comma and a point
both parse; more than three places is refused.

#### 📋 4.7 — Editing categories and the aisle order (phase 2)

**Goal:** a household's categories are its own. **Design:** §8.3. **Depends on:** 4.2, 5.2.

**Technical:** actions to rename (sealing the name), hide, add and reorder categories, through the one path; _Other_ stays; a hidden category's items
show under _Other_ until moved; the sixth limit, `SHOPPER_LIMIT_HOUSEHOLD_CATEGORIES` (100), with its setting, its place in `.env.example` and its
sentence; the sealed name added to the registry test. The screen is 8.6.

**Accepts when:** a renamed category is sealed and shows its new name on every device; a hidden one is not offered and its items show under _Other_;
reordering changes every list's grouping after sync; the limit refuses the hundred-and-first.

#### 📋 4.8 — Growing the starter catalog (phase 2)

**Goal:** about 400 common groceries, with icons for them. **Design:** §8.4, §8.6. **Depends on:** 4.3, 16.4.

**Technical:** the entries of 4.3 re-iconed from the released grocery set, and the list extended to about 400, under the same schema test, reviewed
by the owner in the PR.

**Accepts when:** the schema test passes; every entry's icon is in the released grocery set; the owner has approved the additions.

#### 📋 4.9 — Money and unit prices (phase 2)

**Goal:** the arithmetic of what it cost, with no binary float. **Design:** §10.4. **Depends on:** 4.6.

**Technical:** `src/quantity/` (pure) gains money as integer minor units, with Ledger's currency table and its generator copied for decimals, and the
`money` column vocabulary (1.5); `unitPrice(price, quantity)` rounded half up to the minor unit; `offerPrice(product, quantity, unit)` in the same
unit only; `tripTotal(lines)` with the count of lines without a price.

**Accepts when:** property tests hold that a unit price times its quantity is within half a minor unit of the price and that a total equals the sum
of its priced lines; currencies with no and with three decimals format correctly.
