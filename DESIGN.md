# Shopper — design

**Status:** draft, written on 2026-11-09 from the legacy `sovereign-plugin-shopper` (manifest 0.6.1, its `SPEC.md` 0.2, `UI.md` and roadmap), Tusk's,
Tally's and Roam's designs, and the owner's direction in planning. **Phase 1 is built and released as 0.1.0 (2026-11-11).** Before phase 2, workstream
0001 moved Shopper onto the suite's encryption, push and exports (`docs/rfcs/` 0001 to 0003, released as 0.2.0), and **workstream 0002** gives it the
suite's frame, Settings as a dialog, Home, Inventory and loyalty cards (`docs/rfcs/` 0005 to 0007, §2.3); this file says what both build. **Phase 1
was cut to a minimum viable product on 2026-11-10 (§2.2);** this file still describes the whole design, and each section says where something comes
later. Where this file and a contract Sovereign publishes disagree, the contract wins (`AGENTS.md`, Source of truth). §25 holds what is still waiting
on a decision, and §26 what has been decided and why.

[`ROADMAP.md`](ROADMAP.md) puts the work in order, and [`docs/epics/`](docs/epics/) holds each task's detail.

---

## 1. Purpose

Shopper is shopping lists shared with the people you shop with: the lists they add to through the week, the shop where one of them ticks things off with no signal, and the
memory of what was bought, where and for how much, so that next week's list writes itself faster. It is an app of the Sovereign suite exactly as Tusk,
Fjord, Tally and Roam are: a program of its own, which an instance can host, and which needs no instance to run.

Shopper replaces the legacy plugin `sovereign-plugin-shopper`. Its behaviour is the starting point; none of its code is carried over, its interface
and data model are designed anew (§16, §20), and its export can be imported (§18.3).

What it must not give up, whatever the convenience:

- **It works alone.** Every feature works on a Shopper with no Sovereign instance: its own accounts, its own people, its own mail, its own notices. In a
  suite, core is the way to sign in (never beside Shopper's own, §15.1) and adds a directory to find people in, and core's bell and email; it is never what a feature depends on (§15).
- **The shop has no signal.** Everything done to lists, items, the catalog and trips works with no network, answers at once, and syncs in the
  background (§12). Nobody standing in an aisle should notice they are offline.
- **Two people, one list, at once.** The people on a list write to it from several phones, often at the same moment. Changes merge field by field,
  nothing anyone typed is lost, and nobody is asked to resolve a conflict (§12.4). Each person chooses how fresh their copy is, up to live (§12.6).
- **Adding is quick.** The second time anyone on a list adds _oat milk_ it comes with its category, icon, unit and last price, and the
  suggestions learn what is bought on it (§8).
- **Private.** What people buy says a lot about them. Names, notes, prices and shops are encrypted in the browser, under keys of each list's own,
  so that the server stores what it cannot read (§13).
- **A person can leave.** One file holds what is theirs to take (§18). Deleting the account removes their email and everything else personal, and
  keeps only their name on the shared record (§19).

How much of this the first release holds is §2.2.

What it is not: a budget or a ledger (that is Ledger), a way to split what a trip cost (that is Tally), a price-comparison service, or a delivery app.
It never talks to a shop.

## 2. Phases

| Phase                  | What it delivers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1, the MVP** (0.1.0) | On the web, responsive, installable and **working offline**: sign-in with an email and a password, or through a Sovereign core; lists of one's own, each shared on its own by a link, with a first list; items with quantity, unit, category, icon and note; a catalog that learns what is bought on each list, a starter catalog, and suggestions as one types; ticking off, a Bought section and _Clear bought_; a light shopping mode; **sharing by a link**, so that anyone invited sees and edits every list; background sync with Couldn't sync; **everything sealed at rest**; deleting an account. Runs alone or hosted. §2.2 is the exact list. |
| **2**                  | What the first design put in phase 1 and 0.1.0 leaves out: kinds of group (a household, a group of friends), roles, invitations by email; trips, shops, prices and totals, shopping mode with them, the trips history; notices, the bell and mail; live updates and a freshness setting; passkeys and the authenticator app; reading "2 oat milk"; merging and deleting products; a larger starter catalog; export, import and import from the plugin; core's bell, email, activity and directory. §22.1.                                                                                                                                                |
| **3**                  | The pantry (what is at home, low-stock flags), staples, repeating items, list templates, shops with their own aisle order learned from ticking, insights with charts, Push notifications. §22.2 outlines each.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **4**                  | Capture: barcode scanning of products (decoded on the device, as loyalty cards are from §2.3), product lookup by barcode through the server, photos on products and items, receipt images on trips. §22.3.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Later**              | Candidates, none committed: encrypted backup to Git, sending a trip to Ledger or Tally as a link, AI features through the instance's model provider. §22.4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 2.1 What is carried over

The plugin's requirement numbers (`SHP-*`) and task numbers (`T-*`) are not used here. This table is how to check nothing was lost.

| Plugin                                                                                         | Here                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lists owned by a user, rename, archive (SHP-01)                                                | §9.1. **A list is its maker's,** shared on its own (RFC 0004)                                                                                           |
| Per-list sharing with one user as editor or viewer (SHP-09)                                    | **Kept, by a link:** a list's people are Admin and Member (§7); there is no viewer role (§26)                                                           |
| Households, owner and member roles, invites, a default shared list (SHP-20–23)                 | §7: **a list's people**, Admin and Member, by a link to the list, and a first list; kinds of group, changing roles and invitations by email are phase 2 |
| Moving a list from a person to a household (SHP-24) and its unsolved migration                 | **Dropped:** a list is shared by its link, never moved (§9.1)                                                                                           |
| Own lists, shared with me, read-only combined view (SHP-02)                                    | §7.4: **My lists** and **Shared with me**; §9.7: **All lists**, editable (phase 2)                                                                      |
| Last-used list as the landing page (SHP-03)                                                    | §16.4: Shopper opens on **Home**, whose _Continue_ is the last list used                                                                                |
| Type-ahead suggestions from the owner's catalog and history (SHP-04), learned ranking (SHP-32) | §8.5, from every catalog of the person's lists, learned from the first release                                                                          |
| Curated icons with a category fallback (SHP-05)                                                | §8.4, `IconPicker`; 0.1.0 uses the icon set as it is, and more grocery icons are added to the design system for phase 2 (§16.10)                        |
| Edit name, quantity, unit, category, icon, barcode, price, updating the catalog (SHP-06)       | §9.2, §8.2. Price comes with trips in phase 2; the barcode is kept on the product in phase 4, with scanning                                             |
| Tap to buy writes a purchase row; untap removes it (SHP-07)                                    | §9.5: a tick marks the item bought; from phase 2 (§10) it also puts it in the person's open **trip**, as a trip line; unticking undoes both             |
| Clear bought, reorder, group by category (SHP-08)                                              | §9.5, §9.6, with the category order as the aisle order                                                                                                  |
| Household analytics: spend, categories, frequent items, who bought what (SHP-25)               | Phase 3, Insights (§22.2). The trips history (§10.5) is in phase 2                                                                                      |
| Light inventory and low-stock (SHP-30, 31)                                                     | **Inventory** (§8.8), a person's own library of what they buy; on hand and low points with the pantry, phase 3 (§22.2)                                  |
| Photos, barcode scanning, Open Food Facts lookup (SHP-40, 41)                                  | Phase 4 (§22.3), files stored by Shopper itself, lookups made by the server                                                                             |
| Live shared-list sync (SHP-50)                                                                 | §12.6: devices pull every 20 seconds by default in 0.1.0; **live updates are phase 2**, as a setting each person chooses within the operator's limits   |
| Notifications for items added, someone bought, invites (SHP-51)                                | §14, phase 2                                                                                                                                            |
| Household activity feed (SHP-52)                                                               | Not carried: the trips history and notices cover what people asked of it (§26)                                                                          |
| AI icons, receipt OCR, auto-categories, predictive restock (SHP-60–63)                         | Later (§22.4); categories are learned from the catalog without AI (§8.3)                                                                                |
| Price history (SHP-70)                                                                         | A product's last price with trips in phase 2 (§8.2); per shop and over time in phase 3 (§22.2)                                                          |
| Budgets, multi-currency, a household ledger (SHP-71, 73)                                       | **Dropped:** Ledger's job. One currency per list (phase 2)                                                                                              |
| Recurring items (SHP-72)                                                                       | A mark on an Inventory item (§8.8); a schedule in phase 3 (§22.2)                                                                                       |
| CSV export of the ledger (SHP-74)                                                              | Export of everything as JSON (§18)                                                                                                                      |
| Export, import, delete through `sdk.portability`                                               | §18 (export and import, phase 2), §19 (delete, 0.1.0), as the app's own, and **the plugin's export can be imported** (§18.3, phase 2)                   |
| Tenants, `sdk.db`, `sdk.directory`, the plugin manifest                                        | Gone with the legacy runtime (§15, §20)                                                                                                                 |

### 2.2 What phase 1 holds, and what waits

0.1.0 is a minimum viable product: a person, or two, can use it every week for their shopping, offline, with what they buy sealed at rest. The cut
keeps **what a list needs to be used, shared and trusted, and leaves out what only makes it richer.** The design stays whole: what comes later is
said where it appears, and **nothing in 0.1.0's data model, access rules or sync has to change for phase 2**; each later feature adds a table, a
column, an operation or a screen.

| Area             | 0.1.0 holds                                                                                                                                                      | Waits (phase)                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sign-in          | Email and password; a Sovereign core, with its back-channel logout and account-deleted notices                                                                   | Passkeys, authenticator app (2); core's directory, bell, email, activity (2)                         |
| Sign-up          | `open` (the default) or `closed` (§6.3)                                                                                                                          | `invite`, the default (2)                                                                            |
| Sharing          | **A list, shared by a link** (RFC 0004): everyone invited sees and changes that list and nothing else; leave and remove, list by list                            | Kinds of group, naming them, several a person; changing roles; invitations by email (2)              |
| Lists and items  | Lists (make, rename, reorder, archive, delete for good); items with quantity, unit, category, icon, note; tick, untick, Bought, _Clear bought_; undo; fold       | Prices (2); reading "2 oat milk" (2); clearing rules (2)                                             |
| Catalog          | Products learned from adding; about 150 starter entries; suggestions and "Often bought"; the starter categories, fixed, in their order                           | Merging products (2); categories edited in Inventory (§2.3); about 400 entries and grocery icons (2) |
| Shopping         | Shopping mode, light: large rows, the screen kept on, In basket, _Finish shopping_ clears what was bought                                                        | Trips, shops, prices, totals, "shopping too", several lists, the trips history (2)                   |
| Offline and sync | Everything above works offline; background sync; Couldn't sync; installable; opens offline; others' changes by an interval (20 s) and on write, focus, reconnect | Live updates and a freshness choice per device; pruning the history (2)                              |
| Encryption       | Everything people write encrypted in the browser, under each list's own keys; the name key (§13)                                                                 | Each later table and field, sealed as it arrives                                                     |
| Notices and mail | None. Mail only for sign-in (verification, reset), when SMTP is set                                                                                              | Notices, the bell, the mail outbox, digests, preferences (2); Push (3)                               |
| A person's data  | Delete the account (§19)                                                                                                                                         | Export, import, import from the plugin (2)                                                           |
| Phone            | Responsive, installable, a footer; the add field at the top of a list                                                                                            | The floating Add button (2)                                                                          |
| Design system    | **Nothing built upstream first**: the components and icons that exist                                                                                            | Grocery icons, `AvatarStack`, a floating button (2); charts (3)                                      |

**Sharing is a list's own** (RFC 0004): a list shared by a link shows that list and nothing else of its maker's; a list never shared is its maker's
alone. The group that holds a person's lists is never shown (§7.1).

**Journeys** (§3) in 0.1.0: 1, 2, 4, 5 and 12 as written; 3 by a link with sign-up open; 6 to 8 without the shop, prices, total or notice; 9, 10 and
11 are phase 2.

### 2.3 Before phase 2: the suite's frame (workstream 0002)

After workstream 0001's release (0.2.0) and before phase 2, Shopper is made to look and behave as the suite's apps do, and gains places phase 2 would
otherwise build twice ([RFC 0005](docs/rfcs/0005-the-frame-settings-and-screens.md) to 0007, epics 22 to 24). Its screens wait on releases of
`@sovereignfs/ui` and core (16.18 to 16.25); each section says what it builds.

| Area            | What changes                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in         | **Core's or Shopper's, never both** (§15.1): in a suite, `/sign-in` goes to core at once; alone, the design system's forms                                                  |
| A list          | An icon and a colour, encrypted (§9.1); the header's Shop, Share and menu (§16.5); its settings in the settings dialog; a row's tap opens it                                |
| An item         | Opens in a column beside its list, a page of its own on a phone, saving as it is left (§16.7)                                                                               |
| Shopping mode   | The list's header, _+ Add item_, _Put it straight in the basket_, and _Finish shopping_ fixed at the bottom (§11.1)                                                         |
| Settings        | `SettingsDialog`, each section at its own address; what each says by mode (§17)                                                                                             |
| A person's data | **A readable export,** one JSON file made in the browser after confirming it is them (§18.1)                                                                                |
| The frame       | The header, the sidebar and the phone's footer are `@sovereignfs/ui`'s; an app launcher in a suite (§16.2, §16.11); every page titled (§16.13)                              |
| Home            | **`/` opens Home,** with _Continue_ for the last list used, every list, and what the device can count (§16.4)                                                               |
| Inventory       | **A person's own library of what they buy,** with the starter catalog shown in it, their own categories, and suggestions drawing on it first (§8.8)                         |
| Loyalty cards   | **Shop cards kept, scanned, shown at the till offline, shared by a link with their own people and keys,** and opened from shopping mode on a list they are linked to (§7.7) |

## 3. User journeys

1. **First visit, alone.** Someone runs the image (§21). They make the first account and land on **Home**, whose _Continue_ is their first list,
   _Groceries_, with one line on what to do next.
2. **First visit, on an instance.** They open Shopper from the launcher and sign in through core. The same.
3. **Sharing.** Kasun presses _Share_ on _Groceries_, makes a link and sends it to Thulana any way he likes. Thulana opens it, makes an account
   (sign-up is open on this server, §6.3), and finds _Groceries_ under _Shared with me_, and nothing else of Kasun's. _(From phase 2 Kasun can also
   invite Thulana by email.)_
4. **Through the week.** Thulana types "oa" and Shopper offers _Oat milk_, which Kasun added last week, with its carton icon, Dairy & eggs, and 1 L.
   One tap. Kasun, on the bus, adds _bread_ and _coffee_. Both see the other's items within seconds (§12.6).
5. **Adding what is there.** Kasun adds _oat milk_ again. Shopper says it is already on the list and offers _+1_; he takes it, and the quantity is 2.
6. **In the shop.** Thulana opens _Groceries_ and presses _Shop_. The screen stays on, rows are large, in the aisle order, and Thulana
   picks _Lidl_ as the shop. The basement has no signal; ticking works anyway, with prices typed for three items. Ticked items drop into the basket at
   the bottom. _(0.1.0: no shop and no prices.)_
7. **Two people, one shop.** Kasun is in the same shop and ticks _coffee_ from his phone while Thulana's phone is offline. When it syncs, Thulana sees
   _coffee_ ticked by Kasun; nothing is bought twice.
8. **Finished.** Thulana presses _Finish shopping_: 14 items, €62.40, Lidl, two items still on the list. Kasun gets a notice, "Thulana finished
   shopping at Lidl · 14 items". The bought items leave the list, as the list's setting says (§9.5). _(0.1.0: *Finish shopping* offers to clear the bought
   items, with no total, shop or notice.)_
9. **Looking back (phase 2).** On _Trips_, Saturday's trip shows each line with its price. _Oat milk_ remembers €1.29, and offers it next time.
10. **A private list.** Kasun keeps _Hardware store_ to himself by not sharing it; Thulana never sees it, its items or its catalog (§7.4).
11. **From the plugin (phase 2).** Thulana imports the file the old plugin exported: her lists, catalog and purchase history arrive in her own lists, the purchases
    as trips (§18.3).
12. **Leave.** Kasun deletes his account. The lists he shared with Thulana pass to her as their Admin; the others are deleted; what he added still says "Kasun (left Shopper)".

## 4. Terminology

| Term                | Meaning                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Account**         | Someone who can sign in. In code, `account_id` is the better-auth user id (as in Tusk)                                                                       |
| **Suite mode**      | An instance with a Sovereign core configured: everyone signs in through core (§15.1)                                                                         |
| **Standalone mode** | An instance with no core: everyone signs in with Shopper's own accounts (§15.1)                                                                              |
| **Person**          | Shopper's record of someone who appears on shared rows: every account has one, which keeps the name after the account is deleted (§6.1). `person_id` in code |
| **Group**           | The one each account is made with, holding the lists it makes, its categories and their order (§7.1). Never shown. In code `household`                       |
| **List's people**   | Who is on a list, each with a role, **Admin** (who made it, or to whom it passed) or **Member** (§7.2). In code `list_member`                                |
| **Invitation**      | A single-use link that lets someone join one list (§7.3)                                                                                                     |
| **List**            | A shopping list, shared on its own, with its icon and colour: _Groceries_, _Pharmacy_ (§9.1)                                                                 |
| **Item**            | One thing on a list: _Oat milk, 2 L_ (§9.2). It is **open** until ticked, then **bought**, then **cleared** from the list                                    |
| **Product**         | An entry in a list's **catalog**: what Shopper remembers about something bought on it (§8.2)                                                                 |
| **Inventory**       | A person's own library of the things they buy, across their lists and beyond groceries, never shared; an entry is an **Inventory item** (§8.8)               |
| **Home**            | Where Shopper opens: the last list to continue, every list, and what is going on (§16.4)                                                                     |
| **Loyalty card**    | A shop's card, with its code, shown at the till; shared on its own, as a list is, with its own people and keys. On screen, a **card** (§7.7)                 |
| **Starter catalog** | The common groceries Shopper ships with, shown in Inventory and offered until a list or a person has their own entry (§8.6)                                  |
| **Category**        | A section of the shop (_Produce_, _Dairy & eggs_): a starter one, or a person's own, made in Inventory. Their order is the **aisle order** (§8.3)            |
| **Trip**            | (Phase 2) One person's time in a shop: what they ticked, where, when, and what it cost (§10)                                                                 |
| **Trip line**       | (Phase 2) One bought thing in a trip, kept after the item leaves the list (§10.2)                                                                            |
| **Shop**            | (Phase 2) A place bought from, named in trips (§10.3)                                                                                                        |
| **Shopping mode**   | The screen for the shop (§11)                                                                                                                                |
| **Notice**          | (Phase 2) Something a person is told, in the bell (§14)                                                                                                      |
| **Outbox**          | Changes made on a device and not yet accepted by the server (§12)                                                                                            |

User-facing text says "list", "item", "catalog", "Inventory", "Home", "card", "loyalty card", "trip", "shop", "bought", "basket", "shopping", "Admin", "Member", "app"; never "household" or
"group" (§7.1), "ledger", "purchase transaction", "product row", "owner", "viewer", "editor", "tenant", "client" or "plugin". On screen, ticking is "bought" and a
trip is "shopping at Lidl".

## 5. Architecture

```
            browser (a PWA)                                        server (one image, one process)
 ┌────────────────────────────────────────┐              ┌──────────────────────────────────────────────────┐
 │ UI (React 19, @sovereignfs/ui)         │              │ Next.js: the shell, routes, server actions        │
 │ reads and writes the device's store:   │  /api/sync   │ better-auth (§15)                                 │
 │   IndexedDB, one database per account  │ ◀──────────▶ │ sync: checks, merges, orders, stores (§12)        │
 │ actions: pure, shared with the server  │              │ /api/ops: a list's people, invitations, deleting  │
 │ suggestions, totals, aisle order: pure │  /api/ops    │   a list (online)                                 │
 │ service worker: the shell, Background  │ ◀──────────▶ │ /api/live: "group X moved" (SSE, §12.6)           │
 │   Sync                                 │  /api/live   │ stores what it cannot read (§13)                  │
 │ live listener: pulls when told         │ ◀─────────── │ notices, digests, mail outbox; jobs               │
 │ keys: each list's; encrypts and        │              │                                                  │
 │   opens every field people write (§13) │              │                                                  │
 └────────────────────────────────────────┘              └───┬──────────────────┬───────────────────┬───────┘
                                                             │                  │                   │
                                                      SQLite (sqld or      SMTP (Shopper's      a Sovereign core,
                                                      a file) or           own, when set)       if one is set
                                                      PostgreSQL (§20)
```

- **Offline first for what is shopped, online for what is decided.** Lists, items, the catalog, categories, Inventory, cards, shops and trips are written to
  the device and synced (§12), as Tusk's Desk and Tally's expenses are. A list's or a card's people, roles, invitations and deleting it for good are
  changes the server must decide at once, so they are online operations (`/api/ops`), as Tally's groups are (§12.8).
- **The server is the referee:** it checks every change against the list's people and the limits, merges it field by field, orders it, and hands it
  to the devices of the others on the list. **It reads no name, note or price** (§13): what people write is encrypted in the browser under the list's keys, the
  server merges by field stamps and folds by name key, and the device words what it shows.
- **What can be pure is pure:** building a mutation from an action, merging fields, suggestion ranking, the aisle order, a trip's total, a unit price,
  normalising a name, describing a notice in words. They take rows and the time as arguments, and the same module runs in the browser and on the
  server, so a figure has one implementation.
- **Next.js with React 19**, a long-running server, because of the jobs and the live stream.
- **SQLite by default, in production too, and PostgreSQL if the operator prefers** (§20).
- **Jobs run in the web process** on a timer from `instrumentation.ts`, with `SHOPPER_WORKER=off` for all but one process if several share a database;
  every job claims its work in the database, so two running it is safe anyway (Tusk §5).
- **The server talks to SMTP and to core,** and in phase 4 to a product database by barcode. The browser talks only to its own server.

### 5.1 Where things go

As Tusk's: `app/` for routes, `src/` for everything else, tests beside the code.

| Path                      | What                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/`                    | Routes: the landing page, sign-in, the invitation page, the signed-in area, `/api/*`                                                                               |
| `src/db/`                 | Configuration, clients, schemas per dialect, migrations at start-up (§20) — **copied from Tusk**                                                                   |
| `src/auth/`               | better-auth, its settings, the sign-up policy, the screens, the fake Sovereign for tests (§15) — **copied from Tusk**                                              |
| `src/access/`             | Every page, route and operation with who may use it; the membership conditions; input parsers (§5.2)                                                               |
| `src/crypto/`             | The instance key and envelope encryption, for what the server must hold: credentials and identity (§13.4) — envelope **copied from Tusk**                          |
| `src/keys/`               | The keys in the browser: the account's (core's or Shopper's vault), the group's and each list's, the fields and the name key (§13), on `@sovereignfs/sdk`          |
| `src/lists/`              | A list's people, its rows stamped at a join, its catalog's lifecycle (§7, §8)                                                                                      |
| `src/people/`             | Persons (§6.1)                                                                                                                                                     |
| `src/households/`         | The group, invitations, a list's people and roles, the operations (§7)                                                                                             |
| `src/catalog/`            | Normalising names, the starter catalog and its icons, categories, Inventory's layering over the starter, units, suggestion ranking (§8) — pure                     |
| `src/cards/`              | Loyalty cards: their kinds of code, check digits, decoding a scan on the device (§7.7, §22.3)                                                                      |
| `src/quantity/`           | Decimal quantities, units, unit prices, money in minor units, a trip's total (§9.3, §10.4) — pure; currencies **from Ledger**                                      |
| `src/actions/`            | Each recorded action as a pure function from intent to a mutation, and the validators (§12.2) — shared with the browser                                            |
| `src/sync/`               | The protocol, `/api/sync`, applying and merging a mutation, folding duplicates, cursors, tombstones, the live hub (§12) — the shape **from Tusk's Desk and Tally** |
| `src/local/`              | The device's store, the outbox, the sync loop, the live listener, Couldn't sync (§12) — browser only; **from Tusk and Tally**                                      |
| `src/trips/`              | Opening, closing and summarising trips (§10)                                                                                                                       |
| `src/notices/`            | Notices, digests, preferences, delivery (§14)                                                                                                                      |
| `src/portability/`        | The file format, export, import, the plugin's format (§18)                                                                                                         |
| `src/sovereign/`          | Core's notices, `People.deletePerson`, the bell, email, activity and directory calls (§15, §19) — **from Tusk**                                                    |
| `src/jobs/`               | The runner and claims — **copied from Tusk**                                                                                                                       |
| `src/mail/`               | The SMTP mailer and the mail outbox — **copied from Tally**                                                                                                        |
| `src/sw/`                 | The service worker: `@sovereignfs/pwa`'s, with the shell page and Shopper's Background Sync                                                                        |
| `src/screens/`, `src/ui/` | The signed-in screens and the shell                                                                                                                                |
| `migrations/`, `deploy/`  | Generated SQL (`sqlite/`, `postgres/`, `auth/`); the Compose setups                                                                                                |

Directories are made when a task needs them: `src/trips/`, `src/notices/`, `src/portability/` and `src/mail/` are phase 2's.

**Copied** (building-an-app §15: until the kit is published, an app copies, and says which files): from Tusk, `src/db/`, `src/jobs/`, `src/auth/` and
its fake Sovereign, `src/sovereign/`, `src/crypto/` (the envelope), `src/config/`, `src/security/` and `proxy.ts`, `src/limits/`, `src/sw/`,
`src/theme/`, the Desk's field-level sync (`src/sync/`, its local store and loop), `scripts/`, the Dockerfile and `deploy/`; from Tally, the sync's
counter per group and Couldn't sync, the mail outbox, invitations; from Roam, sealed rows (`src/crypto/sealed.ts`); from Ledger, the currency table
and its generator. Each is renamed to `SHOPPER_` and trimmed of what Shopper does not use (workspaces, boards, the personal cipher, backup to git);
none is changed in behaviour without saying so in its task. Whichever of Tally and Roam is built first is the one copied, and the task says which.

### 5.2 Access

**The permission is in the statement, at the list** (RFC 0004). Every row carries its group's `household_id`, and a list, its items and its products
carry `list_id`; every read and write of them names the list together with the account's place on it:
`… WHERE list_id = ? AND EXISTS (SELECT 1 FROM list_member lm JOIN person p ON p.id = lm.person_id WHERE lm.list_id = ? AND p.account_id = ? AND lm.left_at IS NULL)`
(`onList` in `src/access/membership.ts`). Never checked first and then touched; a refusal reads as not found. Anything a change points at must be the
same group's, in the same statement, and **an item's product is always on the item's own list**. A list Admin's operation adds `AND lm.role = 'admin'`
(`listAdminOf`). Making a list in a group is its own account's alone (`ownerOf`); a starter category is the group's, read by anyone on one of its lists.
**Inventory is its own account's alone** (§8.8): every read and write of an `inventory_item` or of a person's own category names the group with
`household.own_of` the account, in the statement (`ownerOf`); a list's copy of a category (`list_category`) is read and written as the list's.
**A card is a list's equal** (§7.7): every read and write of a card names it with the account's place on it (`card_member`, `onCard`), and its Admin's
operations add the role; a link between a list and a card (`list_card`) needs both, in the same statement.

- **Sync applies the same rule per change** (§12.5): a change to a list the account is not on, or to an item or product of one, is refused, not ignored.
- `src/access/routes.ts` lists every page, route and operation with who may use it; a test calls each as a second signed-in person, including one on
  another list of the same group, and expects not found.
- **Pull and the live stream hand a device only its lists:** a list the account leaves or is taken off stops arriving, each pull names the lists the
  reader may see, and the device deletes the rest (§12.3).

## 6. People and accounts

### 6.1 A person

`person` is Shopper's record of someone who appears on shared rows: their name, their email, and the account. **Every account has exactly one
person,** made with the account, its name and email copied from sign-in and kept in step: from core at each sign-in in suite mode, from Settings when the
person changes them standalone (§15.1, §17). Shopper has no
placeholders: everyone on a list has an account, since a list is shared by people who all shop (§26).

As in Tally, the person exists so that **a name outlives an account** (§19) and **no feature depends on core for who someone is:** core's directory is
one more way to find a person to invite (§7.3), never where their name lives.

- **A name** is what everyone on a shared list sees, on items ("added by Thulana"), ticks and trips. **An email** is seen by the person
  themselves and by the Admin of a list they are on; never by its other people, and never in a notice or an export of someone else.

### 6.2 Avatars

Initials, from the name, in a colour derived from the person's id. **In suite mode** the header's avatar and its menu show core's picture of the
person (the SDK session's `picture`), loaded from core's own address, the one place an image comes from beyond Shopper (§21); everyone else on a list
still sees initials. A photo of one's own, uploaded to Shopper, is later.

### 6.3 Who may sign up

In standalone mode (§15.1), `SHOPPER_AUTH_SIGNUP` decides who may make an account, one policy in better-auth's user-creation hook, as Tally's. In suite
mode it has nothing to decide: who may sign up is core's.

| Value                                         | Local sign-up                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `open` (**the default in 0.1.0**)             | Anyone                                                                                             |
| `closed`                                      | The first account only; an invitation can be accepted only by signing in to an account that exists |
| `invite` (phase 2, **the default from then**) | The first account, and anyone holding a valid invitation                                           |

**Signing in through core always gets an account,** whatever the value (`app-manifest.md` §4).

**Why `open` for now.** Sharing is by a link, and someone with no account must be able to make one to accept it: only `open` and `invite` allow
that. `invite` is not yet in `contracts/env.md`; adding it is the task in `sovereign` that Tally and Roam wait on (§24, epic 16), and 0.1.0 does not
wait for it. The README says what `open` means on a server reachable from the internet, and to set `closed` once everyone who is to share has an
account. When `invite` arrives it becomes the default, which changes what a server that never set the value does, and the changelog and the upgrade
note say so.

## 7. Lists and their people

**A list is what is shared, and nothing else** (RFC 0004). Each list has its own people, its own catalog (§8) and its own keys (§13), and is shared on
its own by a link. Sharing one list shows that list and nothing more.

### 7.1 The group

Every account has **one group**, made with it (`household` in code, `own_of` the account), which holds the lists it makes, its categories and
their order (§8.3), its **Inventory** (§8.8), and the counter its changes are ordered by (§12.3). **Nobody sees it:** no screen, word or setting names a group. It is never shared;
its own account is its only `member`. Kinds of group (a household, a group of friends), naming them, and more than one a person are later (§22.1).

A group is made with one list, _Groceries_, and the starter categories.

### 7.2 A list's people and roles

| Who        | May                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Member** | Everything to do with shopping on the list: rename and archive it; add, edit, tick and delete items; shop; invite; leave |
| **Admin**  | Also: remove people from the list, revoke anyone's link, delete the list for good                                        |

- **Whoever makes a list is its Admin** (`list_member`, role `admin`); everyone who joins it is a Member. Roles cannot be changed in phase 1.
- **A list with others on it keeps its Admin:** the Admin cannot leave it while others are on it. When the Admin's account is deleted, the role passes
  to the person on the list longest (§19).
- **There is no read-only role** (§26): people on a list shop together.

### 7.3 Invitations

People join a list only by accepting, never by being added: joining shows them your name.

**An invitation is a link to one list** (`invitation.list_id`). _Share_, on the list, makes one, shown once to copy and send any way; there is no email
field, no resend, no directory search and no notice in phase 1: the person who shared sees the new person appear among the list's people. Email, the
directory and the bell are phase 2.

- **An invitation** is a random token of 32 bytes, stored only as its hash, compared in constant time, valid for 14 days, single-use, revocable by
  whoever made it or the list's Admin. At most 20 live links a list. Deleting a list revokes its links.
- **`/invite/<token>`** says who invited, and nothing else (a list's name may be one the server cannot read). It offers to sign in or to create an
  account: in suite mode, through core; standalone, with Shopper's forms, as the sign-up policy allows (§6.3). **Whoever holds the link can accept it,** whatever address it was
  sent to.
- **Accepting** puts the person on that list as a Member, in one transaction, re-stamps the list's rows so that their devices pull them (§12.3), and
  tells the list's other people's devices (RFC 0002). **A link to an encrypted list carries that list's keys in its fragment**, which the server never
  sees (§13.5).

### 7.4 My lists, and those shared with me

- **My lists** are the ones you made, in your group, with _New list_. **Shared with me** are the lists others shared with you, whoever's they are,
  each with its Admin's name under it. That is all the sidebar says of lists (§16.2).
- **Sharing is a list's own:** sharing Groceries shares nothing of Hardware store. To keep a list to yourself, do not share it.

### 7.5 Lifecycle

- **Leave** (anyone on a list but its Admin while others are on it): what they added and ticked stays, by their name ("added by Sam (left)"), and the
  list goes from their devices at their next sync, with its catalog. Their links to it are revoked, and their copy of its keys deleted.
- **Remove** (the list's Admin): the same, for the person removed.
- **Delete for good** (the list's Admin, an archived list): its items, catalog, people, links and their copies of its keys go, in one transaction.
- **Limits** (§7.6) are checked by the server and said in a sentence.

### 7.6 Limits

Every limit is a setting the operator can change, with a default (the names are the first design's):

| Setting                              | Default | What                                                                              |
| ------------------------------------ | ------- | --------------------------------------------------------------------------------- |
| `SHOPPER_LIMIT_HOUSEHOLD_MEMBERS`    | 20      | People on a list                                                                  |
| `SHOPPER_LIMIT_ACCOUNT_HOUSEHOLDS`   | 20      | Groups an account has lists from, its own included                                |
| `SHOPPER_LIMIT_HOUSEHOLD_LISTS`      | 100     | Lists a person makes, archived included                                           |
| `SHOPPER_LIMIT_LIST_OPEN_ITEMS`      | 500     | Open items on a list                                                              |
| `SHOPPER_LIMIT_HOUSEHOLD_PRODUCTS`   | 5000    | Products in a group's lists' catalogs, together                                   |
| `SHOPPER_LIMIT_HOUSEHOLD_CATEGORIES` | 100     | Categories of a group, hidden included (phase 2)                                  |
| `SHOPPER_LIMIT_INVENTORY_ITEMS`      | 5000    | Items in a person's Inventory, hidden starter entries included                    |
| `SHOPPER_LIMIT_ACCOUNT_CARDS`        | 100     | Cards a person adds; people on a card as on a list, live links to it as to a list |

A limit reached offline is found when the change syncs and goes to Couldn't sync with the sentence (§12.5). Phase 1 has the first five; Inventory
(§8.8) brings the categories' and its own, and cards (§7.7) theirs.

### 7.7 Loyalty cards

**Shop loyalty cards are kept in Shopper** (RFC 0007): the cards shown at a checkout and shared with whoever shops. Wallet, the suite's app for what is
private (transport, membership, identity, documents), keeps those; moving a card between the two in a suite is later (15.6).

- **A card holds** the shop's or brand's name, the number, **the kind of code** (QR, EAN-13, EAN-8, UPC-A, Code 128 or Code 39) and its value, an
  icon and a colour (as a list's, §9.1; no shop's logo, since nothing is loaded from a third party), the name on the card and a note. **Everything
  of it is encrypted in the browser** (§13.1), under the card's own keys.
- **Added** by scanning it with the camera, decoded on the device (§22.3, brought forward), or by typing the number and choosing its kind (an EAN's
  or a UPC's check digit is checked). **Shown** full screen on a white surface, the code large and the number in text beneath it, the screen kept
  on, offline (§16.14).
- **A card is shared as a list is** (§7.2 to §7.5, RFC 0004): it has its own people, joined only by accepting an invitation by link to it; its
  **Admin** (who added it, or to whom it passed) edits, shares and deletes it, removes people and revokes links; a **Member** sees and shows it,
  and leaves. **Each card has its own keys** (§13.2), and a link to a card carries that card's keys and no other (§13.5). Leaving or being
  removed takes the card from the device. **Sharing a card shows nothing else of the person's,** and **sharing a list shares no card.**
- **A card's people, invitations and deleting it are online operations** (`/api/ops`), as a list's are; its fields sync, offline as well.
- **Cards on a list:** a list's Admin links cards to the list (from the list's settings, among the cards they are on); shopping mode shows a card
  button when the list has one (§11.1). A link (`list_card`) names a card and a list of the same group and holds nothing else; **someone on the list
  who is not on the card is not handed the link and sees no button for it.** Linking a card to a shop is later, with shops (13.5).

## 8. The catalog

### 8.1 What it is for

**Each list has a catalog of its own** (RFC 0004): what Shopper remembers about the things bought on it, so that adding is one tap and the item
arrives right. **Each person has an Inventory of their own** (§8.8, RFC 0006): what they buy, in their own words, across every list, which a list's
catalog is made from and which nobody else sees. Neither is a screen people must maintain: both fill themselves from what is added and edited, and
people may tidy them (§16.8, §9.4).

### 8.2 A product

A name, its **name key** (§8.7), a category, an icon, a default unit and quantity, a note (a brand, "the green one"), a **barcode** (kept; used in
phase 4), the **last unit price** and the unit it was for, how many times it has been bought, and when it was last bought and added. **0.1.0 has no last unit price and no barcode:** they arrive, as columns, with prices (7.1) and capture (14.1).

- **Every item points at a product of its own list.** Adding a name the list has never used makes a product there, from the adding person's Inventory
  item of that name when there is one (its category, icon, unit and quantity), else from the starter catalog when it matches (§8.6), else with the
  category guessed (§8.3) and a generic icon.
- **Editing an item's category, icon or unit can update its product,** so the next add comes right: the item dialog has "Remember for next time", on
  by default (§9.4). Its name, quantity, note and price are the item's own; the price also updates the product's last unit price when the item is
  bought (§10.4).
- **A product is tidied where it is used,** from an item's panel (§16.7): its "Remember for next time" (§9.4) writes the product, and offers to update
  the person's Inventory item too. **A product is merged or deleted** (phase 2, 5.6). Merging two (_Oatmilk_ into _Oat milk_) points every item and trip line
  of one at the other, in one mutation. Deleting a product with open items is refused with a sentence; its trip lines keep their names.

### 8.3 Categories and aisle order

Categories are a group's rows, made from the starter set when the group is made: **Produce, Bakery, Dairy & eggs, Meat & fish,
Deli, Frozen, Pantry, Breakfast, Snacks & sweets, Drinks, Household, Personal care, Baby, Pets, Other**, each with an icon. Their order is the
**aisle order**: lists and shopping mode group items in it.

- **The starter categories are read by everyone on any of the group's lists,** by their key, since they name no one's shopping.
- **A person's own categories** (Hardware, Electronics, Clothing, Gifts, Garden, Office, whatever they shop for) are made, renamed, hidden and put in
  order in **Inventory** (§8.8, §16.8; 4.7's editing, brought forward from phase 2): rows of their group whose name is encrypted under the group's
  Inventory keys (§13.2), which **nobody else holds**. A starter category stays the group's, by its key; renaming it there gives it a name of the person's, encrypted as their own
  categories' names are, on the same row.
- **A list carries its own copy of each of a person's categories its items use** (`list_category`: the list, the category it copies, its name
  encrypted under **the list's keys**, its place in the aisle order), made when an item of that category is first put on the list. The people on a
  shared list read the names of the categories its items use, and nothing else of anyone's categories. Renaming a category in Inventory renames its
  copies on the person's own lists (those they are Admin of); a copy goes with its list. **An item's category is a starter category of its list's
  group or a `list_category` of its own list,** never another group's row.
- Hidden categories are not offered; their items show under _Other_ until moved. _Other_ cannot be hidden or deleted. **In phase 1 the starter
  categories were fixed**, in the starter order.
- **A new product's category** is guessed by one pure function: the person's Inventory item if the name matches one, the starter catalog's entry if it
  matches one, otherwise the category most used by the products the device holds sharing a word with it, otherwise _Other_.
- **Per-shop aisle order** is phase 3 (§22.2); until then there is one, the list's group's.

### 8.4 Icons

Every product, category and item has an icon from the design system's grocery set, chosen with `IconPicker`. The set the plugin added (21 icons) is
too small for the starter catalog; around 80 grocery icons are added to `@sovereignfs/ui` first (task 16.4), Lucide-style, token-coloured. An item
without one shows its category's. **0.1.0 uses the set as it is,** each starter entry taking the icon that fits best, or its category's; the
larger set arrives in phase 2 with a larger starter catalog (4.8).

### 8.5 Suggestions

The add field (§16.6) suggests as the person types, from one pure function (`src/catalog/suggest.ts`), on the device, offline, drawing from, in this
order: **the person's Inventory** (§8.8, with the starter entries it does not hide), **this list's products**, and **the person's other lists'
products** (another list's product lends its quantity, unit, category and icon to a new product of this list, and is never itself used, §8.2); and,
from phase 2, the last 180 days of trip lines:

1. **Matches:** the entries whose normalised name starts with what was typed, then those with a word that does, then those within one edit of it.
   **A hidden starter entry is never offered,** and a starter entry the person renamed is offered by its new name, not its old.
2. **Ranked** within each tier by how often it was bought in the last 180 days, with recent buys counting more (a weight halving every 30
   days), then by when it was last added, then alphabetically. **In 0.1.0, which has no trip lines,** "how often" is the product's count of
   times bought, then when it was last bought (§8.2); the decayed count over trip lines arrives with trips (7.1).
3. **Already on this list:** a match open on the list shows "On the list · 2" and choosing it offers _+1_ rather than a second row (§9.3).
4. **Always last,** "Add _what was typed_" as a new item, so nobody is stuck when nothing matches.

At most eight are shown. Nothing about ranking is stored: it is computed from the rows the device already holds. With an empty field, the add field
offers **the person's recurring Inventory items not on the list first** (what staples were to be, §22.2), then the most often bought products not on
the list ("Often bought").

### 8.6 The starter catalog

About 150 common groceries in 0.1.0 and about 400 from phase 2 (4.8), in English, shipped in the code (`src/catalog/starter.ts`), each with a name, aliases (_courgette_ and _zucchini_), a
category key, an icon and a default unit. It is data, not rows: a list's product is made from an entry when it is first added there. It is
reviewed in its own task (4.3) and can grow in any release; other languages are not in phase 1.

**In Inventory it is a layer** (RFC 0006): shown together with the person's own items, and never copied into an account. A person's change to an
entry (a new name, category, icon, unit, note, recurring, hidden) is an `inventory_item` of theirs that overrides it, by the entry's key; everything
the person did not change still comes from the entry, so the starter can grow or be corrected in any release and nobody's own words are lost.

### 8.7 Names

- **Normalising** (`src/catalog/name.ts`, pure): trim, collapse spaces, Unicode NFKC, lower case in the root locale, strip a trailing plural "s" only
  where the starter catalog says so. _Oat Milk_ and _oat milk_ are one product.
- **The name key** is an HMAC of the normalised name and the list's id under a key derived from the list's first key, made **in the browser**
  (§13.3). It is how the server finds "the same product" on a list without reading a name, and it is unique per list. It reveals only that two
  products of one list share a name. (While a group is still sealed by the server, §13.7, the server makes it from the name itself.) **An Inventory
  item's name key** is the same HMAC of its normalised name and the group's id under a key derived from the group's Inventory keys (§13.3), unique per
  group, so the server finds "the same thing" in a person's Inventory without reading it either.

### 8.8 Inventory

**A person's own library of the things they buy** (RFC 0006), across every list and beyond groceries: their own names ("the good bin bags"), their
own categories (§8.3), what they buy again and again and what they buy once. It answers "the starter catalog does not say it the way we do, and is
only groceries".

- **The person's alone,** kept in their own group (§7.1), which is never shared. **Nobody on a shared list sees any of it,** and a list's people never
  pull an `inventory_item` (§12.3). A shared pantry for a home of several people is later, with kinds of group (§22.1).
- **Shown with the starter catalog,** as one list, the starter's entries and the person's own side by side; the starter is a layer under it (§8.6).
- **An Inventory item:** a name and its name key (§8.7), a category (a starter one or the person's own), an icon, a unit, a quantity, a note, whether
  it is **recurring or once** (a mark; a schedule is phase 3, §22.2), whether it is **hidden** (a hidden starter entry is offered nowhere until shown
  again), and, with the pantry (§22.2), what is on hand and a low point. Its name and note are encrypted in the browser (§13.1).
- **It fills itself:** a new name typed on any list makes an Inventory item of the person who typed it, marked once, unless they already have one, so
  nobody keeps it up by hand (§16.12); people tidy it if they want to. That write is a mutation of the person's own group, beside the list's.
- **A list's products stay** (§8.2, RFC 0004): a list keeps its own catalog, so sharing a list shares nothing of anyone's Inventory. A list's new
  product is made from the adding person's Inventory item when there is one (§8.2).
- **Written through the one path** (`src/actions/`, `src/sync/apply.ts`), merged by field, folded by name key as products are (§12.4), restored by an
  edit after a delete. Exported, imported, and removed by `People.deletePerson` (§18, §19).

## 9. Lists and items

### 9.1 A list

A name, an **icon** and a **colour**, its position among its maker's lists, its **clearing rule** (§9.5; `manual` in phase 1), whether it is archived,
its people (§7.2) and its catalog (§8). It is in its maker's group.

- **The icon and the colour** (RFC 0005): the icon one of the design system's, chosen with `IconPicker` (people choose from the set and never upload
  their own; more icons are added there, 16.18); the colour any `#rrggbb`, chosen with `ColorPicker`, which suggests the nine colours Tusk and Tally
  suggest (copied from Tally's `src/groups/colors.ts`). A new list has the cart and blue, and **a list with neither** (every list made before them) **is shown with the cart and blue** until someone on it
  chooses: the server cannot encrypt a default for it, and writing one in plain would say it.
  **Both are encrypted in the browser, as the name is** (§13.1), since an icon says what a list is for; each is its own field, merged as every field
  is, and both are exported and imported.
- **Shown** before the list's name in its header, in the sidebar (the rail shows the icon), in the phone's drawer, on Home and in shopping mode. The
  icon is drawn in the list's colour on the ordinary surface; the colour is never a background or the colour of text (Tally's rule), so light and
  dark stay readable.

- **Make** (its maker, in their own group), **rename, reorder, archive and restore** (anyone on it) are synced changes, offline as well. **Delete for
  good** (its Admin) is offered only for an
  archived list, and removes its items; trip lines keep their names and the list's name.
- **Moving a list to another group** is not offered: a list is shared by its link, not by moving it.

### 9.2 An item

The product it is for, a **name** (the product's at the time of adding; the item's own after), a **quantity** and **unit** (§9.3), a category and icon
(the product's unless changed), a **note** (up to 500 characters), a **price** (phase 2: optional, what it cost for the quantity, §10.4), its position, who
added it and when, and once ticked, when and by whom (and, from phase 2, in which trip, §10).

### 9.3 Quantity and units

- **A quantity** is a positive decimal with up to three places, stored as a canonical decimal string (`"1.5"`), never a binary float, and calculated
  with integers (`src/quantity/`). The default is the product's default, or 1.
- **A unit** is one of a fixed list: _pcs, kg, g, lb, oz, L, mL, bag, box, bottle, bunch, can, jar, pack, dozen_, or none. `QuantityStepper` steps by
  1 for counted units and by the product's last quantity otherwise.
- **Adding what is already open on the list** (the same product) does not make a second row: the device offers _+1_ (or the product's default step) on
  the open item. A second row is made only by "Add another anyway" in the item's menu, for when it is really two (two different brands, with notes).
- **Two devices adding the same product offline** both send a new item. The server folds the second into the first (§12.4): one item, the larger
  quantity, both notes kept, the earlier adder named.

### 9.4 Editing

Anyone on its list can change any field of an item, from its panel (§16.7): name, quantity and unit, category, icon, note, price (phase 2), and which list
it is on (another of the person's lists: **it takes that list's product of its name, or one made there**, so that an item's product is always on its
list, and its name and note are encrypted again for it, §13.1). "Remember for next time" (on by default) writes the category, icon and unit to the product (§8.2). **Delete** removes the item at
once, with _Undo_ in a toast for a few seconds; it is kept as deleted until pruned (§12.9).

### 9.5 Bought, and clearing

**In 0.1.0** ticking only marks the item bought: there is no trip (§10 is phase 2), and a list's clearing rule is **manual**. Bought items stay
in Bought until _Clear bought_, which is in the list's menu, is offered when shopping mode finishes (§11.3), and can be undone. The other two rules
below arrive with trips (7.2).

- **Tapping an item marks it bought** (§10.1): it moves to the list's **Bought** section, collapsed, and, from phase 2, into the person's open trip. Tapping a bought
  item again unmarks it: it is open again (and leaves the trip).
- **Clearing** removes bought items from the list. They leave the list, never the trip. Each list has a **clearing rule**, chosen in its settings:
  - **When I finish shopping** (the default): the items a trip bought are cleared when that trip finishes (§10.1).
  - **Manually:** only _Clear bought_ clears them.
  - **After a day:** bought items are cleared 24 hours after they were bought, by the device that next opens the list (the server's job does the same
    for lists nobody opens).
- _Clear bought_ is always in the list's menu. A cleared item is gone from every device; restoring the trip line to the list is "Add again" (§10.5).

### 9.6 Order

Items are grouped by category in the aisle order, and within a category by their **position**, a fractional key (Tusk's `position`, §10.4
of its design) that anyone on the list changes by dragging within the category (`DragHandleRow`, dnd-kit), keyboard too. Two devices moving one item to one
place keep the key, ties broken by id (Tusk §8.4). A list can also be shown **in the order added**, a view choice kept on the device.

### 9.7 All lists

**Every list the person is on is on Home** (§16.4, RFC 0006): a tile each, own then shared, with archived lists behind a toggle. Phase 2's _All lists_
page (`/all`, every open item of every list in one view) is not built; shopping across several lists is in shopping mode (§11.2).

## 10. Trips (phase 2)

**Everything in this section is phase 2.** In 0.1.0 a tick only sets the item's own bought fields (§9.5) and shopping mode keeps no trip (§11). Trips
arrive as an addition: a tick then also writes a trip line, and what 0.1.0 wrote is read as an item whose trip was deleted (§10.5).

### 10.1 Opening and finishing

A **trip** is one person's shopping, across the lists they shop: who, when it started and finished, the shop (§10.3), its lines (§10.2), and its total (§10.4).

- **A person has at most one open trip.** The first item they tick with none open opens one, on the device, with an id
  the device makes. Shopping mode opens one when it starts (§11).
- **Finish shopping** (shopping mode, or the trip's banner on a list) finishes it: the person's open trip gets its finish time, the
  clearing rule runs on each list it bought from (§9.5), and the other people on those lists are told (§14.1).
- **A trip left open** finishes on its own six hours after its last tick, at the time of that tick, by the server's job or the next device to notice;
  nobody is told then. An empty trip that finishes is deleted.
- **Two people shopping together** each have their own trip. Shopping mode shows "Sam is shopping too" when someone else on the list has a trip open
  (§11.1).

### 10.2 Trip lines

Ticking an item writes, in one mutation, the item's bought fields and a **trip line**: a copy of the item's product, name, quantity, unit, category
and price, the list's id and name, who ticked and when. **The line is the record;** the item can be cleared, renamed or deleted and the trip still
says what was bought. Unticking deletes the line. Editing the item's price or quantity while it is bought updates its line, and the line can be edited
from the trip (§10.5), which does not change the item.

- **Two people ticking the same item** (both offline): the first tick to reach the server stands, with its trip line; the second is folded into it and
  its line is not made (§12.4). The second person sees the item ticked by the first.
- **One ticks while another unticks:** the later to arrive stands, line and all.

### 10.3 Shops

A person's shops are rows of their group, with trips (phase 2): a name, nothing else. A trip's shop is chosen when shopping mode starts or at any time after, from
their shops by most used, or typed new (which makes one). Phase 3 gives a shop its own aisle order (§22.2).

### 10.4 Prices and totals

- **Money** is an integer of minor units of the list's currency (Ledger's currency table for decimals); a price is entered with `CurrencyInput`
  and formatted in the reader's locale.
- **An item's price is for its quantity:** 2 L of oat milk at 2.58. When it is bought, its product's **last unit price** becomes 1.29 per L
  (`src/quantity/unit-price.ts`, pure, integer arithmetic, rounded half up to the minor unit). The next time the product is added, its price is
  offered as the unit price times the quantity, in the same unit; in another unit, none is offered.
- **A trip's total** is the sum of its lines' prices, with a count of lines without one ("14 items · €62.40 · 2 without a price"). The person can type
  **the receipt's total** instead, which then is what the trip says, and the lines' sum is shown beside it.

### 10.5 The trips history

`/trips` lists the trips on the person's lists, newest first, by month: who, the shop, the date, the number of lines and the total, the person's own first if they
choose. A trip's page shows its lines by category, each editable (quantity, price, name, delete); its shop and receipt total; and per line **Add
again**, which puts the product back on a list. A trip can be deleted by its shopper or an Admin; that removes its lines and does not unmark items
still on a list (they become bought with no trip, and clear as usual). Trips are kept until deleted: they are the record, and phase 3's
insights read them.

## 11. Shopping mode

The screen for the shop, made for one hand, a moving body and no signal.

**0.1.0 has it in a light form:** what follows without the shop, the running total, the price in the long-press, "shopping too" and several lists, and
with a _Finish shopping_ that offers to clear what was bought (§11.3). Each is tagged where it appears. Shopping mode with trips is 7.6.

### 11.1 The screen

```
┌─────────────────────────────────────┐
│ ‹  🛒 Groceries             Lidl ▾  │  ← back, the list's icon and name; the shop (phase 2)
│    12 to get · 3 in basket · €8.70  │  ← progress and running total
│ Sam is shopping too                 │  ← only when another member's trip is open
├─────────────────────────────────────┤
│ [ + Add item ]                      │  ← opens the add field
│ PRODUCE                             │
│  ○ 🥬  Spinach            1 bag     │  ← large rows, the whole row ticks
│  ○ 🍌  Bananas            6 pcs     │
│ DAIRY & EGGS                        │
│  ○ 🥛  Oat milk           2 L       │
│ ...                                 │
├─────────────────────────────────────┤
│ IN BASKET (3)                     ⌄ │  ← ticked items drop here, undoable
├─────────────────────────────────────┤
│ 3 in basket   [ Finish shopping ]   │  ← fixed to the bottom, always visible
└─────────────────────────────────────┘
```

Before phase 2 the shop picker, the total and the "shopping too" line are absent, and the line under the title reads "12 to get · 3 in basket".

- **The header is the list's** (RFC 0005): back, the list's icon and name, and the progress under them. On the right, only what a feature adds
  there: **the card button** when the list has a card linked that the person is on (§7.7; with several, it opens a choice, and a card opens full
  screen, §16.14), and the shop (phase 2).
- **Large rows,** at least 56 px, **the whole row ticking** (`CheckableListRow`), in the aisle order. A ticked row drops into **In basket** with a
  short animation, and a toast offers _Undo_.
- **The screen stays on** (the Screen Wake Lock API, where the browser has it; where it does not, nothing is said).
- **Long-press a row** for its price and quantity, in a small sheet sized for a thumb, so a price is typed where it is picked up (phase 2; until then
  a long press opens the item, §16.7).
- **Adding** is behind **+ Add item**, which opens the same add field (§16.6), for what is seen and wanted; it closes after adding or on Escape. What
  is added goes on the list being shopped, and straight into the basket with the toggle **Put it straight in the basket** (off by default), for what
  was picked up and was not on the list.
- **Finish shopping** is a bar fixed to the bottom of the content, above the phone's safe area, always visible, with the basket's count
  ("3 in basket · _Finish shopping_"); the list has room beneath it so that its last row is never under the bar.
- **The running total** (phase 2) is the trip's, from the lines with a price.
- **Freshness** is the fastest the operator allows (§12.6), whatever the person's setting, while the screen is open (0.1.0: every 10 seconds, or the operator's interval if that is shorter).

### 11.2 Starting, and several lists

**Shop** on a list opens shopping mode for it (in 0.1.0 that and nothing more; the rest of this paragraph is phase 2), opens the person's trip (§10.1), and asks for the shop (skippable; remembered as last used). From the
list's menu, **Shop several lists** (phase 2) picks lists to shop at once: their items merge into one aisle order, each tagged with its
list. The address keeps the choice (`/shop?h=<group>&l=<id>,<id>`), so the back button and a reload keep it.

### 11.3 Finishing

**In 0.1.0** _Finish shopping_ asks "Clear 3 bought items from Groceries?" (_Clear_ or _Keep_) and returns to the list; leaving without finishing changes
nothing. The rest of this section is phase 2.

**Finish shopping** shows a summary: what was bought, with its total and a field for the receipt total; what is left on the lists; the shop.
Confirming finishes the trip (§10.1). Leaving shopping mode without finishing keeps the trip open; the list shows a banner, "You're shopping at Lidl ·
3 in basket · Finish".

### 11.4 Offline

Shopping mode needs nothing from the network after the first load of the device (§12.10). An item another member added while this phone was offline
appears when it syncs, in its aisle; one they deleted disappears, unless this phone ticked it first, in which case the tick stands and the item comes
back as bought (§12.4).

## 12. Offline and sync

The design goal is Tusk's and Tally's: **a person does not feel any of this.** Nothing waits for the network, nothing asks about a conflict, and
nothing says "saving". Settings shows when the device last synced, for anyone who wants to know. The shape is Tusk's Desk (field-level changes) with
Tally's counter per group, here each account's group (§7.1).

### 12.1 The model

- **The device holds the lists the account is on, by group, and nothing else of a group:** their people (names), open and bought items, products,
  the group's starter categories and the lists' copies of others (§8.3), **the account's own Inventory and categories** (§8.8), **the cards the
  account is on** and their links to its lists (§7.7), and, from phase 2, shops and trips of
  the last 180 days with their lines, in IndexedDB through `idb`, one database per account (`shopper-<account id>`). Screens read from it, and
  suggestions, totals and aisle order are computed from it, so everything is readable and writable offline. Older trips are fetched online when the
  history is scrolled to them.
- **The device holds what it has opened,** as the screens need, and the keys that open it, until sign-out deletes both (§12.10). What it sends and
  receives is ciphertext (§13).
- **A recorded action is written to the device at once** and, in the same IndexedDB transaction, to the outbox. The sync loop sends it.

### 12.2 Mutations

An action ("tick this item", "rename this product") is a pure function in `src/actions/` that turns intent into a **mutation**: one or more row
changes, with an id made by the device, and the group. The example is a tick as phase 2 makes it; **in 0.1.0 it is the first change alone**,
the item's `boughtAt` and `boughtBy`.

```json
{
  "mutationId": "…",
  "householdId": "…",
  "changes": [
    {
      "table": "item",
      "id": "…",
      "fields": { "boughtAt": 1793000000000, "boughtBy": "…", "tripId": "…" }
    },
    {
      "table": "trip_line",
      "id": "…",
      "create": true,
      "fields": { "tripId": "…", "itemId": "…", "productId": "…", "name": "Oat milk", "quantity": "2", "unit": "L", "price": 258 }
    }
  ]
}
```

- **Ids are made by the device,** so a new item, product or trip exists at once and everything can point at it offline. A mutation's id makes sending
  it twice harmless: the server records what it has applied.
- **Only what changed is sent:** a field, not a row (Tusk's Desk). That is what makes most conflicts vanish (§12.4).
- **What syncs offline:** everything about lists, items, products, categories and the aisle order, Inventory, a card's fields and its links to
  lists, shops, trips and trip lines. Everything else is
  online (§12.8).
- **The validators are one module,** run by the browser before it queues and by the server before it applies.

### 12.3 The endpoint

`POST /api/sync`, with the session cookie and `Origin` checked. A request carries the outbox in order, and a cursor per group; the answer carries what
was applied (with any fold, §12.4), what was refused and why, the groups the account is on a list of, and the changes since each cursor.

- **Order is a counter per group** (`household.seq`), as Tally's. Applying a mutation is one short transaction: increment the group's `seq`, merge each change field by field, stamp each changed field and row with the `seq`, record the mutation id, write any notice. The
  increment serialises one group's writes without holding up any other.
- **Pull** returns, per group, rows of the reader's lists whose `seq` is past the cursor (and, for the reader's own group alone, its Inventory and
  categories: **an `inventory_item` is handed to nobody but its group's own account,** a condition of the statement, §5.2; and the group's cards
  the reader is on, with the links between those cards and the reader's lists), paged at `seq` boundaries, tombstones and aliases included,
  and **names every list of the group the reader may see**: the device deletes any other it holds, with its items, people and catalog. **Joining a
  list re-stamps its rows** at the join's `seq`, so a device whose cursor is past them pulls them; an item moved to a list a reader is not on leaves a
  tombstone handed only to readers who cannot see it where it is now. A group new to the device starts at zero; one the account is on no list of any
  more is named as gone, and the device deletes its copy.
- **A device syncs** after a write (debounced, 300 ms), on load, when the tab regains focus, when it comes back online, when the live stream says so
  (§12.6), on its freshness interval while visible (0.1.0: there is no live stream, and the interval is the operator's
  `SHOPPER_SYNC_INTERVAL_SECONDS`), and through Background Sync where there is one. One tab syncs at a time (Web Locks); the others
  see the store change (BroadcastChannel).
- **Retrying is safe,** and a lost answer is only a retry. **A protocol version** travels with each request; a device too old is told to update, and
  keeps its outbox.

### 12.4 Conflicts

Resolved by rule, in the background, with nothing asked. Fields merge independently, so two people editing different things of one item both stand.

| What happened                                                                                           | What results                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two people change different fields of an item, product or list                                          | Both changes stand                                                                                                                                                                          |
| Two people change the same field                                                                        | The one that reached the server later wins                                                                                                                                                  |
| Two people add the same product to one list (neither saw the other)                                     | **Folded:** the later item becomes an alias of the earlier; one item, the larger quantity, both notes joined, the earlier adder named. A device's later changes to the alias go to the item |
| Two people tick the same item                                                                           | **The first tick stands,** with its trip line (phase 2); the second is folded into it and changes nothing                                                                                   |
| One ticks, another unticks                                                                              | The later to arrive stands, with or without its line                                                                                                                                        |
| One edits or ticks an item another deleted                                                              | The edit restores it: losing someone's work is worse than an item coming back. A tick restores it as bought                                                                                 |
| One edits a bought item another cleared                                                                 | The edit stands on the item and its trip line; the item stays cleared                                                                                                                       |
| Both delete                                                                                             | Deleted                                                                                                                                                                                     |
| Two people move an item to one position                                                                 | Both keep the key; ties break by id, so every device shows one order                                                                                                                        |
| An item is added to a list another person archived or deleted                                           | Archived: the list is restored. Deleted for good: refused, to Couldn't sync                                                                                                                 |
| Two people make a product with the same name on a list (or two devices an Inventory item with one name) | **Folded** by name key: the later becomes an alias of the earlier, and its items and lines point at the earlier                                                                             |
| A product is merged into another while a device adds an item for it                                     | The item points at the product it was merged into                                                                                                                                           |
| Two trips finish the same item's clearing (phase 2)                                                     | Cleared once                                                                                                                                                                                |

Folding (`src/sync/fold.ts`) is applied by the server in the mutation's transaction and recorded in `alias` (§20.3), which pull hands to devices so
they re-point what they hold. It is the only change the server makes that a device did not send. **Joining two notes needs their text,** which the
server cannot read (§13): it keeps the later item's note, still encrypted, on the alias, and the first device that pulls the alias joins the two
(earlier first) and writes the result through the one path, the same on every device.

### 12.5 What the server refuses, and what the person sees

The server re-checks everything, whatever the device said: the account is on the list a change is for; every row a change points at is the group's,
and an item's product is on its list; a value is encrypted for its row's list (§13.1); the list is not deleted for good; the limits (§7.6); the sizes; a quantity is positive and well-formed; a unit is known; a category is
the group's. **A refused change is not thrown away:** it goes to **Couldn't sync** (Settings › Preferences › This device, and a quiet mark on the avatar) with the reason in a
sentence ("That list is not shared with you any more", "Groceries was deleted", "Groceries has 500 items, the most it can hold"), from where it can be moved to another
list, or discarded. A refused tick is undone with a toast that says why.

### 12.6 Freshness: interval or live

**In 0.1.0 freshness is the operator's, and fixed:** every device pulls after a write, on load, on focus, when the network returns, and every
`SHOPPER_SYNC_INTERVAL_SECONDS` (20 by default) while visible, and every 10 seconds in shopping mode. **Live updates and the choice per device below are
phase 2** (6.4); what follows is the full design.

How soon a device sees another member's change is **a setting**, chosen per device within the operator's limits:

| Setting                             | Default | What                                                                   |
| ----------------------------------- | ------- | ---------------------------------------------------------------------- |
| `SHOPPER_SYNC_LIVE`                 | `true`  | Whether live updates are offered                                       |
| `SHOPPER_SYNC_INTERVAL_MIN_SECONDS` | `10`    | The shortest interval anyone may choose (10 to 600)                    |
| `SHOPPER_SYNC_LIVE_MAX_CONNECTIONS` | `10`    | Live connections an account may hold at once (one per open tab or app) |

In **Settings › Preferences › This device › Updates from others**: **Live** (the default where offered), **Every 10 seconds**, **Every 30 seconds**, **Every 2
minutes**, or **Only when I open Shopper**, with the choices below the operator's minimum not offered. It is kept on the device, not the account: a
laptop and a phone may want different things. **Shopping mode always uses the fastest choice offered** while it is open (§11.1).

- **Live** is a server-sent-event stream, `GET /api/live`, with the session cookie, held open while Shopper is visible. It carries only
  `{ "household": "<id>", "seq": <n> }` when a group the account is on a list of moves on, and a heartbeat every 25 seconds; the device then pulls through
  `/api/sync` as usual. **No list data travels on the stream,** so it adds nothing to what access (§5.2) and encryption (§13) cover. It is closed when
  the tab is hidden and reopened when it is shown, with a pull. While live, the device still pulls every five minutes, in case a signal was missed.
- **The signal stays in the process.** The suite's portable SQL forbids `LISTEN/NOTIFY` (building-an-app §8), so the hub that tells streams a
  group moved (`src/sync/live.ts`) is in memory. That is right for one Shopper process, which is how an instance runs it. **With more than one
  process,** the operator sets `SHOPPER_SYNC_LIVE=false`, the README says so, and devices poll; the start-up check cannot tell, so it is a documented
  setting, not a guess.
- **Offline,** none of this matters: the device syncs when it comes back.

### 12.7 Undo

Ticking, unticking, deleting an item and clearing bought show a toast with _Undo_ for five seconds; undo is a new mutation that reverses the old, so
it works offline and syncs like any other.

### 12.8 What needs a network

Stated in the app and in the user's documentation:

- **Signing in, and the first load on a device.**
- **Inviting, accepting, revoking a link, removing someone, leaving and deleting a list or a card for good** (`/api/ops`, which answers at once and is undone
  with a toast on a refusal, as Tally's groups are).
- **Settings, notices, export and import, and trips older than 180 days.** Each says so offline, and changes nothing.
- **On iPhone, sync happens only while Shopper is open.** Safari has no Background Sync; live updates stop when the app is in the background.
- **A browser can evict storage.** Persistent storage is requested (`navigator.storage.persist()`); unsent changes could still be lost if it evicts.
  Settings says whether it was granted.
- **A shared computer** holds a signed-in person's lists until they sign out.

### 12.9 Keeping the history small (phase 2)

Phase 1 keeps everything, which a list's first months do not make large (6.6).

Deleted and cleared items are hard-deleted after 30 days; deleted products, categories, shops and lists after 30 days; trips and their lines are kept
until deleted (§10.5). A removed row leaves a tombstone of id and `seq` so that devices learn of it. Tombstones, aliases and applied-mutation records
go after 90 days; a device whose cursor is older gets a fresh snapshot of that group, sending its outbox first.

### 12.10 First load, sign-out and an ended session

As Tusk's §8.5 and Tally's §11.7: the first load pulls each group's snapshot in pages, the last-used list's group first and its lists before its
trips; later loads paint from the device with no spinner, on any network; signing out deletes the device's database after trying to send the outbox,
and warns if it cannot; a session that ended elsewhere (a password reset, core's logout) is found at the next sync, which shows sign-in and no data,
and keeps the outbox for the same account.

## 13. Encryption

**What people write into Shopper is encrypted in the browser, under keys of each list's own, held only by the people on that list, always** (RFC 0001,
RFC 0004, the owner's decision of 2026-11-21, §26). It is the suite's encryption (`sovereign`'s RFC 0005, through `@sovereignfs/sdk`), not Shopper's
own: Shopper calls the SDK and holds no cipher. There is no setting and no opt-in. **Not yet audited:** the SDK's design and code have not been reviewed
by a cryptographer or audited, and every place Shopper describes the feature says so.

### 13.1 What is encrypted

| Encrypted in the browser, under the list's keys (Inventory and a person's own categories under their group's Inventory keys; a card under its own)                                                                                                                                                                                                                                 | Readable by the server                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Household: name; list: name, icon, colour; item: name, note, price; product: name, note, barcode, last unit price; category: name (a starter category is its key until renamed); list category: name; inventory item: name, note; card: shop, number, kind of code, code, icon, colour, name on the card, note; shop: name; trip: receipt total; trip line: name, list name, price | Ids, `household_id`, `list_id`, `product_id`, `category_id`, `trip_id`, quantities and units, the icons of items, products and categories, positions, times, ticks, roles, who is on which list, counts, `seq`, the field stamps, name keys, the key epoch, sizes |

- **Each field is its own ciphertext** (`encryptBytes` under the list's content key, `importDocumentKey`), bound to list, table, row, field and epoch,
  and stored as `e2.<epoch>.<list>.<row>.<ciphertext>`, so a value moved to another row, field or list does not open, and the server, which cannot
  open it, still sees which list it is for. **The server refuses a value whose list is not its row's** (a row moved to another list on another device
  in between); the device keeps it in Couldn't sync. A mutation (§12.2) carries the ciphertext where it carried the text; the validators check shapes
  and sizes.
- **An item that changes list is encrypted again for the new one:** the device sends its name and note again, whatever the change was (a move, its
  Undo, a refused change moved to another list), and the server refuses a change of list without them. Its product is one of the new list's (§9.4).
- **Prices, shops, trips and barcodes** arrive, encrypted, with the phase that adds them.
- **Inventory** (§8.8) and a person's own categories are bound the same way to their group in place of a list, under the group's Inventory keys
  (§13.2); a list's copy of a category (`list_category`) is the list's, under the list's keys. **A card** (§7.7) is bound the same way to the card in
  place of a list, under the card's keys.
- **Field merging is unchanged** (§12.4): field stamps say which write is later, and the value is opaque. **Search, suggestions, totals, unit prices,
  aisle order and the plugin's import** run on the device, over what it has opened; the server has no copy of any of them.
- **The server never shows, logs or decrypts** a value, and a screen that cannot open one shows `LockedState`, never ciphertext.

### 13.2 Keys

- **An account's key comes from how it signs in.** Through core: core releases the app key (`appKeys` from `@sovereignfs/sdk/keys`), and its
  passkeys, recovery kit and escrow are core's. With a password: Shopper's own vault (`AppVault` and `vaultRoute` from `@sovereignfs/sdk/vault`,
  `localVault` from `/local-vault`) keeps the keys, unlocked at sign-in from the password, which never reaches the server (the browser sends the value
  it derives), and the recovery kit is shown by Shopper once after sign-up. Which it is follows from the instance's mode (§15.1), never from the viewport. `src/keys/` is one
  interface over both.
- **A group has a keyring** (every epoch's key, 32 random bytes each), made in the browser of its account when it **moves** (§13.7), and kept by that
  account alone, **wrapped under its app key** in `household_key` (WebCrypto's AES-GCM, `src/keys/household.ts`, until the SDK has a call, 16.15). The
  pull hands it to the group's own account and to nobody else.
- **A list's keyring is derived from its group's** (`deriveListKeyring`: each epoch's key through HKDF, `shopper:list-key:v1`, with the list's id), so
  the account's devices hold every list's keys with nothing more stored, and **one list's keyring opens nothing of another list's, nor gives back the
  group's**.
- **A group's Inventory keys are derived from its keyring** the same way (`shopper:inventory-key:v1`, with the group's id), and are never given to
  anyone: no link carries them and no `list_key` holds them, so nobody on a shared list can open a person's Inventory or own categories, even from a
  copy of the database.
- **A card's keyring is derived from its group's** as a list's is (`shopper:card-key:v1`, with the card's id), and someone given a card by a link
  keeps their own copy in `card_key`, as `list_key` (`lr1.`), deleted when they leave it or are removed. Its epochs follow a list's: none is made
  until 16.8, so removing someone from a card does not change its keys yet (§13.6).
- **Someone given a list by a link keeps their own copy of its keyring** in `list_key`, wrapped under their own app key (`lr1.`), kept by
  `list.key.mine`, handed back to them in each pull of a list they are on, and deleted when they leave it or are removed, with the list and with the
  person. Until the server has it, the copy waits in the browser (`src/keys/pending.ts`) and is used meanwhile. A device looks for its own copy first,
  then derives.
- **On the device** (`src/keys/transport.ts`), a change is encrypted under the keys of the list it is for, followed through the outbox in order from
  the server's version of the row; a group whose keys are not open yet (a locked key, or not heard of since the page opened) is held, in order; a
  change for a list it will not get keys for goes to Couldn't sync rather than holding everything after it.
- **A key epoch** is part of every value and keyring; **phase 1 makes no new epoch:** removing someone from a list does not change its keys (§13.6).
  When `sovereign` lets an app seal a key to its own people (16.8), removing someone will add an epoch to that list, sealed to those who remain.
- **Signing out** forgets the keys this browser holds and deletes the device's store (§12.10).

### 13.3 The name key

`HMAC-SHA-256(K_name, list_id ‖ normalised name)`, with `K_name` derived by HKDF (`shopper:name-key:v3`) from the list's **first** key, made in the
browser and sent with the product (`n3.`). The server folds products of one list whose name keys are equal and keeps one per name on a list, without
reading a name. An Inventory item's name key is the same HMAC with the group's id, under `K_name` derived from the group's Inventory keys, and the
server folds a person's Inventory by it (§8.7). It does not change with the epoch, so folding holds across devices; it differs from list to list, so the same name on two lists says
nothing; the cost is that someone removed from a list who also had a copy of the database could test a name they guess on it.

### 13.4 What the server still holds

The server seals at rest, under `SHOPPER_ENCRYPTION_KEY` (Tusk's envelope, `src/crypto/`), only what it must read itself: a **person's name and
email** (mail, the invitation page and a list's people need them before a reader has any key, and core and better-auth hold them in plain), an
**invitation's email**, **core's refresh token**, and a **push device's keys** (RFC 0002); and, until its group moves (§13.7), the content of a list.
Rotation is `SHOPPER_ENCRYPTION_KEY_PREVIOUS`, re-wrapping those only. `docs/encryption.md` says plainly that the server can read these.

### 13.5 Sharing and encryption

- **By a link:** the link carries a secret of 32 random bytes in its fragment (`/invite/<token>#<secret>`), which never reaches the server. The
  inviter's browser stores **the list's keyring, and no other**, wrapped under it (`lk2.`, `src/keys/link.ts`), beside the token's hash; the invitation
  page keeps the fragment in the tab and removes it from the address first; accepting gives the newcomer the wrapped copy once and deletes it, and
  their browser keeps the keyring under their own app key (`list.key.mine`, §13.2). A used, revoked or expired link opens nothing. Whoever holds the
  link can accept it (§7.3). **A link to a card** is the same, with **the card's keyring, and no other** (§7.7).
- **By email or from the directory** (phase 2), the link carries no fragment, since the server sends it: the newcomer joins and waits until a device of
  someone on the list seals the key to them.

### 13.6 What it protects, and what it does not

- **It protects against someone who reads the server:** a copy of the database, a backup or a disk holds ciphertext and wrapped keys. Someone given one
  list cannot open another list's rows, even from such a copy.
- **It does not protect against whoever runs the server,** which sends the app's code. Shopper never says the operator "cannot" read anything.
- **The server still sees** who is on which list, how many lists and items there are, quantities and units, when things are ticked, and sizes.
- **Removing someone from a list or a card does not change its keys yet.** They stop receiving it at once; someone who kept the key and also got a copy of the
  database could read what is added to that list after.
- **A forgotten password and a lost kit lose a password account's lists for good,** unless someone they shared a list with still has its key.

### 13.7 Moving to device encryption

**A group starts as the server seals it** (each new account's), and **moves** once its device has the key (RFC 0001, amendment 2): `GET
/api/keys/move` opens its rows one last time for its account, each with its list; the device makes the group's keyring, derives each list's, encrypts
every row under its list's keys, and `POST` writes them all, empties the sealed content, keeps the keyring and marks the group encrypted, in one
transaction, only if its `seq` has not moved and every value is for its own row and list. **A group with anyone else on one of its lists, or a link to one of them waiting** (made while it was sealed, so carrying no keys), **does not move**
(they could not be given keys without a link): it stays sealed by the server, and loses nothing. **Its Inventory and its account's own categories**
(§8.8) are sealed by the server too, as the rest of its content is, and move with it. Lists shared after the move carry their keys in their
links.

## 14. Notices (phase 2)

**Everything in this section is phase 2.** 0.1.0 has no notices, no bell and no mail but sign-in's: the person who shares sees the new person appear among
the list's people, and everyone sees changes when their device syncs.

### 14.1 Kinds

Something a person is told: a row per person told, written in the change's transaction (or by the digest job), **never for what a person did
themselves.**

| Kind            | Who is told                                                                                      | Default |
| --------------- | ------------------------------------------------------------------------------------------------ | ------- |
| `invited`       | An account here that an invitation names, by verified email or `sub` (§7.3)                      | On      |
| `member_joined` | The list's other people, when someone accepts                                                    | On      |
| `removed`       | The person removed                                                                               | On      |
| `admin_passed`  | Someone who became a list's Admin because its Admin's account was deleted (§19)                  | On      |
| `trip_finished` | The list's other people: "Thulana finished shopping at Lidl · 14 items"                          | On      |
| `items_added`   | The list's other people: "Sam added 3 items to Groceries", one per list and adder per 30 minutes | **Off** |

- **Words:** a notice in Shopper's own bell carries what it names encrypted, and the device words it ("Sam added Oat milk"). One that leaves the app,
  through core's bell, mail or a push, says only what happened and who did it: "Sam added 3 items to a list" (§13).
- **`items_added` is a digest:** each item added writes a count into `notice_digest`, keyed by recipient, list, adder and window; the digest job turns
  a window into one notice once it has been quiet for 30 minutes or is 30 minutes old. An item added and removed in the window is not counted.
- **The bell,** left of the avatar, as Tally's: the unread count up to "99+", `NotificationsPanel` with the latest, each opening where it points;
  **`/notifications`** the whole list, by day. Read per notice, and "Mark all read". Kept 90 days, at most 500 a person. A notice for a list the
  person has left is not shown. The unread count shows offline as last synced.

### 14.2 Preferences

Per kind and per channel, in **Settings > Notifications** (`notice_pref`). Shopper's bell is the channel for every kind that is on; the defaults are
the table's.

### 14.3 Delivery

| Channel            | Standalone                        | Suite mode                                               | Default on for                                                       |
| ------------------ | --------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| **Shopper's bell** | Always                            | Always                                                   | Every kind that is on                                                |
| **Email**          | Shopper's mail (`SHOPPER_SMTP_*`) | Core's email (`email:send`), or Shopper's if not granted | Invitations (always by email when an address is given) and `invited` |
| **Core's bell**    | —                                 | `notifications:send`, a link back to the notice's place  | Every kind that is on                                                |
| **Push**           | Web Push (RFC 0002)               | Web Push                                                 | A channel in the same table (19.3)                                   |

- **Mail is sent in the background** through `mail_outbox`: a row written in the change's transaction, claimed by the mail job, retried with backoff,
  never logged with its address or content. Invitations go the same way.
- **With no channel beyond the bell** (no mail set up, no core), Settings says so; nothing fails for it.
- Each send to core carries a `key`, so a repeat within a day is one send; `NotSupportedError`, a refusal or no core sends nothing and changes nothing
  else.

## 15. Sign-in and core

### 15.1 Sign-in

**On `@sovereignfs/auth`** ([ADR 0001](docs/adrs/0001-sign-in-on-sovereignfs-auth.md), `sovereign`'s auth.md): better-auth on the package's
preset in a store of its own (`shopper_auth`), its tables the package's. **An instance signs people in one way, never both** (RFC 0005):

| Mode                                      | Who signs in, and how                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Suite mode** (`SHOPPER_CORE_*` are set) | Everyone, through core: the package's `./core` on the SDK's steps (PKCE, matched by `sub`), `SHOPPER_CORE_URL` being the instance's own address       |
| **Standalone mode** (no core)             | Everyone, with Shopper's own accounts (`SHOPPER_AUTH_LOCAL=1`): a password; **passkeys and an authenticator app with backup codes are phase 2** (2.8) |

- **In suite mode `/sign-in` and `/sign-up` show nothing:** someone with a session goes to `next` (or `/`), anyone else straight to
  `/api/auth/sign-in/sovereign?returnTo=…`, keeping an invitation's `next` through the round trip. Coming back from core with `?error=` shows a small
  page with the reason and _Try again_, and does not redirect, so that a failure at core cannot loop. `/sign-up` lands on core's sign-in, one click
  from _Create account_, until core can be asked to open on its sign-up page (`prompt=create`, 16.17). The landing page's button says _Sign in with
  Sovereign_.
- **Standalone, the forms are the design system's** (`SignInForm`, `SignUpForm` and the reset pair of `@sovereignfs/ui`, as core renders them).
  Shopper keeps only what is its own: deriving the password, opening the vault, the recovery kit after a reset (in the same `AuthCard`), and where the
  person goes next. Email is verified and passwords reset only with mail set up; signing in unverified sends no link, and the sign-in page offers a
  new one. The server is sent the sign-in value the page derives, never the password, and a 0.1.0 password moves at its next sign-in for 90 days
  after the upgrade (auth.md §8.1).
- **An instance configured with both** (`SHOPPER_CORE_*` and `SHOPPER_AUTH_LOCAL=1`) **starts in suite mode** and logs, once at start-up, that its
  local sign-in is off and which setting to remove; nothing else changes, so an instance upgraded with both keeps running. Its password accounts
  cannot sign in while it is in suite mode; giving them a way across to core is a candidate (15.5), not designed.
- A session that came from core is checked against it every hour, and signing out of one goes through core's sign-out, which decides what else it
  ends.
- **Making an account makes its person and its own group, with a first list** (§6.1, §7.1), or, through an invitation, also joins that list.
- **There is no linking** of a core account and a local one: an instance has one kind (task 2.9 is superseded). Name, email and picture from core are
  read from the session at each sign-in, and shown read only (§17).

### 15.2 Core's notices

Back-channel logout at `/api/sovereign/backchannel-logout` ends the sessions of the core session it names, or every session of the person; account
deleted at `/api/sovereign/account-deleted` runs `People.deletePerson` (§19) and answers `200` only once done. Both are `@sovereignfs/auth`'s
`coreNotices`: checked by the SDK, a replayed `jti` refused after a restart (`sv_core_notices`), sessions ended through better-auth, the person's
refresh token dropped. Shopper keeps a bounded form and one rate limit in front of them; 404 where core is not set.

### 15.3 The manifest

```json
{
  "manifest": 5,
  "prefix": "shopper",
  "name": "Shopper",
  "description": "Shopping lists shared one by one, working in the shop with no signal, and remembering what you buy",
  "icon": "/icons/icon.svg",
  "port": 3007,
  "health": "/api/health",
  "launch": "/",
  "signIn": {
    "redirect": ["/api/auth/callback/sovereign"],
    "backChannel": "/api/sovereign/backchannel-logout",
    "accountDeleted": "/api/sovereign/account-deleted",
    "export": "/api/sovereign/export",
    "scopes": ["openid", "profile", "email", "offline_access", "directory"]
  },
  "encryption": { "return": "/keys/return" },
  "database": true,
  "generate": ["SHOPPER_AUTH_SECRET", { "name": "SHOPPER_ENCRYPTION_KEY", "bytes": 32 }, { "name": "SHOPPER_VAPID_PRIVATE_KEY", "bytes": 32 }],
  "core": ">=0.126.0 <1.0.0"
}
```

- **What workstream 0001 adds** (each with the task that uses it): `encryption` (18.3), core's key release to `/keys/return` (§13.2), which gives
  the app the `keys` scope once the operator allows it (not a scope the sign-in asks for);
  `signIn.export` (20.1), core's ask for a person's part of their export (§18.1); `SHOPPER_VAPID_PRIVATE_KEY` (19.1), the push key (RFC 0002).

- **`directory` and `offline_access`** (phase 2: **0.1.0 asks for `openid`, `profile` and `email` only**, and the manifest above is what phase 2 ships)
  are for finding people to invite in core's directory, which the SDK does as the person (`sv.as({ sub })`) with
  their refresh token. That token is a credential, kept only through envelope encryption (`credential`, §20.3). If a core refuses the scopes, or the
  person did not grant them, inviting works exactly as alone. The refresh token is the SDK's alone, in its `tokenStore` in the auth store, sealed
  with Shopper's key ring (`src/auth/sdk-stores.ts`).
- **The `core` floor** is raised, if needed, to the first release that shipped the directory scope and the app scopes Shopper calls, checked against
  core's changelog in that task.
- **Manifest 5** (17.1), as `sovereign`'s template, with its `core` floor: the version a core must read to host Shopper. `encryption` (18.3) and
  `signIn.export` (20.1) are added by the tasks that use them.
- **`pooling`** is not set, as Tusk's and Tally's.
- **`data`** is not needed until phase 4's photos and receipts (§22.3), which add `/data/media`.

### 15.4 Core's services

| What                            | Hosted                                                      | Alone                        |
| ------------------------------- | ----------------------------------------------------------- | ---------------------------- |
| Sign-in                         | Core only (suite mode, §15.1)                               | Local accounts               |
| Finding people to invite        | An email address, and core's directory by name (§7.3)       | An email address             |
| Notices                         | Shopper's bell, and core's bell (`notifications:send`)      | Shopper's bell               |
| Email                           | Core's (`email:send`) for accounts; Shopper's for addresses | Shopper's (`SHOPPER_SMTP_*`) |
| Export, import, account deleted | A line on the person's activity page (`activity:write`)     | Nothing                      |

In phase 2 the operator grants the three app scopes when hosting; 0.1.0 needs none, and uses only the first row of this table, sign-in. **An instance without SMTP for Shopper** can still invite by link; the invitation dialog says
email to new people is not set up.

## 16. Interface

Designed anew; the plugin's layout is not carried over, though its lessons are (§16.12).

### 16.1 Principles

`@sovereignfs/ui` throughout, imported directly; `--sv-*` tokens only; Hanken Grotesk served by the app. **Screens paint from the device** (§12.1), so
after the first load nothing shows a spinner to see what was already seen; a screen that needs the server (notices, settings, old trips) shows a
skeleton. Every surface has an empty state that says what to do next. An item not yet synced shows a small clock mark and nothing more. **Home is where
Shopper opens, and the last list is one tap from it** (§16.4); everything else is one step away. Prices are tabular figures with their currency. Bought is shown by a tick, strikethrough and a
muted row, never by colour alone.

### 16.2 The frame

The frame around every signed-in page is **`@sovereignfs/ui`'s** (RFC 0005, 16.20 to 16.24), not Shopper's own: `AppFrame` wires the header, the
sidebar, the content and an optional right column on a desktop, and `MobileHeader`, the content, `MobileFooter` and a `Drawer` on a phone (§16.11).
The same routes on both; only what is drawn differs. Shopper adopts it first; Tusk and Tally follow in their own repositories.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ☰  shopper.                                       (apps) (bell) (avatar)     │
├────────────────────────┬──────────────────────────────────┬───────────────────┤
│ ⌂ Home                 │                                  │                   │
│ ▦ Inventory            │                                  │  an item (§16.7), │
│ ▭ Loyalty cards        │            content               │  when one is open │
│                        │                                  │                   │
│ MY LISTS               │                                  │                   │
│ 🛒 Groceries      12   │                                  │                   │
│ 🔧 Hardware store  4   │                                  │                   │
│    + New list          │                                  │                   │
│ SHARED WITH ME         │                                  │                   │
│ 🛒 Groceries       3   │                                  │                   │
│    Thulana             │                                  │                   │
│                    ⇤   │                                  │                   │
└────────────────────────┴──────────────────────────────────┴───────────────────┘
```

- **Header** (`Header`, with the app's own brand, 16.20): on the left the sidebar's toggle and the wordmark; on the right, in this order, **the app
  launcher, the bell and the avatar**, the launcher and the bell drawn only when there is something to give them. The avatar opens `UserMenu`: name
  and email (and core's picture in suite mode, §6.2), Settings, Notifications, Sign out, and a way back to core in suite mode. Couldn't sync, when
  anything is there, shows as a mark on the avatar and an entry in its menu.
- **The launcher** (`AppsLauncher`), **suite mode only:** the apps the person may open on the instance, from core's endpoint for them (name,
  description, icon and launch address from each app's manifest, for the person signed in, 16.23) through the SDK with the app's token; kept on the
  device so that it opens offline; its icons loaded from core's own address. Standalone, there is none.
- **Sidebar** (`AppSidebar`, 16.21): **full, a rail of icons, or hidden**, with its toggle, remembered on the device per kind of page (the rules
  Shopper's `sidebar.ts` had). Its content is **two blocks** of `NavList`:
  1. **Home** (§16.4), **Inventory** (§16.8) and **Loyalty cards** (§16.14);
  2. **My lists**, the lists the person made, with their icons and open counts, their archived ones behind a toggle and _+ New list_; and **Shared
     with me**, the lists others shared, each with whose it is under its name (RFC 0004). No group is named. The rail shows each list's icon.
- **Phase 2's _All lists_ and _Trips_ are parts of Home, and _Catalog_ is Inventory** (RFC 0006), not rows of the sidebar.

### 16.3 Screens and addresses

| Address                      | What                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `/`                          | The landing page for a visitor; for someone signed in, Home (§16.4)                           |
| `/l/<id>`                    | A list (§16.5); `?view=added` for the order added                                             |
| `/l/<id>?settings=<section>` | The list's settings, in the settings dialog over the list (§16.5)                             |
| `/l/<id>/settings`           | Redirects to `?settings=general`; there is no page                                            |
| `/shop?h=<id>&l=<id>,…`      | Shopping mode (§11); one list in phase 1 (`h` is the list's group)                            |
| `/inventory`                 | Inventory (§16.8): a person's items and categories                                            |
| `/cards`, `/cards/<id>`      | Loyalty cards (§16.14), and one card full screen; `?share=1` for its sharing                  |
| `/trips`, `/trips/<id>`      | Trips (§10.5), phase 2, linked from Home                                                      |
| `/notifications`             | Every notice (§14.1), phase 2                                                                 |
| `/settings/<section>`        | Settings (§17): `profile`, `security`, `preferences`, `data`; `/settings?section=…` redirects |
| `/invite/<token>`            | An invitation (§7.3), for anyone                                                              |
| `/sign-in`, `/sign-up`       | Standalone, the forms; in suite mode, straight to core (§15.1)                                |

An item opens beside its list at `?item=<id>` (§16.7), so that a link and the back button behave. The sharing dialog opens the same way, at
`?share=1`, and a list's settings at `?settings=<section>`, so that Back closes them and a link opens them, offline too.

### 16.4 Home

**Signed in, `/` opens Home** (RFC 0006). Its first tile is **Continue**: the list the person used last, with its open count ("Continue: Groceries"),
kept on the device (and, once something writes it, in `account_settings`, so that a new device starts there too: the table exists since 17.4), or
their own first list.

| Part                                                                                                    | When                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Continue:** the last list used, with its open count                                                   | Now                           |
| **Lists:** a tile for every list, own then shared, with icon, colour, name, open count and who is on it | Now; archived behind a toggle |
| **At a glance:** open items across the lists, bought this week, the most bought                         | Now                           |
| **What happened:** "Anna added 3 items to Groceries"                                                    | With notices (9.2)            |
| **Trips and spending:** the last trips, this month's total, a link to the trips history                 | With trips (7.1, 7.5)         |
| **Running low, and staples to add**                                                                     | With the pantry (13.1, 13.2)  |

- **Everything on Home is computed on the device** from the rows it holds, offline, as suggestions are (§8.5); nothing is stored for it. Who is on a
  list shows as initials until `AvatarStack` is released (16.3).
- **A brand-new account** opens Home, whose Continue is its _Groceries_, with one line: "Add what you need. To shop with others, press Share." **A
  person who arrived by an invitation** lands on that list, not on Home.
- **On a phone** Home is the footer's left icon (§16.11), and it links to Inventory.

### 16.5 A list

- **Header:** the list's icon and name, on one line; then, in this order, **Shop** (the primary button, the only one on the screen, with the cart icon
  and its label, on a phone too; shown only when the list has something to buy), **Share** (secondary; its label hidden on a phone) and **the list's
  menu** (a ghost button with no border, pulled right by its own padding so that its dots line up with the content's right edge). Every icon in the
  row is at the small size, so the two labelled buttons are the same height. The menu: Shop several lists (phase 2), Clear bought, view by aisle or
  order added, and Settings. A banner when the person has an open trip (§11.3).
- **The add field** at the top, always (§16.6).
- **Open items** grouped by category in aisle order, each row a checkbox, then icon, name, quantity and unit, a note's first line muted, the price
  if set, and who added it when that is not the reader (on a shared list). **The checkbox ticks; a tap anywhere else on the row opens the item**
  (§16.7): opening a panel changes nothing, so a stray tap while scrolling costs nothing. The edit icon (`square-pen`, 16.18) stays on the row, as the
  visible sign and for a keyboard and a screen reader; there is no long press. Shopping mode keeps the whole row as the tick's target (§11.1).
  Dragging reorders within a category.
- **Bought (n)**, collapsed under the open items, each with who ticked it; _Clear bought_ beside it.
- **Empty:** "Nothing on Groceries. Add something above, or pick from Often bought," with the often-bought products as chips.
- **The list's settings** open as the settings dialog (§17) over the list, at `?settings=general`, from the menu: **General** (name, icon and colour,
  and from phase 2 the clearing rule), **Cards** (the cards linked to the list; its Admin links and unlinks them among the cards they are on, §7.7)
  and **Archive and delete** (archive or restore; delete for good, the list's Admin only, an archived list, with a confirmation). **Share stays a button and a dialog of its own** (§16.9).

**Before phase 2** the menu has no "Shop several lists"; there is no trip banner and no price on a row.

### 16.6 Adding

The field at the top of a list (and in shopping mode), built on `SuggestionInput`:

- **Typing suggests** (§8.5), each suggestion with its icon, name, default quantity and unit, and "On the list · 2" where it applies. Enter takes the
  first; arrows move; one tap or click adds.
- **A quantity can be typed with the name (phase 2, 4.5):** "2 oat milk", "oat milk 2l", "500 g flour" (`src/catalog/parse.ts`, pure, English number words and the
  unit list). What it understood shows in the suggestion before it is added.
- **Adding keeps the field focused and empty,** so a list is typed as fast as a person thinks.
- **With nothing typed,** "Often bought" chips (§8.5).

### 16.7 An item

**A column beside its list** (RFC 0005): `ThreeColumnLayout`'s right column, 360 px, there only while an item is open, as a card opens in Tusk. The
list grows narrower and stays usable, so another item can be opened from it in the same column. **On a phone it is a page of its own** in place of
the list, with a back arrow. The address stays `?item=<id>` either way.

Its fields: name; quantity with `QuantityStepper` and the unit `Select`; category; icon (`IconPicker`); note; price (phase 2; `CurrencyInput`, with
the unit price under it once there is a quantity); list (to move it to another of the person's lists: it takes that list's product of its name, or
one made there, and its name and note are encrypted again for it, §13.1); "Remember for next time" (§9.4). **Each field saves as it is left,** with
no Save, as Tusk's card; **Delete** is a quiet text action, with _Undo_ (§12.7). Who added it and when, and if bought, who and in which trip, at the
foot.

### 16.8 Inventory

`/inventory` (RFC 0006), in the sidebar's first block and linked from Home. **It is the catalog screen** phase 2 planned (8.6), a person's own: a
list's own products are tidied where they are used, from an item's panel (§16.7), and merging a list's products is a task of its own (5.6).

- **Items:** every item, the person's and the starter's together, **searchable**, grouped by category, filtered by category, by **recurring or once**
  and by **mine, starter or hidden**. An item opens in the right column (as an item of a list does, §16.7): its name, category, icon, unit, quantity,
  note, recurring, hide or restore, and **Add to a list**. _+ Add item_ at the top.
- **Categories:** the aisle order as a draggable list (`DragHandleRow`, a keyboard way too), each with rename, icon and hide; _Add category_ at the
  end (§8.3).

### 16.9 Sharing a list

**Sharing is a dialog** (`?share=1`), opened by **Share** on a list (its icon alone on a phone), and it is about that list only (RFC 0004). It says
first, "People you share this list with can see and change it, and nothing else of yours", then lists the list's people (name and avatar, the Admin
marked; the list's Admin also sees emails, §6.1); **Invite** makes a link to the list, shown once with _Copy_ and a note that anyone holding it can join
it and that it expires in 14 days; live links are listed with _Revoke_; a Member has _Leave this list_ and the Admin _Remove_.

**From phase 2** the dialog adds invitations by email (§7.3), resending, and changing a person's role.

### 16.10 Design system

**0.1.0 needs nothing built upstream first:** it uses the components and the icon set that exist. What follows is for phase 2 and later.

Available and used: layouts, `Header`, `UserMenu`, `NotificationsPanel`, `Dialog`, `ConfirmDialog`, `Sheet`, `Drawer`, `Tabs`, `SegmentedControl`,
`SuggestionInput`, `QuantityStepper`, `CheckableListRow`, `IconPicker`, `DragHandleRow`, `CurrencyInput`, `Select`, `Combobox`, `Avatar`, `Badge`,
`StatusBadge`, `EmptyState`, `Toast`, `Menu`, `CopyButton`, `Collapsible`, `NavList`, `MobileFooter`, `MobileHeader`, `MobileAppsDrawer`, `Auth` and
its whole forms (`SignInForm`, `SignUpForm`, the reset pair), `ThreeColumnLayout`, `ColorPicker`, `AppsLauncher`, `QrCode`, `ExportPanel`. The
four the plugin added (`SuggestionInput`, `QuantityStepper`, `CheckableListRow`, `IconPicker`) are already in `@sovereignfs/ui`; each is checked
against what this design asks of it in the task that first uses it, and a gap goes to `sovereign` (epic 16).

**Missing, and built in `@sovereignfs/ui` in `sovereign` first, released, then used** (epic 16):

- **For workstream 0002** (§2.3): the edit icon `square-pen` and more icons for lists (16.18); **`SettingsDialog`** (16.19), on `Dialog`'s fixed-size
  `lg` frame: a title row across the whole width, sections on the left in groups with a divider between them, each with an icon, an optional search
  box (off by default), the section's content on the right with no repeated heading, scrolling inside a frame that does not change size, and on a
  phone the whole screen, the sections first and then one with a back arrow; **`Header` with the app's own brand** (16.20), which must not change
  core's own header; **`AppSidebar`** (16.21) and **`AppFrame`** (16.22), §16.2; core's endpoint of **the apps a person can open** and the SDK's call
  to it (16.23); **`MobileFooter`'s middle button named** by the app (16.24, "Apps" today). None of them needs Shopper's data or words to work.

- **Grocery icons** (phase 2): about 80, enough for the starter catalog's categories and common products (task 16.4).
- **`AvatarStack`** (who is on a list; phase 2) and **a floating action button** (the phone's Add), the same parts Tally and Roam wait on: whichever app
  asks first has them built for all.
- **`MoneyInput`** (phase 2; a `CurrencyInput` bound to a currency's decimals), as Tally's 14.4, if it is published by then; otherwise `CurrencyInput` with the
  currency's decimals.
- **Charts** for phase 3's insights, the same Tally's 14.1 builds.

### 16.11 Phone and PWA

**One responsive tree:** the same routes and decisions at every width, only rendering forked (the guide's rule).

- **`MobileFooter`** (RFC 0005): the left icon opens **Home** (§16.4, which links to Inventory); the middle button opens **the lists drawer**, every
  list, own then shared, with its icon, colour and open count, and _New list_; the right icon opens **Loyalty cards** (§16.14). The header's menu
  button opens the same drawer. **There is no app launcher on a phone** for now. Settings and Notifications are in the avatar's menu, as on a desktop;
  the bell stays in the header. **Add** is a floating button above the footer on a list, opening the add field (phase 2; until then the add field
  sits at the top of a list).
- A list is full-width; its name keeps to one line, and an item's quantity and note sit under its name. Shopping mode hides the footer.
- **Installable as a PWA,** with the suite's worker, `@sovereignfs/pwa`'s (17.2): it keeps the shell by allow-list and the one shell page, which holds
  nothing of a person; with no network, every address is answered with the kept shell, which reads the device's store and shows a signed-in screen (a
  list, shopping mode, Home, Inventory, the cards, recent trips) or says that the page needs a connection. **No data is ever in a cache;** it lives in
  IndexedDB, named per account and deleted at sign-out. Shopper adds Background Sync (§12.3) after the package's worker, until the package has it
  (16.12).

### 16.12 What the plugin paid to learn

- **An item's editor is never a `Sheet`:** `Sheet` has no desktop form. It was a `Dialog`; it is now a column beside the list, and a page on a phone
  (§16.7).
- **Ticking and editing are separate targets:** the checkbox ticks; the rest of the row, and its edit icon, open the item. Sharing one target made both
  unreliable.
- **Reordering is drag-and-drop within a category,** not up and down buttons, which proved unreliable.
- **A list name typed in a quick-add field is kept on blur,** not only on Enter.
- **A mutation that matches no row because of its permission must read as not found,** never as a silent success: the plugin's rename and archive did,
  and the hardening pass found it. Here the permission is in every statement (§5.2) and a test calls each as a second person.

### 16.13 Page titles

Every page says what it is in its title. A list's name is encrypted, so the server cannot put it there: **the browser sets the title** (one hook,
from the opened name), and until the name is open it is `Shopper`.

| Page              | Title                            |
| ----------------- | -------------------------------- |
| Home              | `Home · Shopper`                 |
| A list            | `<list> · Shopper`               |
| Shopping mode     | `Shopping <list> · Shopper`      |
| Settings          | `<section> · Settings · Shopper` |
| A list's settings | `Settings · <list> · Shopper`    |
| Inventory         | `Inventory · Shopper`            |
| Loyalty cards     | `Loyalty cards · Shopper`        |

**A title is kept in the browser's history,** and a history the browser syncs leaves the device with it: the one way an opened name leaves Shopper.
Accepted (RFC 0005), and said in `docs/encryption.md`.

### 16.14 Loyalty cards

`/cards` (RFC 0007), in the sidebar's first block and the phone's footer: a grid of cards, the person's own then those shared with them, each with
its colour, icon and name. _+ Add card_ starts the camera (§22.3), with typing the number and choosing its kind as the way when there is no camera
or it is refused. **A card opens full screen** (`/cards/<id>`): a white surface, the code large (`QrCode`, or `Barcode` for the other kinds, 16.25)
and the number in text beneath it, the screen kept on (`useWakeLock`), offline. Its Admin edits and deletes it from there; _Share_ opens its sharing
dialog, as a list's (§16.9).

## 17. Settings

**One dialog with a side navigation,** `SettingsDialog` (§16.10, 16.19), over the page it was opened from, from the avatar's menu. Every section has
an address (`/settings/profile`, `/settings/security`, `/settings/preferences`, `/settings/data`), through Next's intercepting routes: opened from a
page, the dialog is over that page; loaded directly, the same address shows Home with the dialog open, so Settings always looks the same.
`/settings?section=…` redirects. A list's settings are the same dialog with the list's sections (§16.5). What each section says depends on the mode
(§15.1); in suite mode, core owns the person's profile, security, appearance and notifications, and Shopper links there rather than copying them.

| Section         | Suite mode                                                                                                                             | Standalone                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Profile**     | Name, email and picture from core (the SDK session's `name`, `email`, `picture`), read only, refreshed at sign-in; _Edit in Sovereign_ | Name (editable; the person's name everywhere, §6.1) and email; initials, a photo of one's own later    |
| **Security**    | Links to core's sign-in and security, and to its keys and recovery kit                                                                 | Change the password (through `@sovereignfs/auth`, as core does); passkeys and two-factor (phase 2)     |
| **Preferences** | How a list shows its items by default; **This device**; "Appearance, language and notifications are in Sovereign"                      | The same, with appearance, time zone, language and region; **Notifications**, "coming later" until 9.4 |
| **Data**        | Shopper's readable export (§18.1); a line that core's export holds Shopper's part, encrypted; deleting the account is core's           | The readable export; delete the account (§19); for the first account, the app's export (§18.1)         |

- **Security** also holds **Encryption:** "Each list is encrypted with keys of its own, held only by the people on it. Not yet audited.", and which
  lists are not yet (§13.7). Standalone, the recovery kit (§13.2); in suite mode, a line that the kit and passkeys that unlock are core's.
- **This device** (in Preferences): **Updates from others** (§12.6, phase 2); when it last synced; whether persistent storage was granted;
  **Couldn't sync** (§12.5); "Reset this device" (sends the outbox, then reloads every list).
- **Notifications** (in Preferences, from 9.4): notifications on this device (`PushControl`, RFC 0002); each kind (§14.1) by channel, with what is not
  available said plainly.
- **Import,** and import from the old Shopper plugin (§18.2, §18.3), join Data when they are built.

## 18. Export and import

The suite's format (`contracts/export.md`, written with `@sovereignfs/export`), RFC 0003. Built before phase 2 (epic 20); 0.1.0 has neither.

### 18.1 Export

- **Core's export of a person** (suite mode): core asks Shopper for its part (`signIn.export`, the SDK's `onExport`): the person, and **every list
  they are on, whole** (its people by name only), with its items, catalog, the categories it uses (its group's starter ones and its
  `list_category` copies), **their own Inventory and categories** (§8.8), **every card they are on** (§7.7, its people by name only) and its links to
  their lists, and what phase 2 adds, under `apps/shopper/records/`. **Encrypted fields are in it as their ciphertext** (the server cannot open them), marked as envelopes, with the person's
  own wrapped keys beside them (the group's for their own lists, cards and Inventory, their copies for lists and cards shared with them), so that their keys open it.
- **A person's own export, readable** (RFC 0005, 22.8), in both modes, from **Settings › Data**: **one JSON file**, `shopper-export-<date>.json`,
  **made in the browser,** which holds the keys. The server checks who is asking and serves the person's records as it holds them (the same records as
  core's export); the browser opens them and writes the file, so the server never reads a name to make it. **Confirmed first, as core's export is:**
  standalone, the password again (the value the browser derives, through `ExportPanel`, as core does); in suite mode, a fresh sign-in at core
  (`prompt=login`). The file has the contract's head (`format`, `kind: "person"`, `producer`, `takenAt`) and the same kinds and fields of record,
  opened. It is not the contract's zip, whose writer needs Node; when `@sovereignfs/export` can write one in the browser (16.26) the file becomes it.
- **The app's export,** standalone, for the first account, Shopper's operator, on **Settings › Data**, encrypted with age to recipients they save
  (20.3).
- **Never in any export:** another person's email, passwords, sessions and tokens.
- **Backups are not exports:** hosted, `sv backup`; alone, the operator's backup of the database and `SHOPPER_ENCRYPTION_KEY` (`deploy/README.md`).

### 18.2 Import

Import reads either kind of a person's export, the contract's (`readExport`, opened in the browser with the person's keys) or the readable file
(§18.1), and makes **new lists**, with new keys, with the
importer as Admin; every other member named in it becomes an **imported person** (a name with no account, shown "Sam (imported)") so that trips still
say who bought what, and nobody else is joined without asking. The exporter's own lists are added to the importer's own:
their products folded by name key on each list, categories matched by name, trips added. Everything is written through the one path,
within the limits (§7.6); a malformed file, or one from a newer version, writes nothing and says so. **A round trip is a test:** export, import into a
second account, export again; the lists match but for ids, times, keys and the people's kind.

### 18.3 From the plugin

The legacy plugin's export section (`fs.sovereign.shopper`, export schema version 1, inside the platform's export file, or as the section on its own)
is read **in the browser** by `src/portability/plugin.ts` and imported into the person's **own lists**, encrypted as it is written:

| Plugin                                                  | Here                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shopper_lists` (archived too)                          | Lists, archived ones archived                                                                                                                                                                                                                                      |
| `shopper_products`                                      | Products, folded by name key; category by name to the group's, or a new category; icon key mapped where the plugin's icon exists in the set, else the category's; `typical_price` as the last unit price, per its unit                                             |
| `shopper_list_items`, open                              | Open items                                                                                                                                                                                                                                                         |
| `shopper_list_items`, checked                           | Not imported as items: their purchases are the record                                                                                                                                                                                                              |
| `shopper_purchases`                                     | **Trips:** one per buyer per local day, finished at the last purchase that day, no shop; each purchase a line. A buyer who is not the importer becomes an imported person "Someone (imported)"; a price in another currency than the list's is dropped and counted |
| `shopper_list_shares`, `shopper_user_state`, households | Not imported: shares name accounts of the old platform; the importer shares each list by a link instead                                                                                                                                                            |

The import ends with a summary: lists, items, products and trips made; prices dropped for another currency; what was skipped and why. A test runs it
over a file the plugin's own export code produces.

## 19. Account deletion and signing out

**`People.deletePerson`** (`src/sovereign/people.ts`, as Tusk's and Tally's) removes everything personal of an account and keeps only the name on the
shared record. One routine, safe to run again; the `sub` link goes last.

- **Their person stays, as a name only:** `account_id`, email and `core_sub` cleared, marked deleted. Everywhere they appear on a shared list (items
  they added, ticks, trips), they are shown as "Kasun (left Shopper)".
- **Their lists:** **a list nobody else is on** is deleted, with its items, catalog, people, links and the records about them; **a shared list whose
  Admin they were** passes to the person on it longest, who becomes its Admin (and is told, `admin_passed`, phase 2), and stays in their group, which
  nobody owns from then; **elsewhere they leave.** A group nobody is left on is deleted whole, by `household_id`. Their open trips are finished
  (phase 2).
- **Their Inventory and their own categories** are deleted, by `household_id`, whether or not their group stays for a list that passed on; a list's
  copy of one of their categories (`list_category`) stays with its list, as the list's.
- **Their cards** go as their lists do: a card nobody else is on is deleted, with its links and keys; a shared card whose Admin they were passes to
  the person on it longest; elsewhere they leave, and their copy of its keys (`card_key`) is deleted.
- **Removed** (the rows that exist, phase by phase): notices for them, digests for and about them, their notice preferences, invitations they made
  (revoked) and to them, their device subscriptions, their group's keyring and their copies of lists' keys, their vault (`vault.deleteAccount`), their
  export jobs, their stored core token, their settings, rate counters, mail queued to them, and better-auth's rows: passkeys, two-factor, sessions,
  sign-ins, and the account.

A test seeds one row of every table, for the person and for a second person on a list with them, and finds nothing personal of the first after (the
name aside), the second's list intact. A new table that holds something of a person fails it until it is decided.

Standalone, it is reached from **Settings › Data**, after the password, saying what goes and what stays. In suite mode deleting the account is
core's: it is reached from **core's account-deleted notice** (§15.2), answered `200` only once done. The device's database is deleted; other devices find out at their next
sync.

## 20. Data model and database

### 20.1 Database

**As Tusk's §23.1, with `SHOPPER_`:** `SHOPPER_DB_DIALECT` is `sqld` (default; namespaces `shopper` and `shopper_auth`), `sqlite`
(`file:/data/shopper.db`, `shopper_auth.db` beside it) or `postgres` (schemas `shopper` and `shopper_auth`). Drizzle, a schema and a migration set per
dialect, generated and never written by hand, applied at start-up under a lock; a parity test across dialects. Standard SQL, values bound; no
`LISTEN/NOTIFY`, trigger, extension or foreign key; **every deletion names what it deletes, in a transaction**, by `household_id` or `list_id` where
it is a group's or a list's. Tests run on all three and read `SHOPPER_TEST_*` only.

### 20.2 Representations

As Tusk's column vocabulary: ids are UUIDs, **made by the device for synced rows** (checked as UUIDs by the server, and refused if the id already
belongs to another group's row) and by the server otherwise; times `epochMs`; booleans the vocabulary's word. **Quantities are canonical decimal
strings** (§9.3). **Money is a 64-bit integer of minor units** (`bigint` on PostgreSQL, read as a `number` and checked to be a safe integer), inside
the encrypted fields where the table has them. A currency is a three-letter code. **`encrypted` is a JSON object of field to its ciphertext**, written
by the device (§13.1), which the server merges by key without opening; `sealed` is the server's envelope, for what it holds itself (§13.4); `fseq` is
a JSON object of field to `seq`, the stamp of each field's last change (§12.4).

### 20.3 Tables

Beyond better-auth's, in the auth store.

**Phase 1 has** `person`, `household` (the group), `member` (its own account), `list_member`, `invitation`, `category`, `product`, `list`, `item`,
`alias`, `tombstone`, `account_settings`, `applied_mutation`, `rate_bucket`, `household_key`, `list_key`, `push_device` and `push_outbox`, the SDK's
vault tables and the export package's jobs (their own migrations, recorded apart), without these columns, which arrive with the phase that needs them:
`household` has no `color` or `currency`, and its sealed name is empty; `invitation` has no email; `product` has no barcode, last unit price or
`price_unit`; `item` has no price or `trip_id`; a list's `clearing` is `manual`. **Phase 2 adds** `shop`, `trip`, `trip_line`, `notice`,
`notice_digest`, `notice_pref`, `mail_outbox` and `credential`, and those columns. **Workstream 0002 adds** (§2.3) a list's icon and colour, two
fields of its `encrypted` and no column, so a list made before them has neither and is shown with the defaults (§9.1); `inventory_item` and
`list_category` (§8.3, §8.8); a person's own categories' names in `category`'s `encrypted`; `card`, `card_member`, `card_key` and `list_card` (§7.7);
and `invitation`'s and `tombstone`'s `card_id`. **The auth store is `@sovereignfs/auth`'s** (auth.md §10): its
account tables, the core sign-in's, the session's key secret (`sv_key_secrets`) and the SDK's stores, moved there from 0.2.x's better-auth tables at
start (`src/auth/migrate.ts`); 0.2.x's `key_secret` and `password_derived` columns are left in place and read by nothing but the move.

| Table              | Columns                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `person`           | `id`, `account_id` (unique, may be null), `core_sub` (unique, may be null), `kind` (`account`, `imported`), `sealed` (name, email), `deleted_at`, `created_at`, `updated_at`                                                                                                                                                                                                                       |
| `household`        | The group (§7.1): `id`, `own_of` (its account's `account_id`, unique; null once that account is deleted), `sealed` (name), `seq`, `encryption` (`sealed`, `encrypted`), `epoch`, `created_by`, `created_at`, `updated_at`                                                                                                                                                                          |
| `member`           | `id`, `household_id`, `person_id`, `role`, `joined_at`, `left_at`, `seq`: the group's own account, its only member                                                                                                                                                                                                                                                                                 |
| `list_member`      | `id`, `household_id`, `list_id`, `person_id` (unique with `list_id`), `role` (`admin`, `member`), `joined_at`, `left_at`, `seq` (§7.2)                                                                                                                                                                                                                                                             |
| `invitation`       | `id`, `household_id`, `list_id` or `card_id` (one of the two: an invitation is to a list or to a card, §7.7), `token_hash` (unique), `wrapped_key` (the list's or the card's keyring under the link's secret, §13.5), `sealed` (email), `core_sub`, `created_by`, `expires_at`, `sent_at`, `accepted_by`, `accepted_at`, `revoked_at`                                                              |
| `category`         | `id`, `household_id`, `starter_key`, `sealed` or `encrypted` (name, when renamed or added; a person's own under the group's Inventory keys), `icon`, `position`, `hidden`, `deleted_at`, `seq`, `fseq`                                                                                                                                                                                             |
| `product`          | `id`, `household_id`, `list_id`, `name_key` (unique with `household_id` and `list_id`), `sealed` (name, note, barcode, last unit price), `category_id`, `icon`, `default_quantity`, `default_unit`, `price_unit`, `times_bought`, `last_bought_at`, `last_added_at`, `deleted_at`, `seq`, `fseq`, `created_at`                                                                                     |
| `list`             | `id`, `household_id`, `sealed` or `encrypted` (name, icon, colour), `position`, `clearing` (`on_finish`, `manual`, `after_day`), `archived_at`, `deleted_at`, `seq`, `fseq`, `created_at`                                                                                                                                                                                                          |
| `item`             | `id`, `household_id`, `list_id`, `product_id`, `sealed` (name, note, price), `quantity`, `unit`, `category_id`, `icon`, `position`, `added_by`, `added_at`, `bought_at`, `bought_by`, `trip_id`, `cleared_at`, `deleted_at`, `seq`, `fseq`                                                                                                                                                         |
| `inventory_item`   | `id`, `household_id` (the person's own group), `starter_key` (the starter entry it overrides, or null for one of their own), `name_key` (unique with `household_id`), `encrypted` (name, null when an override keeps the starter's; note), `category_id`, `icon`, `unit`, `quantity`, `recurring`, `hidden`, `on_hand` and `low_point` (phase 3), `deleted_at`, `seq`, `fseq`, `created_at` (§8.8) |
| `list_category`    | `id`, `household_id`, `list_id`, `category_id` (the category it copies), `encrypted` (name, under the list's keys), `icon`, `position`, `deleted_at`, `seq`, `fseq` (§8.3)                                                                                                                                                                                                                         |
| `shop`             | `id`, `household_id`, `sealed` (name), `last_used_at`, `deleted_at`, `seq`, `fseq`                                                                                                                                                                                                                                                                                                                 |
| `trip`             | `id`, `household_id`, `person_id`, `shop_id`, `sealed` (receipt total), `started_at`, `finished_at`, `last_tick_at`, `deleted_at`, `seq`, `fseq`                                                                                                                                                                                                                                                   |
| `trip_line`        | `id`, `household_id`, `trip_id`, `item_id`, `product_id`, `list_id`, `sealed` (name, list name, price), `quantity`, `unit`, `category_id`, `bought_by`, `bought_at`, `deleted_at`, `seq`, `fseq`                                                                                                                                                                                                   |
| `alias`            | `household_id`, `table`, `from_id` (the key with `table`), `to_id`, `list_id`, `carried`, `seq`, `created_at` (§12.4)                                                                                                                                                                                                                                                                              |
| `notice`           | `id`, `account_id`, `kind`, `actor_person_id`, `household_id`, `subject_id`, `details` (JSON, sealed where it names something), `read_at`, `created_at`                                                                                                                                                                                                                                            |
| `notice_digest`    | `account_id`, `list_id`, `actor_person_id`, `window_start` (the key), `household_id`, `count`, `updated_at`                                                                                                                                                                                                                                                                                        |
| `notice_pref`      | `account_id`, `kind`, `channel` (the key), `on`                                                                                                                                                                                                                                                                                                                                                    |
| `account_settings` | `account_id` (the key), `last_list_id`, `inbox_seen_at`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                                |
| `mail_outbox`      | `id`, `account_id` or `sealed` (address), `template`, `data` (sealed JSON), `attempts`, `next_attempt_at`, `sent_at`, `failure_kind`, `created_at`                                                                                                                                                                                                                                                 |
| `applied_mutation` | `account_id`, `id`, `household_id`, when (§12.9)                                                                                                                                                                                                                                                                                                                                                   |
| `tombstone`        | `table`, `id`, `household_id`, `list_id` or `card_id` (who may be handed it), `seq`, when (§12.9)                                                                                                                                                                                                                                                                                                  |
| `credential`       | As Tusk's: core refresh tokens under envelope encryption (§15.3)                                                                                                                                                                                                                                                                                                                                   |
| `household_key`    | `household_id`, `person_id` (the key), `epoch`, `record` (the group's keyring wrapped under its account's app key), `created_at` (§13.2)                                                                                                                                                                                                                                                           |
| `list_key`         | `list_id`, `person_id` (the key), `household_id`, `epoch`, `record` (the list's keyring wrapped under that person's app key), `created_at` (§13.2)                                                                                                                                                                                                                                                 |
| `card`             | `id`, `household_id`, `encrypted` (shop, number, kind of code, code, icon, colour, name on the card, note), `position`, `deleted_at`, `seq`, `fseq`, `created_at` (§7.7)                                                                                                                                                                                                                           |
| `card_member`      | `id`, `household_id`, `card_id`, `person_id` (unique with `card_id`), `role` (`admin`, `member`), `joined_at`, `left_at`, `seq`, as `list_member`                                                                                                                                                                                                                                                  |
| `card_key`         | `card_id`, `person_id` (the key), `household_id`, `epoch`, `record` (the card's keyring wrapped under that person's app key), `created_at`, as `list_key`                                                                                                                                                                                                                                          |
| `list_card`        | `list_id`, `card_id` (the key, a list and a card of the same group), `household_id`, `deleted_at`, `seq` (§7.7)                                                                                                                                                                                                                                                                                    |
| `push_device`      | `id` (the push service's endpoint for the device), `account_id`, `sealed` (its keys, §13.4), `saved_at`: at most ten an account (RFC 0002)                                                                                                                                                                                                                                                         |
| `push_outbox`      | `id`, `account_id`, `endpoint`, `message` (a kind, who did it and a path; never a name), `attempts`, `due_at`, `claimed_until`, `expires_at`                                                                                                                                                                                                                                                       |
| `rate_bucket`      | As Tusk's. A job claims its work by a conditional update of the row it works on (`src/jobs/claim.ts`), not by a table                                                                                                                                                                                                                                                                              |

Indexes follow the queries: a list's people by person and by list; every synced table by `(household_id, seq)` for pull; items
by list; trip lines by trip and by `(household_id, bought_at)` for suggestions; trips by `(household_id, started_at)` and open trips by person;
invitations by list; Inventory by `(household_id, seq)` like every synced table and by `(household_id, starter_key)`; notices by account and time; the mail outbox by `next_attempt_at`; digests by `updated_at`.

**The device's store** holds, per group, the lists the person is on, their people's names, items not cleared, products, the group's starter
categories and the lists' copies of others, the account's own Inventory and categories, the cards the account is on and their links to its lists,
shops, trips of the last 180 days and their lines, and aliases; and per account the cursors, the outbox, Couldn't sync, the freshness choice, the last list, the
last-synced unread count, and view choices. Nothing else.

## 21. Security, deployment, testing

### Security

As Tusk's §24: a strict CSP with a per-request nonce, `connect-src 'self'`, no `'unsafe-inline'`; nothing third-party loads, and in suite mode
`img-src` adds core's own address alone, for the person's picture (§6.2) and the launcher's icons (§16.2); what people write is
rendered as text, never as HTML. **The camera's frames never leave the device** (§22.3): a card or a barcode is decoded in the browser. **Logs hold no item, product, list, shop or person names, notes, prices or addresses:** an id and a kind
of failure. Every route, operation and mutation finds the session and carries the permission in its statement (§5.2); a route that changes something
checks `Origin`; `/api/live` checks the session on connect and closes when it ends. An invitation token is random, stored hashed, compared in constant
time, and its page reveals the inviter's name only. **Rate limits:** invitations and resends, sign-up, sync requests, live
connections, import. A security review of each phase is written up before its release; phase 1's has access (§5.2), sync and folding (§12.4, §12.5), sealing (§13),
invitations (§7.3), sign-in through core (§15) and deletion (§19) at its centre, and the live stream (§12.6), import and the directory join with
phase 2's.

### Licence

AGPL-3.0-or-later, since it bundles `@sovereignfs/ui`.

### Deployment

One image (Debian, for libSQL), not root, on port 3007, and three Compose setups in `deploy/`:

```bash
docker run -v shopper:/data -e SHOPPER_DB_DIALECT=sqlite -e SHOPPER_SQLITE_URL=file:/data/shopper.db \
  -e SHOPPER_URL=https://shopper.example.com -e SHOPPER_AUTH_LOCAL=1 -e SHOPPER_AUTH_SECRET=… -e SHOPPER_ENCRYPTION_KEY=… ghcr.io/sovereignfs/shopper
```

- **Settings** are the shared names of `contracts/env.md` (with `AUTH_SIGNUP`'s `invite` from phase 2, §6.3), and Shopper's own: `SHOPPER_WORKER`,
  `SHOPPER_ENCRYPTION_KEY_PREVIOUS`, the sync interval (§12.6; the live settings are phase 2) and the limits (§7.6). Each declared once in `@sovereignfs/config`, in
  `.env.example` and in the README.
- **Hosted:** `sv app add shopper`, from the manifest; the operator (from phase 2) grants the three app scopes, sets `SHOPPER_SMTP_*` in `suite.yml` to email people
  who are not on the instance. Hosted is suite mode: `SHOPPER_AUTH_LOCAL` is not set, and someone invited who has no account signs up at core, as core's
  sign-up allows (§15.1).
- **A proxy in front** (from phase 2) must not buffer `/api/live` (Caddy, which the instance uses, does not for `text/event-stream`); the README says so for anyone
  running another.
- **Releases** as every app's: a promotion titled `Release vX.Y.Z` tags and publishes amd64 and arm64 to `ghcr.io` on merge (`RELEASING.md`); a patch has no migration.
- `/api/health` answers `200` once the database is ready.

### Testing

- **Vitest, pure:** normalising names, the name key, parsing "2 oat milk", suggestion ranking with hand-worked fixtures, category guessing, quantities
  and unit prices, trip totals, the aisle order, field merging, folding, describing notices.
- **Properties:** random interleavings of adds, edits, ticks, unticks, deletes, moves, merges and clears from several devices, after which every
  device that has synced holds the same rows; no item is open and bought at once; every bought item with a trip has exactly one trip line; no product
  name is on a list twice; and the same mutations give the same result in any order of arrival allowed by the counter.
- **Sync:** two devices folding the same product and the same item; two ticks of one item; a tick against a delete; an edit against a clear; a
  mutation sent twice; a lost answer; a refusal for someone taken off a list and for a deleted list (landing in Couldn't sync); a stale cursor; a list
  left between syncs, and one of two lists of a group left; the live stream telling a second device, and a device falling back to its interval when the stream drops.
- **Encryption:** a random marker written as every encrypted field is found in no row of any table and no file, in plain text, base64 or hex, on all
  three databases (18.12); a test holds `src/keys/fields.ts` to §13.1's table and `sealed.ts` to §13.4's; rotation re-wraps what the server seals.
- **Access:** every route, operation, mutation and the live stream called as a second person, and as one on another list of the same group,
  expecting not found (§5.2).
- **The data layer** on sqld, a `file:` database and PostgreSQL; **jobs** run twice and from two processes, acting once.
- **Sign-in** against the fake Sovereign, **notices** against `createFakeCore` from `@sovereignfs/sdk/testing`, **mail** against a fake SMTP server.
- **Import** of a Shopper file round trip, and of a plugin file produced by the plugin's own export code.
- **Playwright** in Chromium and WebKit, at desktop and phone widths: sign up, add with suggestions, share a list, accept, shop with the
  network off (`context.setOffline`) while a second browser adds and ticks, finish, and both browsers end with the same list and trip. **0.1.0's version:** sign up, add with suggestions, share by a link, accept it in a second browser,
  shop with the network off while the second browser adds and ticks, finish shopping, and both browsers end with the same list.
- **A seed** (`pnpm seed`): a few accounts, a list shared with another and lists of their own, a catalog of a hundred products, lists with open and bought items,
  trips across two months in two shops (phase 2), a live invitation, a fold in history, and someone who left.

## 22. Later phases, in outline

### 22.1 Phase 2: groups, trips and the rest

Everything the first design put in phase 1 that 0.1.0 leaves out (§2.2). Each is designed in the section named and detailed in its task (epics 2 to 11).

- **Groups:** kinds of group (a household, a group of friends), naming them, several a person; changing a list's roles; invitations by email;
  `AvatarStack`; a new key epoch for a list when someone leaves it (§7, §13.2).
- **Catalog:** merging and deleting products; reading "2 oat milk"; about 400 starter entries with grocery icons (§8). Editing categories, All lists
  and the catalog screen came before phase 2, as Inventory and Home (§2.3, §8.8, §16.4).
- **Trips and prices:** ticking also writes a trip line; shops; prices, unit prices and totals; shopping mode with a shop, a total and "shopping too";
  several lists; the trips history; the clearing rules (§10, §11).
- **Notices and mail:** the mail outbox, notices and the bell, the items-added digest, preferences and delivery (§14).
- **Fresher:** live updates and a freshness choice per device; pruning the history (§12.6, §12.9).
- **Sign-in:** the `invite` sign-up policy, passkeys and the authenticator app (§6.3, §15.1); linking a core account to a local one is superseded by
  one way in per instance (2.9, RFC 0005).
- **The suite:** core's bell, email and activity; inviting from the directory (§15.4).
- **A person's data:** export, import, and import from the legacy plugin (§18).
- **The phone:** the floating Add button (§16.11).

### 22.2 Phase 3: the pantry and routines

- **The pantry:** an **Inventory item** (§8.8, RFC 0006; not a list's product) can be **kept at home**, with an amount on hand, adjusted when a trip
  line of it is bought (plus its quantity, in the item's unit) and by hand ("used up", "have 2"); and a **low point**. It is a person's; a pantry
  shared by a home of several people waits for kinds of group (§22.1). A product at or below it is offered on a chosen list ("Running low: oat milk, eggs")
  and can be added to it automatically, the list's choice.
- **Staples:** Inventory items marked **recurring** (§8.8), which the add field's empty state already offers first (§8.5); _Add staples_ puts every
  missing one on the list.
- **Repeating items:** a recurring Inventory item added to the list the person chooses every N days or weeks, on a rule set on the item (Tusk's rule format, as Ledger and Tally copy it), by the server's
  job, idempotent on `(rule, occurrence)`, and on the device for a list that is offline.
- **Templates:** a list's items saved as a template ("weekly shop", "barbecue"), applied to a list in one action, adding what is missing at the
  template's quantities.
- **Shops with their own aisle order:** a shop gets a category order of its own, **learned from the order its trips' lines were ticked in** (a pure
  function over the last trips there: for each pair of categories, which came first more often), applied automatically when shopping mode is started
  there, and correctable by dragging. Prices remembered per shop, and the product's price over time.
- **Insights:** per list, from trips: spending by month and by category, the most bought products, who shopped how often, prices over time for a
  product; charts from `@sovereignfs/ui` (Tally's 14.1), each with a table beside it.
- **Push notifications:** moved before phase 2 (RFC 0002, epic 19), on `@sovereignfs/push`.

### 22.3 Phase 4: capture

- **Barcode scanning,** decoded on the device, **built before phase 2 with loyalty cards** (§7.7, 24.4, RFC 0007), which phase 4 uses for products:
  the six kinds of code a card may have, read by the browser's `BarcodeDetector` where there is one, otherwise a WebAssembly decoder bundled with
  Shopper (ZXing's, licence checked for AGPL compatibility); the camera through `getUserMedia`, never leaving the device. A scan finds the list's
  product by barcode (unsealed in memory on the device, which holds the catalog), or offers to make one.
- **Lookup by barcode,** for a barcode the list does not know: **the server** asks a product database (Open Food Facts, by barcode only, with no
  account and nothing else sent; its data licence, ODbL, attributed), caches the answer, and offers the name and a category. The browser never calls
  it. An operator can turn it off (`SHOPPER_PRODUCT_LOOKUP=false`) or point it elsewhere.
- **Photos** on products and items, and **receipt images or PDFs** on trips, stored **by Shopper itself** as Roam's §18.3: under `/data/media` (the
  manifest's `data`), one file each, named by a random id, sealed with its own data key, served after the access check, 15 MB a file and
  `SHOPPER_MEDIA_MAX_HOUSEHOLD_MB` per group (default 500). Taken offline, kept on the device and uploaded when there is a network, as Roam's
  photos waiting.

### 22.4 Later, candidates

- **Encrypted backup to Git,** as the other apps plan: a person's export, encrypted, committed to a repository the person names. Deferred by the
  owner on 2026-11-09.
- **Send a trip to Ledger or to Tally,** as a link that opens the other app's add form pre-filled with the total, date and shop: no shared data, no
  dependence, each app working alone.
- **AI features through the instance's model provider** (receipt reading into trip lines, smarter categories, predicting what is running out), when
  the platform offers one.
- **Other languages** for the starter catalog and the parser.

## 23. Accessibility

Every screen works with a keyboard and a screen reader, in light and dark, at a phone's width. A list row announces its name, quantity, whether it is
bought and by whom; ticking is a checkbox in the accessibility tree whatever it looks like. Dragging has a keyboard way (dnd-kit's). Shopping mode's
rows are at least 56 px high and its text follows the person's font size. Toasts with _Undo_ are announced politely and stay long enough to reach.

## 24. Not settled in the platform

- **`AUTH_SIGNUP`'s `invite`** (§6.3) is not in `contracts/env.md`; it is added there first, for every app, by the task in `sovereign` that Tally
  (14.5) and Roam (17.2) also wait on (16.1 here). Until it lands, Shopper does not ship it, and 0.1.0 does not wait for it (§6.3).
- **The directory as a person** (§15.3) uses the SDK's `tokenStore`, which the package's core sign-in fills (ADR 0001).
- The kit of research 0004 is not published, so the infrastructure is copied (§5.1); when the kit lands, Shopper adopts it in a task of its own.
- `AUTH_LOCAL` accepts `1` and `true` until `contracts/env.md` and the apps agree (building-an-app §15).
- **Port 3007** is added to building-an-app §2's table in `sovereign` (16.2), with Ledger's 3003, Tally's 3004, Roam's 3005 and Wallet's 3006 if they
  are not there yet.

## 25. Open questions

None. Every question raised in planning was settled on 2026-11-09 or 2026-11-10, RFC 0005 to 0007's on 2026-11-23, and the fourteen points that
writing them into this file found were settled with the owner the same day, as proposed (§26, "Settled at leg 1's review").

## 26. Decision log

| Date       | Decision                                                                                                                                                                                                                                                                                   | Why                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-09 | An app of its own, Tusk's shape: local and core sign-in, three database forms; **every feature works alone**                                                                                                                                                                               | The owner's golden rule for every app                                                                                                               |
| 2026-11-09 | Name **Shopper**, prefix `shopper`, port 3007                                                                                                                                                                                                                                              | Kept from the plugin; 3000–3006 are taken                                                                                                           |
| 2026-11-09 | **Planned anew**: the plugin's interface and architecture are not followed                                                                                                                                                                                                                 | The owner's direction                                                                                                                               |
| 2026-11-09 | **The household is the unit of sharing from the first release;** everyone has a private one; **no per-list sharing**                                                                                                                                                                       | The plugin's per-list shares made the catalog the owner's and left households an unsolved migration                                                 |
| 2026-11-09 | Roles **Admin and Member**; **no read-only role**                                                                                                                                                                                                                                          | A household shops together; the owner agreed                                                                                                        |
| 2026-11-09 | Ticking gathers into **trips** of one person in one household, with trip lines as the record, instead of one purchase row per tick                                                                                                                                                         | A trip is what a person remembers ("Saturday at Lidl"); it carries the shop and the total                                                           |
| 2026-11-09 | **Budgets, multiple currencies and the household ledger dropped;** one currency per household                                                                                                                                                                                              | Ledger and Tally do money; a link to them is a later candidate                                                                                      |
| 2026-11-09 | Phases: **1** households, lists, catalog, trips, shopping mode, offline; **2** pantry, staples, repeating, templates, shops' order, insights, Push; **3** barcode, lookup, photos, receipts                                                                                                | Agreed with the owner                                                                                                                               |
| 2026-11-09 | **Offline first for shopping, online for membership,** with Tusk's field-level changes and a counter per household                                                                                                                                                                         | The shop has no signal; several people write one list at once, so fields must merge                                                                 |
| 2026-11-09 | **Freshness is a setting:** the operator allows live updates and an interval floor; each device chooses Live, an interval, or on open; live updates are in phase 1                                                                                                                         | The owner asked for it to be configurable                                                                                                           |
| 2026-11-09 | Live updates are **a signal on a server-sent-event stream, then a normal pull,** held in the process                                                                                                                                                                                       | No data on the stream; the suite's SQL forbids `LISTEN/NOTIFY`; one process is how an instance runs an app                                          |
| 2026-11-09 | **Duplicates fold:** the same product added twice to a list, or a product made twice, becomes one, recorded as an alias                                                                                                                                                                    | Two people adding milk offline should not make two rows to tidy                                                                                     |
| 2026-11-09 | **The first tick stands;** a second tick of the same item makes no second trip line                                                                                                                                                                                                        | Nothing is recorded as bought twice                                                                                                                 |
| 2026-11-09 | **Encryption at rest on the server** (envelope under `SHOPPER_ENCRYPTION_KEY`, sealed rows), not end to end; product identity by an HMAC name key                                                                                                                                          | The owner's choice; the server must merge, fold and word notices                                                                                    |
| 2026-11-09 | Notices (Claude's call, at the owner's request): invitations and joins, **trip finished on by default**, **items added as a 30-minute digest, off by default**; email only for invitations; Push in phase 2                                                                                | Useful without being noisy; a digest keeps a week of adding from becoming a stream of pings                                                         |
| 2026-11-09 | Aisle order (Claude's call, at the owner's request): **one category order per household in phase 1; per-shop order learned from ticking in phase 2**                                                                                                                                       | One order is enough to start; learning from what people already do needs no setup                                                                   |
| 2026-11-09 | **A starter catalog** of common groceries, in English, shipped as data                                                                                                                                                                                                                     | The first list should already come right; the owner agreed                                                                                          |
| 2026-11-09 | Categories: a **starter set each household can rename, hide, add to and reorder**                                                                                                                                                                                                          | Groceries vary too much for a fixed list                                                                                                            |
| 2026-11-09 | Units: a **fixed list**; quantities as **decimal strings**                                                                                                                                                                                                                                 | As the plugin decided; no binary float                                                                                                              |
| 2026-11-09 | A **note** on every item and product                                                                                                                                                                                                                                                       | Brands and "the green one"                                                                                                                          |
| 2026-11-09 | Prices: **optional per item, for its quantity;** a product remembers its last unit price; a trip totals its lines or takes the receipt total; per shop in phase 2                                                                                                                          | Enough to be useful without becoming a ledger                                                                                                       |
| 2026-11-09 | **Limits are operator settings** with defaults: 20 members, 20 households an account, 100 lists, 500 open items, 5000 products, 100 categories                                                                                                                                             | As Roam; changeable without a release                                                                                                               |
| 2026-11-09 | Account deletion **keeps the name** on shared rows and removes email and everything else personal, as Tally                                                                                                                                                                                | The owner's choice                                                                                                                                  |
| 2026-11-09 | Sign-in as Tusk and Tally; **joining only by accepting an invitation** (link, email, or core's directory); local sign-up by invitation by default                                                                                                                                          | A household shows your name to its members, so nobody is added without agreeing                                                                     |
| 2026-11-09 | No placeholders                                                                                                                                                                                                                                                                            | Everyone in a household shops and has an account; imported names cover history                                                                      |
| 2026-11-09 | **The plugin's export is imported** into the person's own household, purchases as trips; Shopper's own export and import in phase 1                                                                                                                                                        | The owner's choice                                                                                                                                  |
| 2026-11-09 | **Encrypted backup to Git deferred** past phase 3                                                                                                                                                                                                                                          | The owner's choice                                                                                                                                  |
| 2026-11-09 | No activity feed                                                                                                                                                                                                                                                                           | Trips and notices cover what the plugin's planned feed was for                                                                                      |
| 2026-11-09 | An editable **All lists** view replaces the read-only combined view                                                                                                                                                                                                                        | The device holds every list, so nothing stops it being editable                                                                                     |
| 2026-11-09 | **Grocery icons, `AvatarStack`, a floating button** built in `@sovereignfs/ui` first; charts shared with Tally for phase 2                                                                                                                                                                 | The suite's design-system-first rule                                                                                                                |
| 2026-11-10 | **Phase 1 is a minimum viable product** (§2.2); what the first design put in it and 0.1.0 leaves out is **phase 2**, the pantry becomes phase 3 and capture phase 4                                                                                                                        | The owner wants a usable app as fast as possible; nothing is dropped, and the data model does not change for phase 2                                |
| 2026-11-10 | **Sharing in 0.1.0 is sharing the household each account is made with, by a link;** no per-list sharing, and no making or naming households until phase 2                                                                                                                                  | The owner wants lists shared and households deferred; this reuses the designed access, sync and sealing unchanged, where per-list sharing would not |
| 2026-11-10 | **An account's own household takes members:** "Just me" goes, and it is shown as "My lists" or "Kasun's lists"                                                                                                                                                                             | Follows from the line above; passes on or ends with the account (§19)                                                                               |
| 2026-11-10 | **Ticking sets the item's bought fields only** in 0.1.0; trips, shops, prices and totals are phase 2, and 0.1.0 has a **light shopping mode**                                                                                                                                              | The owner's choice; a trip is added later without changing what 0.1.0 wrote                                                                         |
| 2026-11-10 | **0.1.0 signs in by password or through a core;** passkeys, the authenticator app, linking and `invite` are phase 2, and **`open` is the default sign-up** until `invite` exists                                                                                                           | A link must be acceptable by someone with no account; `invite` waits on `sovereign` and 0.1.0 does not                                              |
| 2026-11-10 | **No notices, mail outbox, live updates, export, import or directory in 0.1.0;** devices pull every 20 seconds by default                                                                                                                                                                  | Not needed to use, share and trust a list; each is an addition                                                                                      |
| 2026-11-10 | **A starter catalog of about 150 on the icons that exist, and fixed starter categories;** the larger set and editing are phase 2                                                                                                                                                           | 0.1.0 waits on nothing upstream                                                                                                                     |
| 2026-11-10 | **Phase numbers in the rows above dated 2026-11-09 are that day's:** its phase 2 is now 3, its phase 3 is now 4, and what it called phase 1 is now phases 1 and 2                                                                                                                          | The log is not rewritten                                                                                                                            |
| 2026-11-21 | **Encryption the server cannot read, always, the suite's way** (RFC 0001): what people write is encrypted in the browser under a household key, from core when hosted and from Shopper's vault alone; it supersedes the rows above that ruled end to end out, and §13 is rewritten by 18.1 | The owner's decision: the suite published it, and the server does not need the text                                                                 |
| 2026-11-21 | **Web Push and exports from the suite's packages, before phase 2** (RFC 0002, 0003); push is no longer phase 3's (13.8 superseded), and export no longer phase 2's own format (11.1, 11.2 superseded)                                                                                      | The owner's decision                                                                                                                                |
| 2026-11-21 | **A phase carries no version number:** each ends in a release, whose version semver gives (`AGENTS.md`); 0.1.0 is phase 1's                                                                                                                                                                | `0.2.0` on `develop` (the installed app) and phase 2's label collided; the suite's rule that the version follows the change settles it              |
| 2026-11-21 | **Lists of their own** (RFC 0004): a list is what is shared, with its own people, catalog and keys; the group each account is made with holds its lists and is never shown. Supersedes the rows above that made the household the unit of sharing and ruled out per-list sharing           |
| 2026-11-22 | **No compatibility with 0.1.0's shared households is designed for** (the owner): this design describes lists of their own only                                                                                                                                                             |
| 2026-11-21 | **Sign-in on `@sovereignfs/auth`** (ADR 0001, proposed), before Shopper's vault                                                                                                                                                                                                            | One sign-in for the suite; the vault's hooks are the package's                                                                                      |
| 2026-11-22 | **Sign-in on `@sovereignfs/auth`, built** (ADR 0001 accepted, task 17.5): the auth store moves onto the package's tables at start; everyone signs in once more after the upgrade, under the package's cookie                                                                               | What the ADR's fallback waited on was released in `@sovereignfs/auth` 0.6.0                                                                         |
| 2026-11-23 | **One way in per instance** (RFC 0005): suite mode signs in through core only, standalone through Shopper's own accounts only; an instance configured with both starts in suite mode. Supersedes "locally, through core, or both" and linking (2.9)                                        | A suite signs in through core; a standalone app has no core to offer                                                                                |
| 2026-11-23 | **The suite's frame, Settings as `SettingsDialog`, an item beside its list, a list's icon and colour (encrypted), page titles set by the browser** (RFC 0005); the frame and the dialog are built in `@sovereignfs/ui` first                                                               | Shopper looks and behaves as the suite's apps do, and reusable UI is the design system's                                                            |
| 2026-11-23 | **Home is where Shopper opens,** with _Continue_ for the last list; _All lists_ is Home's (RFC 0006). Supersedes the landing on the last list (§16.4 as it was)                                                                                                                            | The owner's decision: Continue keeps the last list one tap away                                                                                     |
| 2026-11-23 | **Inventory, a person's own library of what they buy,** never shared, with the starter catalog layered under it and their own categories, copied per list as a list uses them (RFC 0006). The catalog screen is Inventory; the pantry, staples and repeating items are Inventory's         | Sharing it would break RFC 0004; copying the starter into every account would freeze it                                                             |
| 2026-11-23 | **Loyalty cards in Shopper, shop cards only,** each with its own people and keys, shared by a link as a list is, linked to lists for shopping mode; six kinds of code; scanning on the device brought forward from phase 4 (RFC 0007)                                                      | Shopper alone would otherwise have none, and sharing with the people one shops with would wait on Wallet; Wallet stays for what is private          |
| 2026-11-23 | **A person's own export is readable,** one JSON file made in the browser after confirming it is them (RFC 0005); core's export keeps Shopper's part as ciphertext. Supersedes 20.2 as written                                                                                              | The owner's decision: people get their data readable now                                                                                            |

### Settled at leg 1's review (2026-11-23)

Writing RFC 0005 to 0007 into this file (22.1, 23.1, 24.1) found these, where the RFCs were silent, disagreed or could not be built as written. The
owner settled each as written here, in workstream 0002's leg 1 review:

1. **A list's default icon and colour** (§9.1): RFC 0005 gives existing lists the cart and blue by a migration, but the server cannot encrypt them and
   a plain default would say what it is. Decided: a list with neither is shown with the defaults, and nothing is written for it.
2. **The sidebar's words** (§7.4, §16.2): RFC 0005 says _My lists_ and _Shared with me_; 0.3.0 says _Your lists_ and _Shared with you_. Decided:
   RFC 0005's, changed with the frame (22.11).
3. **Limits for Inventory** (§7.6): RFC 0006 sets none, and every limit is a setting. Decided: `SHOPPER_LIMIT_INVENTORY_ITEMS`, 5000, as a group's
   products; a person's own categories count against `SHOPPER_LIMIT_HOUSEHOLD_CATEGORIES`.
4. **Inventory in a group still sealed by the server** (§13.7): a group that could not move has no keyring to derive Inventory keys from. Decided:
   its Inventory and own categories are sealed by the server as the rest of its content is, and move with it.
5. **An item's category on a shared list** (§8.3): RFC 0006 makes a list's copy of a person's category; decided that an item then points at the
   copy (`list_category`), so that nothing a change points at is another group's.
6. **All lists** (§9.7): RFC 0006 makes _All lists_ Home's tiles; decided that phase 2's view of every open item in one place is not built, rather
   than kept as a page beside Home.
7. **Where a card's invitation is kept** (§20.3): RFC 0007 does not say. Decided: `invitation` with a `card_id` in place of its `list_id`, so that
   one token store, one page and one set of rules serve both.
8. **A card's keys when someone leaves** (§13.2): 24.5 asks for a new key; a list makes none until 16.8. Decided: a card follows a list, and both get
   new epochs together when 16.8 is released.
9. **Where a list's cards are linked** (§16.5): RFC 0007 says "from the list's settings", which have two sections. Decided: a third, **Cards**.
10. **Limits for cards** (§7.6): decided, `SHOPPER_LIMIT_ACCOUNT_CARDS`, 100, with a card's people and links as a list's.
11. **Who is handed a card's link to a list** (§7.7, §12.3): decided, only someone on both, so that a person on the list learns nothing of a card they
    are not on, not even that it exists.
12. **Shopping mode's header** (§11.1): RFC 0005 leaves nothing on the right; RFC 0007 puts the card button there. Decided: the card button, and
    phase 2's shop beside it.
13. **Joining a list in a suite with no account there** (§15.1, §21): with one way in, someone sent a link who has no account on the instance can join
    only if core lets them sign up; until now a hosted Shopper could keep its own sign-in on for them. Decided: accepted, as core's sign-up decides.
14. **Who may invite to a card** (§7.7): RFC 0007 says a Member sees and shows it, where a list's Member may also invite. Decided: RFC 0007's, its
    Admin alone invites.
