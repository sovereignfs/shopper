# Shopper — design

**Status:** draft, written on 2026-11-09 from the legacy `sovereign-plugin-shopper` (manifest 0.6.1, its `SPEC.md` 0.2, `UI.md` and roadmap), Tusk's,
Tally's and Roam's designs, and the owner's direction in planning. Nothing is built. **Phase 1 was cut to a minimum viable product on 2026-11-10 (§2.2);** this file still describes the whole design, and each
section says where something comes later. Where this file and a contract Sovereign publishes disagree, the
contract wins (`AGENTS.md`, Source of truth). §25 holds what is still waiting on a decision (nothing, for now), and §26 what has been decided and why.

[`ROADMAP.md`](ROADMAP.md) puts the work in order, and [`docs/epics/`](docs/epics/) holds each task's detail.

---

## 1. Purpose

Shopper is a household's shopping: the lists its people add to through the week, the shop where one of them ticks things off with no signal, and the
memory of what was bought, where and for how much, so that next week's list writes itself faster. It is an app of the Sovereign suite exactly as Tusk,
Fjord, Tally and Roam are: a program of its own, which an instance can host, and which needs no instance to run.

Shopper replaces the legacy plugin `sovereign-plugin-shopper`. Its behaviour is the starting point; none of its code is carried over, its interface
and data model are designed anew (§16, §20), and its export can be imported (§18.3).

What it must not give up, whatever the convenience:

- **It works alone.** Every feature works on a Shopper with no Sovereign instance: its own accounts, its own people, its own mail, its own notices. An
  instance adds a way to sign in, a directory to find people in, and core's bell and email; it is never what a feature depends on (§15).
- **The shop has no signal.** Everything done to lists, items, the catalog and trips works with no network, answers at once, and syncs in the
  background (§12). Nobody standing in an aisle should notice they are offline.
- **Two people, one list, at once.** A household writes to the same list from several phones, often at the same moment. Changes merge field by field,
  nothing anyone typed is lost, and nobody is asked to resolve a conflict (§12.4). Each person chooses how fresh their copy is, up to live (§12.6).
- **Adding is quick.** The second time anyone in a household adds _oat milk_ it comes with its category, icon, unit and last price, and the
  suggestions learn what this household buys (§8).
- **Private at rest.** What a household buys says a lot about it. Names, notes, prices and shops are encrypted in the database under the app's own key
  (§13).
- **A person can leave.** One file holds what is theirs to take (§18). Deleting the account removes their email and everything else personal, and
  keeps only their name on the shared record (§19).

How much of this the first release holds is §2.2.

What it is not: a budget or a ledger (that is Ledger), a way to split what a trip cost (that is Tally), a price-comparison service, or a delivery app.
It never talks to a shop.

## 2. Phases

| Phase                  | What it delivers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1, the MVP** (0.1.0) | On the web, responsive, installable and **working offline**: sign-in with an email and a password, or through a Sovereign core; lists in a household of one's own, with a first list; items with quantity, unit, category, icon and note; a catalog that learns what the household buys, a starter catalog, and suggestions as one types; ticking off, a Bought section and _Clear bought_; a light shopping mode; **sharing by a link**, so that anyone invited sees and edits every list; background sync with Couldn't sync; **everything sealed at rest**; deleting an account. Runs alone or hosted. §2.2 is the exact list. |
| **2** (0.2.0)          | What the first design put in phase 1 and 0.1.0 leaves out: households made, named and managed, roles, moving lists, invitations by email; trips, shops, prices and totals, shopping mode with them, the trips history; notices, the bell and mail; live updates and a freshness setting; passkeys, the authenticator app and linking; reading "2 oat milk"; editing categories and products; All lists and the catalog screen; a larger starter catalog; export, import and import from the plugin; core's bell, email, activity and directory. §22.1.                                                                            |
| **3** (0.3.0)          | The pantry (what is at home, low-stock flags), staples, repeating items, list templates, shops with their own aisle order learned from ticking, insights with charts, Push notifications. §22.2 outlines each.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **4** (0.4.0)          | Capture: barcode scanning decoded on the device, product lookup by barcode through the server, photos on products and items, receipt images on trips. §22.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Later**              | Candidates, none committed: encrypted backup to Git, sending a trip to Ledger or Tally as a link, AI features through the instance's model provider. §22.4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 2.1 What is carried over

The plugin's requirement numbers (`SHP-*`) and task numbers (`T-*`) are not used here. This table is how to check nothing was lost.

| Plugin                                                                                         | Here                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lists owned by a user, rename, archive (SHP-01)                                                | §9.1. **Lists belong to a household,** and a person's private household holds what was "my lists"                                                                       |
| Per-list sharing with one user as editor or viewer (SHP-09)                                    | **Dropped.** Sharing is a household (§7), by a link in 0.1.0; there is no viewer role (§26)                                                                             |
| Households, owner and member roles, invites, a default shared list (SHP-20–23)                 | §7: in 0.1.0 a household of one's own, shared by a link, with Admin and Member and a first list; making households, changing roles and invitations by email are phase 2 |
| Moving a list from a person to a household (SHP-24) and its unsolved migration                 | §9.1, **phase 2**: moving a list between one's households is an online operation; there is nothing to migrate                                                           |
| Own lists, shared with me, read-only combined view (SHP-02)                                    | §9.7: **All lists**, editable, since the device holds everything (phase 2; in 0.1.0 the sidebar holds every household's lists)                                          |
| Last-used list as the landing page (SHP-03)                                                    | §16.4                                                                                                                                                                   |
| Type-ahead suggestions from the owner's catalog and history (SHP-04), learned ranking (SHP-32) | §8.5, from the household's catalog and what it buys, learned from the first release                                                                                     |
| Curated icons with a category fallback (SHP-05)                                                | §8.4, `IconPicker`; 0.1.0 uses the icon set as it is, and more grocery icons are added to the design system for phase 2 (§16.10)                                        |
| Edit name, quantity, unit, category, icon, barcode, price, updating the catalog (SHP-06)       | §9.2, §8.2. Price comes with trips in phase 2; the barcode is kept on the product in phase 4, with scanning                                                             |
| Tap to buy writes a purchase row; untap removes it (SHP-07)                                    | §9.5: a tick marks the item bought; from phase 2 (§10) it also puts it in the person's open **trip**, as a trip line; unticking undoes both                             |
| Clear bought, reorder, group by category (SHP-08)                                              | §9.5, §9.6, with the household's category order as its aisle order                                                                                                      |
| Household analytics: spend, categories, frequent items, who bought what (SHP-25)               | Phase 3, Insights (§22.2). The trips history (§10.5) is in phase 2                                                                                                      |
| Light inventory and low-stock (SHP-30, 31)                                                     | Phase 3, the pantry (§22.2)                                                                                                                                             |
| Photos, barcode scanning, Open Food Facts lookup (SHP-40, 41)                                  | Phase 4 (§22.3), files stored by Shopper itself, lookups made by the server                                                                                             |
| Live shared-list sync (SHP-50)                                                                 | §12.6: devices pull every 20 seconds by default in 0.1.0; **live updates are phase 2**, as a setting each person chooses within the operator's limits                   |
| Notifications for items added, someone bought, invites (SHP-51)                                | §14, phase 2                                                                                                                                                            |
| Household activity feed (SHP-52)                                                               | Not carried: the trips history and notices cover what people asked of it (§26)                                                                                          |
| AI icons, receipt OCR, auto-categories, predictive restock (SHP-60–63)                         | Later (§22.4); categories are learned from the catalog without AI (§8.3)                                                                                                |
| Price history (SHP-70)                                                                         | A product's last price with trips in phase 2 (§8.2); per shop and over time in phase 3 (§22.2)                                                                          |
| Budgets, multi-currency, a household ledger (SHP-71, 73)                                       | **Dropped:** Ledger's job. One currency per household (§7.1)                                                                                                            |
| Recurring items (SHP-72)                                                                       | Phase 3 (§22.2)                                                                                                                                                         |
| CSV export of the ledger (SHP-74)                                                              | Export of everything as JSON (§18)                                                                                                                                      |
| Export, import, delete through `sdk.portability`                                               | §18 (export and import, phase 2), §19 (delete, 0.1.0), as the app's own, and **the plugin's export can be imported** (§18.3, phase 2)                                   |
| Tenants, `sdk.db`, `sdk.directory`, the plugin manifest                                        | Gone with the legacy runtime (§15, §20)                                                                                                                                 |

### 2.2 What 0.1.0 holds, and what waits

0.1.0 is a minimum viable product: a person, or two, can use it every week for their shopping, offline, with what they buy sealed at rest. The cut
keeps **what a list needs to be used, shared and trusted, and leaves out what only makes it richer.** The design stays whole: what comes later is
said where it appears, and **nothing in 0.1.0's data model, access rules or sync has to change for phase 2**; each later feature adds a table, a
column, an operation or a screen.

| Area             | 0.1.0 holds                                                                                                                                                      | Waits (phase)                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Sign-in          | Email and password; a Sovereign core, with its back-channel logout and account-deleted notices                                                                   | Passkeys, authenticator app, linking (2); core's directory, bell, email, activity (2)                                      |
| Sign-up          | `open` (the default) or `closed` (§6.3)                                                                                                                          | `invite`, the default (2)                                                                                                  |
| Sharing          | The household an account is made with, **shared by a link**: everyone invited sees and edits every list in it; leave and remove                                  | Making, naming and deleting households, several at once; roles; moving a list between households; invitations by email (2) |
| Lists and items  | Lists (make, rename, reorder, archive, delete for good); items with quantity, unit, category, icon, note; tick, untick, Bought, _Clear bought_; undo; fold       | Prices (2); reading "2 oat milk" (2); clearing rules (2)                                                                   |
| Catalog          | Products learned from adding; about 150 starter entries; suggestions and "Often bought"; the starter categories, fixed, in their order                           | Editing and merging products and categories (2); about 400 entries and grocery icons (2)                                   |
| Shopping         | Shopping mode, light: large rows, the screen kept on, In basket, _Finish shopping_ clears what was bought                                                        | Trips, shops, prices, totals, "shopping too", several lists, the trips history (2)                                         |
| Offline and sync | Everything above works offline; background sync; Couldn't sync; installable; opens offline; others' changes by an interval (20 s) and on write, focus, reconnect | Live updates and a freshness choice per device; pruning the history (2)                                                    |
| Encryption       | Everything that names something sealed at rest, the name key, key rotation (§13)                                                                                 | Each later table and field, sealed as it arrives                                                                           |
| Notices and mail | None. Mail only for sign-in (verification, reset), when SMTP is set                                                                                              | Notices, the bell, the mail outbox, digests, preferences (2); Push (3)                                                     |
| A person's data  | Delete the account (§19)                                                                                                                                         | Export, import, import from the plugin (2)                                                                                 |
| Phone            | Responsive, installable, a footer; the add field at the top of a list                                                                                            | The floating Add button (2)                                                                                                |
| Design system    | **Nothing built upstream first**: the components and icons that exist                                                                                            | Grocery icons, `AvatarStack`, a floating button (2); charts (3)                                                            |

**Sharing in 0.1.0 is sharing a household, and is said so on screen:** everyone in it sees and edits all of its lists. A person who wants a list
only they see keeps it in a household of their own that they do not share, which in 0.1.0 means not sharing at all; phase 2's second household
and moving a list (§9.1) are the fuller answer.

**Journeys** (§3) in 0.1.0: 1, 2, 4, 5 and 12 as written; 3 by a link with sign-up open; 6 to 8 without the shop, prices, total or notice; 9, 10 and
11 are phase 2.

## 3. User journeys

1. **First visit, alone.** Someone runs the image (§21). They make the first account and land on their first list, _Groceries_, in their own lists, with the
   cursor in the add field.
2. **First visit, on an instance.** They open Shopper from the launcher and sign in through core. The same.
3. **Sharing.** Kasun presses _Share_ on _Groceries_, makes a link and sends it to Thulana any way he likes. Thulana opens it, makes an account
   (sign-up is open on this server, §6.3), and finds Kasun's lists, _Groceries_ among them. _(From 0.2.0 Kasun can also make a second household,
   *Home*, in EUR, and invite Thulana to it by email.)_
4. **Through the week.** Thulana types "oa" and Shopper offers _Oat milk_, which Kasun added last week, with its carton icon, Dairy & eggs, and 1 L.
   One tap. Kasun, on the bus, adds _bread_ and _coffee_. Both see the other's items within seconds (§12.6).
5. **Adding what is there.** Kasun adds _oat milk_ again. Shopper says it is already on the list and offers _+1_; he takes it, and the quantity is 2.
6. **In the shop.** Thulana opens _Groceries_ and presses _Shop_. The screen stays on, rows are large, in the household's aisle order, and Thulana
   picks _Lidl_ as the shop. The basement has no signal; ticking works anyway, with prices typed for three items. Ticked items drop into the basket at
   the bottom. _(0.1.0: no shop and no prices.)_
7. **Two people, one shop.** Kasun is in the same shop and ticks _coffee_ from his phone while Thulana's phone is offline. When it syncs, Thulana sees
   _coffee_ ticked by Kasun; nothing is bought twice.
8. **Finished.** Thulana presses _Finish shopping_: 14 items, €62.40, Lidl, two items still on the list. Kasun gets a notice, "Thulana finished
   shopping at Lidl · 14 items". The bought items leave the list, as the list's setting says (§9.5). _(0.1.0: *Finish shopping* offers to clear the bought
   items, with no total, shop or notice.)_
9. **Looking back (0.2.0).** On _Trips_, Saturday's trip shows each line with its price. _Oat milk_ remembers €1.29, and offers it next time.
10. **A private list (0.2.0).** Kasun keeps _Hardware store_ in a household of his own that nobody else is in. Later he moves it into _Home_ (§9.1).
11. **From the plugin (0.2.0).** Thulana imports the file the old plugin exported: her lists, catalog and purchase history arrive in her own household, the purchases
    as trips (§18.3).
12. **Leave.** Kasun deletes his account. The lists he shared pass to Thulana as Admin; what he added still says "Kasun (left Shopper)".

## 4. Terminology

| Term                | Meaning                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Account**         | Someone who can sign in. In code, `account_id` is the better-auth user id (as in Tusk)                                                                                                                     |
| **Person**          | Shopper's record of someone who appears on shared rows: every account has one, which keeps the name after the account is deleted (§6.1). `person_id` in code                                               |
| **Household**       | People who shop together, and everything they share: lists, catalog, categories, shops and trips (§7). In code `household`                                                                                 |
| **Own household**   | The household made with an account, where its lists start; others can be invited into it (§7.4). On screen it is "My lists" to its owner and "Kasun's lists" to everyone else, until it is named (phase 2) |
| **Member**          | A person's place in a household, with a role: **Admin** or **Member** (§7.2)                                                                                                                               |
| **Invitation**      | A single-use link that lets someone join a household (§7.3)                                                                                                                                                |
| **List**            | A shopping list in a household: _Groceries_, _Pharmacy_ (§9.1)                                                                                                                                             |
| **Item**            | One thing on a list: _Oat milk, 2 L_ (§9.2). It is **open** until ticked, then **bought**, then **cleared** from the list                                                                                  |
| **Product**         | An entry in the household's **catalog**: what Shopper remembers about something this household buys (§8.2)                                                                                                 |
| **Starter catalog** | The common groceries Shopper ships with, offered until the household has its own entry (§8.6)                                                                                                              |
| **Category**        | A section of the shop (_Produce_, _Dairy & eggs_). Their order in a household is its **aisle order** (§8.3)                                                                                                |
| **Trip**            | (Phase 2) One person's time in a shop: what they ticked, where, when, and what it cost (§10)                                                                                                               |
| **Trip line**       | (Phase 2) One bought thing in a trip, kept after the item leaves the list (§10.2)                                                                                                                          |
| **Shop**            | (Phase 2) A place a household buys from, named in its trips (§10.3)                                                                                                                                        |
| **Shopping mode**   | The screen for the shop (§11)                                                                                                                                                                              |
| **Notice**          | (Phase 2) Something a person is told, in the bell (§14)                                                                                                                                                    |
| **Outbox**          | Changes made on a device and not yet accepted by the server (§12)                                                                                                                                          |

User-facing text says "household", "list", "item", "catalog", "trip", "shop", "bought", "basket", "shopping", "Admin", "Member", "app"; never
"ledger", "purchase transaction", "product row", "owner", "viewer", "editor", "tenant", "client" or "plugin". On screen, ticking is "bought" and a
trip is "shopping at Lidl".

## 5. Architecture

```
            browser (a PWA)                                        server (one image, one process)
 ┌────────────────────────────────────────┐              ┌──────────────────────────────────────────────────┐
 │ UI (React 19, @sovereignfs/ui)         │              │ Next.js: the shell, routes, server actions        │
 │ reads and writes the device's store:   │  /api/sync   │ better-auth (§15)                                 │
 │   IndexedDB, one database per account  │ ◀──────────▶ │ sync: checks, merges, orders, stores (§12)        │
 │ actions: pure, shared with the server  │              │ /api/ops: households, members, invitations,       │
 │ suggestions, totals, aisle order: pure │  /api/ops    │   moving lists (online)                           │
 │ service worker: the shell, Background  │ ◀──────────▶ │ /api/live: "household X moved" (SSE, §12.6)       │
 │   Sync                                 │  /api/live   │ sealing: envelope encryption at rest (§13)        │
 │ live listener: pulls when told         │ ◀─────────── │ notices, digests, mail outbox; jobs               │
 └────────────────────────────────────────┘              └───┬──────────────────┬───────────────────┬───────┘
                                                             │                  │                   │
                                                      SQLite (sqld or      SMTP (Shopper's      a Sovereign core,
                                                      a file) or           own, when set)       if one is set
                                                      PostgreSQL (§20)
```

- **Offline first for what is shopped, online for what is decided.** Lists, items, the catalog, categories, shops and trips are written to the device
  and synced (§12), as Tusk's Desk and Tally's expenses are. Households, membership, roles, invitations and moving a list between households are
  changes the server must decide at once, so they are online operations (`/api/ops`), as Tally's groups are (§12.8).
- **The server is the referee:** it checks every change against membership and the limits, merges it field by field, orders it, and hands it to the
  other members' devices. It reads every field, which is why Shopper is encrypted at rest and not end to end (§13): it merges fields, folds duplicate
  items together and words notices.
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
| `src/crypto/`             | The instance key, envelope encryption, sealed rows, the name key (§13) — envelope **copied from Tusk**, sealing **from Roam**                                      |
| `src/people/`             | Persons (§6.1)                                                                                                                                                     |
| `src/households/`         | Households, members, roles, invitations, lifecycle, moving lists, the operations (§7)                                                                              |
| `src/catalog/`            | Normalising names, the starter catalog and its icons, categories, units, suggestion ranking (§8) — pure                                                            |
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
| `src/sw/`                 | The service worker: the shell by allow-list, the offline shell page, Background Sync — **from Tusk**                                                               |
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

**The permission is in the statement.** Every row of a household carries `household_id`, and every read and write names it together with membership:
`… WHERE household_id = ? AND EXISTS (SELECT 1 FROM member m JOIN person p ON p.id = m.person_id WHERE m.household_id = ? AND p.account_id = ? AND m.left_at IS NULL)`.
Never checked first and then touched; a refusal reads as not found. Anything a change points at (a list, a product, a category, a trip) must be the
same household's, in the same statement. An Admin's operation adds `AND m.role = 'admin'`.

- **Sync applies the same rule per mutation** (§12.5): a mutation for a household the account is not an active member of is refused, not ignored.
- `src/access/routes.ts` lists every page, route and operation with who may use it; a test calls each as a second signed-in person and expects not
  found.
- **Pull and the live stream hand a device only its households:** rows of a household the account has left stop arriving, and the device deletes its
  copy (§12.3).

## 6. People and accounts

### 6.1 A person

`person` is Shopper's record of someone who appears on shared rows: their name, their email, and the account. **Every account has exactly one
person,** made with the account, its name and email copied from sign-in and kept in step when the person changes them in Settings. Shopper has no
placeholders: everyone in a household has an account, since a household is shared by people who all shop (§26).

As in Tally, the person exists so that **a name outlives an account** (§19) and **no feature depends on core for who someone is:** core's directory is
one more way to find a person to invite (§7.3), never where their name lives.

- **A name** is what every member of a shared household sees, on items ("added by Thulana"), ticks and trips. **An email** is seen by the person
  themselves and by the Admins of a household they are in; never by other members, and never in a notice or an export of someone else.

### 6.2 Avatars

Initials, from the name, in a colour derived from the person's id. No picture is loaded from anywhere else.

### 6.3 Who may sign up

`SHOPPER_AUTH_SIGNUP` decides who may make a local account, one policy in better-auth's user-creation hook, as Tally's:

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

## 7. Households

### 7.1 A household

A household has its **members**, its **aisle order** (the order of its categories, §8.3), and whether it is the creator's own (§7.4). Its lists,
items, catalog, categories, shops and trips belong to it and carry its `household_id`. **From phase 2** it also has a name, a colour (one of the design
system's accent tokens, shown as its dot) and **a currency** (one, for every price in it; from the creator's locale, changeable by an Admin, which
changes no stored amount, only how it is labelled, and says so), and a person can make more than one (§7.4).

**In 0.1.0 a household has none of the three and a person never makes one by hand:** it is made with the account (§7.4) and shown by the rule there.
The name arrives with 3.8 and the currency with prices (7.1), as columns added to a table that exists; nothing is migrated.

A household is made with one list, _Groceries_, and the starter categories (§8.3).

### 7.2 Members and roles

| Who        | May                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member** | Everything to do with shopping: make, rename, reorder, archive and restore lists; add, edit, tick and delete items; edit the catalog, categories, aisle order and shops; shop; edit trips; invite; leave      |
| **Admin**  | Also: rename and recolour the household, change its currency; make and unmake Admins; remove members; revoke invitations; delete lists for good; move lists in and out of the household; delete the household |

- **A household always has an Admin.** The last Admin cannot leave, be removed or step down until another member is made Admin.
- **The creator is its first Admin.**
- **There is no read-only role** (§26): a household shops together.
- **In 0.1.0** the creator is the Admin and everyone who joins is a Member, and roles cannot be changed: so the Admin cannot leave (nobody could take
  over), and the operations in use are inviting (any member), removing, revoking and deleting a list for good (the Admin), and leaving (a Member).
  Changing roles, renaming, moving lists and deleting the household are phase 2 (3.8, 3.9, 3.6).

### 7.3 Invitations

People join a household only by accepting, never by being added: a household is shared by the people in it, and joining shows them your name.

**In 0.1.0 an invitation is a link and nothing else.** _Share_ makes one, shown once to copy and send any way; there is no email field, no resend, no
directory search and no notice: the person who shared sees the new person appear in the list of people. Email, the directory and the bell are phase 2
(3.10, 10.2, 9.2). Everything else below holds from the first release.

- **Invite** (any member, from **Share**, §16.9) offers one field in phase 2: typing an email makes an invitation for that address. **On an instance
  with the directory** (§15.4), typing a name also searches core's directory; choosing someone there makes an invitation addressed to their `sub`,
  delivered to core's bell and email, and to Shopper's bell if they already have an account here. The adder is never told whether an address has an
  account.
- **An invitation** is a random token of 32 bytes, stored only as its hash, compared in constant time, valid for 14 days, single-use, revocable by
  whoever made it or an Admin. At most 20 live invitations a household.
- **Delivered by email** (phase 2) through Shopper's mail (§14.3) when an address is given and mail is set up, and to the bell of an account here whose
  verified email or `sub` it names; **always available as a link** to copy and send any other way. With no mail set up, the dialog says the link is
  the only way, rather than pretending an email went.
- **`/invite/<token>`** shows the household's owner's name (§7.4) and who invited, and nothing else. It offers to sign in, or to create an account (which
  the sign-up policy allows, §6.3; under `closed` it says an account is needed first), and through core when core is set. **Whoever holds the link can
  accept it,** as in Tally, whatever address it was sent to; the inviter is told who joined (§14.1, phase 2; in 0.1.0 they see it in the list).
- **Accepting** adds the person as a Member, in one transaction, and the household's rows start arriving on their devices at the next sync.
- **Resend** (phase 2) sends the same invitation again, at most once an hour.

### 7.4 Your own household

Every account has one, made with it: one member to begin with, its Admin, with a _Groceries_ list. It is where a person's lists start.

- **It takes members.** _Share_ invites people into it (§7.3). Everyone in a household sees and edits all of its lists, so **sharing is not per
  list**; to keep a list private beside shared ones a person makes a second household and moves the list into it (phase 2, §9.1).
- **It is shown by the person it was made for:** "My lists" to its owner, "Kasun's lists" (the owner's name, from `person`) to everyone else, and "Shared
  lists" once its owner has left Shopper (§19), until phase 2 lets it be named. There is no "Just me".
- **It cannot be deleted** while the account exists, and its Admin cannot leave it; it ends with the account, or passes on (§19).
- **It is a household in every other way:** its own catalog, categories, shops and trips, the same screens and sync. In phase 2 a person can make
  further households (3.8); whether the first can then be left or kept unshared is decided there.

### 7.5 Lifecycle

- **Leave** (any member but the last Admin): their items, ticks and trips stay, by their name ("added by Sam (left)"); their open trip in it is
  closed (phase 2).
- **Remove** (Admins): the same, and the person is told (§14.1, phase 2).
- **Delete** (Admins, phase 2), behind a confirmation that names what goes, removes everything of the household, by `household_id`, in one
  transaction; its members are told. A person's own household cannot be deleted (§7.4).
- **Limits** (§7.6) are checked by the server and said in a sentence.

### 7.6 Limits

Every limit is a setting the operator can change, with a default:

| Setting                              | Default | What                                                 |
| ------------------------------------ | ------- | ---------------------------------------------------- |
| `SHOPPER_LIMIT_HOUSEHOLD_MEMBERS`    | 20      | Members of a household                               |
| `SHOPPER_LIMIT_ACCOUNT_HOUSEHOLDS`   | 20      | Households an account is in, its own included        |
| `SHOPPER_LIMIT_HOUSEHOLD_LISTS`      | 100     | Lists of a household, archived included              |
| `SHOPPER_LIMIT_LIST_OPEN_ITEMS`      | 500     | Open items on a list                                 |
| `SHOPPER_LIMIT_HOUSEHOLD_PRODUCTS`   | 5000    | Products in a household's catalog                    |
| `SHOPPER_LIMIT_HOUSEHOLD_CATEGORIES` | 100     | Categories of a household, hidden included (phase 2) |

A limit reached offline is found when the change syncs and goes to Couldn't sync with the sentence (§12.5). 0.1.0 has the first five; the sixth comes
with editing categories (4.7).

## 8. The catalog

### 8.1 What it is for

The catalog is what a household's Shopper remembers about the things it buys, so that adding is one tap and the item arrives right. It is never a
screen people must maintain: it fills itself from what they add and edit, and they may tidy it (§16.8).

### 8.2 A product

A name, its **name key** (§8.7), a category, an icon, a default unit and quantity, a note (a brand, "the green one"), a **barcode** (kept; used in
phase 4), the **last unit price** and the unit it was for, how many times it has been bought, and when it was last bought and added. **0.1.0 has no last unit price and no barcode:** they arrive, as columns, with prices (7.1) and capture (14.1).

- **Every item points at a product.** Adding a name the household has never used makes a product, from the starter catalog when it matches (§8.6),
  otherwise with the category guessed (§8.3) and a generic icon.
- **Editing an item's category, icon or unit can update its product,** so the next add comes right: the item dialog has "Remember for next time", on
  by default (§9.4). Its name, quantity, note and price are the item's own; the price also updates the product's last unit price when the item is
  bought (§10.4).
- **A product is renamed, merged or deleted** (phase 2) from the catalog screen (§16.8). Merging two (_Oatmilk_ into _Oat milk_) points every item and trip line
  of one at the other, in one mutation. Deleting a product with open items is refused with a sentence; its trip lines keep their names.

### 8.3 Categories and aisle order

A household's categories are rows of its own, made from the starter set when the household is made: **Produce, Bakery, Dairy & eggs, Meat & fish,
Deli, Frozen, Pantry, Breakfast, Snacks & sweets, Drinks, Household, Personal care, Baby, Pets, Other**, each with an icon.

- **Any member can rename, hide, add, and reorder them** (phase 2; **in 0.1.0 the starter categories are fixed**, and their order is every household's aisle order). Their order is the household's **aisle order**: lists and shopping mode group items in it.
  Hidden categories are not offered; their items show under _Other_ until moved. _Other_ cannot be hidden or deleted.
- **A new product's category** is guessed by one pure function: the starter catalog's entry if the name matches one, otherwise the category most used
  by this household's products sharing a word with it, otherwise _Other_.
- **Per-shop aisle order** is phase 3 (§22.2); until then a household has one.

### 8.4 Icons

Every product, category and item has an icon from the design system's grocery set, chosen with `IconPicker`. The set the plugin added (21 icons) is
too small for the starter catalog; around 80 grocery icons are added to `@sovereignfs/ui` first (task 16.4), Lucide-style, token-coloured. An item
without one shows its category's. **0.1.0 uses the set as it is,** each starter entry taking the icon that fits best, or its category's; the
larger set arrives in phase 2 with a larger starter catalog (4.8).

### 8.5 Suggestions

The add field (§16.6) suggests as the person types, from one pure function (`src/catalog/suggest.ts`) over the household's products and, from phase 2, its last 180
days of trip lines, on the device, offline:

1. **Matches:** the products whose normalised name starts with what was typed, then those with a word that does, then those within one edit of it,
   then starter-catalog entries the household has no product for, the same way.
2. **Ranked** within each tier by how often the household bought it in the last 180 days, with recent buys counting more (a weight halving every 30
   days), then by when it was last added, then alphabetically. **In 0.1.0, which has no trip lines,** "how often" is the product's count of
   times bought, then when it was last bought (§8.2); the decayed count over trip lines arrives with trips (7.1).
3. **Already on this list:** a match open on the list shows "On the list · 2" and choosing it offers _+1_ rather than a second row (§9.3).
4. **Always last,** "Add _what was typed_" as a new item, so nobody is stuck when nothing matches.

At most eight are shown. Nothing about ranking is stored: it is computed from the rows the device already holds. With an empty field, the add field
offers the household's most often bought products not on the list ("Often bought").

### 8.6 The starter catalog

About 150 common groceries in 0.1.0 and about 400 from phase 2 (4.8), in English, shipped in the code (`src/catalog/starter.ts`), each with a name, aliases (_courgette_ and _zucchini_), a
category key, an icon and a default unit. It is data, not rows: a household's product is made from an entry when the household first adds it. It is
reviewed in its own task (4.3) and can grow in any release; other languages are not in phase 1.

### 8.7 Names

- **Normalising** (`src/catalog/name.ts`, pure): trim, collapse spaces, Unicode NFKC, lower case in the root locale, strip a trailing plural "s" only
  where the starter catalog says so. _Oat Milk_ and _oat milk_ are one product.
- **The name key** is an HMAC of the normalised name under a key derived from `SHOPPER_ENCRYPTION_KEY` and the household's id (§13.2). It is how the
  server finds "the same product" in a household without reading names in a query, and it is unique per household. It reveals only that two rows of
  one household share a name.

## 9. Lists and items

### 9.1 A list

A name, its position among the household's lists, its **clearing rule** (§9.5; `manual` in 0.1.0), and whether it is archived. It belongs to one household.

- **Make, rename, reorder, archive and restore** (any member) are synced changes, offline as well. **Delete for good** (Admins) is offered only for an
  archived list, and removes its items; trip lines keep their names and the list's name.
- **Move to another household** (phase 2; an Admin of both, or the person moving from their own household into a shared one they are an Admin of; online,
  §12.8) moves the list and its items in one transaction. Their products are matched by name key in the destination's catalog, or copied into it;
  categories by name, or to _Other_. Open trips are not moved: bought items already in a trip stay in the source household's trip. The list's members
  on both sides see it leave and arrive at their next sync.

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

Any member can change any field of an item, from its dialog (§16.7): name, quantity and unit, category, icon, note, price (phase 2), and which list it is on (in
the same household). "Remember for next time" (on by default) writes the category, icon and unit to the product (§8.2). **Delete** removes the item at
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

Items are grouped by category in the household's aisle order, and within a category by their **position**, a fractional key (Tusk's `position`, §10.4
of its design) that any member changes by dragging within the category (`DragHandleRow`, dnd-kit), keyboard too. Two devices moving one item to one
place keep the key, ties broken by id (Tusk §8.4). A list can also be shown **in the order added**, a view choice kept on the device.

### 9.7 All lists (phase 2)

`/all` shows every open item of every list in every household the person is in, grouped by household and then by category in that household's order,
each item tagged with its list. It is **fully editable** (ticking, editing, deleting), since it reads the same store; adding asks which list. It is a
view, not a list: it has no settings and cannot be shopped as one; shopping across several lists of one household is in shopping mode (§11.2).

## 10. Trips (phase 2)

**Everything in this section is phase 2.** In 0.1.0 a tick only sets the item's own bought fields (§9.5) and shopping mode keeps no trip (§11). Trips
arrive as an addition: a tick then also writes a trip line, and what 0.1.0 wrote is read as an item whose trip was deleted (§10.5).

### 10.1 Opening and finishing

A **trip** is one person's shopping in one household: who, when it started and finished, the shop (§10.3), its lines (§10.2), and its total (§10.4).

- **A person has at most one open trip per household.** The first item they tick in a household with none open opens one, on the device, with an id
  the device makes. Shopping mode opens one when it starts (§11).
- **Finish shopping** (shopping mode, or the trip's banner on a list) finishes it: the person's open trip in that household gets its finish time, the
  clearing rule runs on each list it bought from (§9.5), and the household's other members are told (§14.1).
- **A trip left open** finishes on its own six hours after its last tick, at the time of that tick, by the server's job or the next device to notice;
  nobody is told then. An empty trip that finishes is deleted.
- **Two people shopping together** each have their own trip. Shopping mode shows "Sam is shopping too" when another member's trip is open in the
  household (§11.1).

### 10.2 Trip lines

Ticking an item writes, in one mutation, the item's bought fields and a **trip line**: a copy of the item's product, name, quantity, unit, category
and price, the list's id and name, who ticked and when. **The line is the record;** the item can be cleared, renamed or deleted and the trip still
says what was bought. Unticking deletes the line. Editing the item's price or quantity while it is bought updates its line, and the line can be edited
from the trip (§10.5), which does not change the item.

- **Two people ticking the same item** (both offline): the first tick to reach the server stands, with its trip line; the second is folded into it and
  its line is not made (§12.4). The second person sees the item ticked by the first.
- **One ticks while another unticks:** the later to arrive stands, line and all.

### 10.3 Shops

A household's shops are rows of its own, with trips (phase 2): a name, nothing else. A trip's shop is chosen when shopping mode starts or at any time after, from
the household's shops by most used, or typed new (which makes one). Phase 3 gives a shop its own aisle order (§22.2).

### 10.4 Prices and totals

- **Money** is an integer of minor units of the household's currency (Ledger's currency table for decimals); a price is entered with `CurrencyInput`
  and formatted in the reader's locale.
- **An item's price is for its quantity:** 2 L of oat milk at 2.58. When it is bought, its product's **last unit price** becomes 1.29 per L
  (`src/quantity/unit-price.ts`, pure, integer arithmetic, rounded half up to the minor unit). The next time the product is added, its price is
  offered as the unit price times the quantity, in the same unit; in another unit, none is offered.
- **A trip's total** is the sum of its lines' prices, with a count of lines without one ("14 items · €62.40 · 2 without a price"). The person can type
  **the receipt's total** instead, which then is what the trip says, and the lines' sum is shown beside it.

### 10.5 The trips history

`/trips` lists a household's trips, newest first, by month: who, the shop, the date, the number of lines and the total, the person's own first if they
choose. A trip's page shows its lines by category, each editable (quantity, price, name, delete); its shop and receipt total; and per line **Add
again**, which puts the product back on a list. A trip can be deleted by its shopper or an Admin; that removes its lines and does not unmark items
still on a list (they become bought with no trip, and clear as usual). Trips are kept until deleted: they are the household's record, and phase 3's
insights read them.

## 11. Shopping mode

The screen for the shop, made for one hand, a moving body and no signal.

**0.1.0 has it in a light form:** what follows without the shop, the running total, the price in the long-press, "shopping too" and several lists, and
with a _Finish shopping_ that offers to clear what was bought (§11.3). Each is tagged where it appears. Shopping mode with trips is 7.6.

### 11.1 The screen

```
┌─────────────────────────────────────┐
│ ‹  Groceries          Lidl ▾    ⋯  │  ← back, the list(s), the shop, menu
│ 12 to get · 3 in basket · €8.70     │  ← progress and running total
│ Sam is shopping too                 │  ← only when another member's trip is open
├─────────────────────────────────────┤
│ PRODUCE                             │
│  ○ 🥬  Spinach            1 bag     │  ← large rows, the whole row ticks
│  ○ 🍌  Bananas            6 pcs     │
│ DAIRY & EGGS                        │
│  ○ 🥛  Oat milk           2 L       │
│ ...                                 │
├─────────────────────────────────────┤
│ IN BASKET (3)                     ⌄ │  ← ticked items drop here, undoable
├─────────────────────────────────────┤
│ [ + Add ]       [ Finish shopping ] │
└─────────────────────────────────────┘
```

In 0.1.0 the shop picker, the total and the "shopping too" line are absent, and the line under the title reads "12 to get · 3 in basket".

- **Large rows,** at least 56 px, the whole row ticking (`CheckableListRow`), in the aisle order. A ticked row drops into **In basket** with a short
  animation, and a toast offers _Undo_.
- **The screen stays on** (the Screen Wake Lock API, where the browser has it; where it does not, nothing is said).
- **Long-press a row** for its price and quantity, in a small sheet sized for a thumb, so a price is typed where it is picked up (0.1.0: a long press opens the item's dialog).
- **Add** is the same add field, for what is seen and wanted; it goes on the list being shopped and straight into the basket if chosen with "Already
  in basket".
- **The running total** (phase 2) is the trip's, from the lines with a price.
- **Freshness** is the fastest the operator allows (§12.6), whatever the person's setting, while the screen is open (0.1.0: every 10 seconds, or the operator's interval if that is shorter).

### 11.2 Starting, and several lists

**Shop** on a list opens shopping mode for it (in 0.1.0 that and nothing more; the rest of this paragraph is phase 2), opens the person's trip (§10.1), and asks for the shop (skippable; remembered as last used). From the
list's menu, **Shop several lists** (phase 2) picks lists of the same household to shop at once: their items merge into one aisle order, each tagged with its
list. The address keeps the choice (`/shop?h=<household>&l=<id>,<id>`), so the back button and a reload keep it.

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
Tally's counter per group, here per household.

### 12.1 The model

- **The device holds every household the account is in:** its members (names), lists, open and bought items, products, categories, and, from phase 2, shops and trips of
  the last 180 days with their lines, in IndexedDB through `idb`, one database per account (`shopper-<account id>`). Screens read from it, and
  suggestions, totals and aisle order are computed from it, so everything is readable and writable offline. Older trips are fetched online when the
  history is scrolled to them.
- **The device holds plain text,** as the screens need. It is deleted at sign-out (§12.10). Encryption at rest is the server's (§13).
- **A recorded action is written to the device at once** and, in the same IndexedDB transaction, to the outbox. The sync loop sends it.

### 12.2 Mutations

An action ("tick this item", "rename this product") is a pure function in `src/actions/` that turns intent into a **mutation**: one or more row
changes, with an id made by the device, and the household. The example is a tick as phase 2 makes it; **in 0.1.0 it is the first change alone**,
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
- **What syncs offline:** everything about lists, items, products, categories and the aisle order, shops, trips and trip lines. Everything else is
  online (§12.8).
- **The validators are one module,** run by the browser before it queues and by the server before it applies.

### 12.3 The endpoint

`POST /api/sync`, with the session cookie and `Origin` checked. A request carries the outbox in order, and a cursor per household; the answer carries
what was applied (with any fold, §12.4), what was refused and why, the account's current households, and the changes since each cursor.

- **Order is a counter per household** (`household.seq`), as Tally's per group. Applying a mutation is one short transaction: increment the
  household's `seq`, merge each change field by field, stamp each changed field and row with the `seq`, record the mutation id, write any notice. The
  increment serialises one household's writes without holding up any other.
- **Pull** returns, per household, rows whose `seq` is past the cursor, paged at `seq` boundaries, tombstones and aliases included. A household new to
  the device starts at zero, which is its snapshot. A household the account is no longer in is named as gone, and the device deletes its copy.
- **A device syncs** after a write (debounced, 300 ms), on load, when the tab regains focus, when it comes back online, when the live stream says so
  (§12.6), on its freshness interval while visible (0.1.0: there is no live stream, and the interval is the operator's
  `SHOPPER_SYNC_INTERVAL_SECONDS`), and through Background Sync where there is one. One tab syncs at a time (Web Locks); the others
  see the store change (BroadcastChannel).
- **Retrying is safe,** and a lost answer is only a retry. **A protocol version** travels with each request; a device too old is told to update, and
  keeps its outbox.

### 12.4 Conflicts

Resolved by rule, in the background, with nothing asked. Fields merge independently, so two people editing different things of one item both stand.

| What happened                                                        | What results                                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two members change different fields of an item, product or list      | Both changes stand                                                                                                                                                                          |
| Two members change the same field                                    | The one that reached the server later wins                                                                                                                                                  |
| Two members add the same product to one list (neither saw the other) | **Folded:** the later item becomes an alias of the earlier; one item, the larger quantity, both notes joined, the earlier adder named. A device's later changes to the alias go to the item |
| Two members tick the same item                                       | **The first tick stands,** with its trip line (phase 2); the second is folded into it and changes nothing                                                                                   |
| One ticks, another unticks                                           | The later to arrive stands, with or without its line                                                                                                                                        |
| One edits or ticks an item another deleted                           | The edit restores it: losing someone's work is worse than an item coming back. A tick restores it as bought                                                                                 |
| One edits a bought item another cleared                              | The edit stands on the item and its trip line; the item stays cleared                                                                                                                       |
| Both delete                                                          | Deleted                                                                                                                                                                                     |
| Two members move an item to one position                             | Both keep the key; ties break by id, so every device shows one order                                                                                                                        |
| An item is added to a list another member archived or deleted        | Archived: the list is restored. Deleted for good: refused, to Couldn't sync                                                                                                                 |
| Two members make a product with the same name                        | **Folded** by name key: the later becomes an alias of the earlier, and its items and lines point at the earlier                                                                             |
| A product is merged into another while a device adds an item for it  | The item points at the product it was merged into                                                                                                                                           |
| Two trips finish the same item's clearing (phase 2)                  | Cleared once                                                                                                                                                                                |

Folding (`src/sync/fold.ts`) is applied by the server in the mutation's transaction and recorded in `alias` (§20.3), which pull hands to devices so
they re-point what they hold. It is the only change the server makes that a device did not send.

### 12.5 What the server refuses, and what the person sees

The server re-checks everything, whatever the device said: the account is an active member of the household; every row a change points at is the
household's; the list is not deleted for good; the limits (§7.6); the sizes; a quantity is positive and well-formed; a unit is known; a category is
the household's. **A refused change is not thrown away:** it goes to **Couldn't sync** (Settings, and a quiet mark on the avatar) with the reason in a
sentence ("You're no longer in Home", "Groceries was deleted", "Groceries has 500 items, the most it can hold"), from where it can be moved to another
list or household, or discarded. A refused tick is undone with a toast that says why.

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

In **Settings > This device > Updates from others**: **Live** (the default where offered), **Every 10 seconds**, **Every 30 seconds**, **Every 2
minutes**, or **Only when I open Shopper**, with the choices below the operator's minimum not offered. It is kept on the device, not the account: a
laptop and a phone may want different things. **Shopping mode always uses the fastest choice offered** while it is open (§11.1).

- **Live** is a server-sent-event stream, `GET /api/live`, with the session cookie, held open while Shopper is visible. It carries only
  `{ "household": "<id>", "seq": <n> }` when a household the account is in moves on, and a heartbeat every 25 seconds; the device then pulls through
  `/api/sync` as usual. **No list data travels on the stream,** so it adds nothing to what access (§5.2) and encryption (§13) cover. It is closed when
  the tab is hidden and reopened when it is shown, with a pull. While live, the device still pulls every five minutes, in case a signal was missed.
- **The signal stays in the process.** The suite's portable SQL forbids `LISTEN/NOTIFY` (building-an-app §8), so the hub that tells streams a
  household moved (`src/sync/live.ts`) is in memory. That is right for one Shopper process, which is how an instance runs it. **With more than one
  process,** the operator sets `SHOPPER_SYNC_LIVE=false`, the README says so, and devices poll; the start-up check cannot tell, so it is a documented
  setting, not a guess.
- **Offline,** none of this matters: the device syncs when it comes back.

### 12.7 Undo

Ticking, unticking, deleting an item and clearing bought show a toast with _Undo_ for five seconds; undo is a new mutation that reverses the old, so
it works offline and syncs like any other.

### 12.8 What needs a network

Stated in the app and in the user's documentation:

- **Signing in, and the first load on a device.**
- **Making a household, inviting, accepting, roles, removing, leaving, deleting a household, and moving a list between households** (`/api/ops`, which
  answers at once and is undone with a toast on a refusal, as Tally's groups are).
- **Settings, notices, export and import, and trips older than 180 days.** Each says so offline, and changes nothing.
- **On iPhone, sync happens only while Shopper is open.** Safari has no Background Sync; live updates stop when the app is in the background.
- **A browser can evict storage.** Persistent storage is requested (`navigator.storage.persist()`); unsent changes could still be lost if it evicts.
  Settings says whether it was granted.
- **A shared computer** holds a signed-in person's households until they sign out.

### 12.9 Keeping the history small (phase 2)

0.1.0 keeps everything, which a household's first months do not make large (6.6).

Deleted and cleared items are hard-deleted after 30 days; deleted products, categories, shops and lists after 30 days; trips and their lines are kept
until deleted (§10.5). A removed row leaves a tombstone of id and `seq` so that devices learn of it. Tombstones, aliases and applied-mutation records
go after 90 days; a device whose cursor is older gets a fresh snapshot of that household, sending its outbox first.

### 12.10 First load, sign-out and an ended session

As Tusk's §8.5 and Tally's §11.7: the first load pulls each household's snapshot in pages, the last-used household first and its lists before its
trips; later loads paint from the device with no spinner, on any network; signing out deletes the device's database after trying to send the outbox,
and warns if it cannot; a session that ended elsewhere (a password reset, core's logout) is found at the next sync, which shows sign-in and no data,
and keeps the outbox for the same account.

## 13. Encryption at rest

### 13.1 What is sealed

**Server-side envelope encryption at rest** (the owner's decision, §26), under `SHOPPER_ENCRYPTION_KEY`: Tusk's envelope (a random data key per row,
wrapped under the instance key, bound to the row's id and purpose), copied, with Roam's sealed rows. Everything that says **what a household buys,
where, for how much, or who they are** is sealed; only what the database must sort, join, count or merge stays readable:

| Sealed                                                                                                                                                                                                                                                                        | Readable                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Household: name; list: name; item: name, note, price; product: name, note, barcode, last unit price; category: name (a starter category is its key until renamed); shop: name; trip: receipt total; trip line: name, list name, price; person: name, email; invitation: email | Ids, `household_id`, `list_id`, `product_id`, `category_id`, `trip_id`, quantities and units, icons, positions, times, roles, counts, `seq`, the field stamps, name keys, the currency code |

- **0.1.0 has no prices, shops, trips, barcodes or invitation emails,** so those fields and tables arrive, sealed, with the phase that adds them (the
  registry test lists only what exists); a household's name is sealed but empty until it can be named (3.8).
- **A sealed row has one `sealed` column** holding its sensitive fields as one envelope, as Roam's: one data key per row, one place to read them. Code
  reads and writes rows only through `src/crypto/sealed.ts`, which a test holds to this table.
- **Field-level merging works on the unsealed row:** the server unseals, merges the changed fields (§12.4), and seals again, in the mutation's
  transaction. Field stamps (`fseq`) are readable, so which field is newer is known without unsealing.
- **Search, suggestions, totals and aisle order** work on unsealed rows in memory, on the device, and on the server only for a household's own rows
  (notices, folding, import). No sealed field is ever in a `WHERE`, `ORDER BY` or index.
- **Quantities, units and times stay readable**: they are merged and ordered, and alone, without a name, say little (§26).
- **Rotation:** a new key with the old as `SHOPPER_ENCRYPTION_KEY_PREVIOUS`; a job re-wraps every data key and recomputes the name keys (§13.2), then
  the old key can go.
- **What it protects against:** a copied database, a backup, a disk, an operator reading tables. **What it does not:** someone in control of the
  running server, which holds the key and reads everything to do its work; or the device, which holds plain text until sign-out. The README says so,
  plainly.

### 13.2 The name key

A product's **name key** (§8.7) is `HMAC-SHA-256(K_name, household_id ‖ normalised name)`, with `K_name` derived from `SHOPPER_ENCRYPTION_KEY` by HKDF
with its own label. It lets the server fold duplicates and enforce one product per name without reading names. It reveals, to someone with the
database and not the key, only that two products of one household have the same name, which the unique index already implies. On rotation, the job
recomputes every name key under the new key.

### 13.3 Sharing and encryption

The server unseals for whoever may read a row (§5.2), so joining a household needs no key exchange, and a member leaving or an account being deleted
changes no other row. **End-to-end encryption is not in any phase** (§26): folding, merging and notices need the server to read.

## 14. Notices (phase 2)

**Everything in this section is phase 2.** 0.1.0 has no notices, no bell and no mail but sign-in's: the person who shares sees the new person appear in
the list of people, and everyone sees changes when their device syncs.

### 14.1 Kinds

Something a person is told: a row per person told, written in the change's transaction (or by the digest job), **never for what a person did
themselves.**

| Kind                | Who is told                                                                                            | Default |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------- |
| `invited`           | An account here that an invitation names, by verified email or `sub` (§7.3)                            | On      |
| `member_joined`     | The household's members, when someone accepts                                                          | On      |
| `removed`           | The person removed                                                                                     | On      |
| `household_deleted` | Every member but the Admin who deleted it                                                              | On      |
| `admin_passed`      | A member who became Admin because the last Admin's account was deleted (§19)                           | On      |
| `trip_finished`     | The household's other members: "Thulana finished shopping at Lidl · 14 items"                          | On      |
| `items_added`       | The household's other members: "Sam added 3 items to Groceries", one per list and adder per 30 minutes | **Off** |

- **`items_added` is a digest:** each item added writes a count into `notice_digest`, keyed by recipient, list, adder and window; the digest job turns
  a window into one notice once it has been quiet for 30 minutes or is 30 minutes old. An item added and removed in the window is not counted.
- **The bell,** left of the avatar, as Tally's: the unread count up to "99+", `NotificationsPanel` with the latest, each opening where it points;
  **`/notifications`** the whole list, by day. Read per notice, and "Mark all read". Kept 90 days, at most 500 a person. A notice for a household the
  person has left is not shown. The unread count shows offline as last synced.

### 14.2 Preferences

Per kind and per channel, in **Settings > Notifications** (`notice_pref`). Shopper's bell is the channel for every kind that is on; the defaults are
the table's.

### 14.3 Delivery

| Channel            | Alone                             | Hosted, person signed in through core                    | Default on for                                                       |
| ------------------ | --------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| **Shopper's bell** | Always                            | Always                                                   | Every kind that is on                                                |
| **Email**          | Shopper's mail (`SHOPPER_SMTP_*`) | Core's email (`email:send`), or Shopper's if not granted | Invitations (always by email when an address is given) and `invited` |
| **Core's bell**    | —                                 | `notifications:send`, a link back to the notice's place  | Every kind that is on                                                |
| **Push** (phase 3) | Web Push (§22.2)                  | Web Push                                                 | Designed now: a channel in the same table                            |

- **Mail is sent in the background** through `mail_outbox`: a row written in the change's transaction, claimed by the mail job, retried with backoff,
  never logged with its address or content. Invitations go the same way.
- **With no channel beyond the bell** (no mail set up, no core), Settings says so; nothing fails for it.
- Each send to core carries a `key`, so a repeat within a day is one send; `NotSupportedError`, a refusal or no core sends nothing and changes nothing
  else.

## 15. Sign-in and core

### 15.1 Sign-in

**As Tally's §14.1, with `SHOPPER_`:** better-auth in a store of its own; local accounts (a password; **passkeys and an authenticator app with backup codes are phase 2**, 2.8) when
`SHOPPER_AUTH_LOCAL=1`; a Sovereign core through `genericOAuth` with PKCE when `SHOPPER_CORE_*` are set; either or both, from one image, and **both
may be on when hosted**, so people not on the instance can join a household. Email is verified and passwords reset only with mail set up.

- **Making an account makes its person and its own household** (§6.1, §7.4), or, through an invitation, also joins that household.
- **No implicit linking**, as Tusk's: a core login whose email is a local account's is refused until the person links the two from a signed-in
  session, and only when the addresses match. Unlinking can never remove an account's last way in. In 0.1.0 such a login is refused with a sentence that says to sign in with the
  password; linking is 2.9.
- Name and email from core are copied when the account is made and not overwritten after; the person changes their own in Settings.

### 15.2 Core's notices

Back-channel logout at `/api/sovereign/backchannel-logout` ends every session of the person; account deleted at `/api/sovereign/account-deleted` runs
`People.deletePerson` (§19) and answers `200` only once done. Both checked by the SDK (`verifyLogoutToken`, `verifyAccountDeletedToken`), a replayed
`jti` refused after a restart (`notice_seen`), a bounded form, one rate limit, 404 where core is not set. Copied from Tusk.

### 15.3 The manifest

```json
{
  "manifest": 2,
  "prefix": "shopper",
  "name": "Shopper",
  "description": "Your household's shopping lists, working in the shop with no signal, and remembering what you buy",
  "icon": "/icons/icon.svg",
  "port": 3007,
  "health": "/api/health",
  "launch": "/",
  "signIn": {
    "redirect": ["/api/auth/callback/sovereign"],
    "backChannel": "/api/sovereign/backchannel-logout",
    "accountDeleted": "/api/sovereign/account-deleted",
    "scopes": ["openid", "profile", "email", "offline_access", "directory"]
  },
  "database": true,
  "generate": ["SHOPPER_AUTH_SECRET", { "name": "SHOPPER_ENCRYPTION_KEY", "bytes": 32 }],
  "core": ">=0.57.0 <1.0.0"
}
```

- **`directory` and `offline_access`** (phase 2: **0.1.0 asks for `openid`, `profile` and `email` only**, and the manifest above is what phase 2 ships)
  are for finding people to invite in core's directory, which the SDK does as the person (`sv.as({ sub })`) with
  their refresh token. That token is a credential, kept only through envelope encryption (`credential`, §20.3). If a core refuses the scopes, or the
  person did not grant them, inviting works exactly as alone. How better-auth's `genericOAuth` hands the refresh token to the SDK's `tokenStore` is
  the same question Tally's task 11.2 answers; whichever app answers it first, the other copies (§24).
- **The `core` floor** is raised, if needed, to the first release that shipped the directory scope and the app scopes Shopper calls, checked against
  core's changelog in that task.
- **`pooling`** is not set, as Tusk's and Tally's.
- **`data`** is not needed until phase 4's photos and receipts (§22.3), which add `/data/media`.

### 15.4 Core's services

| What                            | Hosted                                                             | Alone                        |
| ------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| Sign-in                         | Core, and local accounts if `SHOPPER_AUTH_LOCAL=1`                 | Local accounts               |
| Finding people to invite        | An email address, and core's directory by name (§7.3)              | An email address             |
| Notices                         | Shopper's bell, and core's bell (`notifications:send`)             | Shopper's bell               |
| Email                           | Core's (`email:send`) for linked accounts; Shopper's for addresses | Shopper's (`SHOPPER_SMTP_*`) |
| Export, import, account deleted | A line on the person's activity page (`activity:write`)            | Nothing                      |

In phase 2 the operator grants the three app scopes when hosting; 0.1.0 needs none, and uses only the first row of this table, sign-in. **An instance without SMTP for Shopper** can still invite by link; the invitation dialog says
email to new people is not set up.

## 16. Interface

Designed anew; the plugin's layout is not carried over, though its lessons are (§16.12).

### 16.1 Principles

`@sovereignfs/ui` throughout, imported directly; `--sv-*` tokens only; Hanken Grotesk served by the app. **Screens paint from the device** (§12.1), so
after the first load nothing shows a spinner to see what was already seen; a screen that needs the server (notices, settings, old trips) shows a
skeleton. Every surface has an empty state that says what to do next. An item not yet synced shows a small clock mark and nothing more. **The list is
home;** everything else is one step away. Prices are tabular figures with the household's currency. Bought is shown by a tick, strikethrough and a
muted row, never by colour alone.

### 16.2 The shell

Two rows, as Tusk's and Tally's: the header, and the sidebar beside the content. **In 0.1.0** the sidebar holds _Add item_ and, for each household the
person is in (their own, "My lists", first), its lists with open counts and _New list_; All lists, Trips, Catalog, the household dots and gears, _New
household_ and the bell join in phase 2.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ☰  shopper.                                                  (bell) (avatar) │
├────────────────────────┬──────────────────────────────────────────────────────┤
│ [ + Add item ]         │                                                      │
│ ≡ All lists            │                                                      │
│ ⌘ Trips                │                      content                         │
│ ⊞ Catalog              │                                                      │
│                        │                                                      │
│ ○ MY LISTS         ⚙   │                                                      │
│    Hardware store  4   │                                                      │
│ ● HOME             ⚙   │                                                      │
│    Groceries      12   │                                                      │
│    Pharmacy        2   │                                                      │
│    + New list          │                                                      │
│ + New household        │                                                      │
│                    ⇤   │                                                      │
└────────────────────────┴──────────────────────────────────────────────────────┘
```

- **Header:** the sidebar's toggle and the wordmark on the left; the bell and the avatar on the right. The avatar opens `UserMenu`: name and email,
  Settings, Notifications, Sign out, and a way back to core when one is set. Couldn't sync, when anything is there, shows as a mark on the avatar and
  an entry in its menu.
- **Sidebar:** _Add item_ first (to the current list, or asking which); All lists, Trips, Catalog (for the household in view); then each **household**
  with its dot, its settings gear, and its lists with their open counts, then _New list_; the person's own household first; _New household_. Archived
  lists are behind each household's menu. Full or a rail of icons, remembered on the device.

### 16.3 Screens and addresses

| Address                               | What                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                   | The landing page for a visitor; for someone signed in, the last list they used (§16.4)                                                          |
| `/l/<id>`                             | A list (§16.5); `?view=added` for the order added                                                                                               |
| `/l/<id>/settings`                    | The list's name, archive, delete (0.1.0); its clearing rule and move to another household (phase 2)                                             |
| `/shop?h=<id>&l=<id>,…`               | Shopping mode (§11); one list in 0.1.0                                                                                                          |
| `/all`                                | All lists (§9.7), phase 2                                                                                                                       |
| `/h/<id>/trips`, `/h/<id>/trips/<id>` | A household's trips; one trip (§10.5), phase 2                                                                                                  |
| `/h/<id>/catalog`                     | A household's catalog and categories (§16.8), phase 2                                                                                           |
| `/h/<id>/settings`                    | The household: name, colour, currency, members and roles, invitations, shops, leave, delete (§7), phase 2; 0.1.0 has the sharing dialog (§16.9) |
| `/households`                         | Every household, with its lists (the phone's way in; on a wide screen, the sidebar has them too), phase 2                                       |
| `/notifications`                      | Every notice (§14.1), phase 2                                                                                                                   |
| `/settings`                           | Settings (§17)                                                                                                                                  |
| `/invite/<token>`                     | An invitation (§7.3), for anyone                                                                                                                |
| `/sign-in`, `/sign-up`                | As Tusk's                                                                                                                                       |

An item's dialog opens over its list (`?item=<id>`), so that a link and the back button behave. The sharing dialog opens the same way, at `?share=1`.

### 16.4 Landing

Signed in, `/` opens **the last list the person used**, kept on the device and in `account_settings` (so a new device starts there too), or their own
household's first list. A brand-new account lands on its _Groceries_, empty, with the add field focused and one line: "Add what you need. To
shop with others, press Share." A person who arrived by an invitation lands on that household's first list.

### 16.5 A list

- **Header:** the list's name and its household's dot; **Shop** (primary); the menu: Shop several lists, Clear bought, view by aisle or order added,
  list settings. A banner when the person has an open trip in this household (§11.3).
- **The add field** at the top, always (§16.6).
- **Open items** grouped by category in aisle order, each row `CheckableListRow`: icon, name, quantity and unit, a note's first line muted, the price
  if set, and who added it when that is not the reader (on a shared household). The whole row ticks; a pencil, or a long press on a phone, opens the
  item. Dragging reorders within a category.
- **Bought (n)**, collapsed under the open items, each with who ticked it; _Clear bought_ beside it.
- **Empty:** "Nothing on Groceries. Add something above, or pick from Often bought," with the often-bought products as chips.

**In 0.1.0** the header has **Share** beside **Shop** and no household dot; the menu has no "Shop several lists"; there is no trip banner and no price on a row.

### 16.6 Adding

The field at the top of a list (and in shopping mode), built on `SuggestionInput`:

- **Typing suggests** (§8.5), each suggestion with its icon, name, default quantity and unit, and "On the list · 2" where it applies. Enter takes the
  first; arrows move; one tap or click adds.
- **A quantity can be typed with the name (phase 2, 4.5):** "2 oat milk", "oat milk 2l", "500 g flour" (`src/catalog/parse.ts`, pure, English number words and the
  unit list). What it understood shows in the suggestion before it is added.
- **Adding keeps the field focused and empty,** so a list is typed as fast as a person thinks.
- **With nothing typed,** "Often bought" chips (§8.5).

### 16.7 An item

A `Dialog` (full-screen on a phone, as the design system adapts it), as the plugin learned (§16.12): name; quantity with `QuantityStepper` and the
unit `Select`; category; icon (`IconPicker`); note; price (phase 2; `CurrencyInput`, with the unit price under it once there is a quantity); list (to move it
within the household); "Remember for next time" (§9.4). **Save**, and **Delete** as a quiet text action. Who added it and when, and if bought, who and
in which trip, at the foot.

### 16.8 The catalog (phase 2)

`/h/<id>/catalog` has two tabs:

- **Products:** every product, searchable, grouped by category, each with icon, name, default unit, last unit price and times bought. Open one to
  rename it, change category, icon, unit, note or barcode, **merge** it into another (§8.2), or delete it.
- **Categories:** the aisle order as a draggable list (`DragHandleRow`), each with rename, icon, hide; _Add category_ at the end.

### 16.9 Sharing, and household settings

**In 0.1.0 a household has no settings page; sharing is a dialog** (`?share=1`), opened by **Share** on a list and from the household's section in the
sidebar. It says first, "People you share with see and edit every list here", then lists the people (name and avatar, the Admin marked; an Admin also
sees emails, §6.1); **Invite** makes a link, shown once with _Copy_ and a note that anyone holding it can join and that it expires in 14 days; live
invitations are listed with _Revoke_; a Member has _Leave_ and the Admin _Remove_.

**The page, from phase 2** (8.9): name, colour, currency (Admins); **People:** each member with role, an Admin's menu to change it or remove, and **Invite** (§7.3) with live
invitations listed (copy link, resend, revoke); **Shops:** rename, delete; **Leave**; **Delete household** (Admins), behind a confirmation that names
what goes. The person's own household shows no Leave or Delete.

### 16.10 Design system

**0.1.0 needs nothing built upstream first:** it uses the components and the icon set that exist. What follows is for phase 2 and later.

Available and used: layouts, `Header`, `UserMenu`, `NotificationsPanel`, `Dialog`, `ConfirmDialog`, `Sheet`, `Drawer`, `Tabs`, `SegmentedControl`,
`SuggestionInput`, `QuantityStepper`, `CheckableListRow`, `IconPicker`, `DragHandleRow`, `CurrencyInput`, `Select`, `Combobox`, `Avatar`, `Badge`,
`StatusBadge`, `EmptyState`, `Toast`, `Menu`, `CopyButton`, `Collapsible`, `NavList`, `MobileFooter`, `MobileHeader`, `MobileAppsDrawer`, `Auth`. The
four the plugin added (`SuggestionInput`, `QuantityStepper`, `CheckableListRow`, `IconPicker`) are already in `@sovereignfs/ui`; each is checked
against what this design asks of it in the task that first uses it, and a gap goes to `sovereign` (epic 16).

**Missing, and built in `@sovereignfs/ui` in `sovereign` first, released, then used** (epic 16):

- **Grocery icons** (phase 2): about 80, enough for the starter catalog's categories and common products (task 16.4).
- **`AvatarStack`** (who is in a household; phase 2) and **a floating action button** (the phone's Add), the same parts Tally and Roam wait on: whichever app
  asks first has them built for all.
- **`MoneyInput`** (phase 2; a `CurrencyInput` bound to a currency's decimals), as Tally's 14.4, if it is published by then; otherwise `CurrencyInput` with the
  household's decimals.
- **Charts** for phase 3's insights, the same Tally's 14.1 builds.

### 16.11 Phone and PWA

**One responsive tree:** the same routes and decisions at every width, only rendering forked (the guide's rule).

- **`MobileFooter`:** Lists (the households and their lists) and All lists left of the launcher, Trips and Catalog right. **Add** is a floating button
  above it on a list, opening the add field (phase 2; in 0.1.0 the footer has Lists left of the launcher and Settings right, and the add field sits at
  the top of a list). Notifications and Settings are in the avatar menu; the bell stays in the header.
- A list is full-width with a back link to Lists; shopping mode hides the footer.
- **Installable as a PWA,** as Tusk's §17.9: the service worker keeps the shell by allow-list and the one shell page, which holds nothing of a person;
  with no network, a signed-in address (a list, shopping mode, all lists, the catalog, recent trips) is answered with the kept shell, which reads the
  device's store. **No data is ever in a cache;** it lives in IndexedDB, named per account and deleted at sign-out. Every other address offline gets a
  page saying it needs a connection. The worker also runs Background Sync (§12.3).

### 16.12 What the plugin paid to learn

- **An item's editor is a `Dialog`, not a `Sheet`:** `Sheet` has no desktop form; `Dialog` adapts to a full-screen overlay on a phone.
- **Ticking and editing are separate targets:** the row ticks; a pencil opens the item. Sharing one target made both unreliable.
- **Reordering is drag-and-drop within a category,** not up and down buttons, which proved unreliable.
- **A list name typed in a quick-add field is kept on blur,** not only on Enter.
- **A mutation that matches no row because of its permission must read as not found,** never as a silent success: the plugin's rename and archive did,
  and the hardening pass found it. Here the permission is in every statement (§5.2) and a test calls each as a second person.

## 17. Settings

`/settings`, also from the avatar menu. **0.1.0 has** Profile, This device (when it last synced, persistent storage, Couldn't sync, Reset this
device; not the freshness choice), Sign-in (change the password) and Data (delete the account); the freshness choice, Notifications, passkeys, two-factor,
linking core, export and import are phase 2.

- **Profile:** name (the person's name everywhere, §6.1) and email.
- **This device:** **Updates from others** (§12.6); when it last synced; whether persistent storage was granted; **Couldn't sync** (§12.5); "Reset
  this device" (sends the outbox, then reloads every household).
- **Notifications:** each kind (§14.1) by channel, with what is not available said plainly.
- **Sign-in:** the account sections Tusk has: password, passkeys, two-factor, linking core.
- **Data:** export, import, import from the old Shopper plugin (§18), delete account (§19).

## 18. Export and import (phase 2)

**Everything in this section is phase 2.** 0.1.0 can delete an account (§19) but cannot export; the README says so.

### 18.1 Export

One JSON file of what is the person's to take: their profile and settings, and **every household they are in, whole** (its name, currency, categories
with the aisle order, shops, members by name only, catalog, lists with items, trips with lines), since a household's record is what they share. Other
people's emails are never in it. A `format` (`"shopper"`) and `version` at the top; ids kept; sealed fields in plain text, since the file is the
person's. Downloaded from Settings > Data, and noted on core's activity page when hosted. The file is plain text, and Settings says so before
downloading.

### 18.2 Import

Import makes **new households** from a file, with the importer as Admin; every other member named in it becomes an **imported person** (a name with no
account, shown "Sam (imported)") so that trips still say who bought what, and nobody else is joined without asking. A household in the file that was
the exporter's own is merged into the importer's own household: its lists added, its products folded by name key, its categories matched by name, its
trips added. Validated whole before anything is written, written in one transaction per household with new ids mapped consistently, within the limits
(§7.6). A file from a newer version is refused with a sentence that says so. **A round trip is a test:** export, import into a second account, export
again; the households match but for ids, times and the members' kind.

### 18.3 From the plugin

The legacy plugin's export section (`fs.sovereign.shopper`, export schema version 1, inside the platform's export file, or as the section on its own)
is read by `src/portability/plugin.ts` and imported into the person's **own household**:

| Plugin                                                  | Here                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shopper_lists` (archived too)                          | Lists, archived ones archived                                                                                                                                                                                                                                           |
| `shopper_products`                                      | Products, folded by name key; category by name to the household's, or a new category; icon key mapped where the plugin's icon exists in the set, else the category's; `typical_price` as the last unit price, per its unit                                              |
| `shopper_list_items`, open                              | Open items                                                                                                                                                                                                                                                              |
| `shopper_list_items`, checked                           | Not imported as items: their purchases are the record                                                                                                                                                                                                                   |
| `shopper_purchases`                                     | **Trips:** one per buyer per local day, finished at the last purchase that day, no shop; each purchase a line. A buyer who is not the importer becomes an imported person "Someone (imported)"; a price in another currency than the household's is dropped and counted |
| `shopper_list_shares`, `shopper_user_state`, households | Not imported: shares name accounts of the old platform; the importer invites people to a household instead                                                                                                                                                              |

The import ends with a summary: lists, items, products and trips made; prices dropped for another currency; what was skipped and why. A test runs it
over a file the plugin's own export code produces.

## 19. Account deletion and signing out

**`People.deletePerson`** (`src/sovereign/people.ts`, as Tusk's and Tally's) removes everything personal of an account and keeps only the name on the
shared record. One routine, safe to run again; the `sub` link goes last.

- **Their person stays, as a name only:** `account_id`, email and `core_sub` cleared, marked deleted. Everywhere they appear in a shared household
  (items they added, ticks, trips), they are shown as "Kasun (left Shopper)".
- **Their memberships end.** **A household where they were the only Admin** passes to its longest-standing member, who is told (`admin_passed`, phase 2);
  **that includes their own household when it was shared,** which is then shown as "Shared lists" (§7.4); **a household with no other member left,**
  their own when it was never shared, is deleted, with everything of it. Their open trips are finished (phase 2).
- **Removed** (the rows that exist, phase by phase): notices for them, digests for and about them, their notice preferences, invitations they made (revoked) and to them, their device
  subscriptions (phase 3), their stored core token, their settings, rate counters, mail queued to them, and better-auth's rows: passkeys, two-factor,
  sessions, sign-ins, and the account.

A test seeds one row of every table, for the person and for a second person sharing a household with them, and finds nothing personal of the first
after (the name aside), the second's household intact. A new table that holds something of a person fails it until it is decided.

It is reached from **Settings > Data**, after the password or, for a Sovereign-only account, a fresh session, saying what goes and what stays; and
from **core's account-deleted notice** (§15.2), answered `200` only once done. The device's database is deleted; other devices find out at their next
sync.

## 20. Data model and database

### 20.1 Database

**As Tusk's §23.1, with `SHOPPER_`:** `SHOPPER_DB_DIALECT` is `sqld` (default; namespaces `shopper` and `shopper_auth`), `sqlite`
(`file:/data/shopper.db`, `shopper_auth.db` beside it) or `postgres` (schemas `shopper` and `shopper_auth`). Drizzle, a schema and a migration set per
dialect, generated and never written by hand, applied at start-up under a lock; a parity test across dialects. Standard SQL, values bound; no
`LISTEN/NOTIFY`, trigger, extension or foreign key; **every deletion names what it deletes, in a transaction**, by `household_id` where it is a
household's. Tests run on all three and read `SHOPPER_TEST_*` only.

### 20.2 Representations

As Tusk's column vocabulary: ids are UUIDs, **made by the device for synced rows** (checked as UUIDs by the server, and refused if the id already
belongs to another household's row) and by the server otherwise; times `epochMs`; booleans the vocabulary's word. **Quantities are canonical decimal
strings** (§9.3). **Money is a 64-bit integer of minor units** (`bigint` on PostgreSQL, read as a `number` and checked to be a safe integer), inside
the sealed envelope where the table seals it. A currency is a three-letter code. `sealed` is the envelope (§13.1); `fseq` is a JSON object of field to
`seq`, the stamp of each field's last change (§12.4).

### 20.3 Tables

Beyond better-auth's, in the auth store.

**0.1.0 has** `person`, `household`, `member`, `invitation`, `category`, `product`, `list`, `item`, `alias`, `account_settings`, `applied_mutation`,
`tombstone`, `notice_seen`, `job_claim` and `rate_bucket`, without these columns, which arrive with the phase that needs them: `household` has no
`color` or `currency`, and its sealed name is empty; `invitation` has no email; `product` has no barcode, last unit price or `price_unit`; `item` has
no price or `trip_id`; a list's `clearing` is `manual`. **Phase 2 adds** `shop`, `trip`, `trip_line`, `notice`, `notice_digest`, `notice_pref`,
`mail_outbox` and `credential`, and those columns, by new migrations.

| Table                      | Columns                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `person`                   | `id`, `account_id` (unique, may be null), `core_sub` (unique, may be null), `kind` (`account`, `imported`), `sealed` (name, email), `deleted_at`, `created_at`, `updated_at`                                                                                                          |
| `household`                | `id`, `own_of` (an account's own household: its `account_id`, unique; else null), `sealed` (name), `color`, `currency`, `seq`, `created_by`, `created_at`, `updated_at`                                                                                                               |
| `member`                   | `id`, `household_id`, `person_id`, `role` (`admin`, `member`), `joined_at`, `left_at`, `seq`                                                                                                                                                                                          |
| `invitation`               | `id`, `household_id`, `token_hash` (unique), `sealed` (email), `core_sub`, `created_by`, `expires_at`, `sent_at`, `accepted_by`, `accepted_at`, `revoked_at`                                                                                                                          |
| `category`                 | `id`, `household_id`, `starter_key`, `sealed` (name, when renamed or added), `icon`, `position`, `hidden`, `deleted_at`, `seq`, `fseq`                                                                                                                                                |
| `product`                  | `id`, `household_id`, `name_key` (unique with `household_id`), `sealed` (name, note, barcode, last unit price), `category_id`, `icon`, `default_quantity`, `default_unit`, `price_unit`, `times_bought`, `last_bought_at`, `last_added_at`, `deleted_at`, `seq`, `fseq`, `created_at` |
| `list`                     | `id`, `household_id`, `sealed` (name), `position`, `clearing` (`on_finish`, `manual`, `after_day`), `archived_at`, `deleted_at`, `seq`, `fseq`, `created_at`                                                                                                                          |
| `item`                     | `id`, `household_id`, `list_id`, `product_id`, `sealed` (name, note, price), `quantity`, `unit`, `category_id`, `icon`, `position`, `added_by`, `added_at`, `bought_at`, `bought_by`, `trip_id`, `cleared_at`, `deleted_at`, `seq`, `fseq`                                            |
| `shop`                     | `id`, `household_id`, `sealed` (name), `last_used_at`, `deleted_at`, `seq`, `fseq`                                                                                                                                                                                                    |
| `trip`                     | `id`, `household_id`, `person_id`, `shop_id`, `sealed` (receipt total), `started_at`, `finished_at`, `last_tick_at`, `deleted_at`, `seq`, `fseq`                                                                                                                                      |
| `trip_line`                | `id`, `household_id`, `trip_id`, `item_id`, `product_id`, `list_id`, `sealed` (name, list name, price), `quantity`, `unit`, `category_id`, `bought_by`, `bought_at`, `deleted_at`, `seq`, `fseq`                                                                                      |
| `alias`                    | `household_id`, `table`, `from_id` (the key with `table`), `to_id`, `seq`, `created_at` (§12.4)                                                                                                                                                                                       |
| `notice`                   | `id`, `account_id`, `kind`, `actor_person_id`, `household_id`, `subject_id`, `details` (JSON, sealed where it names something), `read_at`, `created_at`                                                                                                                               |
| `notice_digest`            | `account_id`, `list_id`, `actor_person_id`, `window_start` (the key), `household_id`, `count`, `updated_at`                                                                                                                                                                           |
| `notice_pref`              | `account_id`, `kind`, `channel` (the key), `on`                                                                                                                                                                                                                                       |
| `account_settings`         | `account_id` (the key), `last_list_id`, `inbox_seen_at`, `created_at`, `updated_at`                                                                                                                                                                                                   |
| `mail_outbox`              | `id`, `account_id` or `sealed` (address), `template`, `data` (sealed JSON), `attempts`, `next_attempt_at`, `sent_at`, `failure_kind`, `created_at`                                                                                                                                    |
| `applied_mutation`         | `account_id`, `id`, `household_id`, when (§12.9)                                                                                                                                                                                                                                      |
| `tombstone`                | `table`, `id`, `household_id`, `seq`, when (§12.9)                                                                                                                                                                                                                                    |
| `credential`               | As Tusk's: core refresh tokens under envelope encryption (§15.3)                                                                                                                                                                                                                      |
| `notice_seen`              | A core notice's `jti` and when (§15.2)                                                                                                                                                                                                                                                |
| `job_claim`, `rate_bucket` | As Tusk's                                                                                                                                                                                                                                                                             |

Indexes follow the queries: members by person (an account's households) and by household; every synced table by `(household_id, seq)` for pull; items
by list; trip lines by trip and by `(household_id, bought_at)` for suggestions; trips by `(household_id, started_at)` and open trips by person;
invitations by household; notices by account and time; the mail outbox by `next_attempt_at`; digests by `updated_at`.

**The device's store** holds, per household, the household, its members' names, categories, products, shops, lists, items not cleared, trips of the
last 180 days and their lines, and aliases; and per account the cursors, the outbox, Couldn't sync, the freshness choice, the last list, the
last-synced unread count, and view choices. Nothing else.

## 21. Security, deployment, testing

### Security

As Tusk's §24: a strict CSP with a per-request nonce, `connect-src 'self'`, no `'unsafe-inline'`; nothing third-party loads; what people write is
rendered as text, never as HTML. **Logs hold no item, product, list, household, shop or person names, notes, prices or addresses:** an id and a kind
of failure. Every route, operation and mutation finds the session and carries the permission in its statement (§5.2); a route that changes something
checks `Origin`; `/api/live` checks the session on connect and closes when it ends. An invitation token is random, stored hashed, compared in constant
time, and its page reveals the household's name and the inviter's only. **Rate limits:** invitations and resends, sign-up, sync requests, live
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
  who are not on the instance, and `SHOPPER_AUTH_LOCAL=1` to let them make an account.
- **A proxy in front** (from phase 2) must not buffer `/api/live` (Caddy, which the instance uses, does not for `text/event-stream`); the README says so for anyone
  running another.
- **Releases** as Tusk's: `scripts/release.sh`, a `vX.Y.Z` tag publishes amd64 and arm64 to `ghcr.io`; a patch has no migration.
- `/api/health` answers `200` once the database is ready.

### Testing

- **Vitest, pure:** normalising names, the name key, parsing "2 oat milk", suggestion ranking with hand-worked fixtures, category guessing, quantities
  and unit prices, trip totals, the aisle order, field merging, folding, describing notices.
- **Properties:** random interleavings of adds, edits, ticks, unticks, deletes, moves, merges and clears from several devices, after which every
  device that has synced holds the same rows; no item is open and bought at once; every bought item with a trip has exactly one trip line; no product
  name is in a household twice; and the same mutations give the same result in any order of arrival allowed by the counter.
- **Sync:** two devices folding the same product and the same item; two ticks of one item; a tick against a delete; an edit against a clear; a
  mutation sent twice; a lost answer; a refusal for a removed member and for a deleted list (landing in Couldn't sync); a stale cursor; a household
  left between syncs; the live stream telling a second device, and a device falling back to its interval when the stream drops.
- **Sealing:** every table's sealed fields are not readable in the database file; rotation re-wraps every row and recomputes every name key; a test
  holds `sealed.ts` to §13.1's table.
- **Access:** every route, operation, mutation and the live stream called as a second person, expecting not found (§5.2).
- **The data layer** on sqld, a `file:` database and PostgreSQL; **jobs** run twice and from two processes, acting once.
- **Sign-in** against the fake Sovereign, **notices** against `createFakeCore` from `@sovereignfs/sdk/testing`, **mail** against a fake SMTP server.
- **Import** of a Shopper file round trip, and of a plugin file produced by the plugin's own export code.
- **Playwright** in Chromium and WebKit, at desktop and phone widths: sign up, add with suggestions, make a household, invite, accept, shop with the
  network off (`context.setOffline`) while a second browser adds and ticks, finish, and both browsers end with the same list and trip. **0.1.0's version:** sign up, add with suggestions, share by a link, accept it in a second browser,
  shop with the network off while the second browser adds and ticks, finish shopping, and both browsers end with the same list.
- **A seed** (`pnpm seed`): a few accounts, a shared household and their own ones, a catalog of a hundred products, lists with open and bought items,
  trips across two months in two shops (phase 2), a live invitation, a fold in history, and someone who left.

## 22. Later phases, in outline

### 22.1 Phase 2: households, trips and the rest (0.2.0)

Everything the first design put in phase 1 that 0.1.0 leaves out (§2.2). Each is designed in the section named and detailed in its task (epics 2 to 11).

- **Households:** making, naming, colouring and deleting households, several at once; roles and handing over the Admin; moving a list between
  households, which is how a list becomes private or shared; invitations by email; the household's settings page and `AvatarStack` (§7, §9.1, §16.9).
- **Catalog:** editing and merging products; renaming, hiding, adding and reordering categories; All lists; reading "2 oat milk"; about 400 starter
  entries with grocery icons (§8, §9.7, §16.8).
- **Trips and prices:** ticking also writes a trip line; shops; prices, unit prices and totals; shopping mode with a shop, a total and "shopping too";
  several lists; the trips history; the clearing rules (§10, §11).
- **Notices and mail:** the mail outbox, notices and the bell, the items-added digest, preferences and delivery (§14).
- **Fresher:** live updates and a freshness choice per device; pruning the history (§12.6, §12.9).
- **Sign-in:** the `invite` sign-up policy, passkeys, the authenticator app, linking a core account to a local one (§6.3, §15.1).
- **The suite:** core's bell, email and activity; inviting from the directory (§15.4).
- **A person's data:** export, import, and import from the legacy plugin (§18).
- **The phone:** the floating Add button (§16.11).

### 22.2 Phase 3: the pantry and routines (0.3.0)

- **The pantry:** a product can be **kept at home**, with an amount on hand, adjusted when a trip line is bought (plus its quantity, in the product's
  unit) and by hand ("used up", "have 2"); and a **low point**. A product at or below it is offered on a chosen list ("Running low: oat milk, eggs")
  and can be added to it automatically, a household's choice.
- **Staples:** products marked as always wanted; the add field's empty state offers those not on the list first, and _Add staples_ puts every missing
  one on the list.
- **Repeating items:** a product added to a list every N days or weeks, on a rule (Tusk's rule format, as Ledger and Tally copy it), by the server's
  job, idempotent on `(rule, occurrence)`, and on the device for a household that is offline.
- **Templates:** a list's items saved as a template ("weekly shop", "barbecue"), applied to a list in one action, adding what is missing at the
  template's quantities.
- **Shops with their own aisle order:** a shop gets a category order of its own, **learned from the order its trips' lines were ticked in** (a pure
  function over the last trips there: for each pair of categories, which came first more often), applied automatically when shopping mode is started
  there, and correctable by dragging. Prices remembered per shop, and the product's price over time.
- **Insights:** per household, from trips: spending by month and by category, the most bought products, who shopped how often, prices over time for a
  product; charts from `@sovereignfs/ui` (Tally's 14.1), each with a table beside it.
- **Push notifications:** Web Push, as Tally's §21.4: keys generated once (`generate`: `SHOPPER_VAPID_PRIVATE_KEY`), a subscription per device, the
  channel already in `notice_pref`. On iPhone, only once Shopper is added to the home screen.

### 22.3 Phase 4: capture (0.4.0)

- **Barcode scanning,** decoded on the device: the browser's `BarcodeDetector` where there is one, otherwise a WebAssembly decoder bundled with
  Shopper (ZXing's, licence checked for AGPL compatibility); the camera through `getUserMedia`, never leaving the device. A scan finds the household's
  product by barcode (unsealed in memory on the device, which holds the catalog), or offers to make one.
- **Lookup by barcode,** for a barcode the household does not know: **the server** asks a product database (Open Food Facts, by barcode only, with no
  account and nothing else sent; its data licence, ODbL, attributed), caches the answer, and offers the name and a category. The browser never calls
  it. An operator can turn it off (`SHOPPER_PRODUCT_LOOKUP=false`) or point it elsewhere.
- **Photos** on products and items, and **receipt images or PDFs** on trips, stored **by Shopper itself** as Roam's §18.3: under `/data/media` (the
  manifest's `data`), one file each, named by a random id, sealed with its own data key, served after the access check, 15 MB a file and
  `SHOPPER_MEDIA_MAX_HOUSEHOLD_MB` per household (default 500). Taken offline, kept on the device and uploaded when there is a network, as Roam's
  photos waiting.

### 22.4 Later, candidates

- **Encrypted backup to Git,** as the other apps plan: a household's export, encrypted, committed to a repository the person names. Deferred by the
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
- **The directory as a person** (§15.3) needs the SDK's `tokenStore` fed from better-auth's `genericOAuth`; Tally's 11.2 checks whether that works
  without a change to the SDK, and Shopper follows its answer.
- The kit of research 0004 is not published, so the infrastructure is copied (§5.1); when the kit lands, Shopper adopts it in a task of its own.
- `AUTH_LOCAL` accepts `1` and `true` until `contracts/env.md` and the apps agree (building-an-app §15).
- **Port 3007** is added to building-an-app §2's table in `sovereign` (16.2), with Ledger's 3003, Tally's 3004, Roam's 3005 and Wallet's 3006 if they
  are not there yet.

## 25. Open questions

None. Every question raised in planning was settled on 2026-11-09 or 2026-11-10 and is in §26.

## 26. Decision log

| Date       | Decision                                                                                                                                                                                                    | Why                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-09 | An app of its own, Tusk's shape: local and core sign-in, three database forms; **every feature works alone**                                                                                                | The owner's golden rule for every app                                                                                                               |
| 2026-11-09 | Name **Shopper**, prefix `shopper`, port 3007                                                                                                                                                               | Kept from the plugin; 3000–3006 are taken                                                                                                           |
| 2026-11-09 | **Planned anew**: the plugin's interface and architecture are not followed                                                                                                                                  | The owner's direction                                                                                                                               |
| 2026-11-09 | **The household is the unit of sharing from the first release;** everyone has a private one; **no per-list sharing**                                                                                        | The plugin's per-list shares made the catalog the owner's and left households an unsolved migration                                                 |
| 2026-11-09 | Roles **Admin and Member**; **no read-only role**                                                                                                                                                           | A household shops together; the owner agreed                                                                                                        |
| 2026-11-09 | Ticking gathers into **trips** of one person in one household, with trip lines as the record, instead of one purchase row per tick                                                                          | A trip is what a person remembers ("Saturday at Lidl"); it carries the shop and the total                                                           |
| 2026-11-09 | **Budgets, multiple currencies and the household ledger dropped;** one currency per household                                                                                                               | Ledger and Tally do money; a link to them is a later candidate                                                                                      |
| 2026-11-09 | Phases: **1** households, lists, catalog, trips, shopping mode, offline; **2** pantry, staples, repeating, templates, shops' order, insights, Push; **3** barcode, lookup, photos, receipts                 | Agreed with the owner                                                                                                                               |
| 2026-11-09 | **Offline first for shopping, online for membership,** with Tusk's field-level changes and a counter per household                                                                                          | The shop has no signal; several people write one list at once, so fields must merge                                                                 |
| 2026-11-09 | **Freshness is a setting:** the operator allows live updates and an interval floor; each device chooses Live, an interval, or on open; live updates are in phase 1                                          | The owner asked for it to be configurable                                                                                                           |
| 2026-11-09 | Live updates are **a signal on a server-sent-event stream, then a normal pull,** held in the process                                                                                                        | No data on the stream; the suite's SQL forbids `LISTEN/NOTIFY`; one process is how an instance runs an app                                          |
| 2026-11-09 | **Duplicates fold:** the same product added twice to a list, or a product made twice, becomes one, recorded as an alias                                                                                     | Two people adding milk offline should not make two rows to tidy                                                                                     |
| 2026-11-09 | **The first tick stands;** a second tick of the same item makes no second trip line                                                                                                                         | Nothing is recorded as bought twice                                                                                                                 |
| 2026-11-09 | **Encryption at rest on the server** (envelope under `SHOPPER_ENCRYPTION_KEY`, sealed rows), not end to end; product identity by an HMAC name key                                                           | The owner's choice; the server must merge, fold and word notices                                                                                    |
| 2026-11-09 | Notices (Claude's call, at the owner's request): invitations and joins, **trip finished on by default**, **items added as a 30-minute digest, off by default**; email only for invitations; Push in phase 2 | Useful without being noisy; a digest keeps a week of adding from becoming a stream of pings                                                         |
| 2026-11-09 | Aisle order (Claude's call, at the owner's request): **one category order per household in phase 1; per-shop order learned from ticking in phase 2**                                                        | One order is enough to start; learning from what people already do needs no setup                                                                   |
| 2026-11-09 | **A starter catalog** of common groceries, in English, shipped as data                                                                                                                                      | The first list should already come right; the owner agreed                                                                                          |
| 2026-11-09 | Categories: a **starter set each household can rename, hide, add to and reorder**                                                                                                                           | Groceries vary too much for a fixed list                                                                                                            |
| 2026-11-09 | Units: a **fixed list**; quantities as **decimal strings**                                                                                                                                                  | As the plugin decided; no binary float                                                                                                              |
| 2026-11-09 | A **note** on every item and product                                                                                                                                                                        | Brands and "the green one"                                                                                                                          |
| 2026-11-09 | Prices: **optional per item, for its quantity;** a product remembers its last unit price; a trip totals its lines or takes the receipt total; per shop in phase 2                                           | Enough to be useful without becoming a ledger                                                                                                       |
| 2026-11-09 | **Limits are operator settings** with defaults: 20 members, 20 households an account, 100 lists, 500 open items, 5000 products, 100 categories                                                              | As Roam; changeable without a release                                                                                                               |
| 2026-11-09 | Account deletion **keeps the name** on shared rows and removes email and everything else personal, as Tally                                                                                                 | The owner's choice                                                                                                                                  |
| 2026-11-09 | Sign-in as Tusk and Tally; **joining only by accepting an invitation** (link, email, or core's directory); local sign-up by invitation by default                                                           | A household shows your name to its members, so nobody is added without agreeing                                                                     |
| 2026-11-09 | No placeholders                                                                                                                                                                                             | Everyone in a household shops and has an account; imported names cover history                                                                      |
| 2026-11-09 | **The plugin's export is imported** into the person's own household, purchases as trips; Shopper's own export and import in phase 1                                                                         | The owner's choice                                                                                                                                  |
| 2026-11-09 | **Encrypted backup to Git deferred** past phase 3                                                                                                                                                           | The owner's choice                                                                                                                                  |
| 2026-11-09 | No activity feed                                                                                                                                                                                            | Trips and notices cover what the plugin's planned feed was for                                                                                      |
| 2026-11-09 | An editable **All lists** view replaces the read-only combined view                                                                                                                                         | The device holds every list, so nothing stops it being editable                                                                                     |
| 2026-11-09 | **Grocery icons, `AvatarStack`, a floating button** built in `@sovereignfs/ui` first; charts shared with Tally for phase 2                                                                                  | The suite's design-system-first rule                                                                                                                |
| 2026-11-10 | **Phase 1 is a minimum viable product** (§2.2); what the first design put in it and 0.1.0 leaves out is **phase 2**, the pantry becomes phase 3 and capture phase 4                                         | The owner wants a usable app as fast as possible; nothing is dropped, and the data model does not change for phase 2                                |
| 2026-11-10 | **Sharing in 0.1.0 is sharing the household each account is made with, by a link;** no per-list sharing, and no making or naming households until phase 2                                                   | The owner wants lists shared and households deferred; this reuses the designed access, sync and sealing unchanged, where per-list sharing would not |
| 2026-11-10 | **An account's own household takes members:** "Just me" goes, and it is shown as "My lists" or "Kasun's lists"                                                                                              | Follows from the line above; passes on or ends with the account (§19)                                                                               |
| 2026-11-10 | **Ticking sets the item's bought fields only** in 0.1.0; trips, shops, prices and totals are phase 2, and 0.1.0 has a **light shopping mode**                                                               | The owner's choice; a trip is added later without changing what 0.1.0 wrote                                                                         |
| 2026-11-10 | **0.1.0 signs in by password or through a core;** passkeys, the authenticator app, linking and `invite` are phase 2, and **`open` is the default sign-up** until `invite` exists                            | A link must be acceptable by someone with no account; `invite` waits on `sovereign` and 0.1.0 does not                                              |
| 2026-11-10 | **No notices, mail outbox, live updates, export, import or directory in 0.1.0;** devices pull every 20 seconds by default                                                                                   | Not needed to use, share and trust a list; each is an addition                                                                                      |
| 2026-11-10 | **A starter catalog of about 150 on the icons that exist, and fixed starter categories;** the larger set and editing are phase 2                                                                            | 0.1.0 waits on nothing upstream                                                                                                                     |
| 2026-11-10 | **Phase numbers in the rows above dated 2026-11-09 are that day's:** its phase 2 is now 3, its phase 3 is now 4, and what it called phase 1 is now phases 1 and 2                                           | The log is not rewritten                                                                                                                            |
