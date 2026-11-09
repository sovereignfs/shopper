# Epic 4: The catalog

## Status

📋 Planned.

## Overview

What a household's Shopper remembers about what it buys, so that adding is one tap and comes right: names and their key, categories and the aisle
order, units, icons, the starter catalog, suggestions, reading "2 oat milk", and the arithmetic of quantities and prices. Almost all of it is pure
(`src/catalog/`, `src/quantity/`), shared by the browser and the server, and runs offline.

## Related

[`DESIGN.md`](../../DESIGN.md) §8, §9.3, §10.4, §13.2, §16.6

## Tasks

#### 📋 4.1 — Names and the name key

**Goal:** one product per name in a household, found without reading names. **Design:** §8.7, §13.2. **Depends on:** 1.11.

**Technical:** `src/catalog/name.ts` (pure): trim, collapse spaces, NFKC, root-locale lower case, the starter catalog's plural rule (once 4.3 is in;
until then, none); `name-key.ts` from 1.11 applied to it; the unique index `(household_id, name_key)` on `product`.

**Accepts when:** _Oat Milk_, `oat  milk` and _OAT MILK_ give one key; two households' keys for one name differ; the key changes under a rotated
encryption key and the rotation job recomputes it.

#### 📋 4.2 — Categories, units and icons

**Goal:** a household's categories in its aisle order, the units, and the icons. **Design:** §8.3, §8.4, §9.3. **Depends on:** 3.2.

**Technical:** `category` (§20.3); the starter set (keys, English names, icons) in `src/catalog/categories.ts`, written for every new household by
`household.create` and for existing ones by an idempotent job; _Other_ undeletable and unhideable; renaming seals the name; position as a fractional
key; the unit list in `src/quantity/units.ts` (counted or measured, for the stepper); icon keys validated against `@sovereignfs/ui`'s set; the
category guess (`src/catalog/guess.ts`, pure: starter match, then the household's most used category for a shared word, then _Other_).

**Accepts when:** a new household has the starter categories in order; a hidden category is not offered and its items show under _Other_; the guess
picks _Dairy & eggs_ for "goat cheese" with no history and the household's own choice once it has one.

#### 📋 4.3 — The starter catalog

**Goal:** about 400 common groceries that come right the first time. **Design:** §8.6. **Depends on:** 4.2, 16.4.

**Technical:** `src/catalog/starter.ts`: entries with a stable key, a name, aliases, a category key, an icon key and a default unit and quantity, as
typed data with a schema test (every category and icon exists, no two entries share a normalised name or alias); written by hand and reviewed by the
owner in this task's PR; used by suggestions (4.4), the guess (4.2), parsing (4.5) and the plugin import's icon mapping (11.3). English only.

**Accepts when:** the schema test passes; every entry's icon is in the released grocery set (16.4); the owner has approved the list in review.

#### 📋 4.4 — Suggestions

**Goal:** the add field's suggestions, learned from the household. **Design:** §8.5. **Depends on:** 4.3, 7.1.

**Technical:** `src/catalog/suggest.ts` (pure, input: the household's products, its trip lines of the last 180 days, the list's open items, the typed
text, the time): the four tiers (prefix, word prefix, one edit, starter entries without a product); within a tier, the decayed buy count (halving
every 30 days), then last added, then name; "On the list · n" for an open match; "Add _text_" last; at most eight; with empty text, "Often bought"
(the top products not on the list). Fast enough on a device for 5000 products and a year of lines (a benchmark test).

**Accepts when:** hand-worked fixtures rank as designed; an open match offers _+1_; the empty field offers often-bought products not on the list; the
benchmark answers in under 10 ms on CI's machine for the largest household the limits allow.

#### 📋 4.5 — Reading what is typed

**Goal:** "2 oat milk", "oat milk 2l", "500 g flour" become a name, a quantity and a unit. **Design:** §16.6. **Depends on:** 4.6, 4.3.

**Technical:** `src/catalog/parse.ts` (pure): a leading or trailing number (digits, a decimal comma or point, English number words to twelve, "a
dozen", "half"), an optional unit from the list with its common spellings (`l`, `ltr`, `litre`, `liter`, `kg`, `kilo`), the rest as the name; never
splits a name the starter catalog knows with a number in it (_7 Up_); what it understood returned for the suggestion to show.

**Accepts when:** a table of examples parses as expected, including the ones that must not split.

#### 📋 4.6 — Quantities, money and unit prices

**Goal:** the arithmetic, with no binary float. **Design:** §9.3, §10.4. **Depends on:** 1.2.

**Technical:** `src/quantity/` (pure): canonical decimal strings with up to three places, parsed and formatted in the reader's locale, added and
compared as scaled integers; money as integer minor units, with Ledger's currency table and its generator copied for decimals;
`unitPrice(price, quantity)` rounded half up to the minor unit; `offerPrice(product, quantity, unit)` in the same unit only; `tripTotal(lines)` with
the count of lines without a price.

**Accepts when:** property tests hold that adding quantities is exact, that a unit price times its quantity is within half a minor unit of the price,
and that a total equals the sum of its priced lines; currencies with no and with three decimals format correctly.
