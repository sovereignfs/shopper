# RFC 0006 — Home and Inventory

|                |                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted on 2026-11-23; to be built in [workstream 0002](../workstreams/0002-frame-home-cards.md)                                   |
| **Date**       | November 2026                                                                                                                       |
| **Author**     | Claude Code (design discussion with `kasunben`)                                                                                     |
| **Scope**      | `DESIGN.md` §4, §8, §9.7, §13.1, §16.2 to §16.4, §16.8, §18, §20, §22.2; `src/catalog/`, `src/screens/`, `src/sync/`, `migrations/` |
| **Supersedes** | §16.4's landing on the last list; 8.5 (All lists) and 8.6 (the catalog screen) as written; where 13.1 to 13.3 keep their data       |
| **Tasks**      | [epic 23](../epics/inventory.md)                                                                                                    |

## Summary

Two places join the top of the sidebar ([RFC 0005](0005-the-frame-settings-and-screens.md)): **Home**, where `/` now opens, an overview of a person's
lists that fills in as trips and notices arrive; and **Inventory**, **a person's own library of the things they buy**, groceries or not, recurring or
once, shown together with the starter catalog and never shared. Inventory is where "what is at home" (the pantry) lives when it comes.

## Home

**`/` opens Home** for someone signed in, in place of the last list they used (§16.4). The last list stays one tap away: Home's first tile is
**Continue**, a large tile for the list used last ("Continue: Groceries"), which is what `/` used to open.

| Part                                                                                                    | When                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Continue:** the last list used, with its open count                                                   | Now                             |
| **Lists:** a tile for every list, own then shared, with icon, colour, name, open count and who is on it | Now                             |
| **At a glance:** open items across the lists, bought this week, the most bought                         | Now, from what the device holds |
| **What happened:** "Anna added 3 items to Groceries"                                                    | With notices (9.2)              |
| **Trips and spending:** the last trips, this month's total                                              | With trips (7.1, 7.5)           |
| **Running low, and staples to add**                                                                     | With the pantry (13.1, 13.2)    |

- **Everything on Home is computed on the device** from the rows it holds, offline, as suggestions are (§8.5); nothing is stored for it.
- **Phase 2's _All lists_ (8.5) becomes Home's lists,** with archived lists behind a toggle, not a page of its own. Trips' history (7.5) is linked
  from Home.
- **Arriving by an invitation** still opens that list. A brand-new account opens Home, whose Continue is its _Groceries_, with today's line ("Add what
  you need. To shop with others, press Share.").
- **On a phone** Home is the footer's left icon, and it links to Inventory.

## Inventory

### What it is

**A person's own library of the things they buy,** across every list and beyond groceries: their own names ("the good bin bags"), their own
categories (Hardware, Electronics, Clothing, Gifts, Garden, Office as well as the starter set), what they buy again and again and what they buy once.
It answers "the starter catalog does not say it the way we do, and is only groceries".

| Question                 | Decision                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Whose                    | **The person's alone,** kept in their own group (§7.1), which is never shared. Nobody on a shared list sees it                       |
| With the starter catalog | **Shown together:** one list, the starter's entries and the person's own, side by side                                               |
| How the starter is held  | **Layered, not copied.** The starter stays data in the code; a person's change to an entry is a row that overrides it                |
| Recurring                | **A mark** on an item, recurring or once. A schedule ("every two weeks", 13.3's rule) is later                                       |
| What is at home          | **Part of Inventory,** when the pantry is built (13.1): on hand and a low point are an Inventory item's, not a list's product's      |
| Kept up by hand          | **Never needed.** A new name typed on a list makes an Inventory item, marked once; people tidy it if they want to (§8.1's principle) |

**Why layered:** copying 150, then 400, entries into every new account is that many encrypted rows a person on their first day, and nobody would get
an entry added or corrected in a later release. With layers the starter can grow in any release, and a person's change is theirs.

### The data

- **`inventory_item`,** a row of the person's own group (`household_id`, with `own_of` the account), on both dialects:
  - `starter_key`, when the row overrides a starter entry (null for one of the person's own);
  - `name` (encrypted; null when an override keeps the starter's name) and its **name key**, under a key derived from the group's, made in the browser
    as a list's is (§13.3), unique per group;
  - `category_id` (one of the group's categories), `icon`, `unit`, `quantity`, `note` (encrypted);
  - `recurring` (a boolean), `hidden` (a boolean: a hidden starter entry is offered nowhere until shown again);
  - and, from the pantry (13.1), `on_hand` and `low_point`.
- **The group's categories** gain the person's own (4.7, brought forward for Inventory): adding, renaming and hiding, with an encrypted name for one a
  person made. A list's items are grouped by them, so **a category a person made is seen by the people on their lists, by its name**, as the starter
  ones are; an Inventory item is not.
- **Read by its own account only.** A pull by anyone else, on any of the group's lists, holds no `inventory_item`; a test pulls as a person on one of
  the group's lists and finds none.
- **Written through the one path** (`src/actions/`, `src/sync/apply.ts`), merged by field, folded by name key as products are (§12.4), restoring on an
  edit after a delete. Exported, imported, and removed by `People.deletePerson` with the group.
- **A list's products stay** (§8.2, RFC 0004): a list keeps its own catalog, so that sharing a list shares nothing of the person's Inventory. Adding a
  name to a list makes the list's product from the Inventory item when there is one (its category, icon, unit and quantity, as another list's product
  lends them today, §8.5), else from the starter, else guessed.

### Suggestions

The add field suggests (§8.5's tiers, unchanged in their ranking) from, in this order: **the person's Inventory** (with the starter entries it does not
hide), this list's products, the person's other lists' products. A hidden starter entry is never offered. _Often bought_ draws on Inventory too; a
recurring item not on the list is offered first (what 13.2's staples would have done, now a mark of Inventory).

### The screen

`/inventory`: every item, the person's and the starter's, **searchable**, filtered by category, by **recurring or once**, and by **mine, starter or
hidden**; grouped by category. An item opens in the right column (as an item of a list does): its name, category, icon, unit, quantity, note,
recurring, hide or restore, and **Add to a list**. _+ Add item_ at the top. A second tab, **Categories**, is 4.7's: the aisle order by dragging, each
with rename, icon and hide, and _Add category_.

**Phase 2's catalog screen (8.6) is this screen.** A list's own products are tidied where they are used, from an item's panel (its "Remember for next
time", §9.4, also offering to update the Inventory item); merging a list's products (5.6) stays a task of its own.

## Alternatives

| Alternative                                               | Why not                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Inventory shared by the people on a list                  | Breaks RFC 0004: a list shares that list and nothing else                                          |
| Inventory as the list catalogs, shown together            | Every list would need tidying on its own; a person's own words would not follow them to a new list |
| Copying the starter catalog into each account             | Hundreds of rows on day one, and no later release could improve them                               |
| Saving to Inventory only when asked                       | A library people must keep up is the plugin's lesson (§16.12): it fills itself                     |
| `/` keeps opening the last list; Home only by the sidebar | The owner's decision: Home is where Shopper opens, and Continue keeps the last list one tap away   |

## Open questions

1. A pantry for a home of several people: Inventory is a person's, and on hand is theirs. A shared "what is at home" waits for kinds of group (§22.1).
2. A schedule for recurring items (13.3's rule) and how it adds to which list.
