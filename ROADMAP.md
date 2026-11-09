# Roadmap

The order of work. **This file tracks progress; it does not define behaviour.** [`DESIGN.md`](DESIGN.md) says what Shopper does, and where it
disagrees with this file, this file is stale and should be corrected. The detail of every task, with its technical notes and what makes it done, is in
[`docs/epics/`](docs/epics/). How a task is run is in [`AGENTS.md`](AGENTS.md).

State as of 2026-11-09: **planned, nothing built.** The developer assigns each task; the first row not done, with its dependencies met, is what the
order recommends.

_Status key: ✅ Done · ⏳ In progress · 📋 Planned · 🚧 Waits on a decision · ➖ Superseded_

_Priority:_ **P0** nothing else can stand without it · **P1** the product · **P2** needed before the first release · **P3** can follow the first
release if it must

## How this is ordered

Tusk's order (building-an-app §14): conventions, configuration, database, sign-in, the shell, then the product, then the image and the release. Within
the product:

1. **Encryption at rest in the foundation** (A), so that no table holding a name is ever written in plain text, not even in development.
2. **Households first** (B), so that no table is written without `household_id` and membership in its statement, and every account has its own
   household from its first sign-in.
3. **The catalog and the one write path before any screen** (C): names, suggestions, quantities, field merging and folding are pure or server-side,
   and every later screen and the sync use them. Trips' data comes here too, since ticking writes a trip line.
4. **Offline before the screens** (D), because the screens read the device's store: building them on server reads first would mean building them
   twice. Live updates belong here, as the freshness setting is part of the loop.
5. **The screens** (E), then **shopping** (F): shopping mode is the product's reason to exist, and it stands on a working list.
6. **Bringing people in** (G): invitations, roles, moving lists, with mail.
7. **Notices** (H), then **the suite and portability** (I), then the release (J). Sign-in through core is P0 but can come late, as Tusk's and Tally's
   do: nothing before it depends on it.

**Epic 16 is work in `sovereign`**, tracked here because Shopper waits on it: the design system's missing parts and the `invite` sign-up value.
Several are the same parts Tally and Roam wait on; whichever app needs one first has it built for all. Each is started early enough to be released
before the task that needs it.

## Phase 1 — the MVP (0.1.0)

### Milestone A — Foundation

The repository can hold the app. Nothing a person would notice. **Done when** an empty database boots on all three forms from the image, sealed rows
round-trip, and CI proves it.

| #   | ID                               | Task                             | Priority | Depends on | Status |
| --- | -------------------------------- | -------------------------------- | -------- | ---------- | ------ |
| 1   | [1.1](docs/epics/foundation.md)  | Repository conventions           | P0       | —          | 📋     |
| 2   | [1.2](docs/epics/foundation.md)  | Format, lint and test tooling    | P0       | 1.1        | 📋     |
| 3   | [1.3](docs/epics/foundation.md)  | Continuous integration           | P0       | 1.2        | 📋     |
| 4   | [1.4](docs/epics/foundation.md)  | Configuration and start-up       | P0       | 1.2        | 📋     |
| 5   | [1.5](docs/epics/foundation.md)  | The database layer               | P0       | 1.4        | 📋     |
| 6   | [1.11](docs/epics/foundation.md) | Encryption at rest               | P0       | 1.5        | 📋     |
| 7   | [1.8](docs/epics/foundation.md)  | Design system boundary and shell | P0       | 1.2        | 📋     |
| 8   | [1.7](docs/epics/foundation.md)  | Security headers                 | P0       | 1.4        | 📋     |
| 9   | [1.6](docs/epics/foundation.md)  | The job runner                   | P0       | 1.5        | 📋     |
| 10  | [1.9](docs/epics/foundation.md)  | Browser tests                    | P0       | 1.5        | 📋     |
| 11  | [1.10](docs/epics/foundation.md) | The image and deployment setups  | P0       | 1.5, 1.6   | 📋     |

### Milestone B — Accounts and households

A person signs in and finds their own household; they can make a shared one and be its Admin; every statement carries the permission. **Done when** a
second person can reach nothing of a household they are not in, and deleting a person leaves nothing personal.

| #   | ID                              | Task                             | Priority | Depends on    | Status |
| --- | ------------------------------- | -------------------------------- | -------- | ------------- | ------ |
| 12  | [2.1](docs/epics/accounts.md)   | Local sign-in                    | P0       | 1.5, 1.8      | 📋     |
| 13  | [3.1](docs/epics/households.md) | Persons                          | P0       | 2.1, 1.11     | 📋     |
| 14  | [3.2](docs/epics/households.md) | Households, members and access   | P0       | 3.1           | 📋     |
| 15  | [3.3](docs/epics/households.md) | Your own household               | P0       | 3.2           | 📋     |
| 16  | [3.7](docs/epics/households.md) | Limits                           | P1       | 3.2           | 📋     |
| 17  | [2.2](docs/epics/accounts.md)   | Landing page and the address `/` | P1       | 2.1           | 📋     |
| 18  | [2.5](docs/epics/accounts.md)   | Deleting a person                | P0       | 3.3           | 📋     |
| 19  | [2.6](docs/epics/accounts.md)   | Settings                         | P1       | 2.1, 1.8, 3.1 | 📋     |

### Milestone C — The catalog and the write path

Lists, items, products, categories, shops and trips can be written through the one path, merged field by field, with duplicates folded, and every
figure comes from one pure module. **Done when** the property tests hold and a mutation is applied, merged, folded, refused and replayed correctly on
all three databases.

| #   | ID                           | Task                                | Priority | Depends on    | Status |
| --- | ---------------------------- | ----------------------------------- | -------- | ------------- | ------ |
| 20  | [4.1](docs/epics/catalog.md) | Names and the name key              | P0       | 1.11          | 📋     |
| 21  | [4.6](docs/epics/catalog.md) | Quantities, money and unit prices   | P0       | 1.2           | 📋     |
| 22  | [4.2](docs/epics/catalog.md) | Categories, units and icons         | P0       | 3.2           | 📋     |
| 23  | [5.1](docs/epics/items.md)   | Actions and validators              | P0       | 4.1, 4.2, 4.6 | 📋     |
| 24  | [5.2](docs/epics/items.md)   | Applying a mutation, field by field | P0       | 5.1, 3.2      | 📋     |
| 25  | [5.3](docs/epics/items.md)   | Folding and aliases                 | P0       | 5.2           | 📋     |
| 26  | [5.4](docs/epics/items.md)   | Lists                               | P0       | 5.2           | 📋     |
| 27  | [5.5](docs/epics/items.md)   | Items                               | P0       | 5.3, 5.4      | 📋     |
| 28  | [5.6](docs/epics/items.md)   | Products: editing and merging       | P1       | 5.3           | 📋     |
| 29  | [7.1](docs/epics/trips.md)   | Trips and trip lines                | P0       | 5.5           | 📋     |
| 30  | [7.2](docs/epics/trips.md)   | Finishing trips and clearing        | P1       | 7.1, 1.6      | 📋     |
| 31  | [4.3](docs/epics/catalog.md) | The starter catalog                 | P1       | 4.2, 16.4     | 📋     |
| 32  | [4.4](docs/epics/catalog.md) | Suggestions                         | P1       | 4.3, 7.1      | 📋     |
| 33  | [4.5](docs/epics/catalog.md) | Reading what is typed               | P2       | 4.6, 4.3      | 📋     |

### Milestone D — Offline and sync

The device holds every household and works without a network; others' changes arrive as fast as each person chose. **Done when** two browsers, one
offline, add, edit and tick on one list and both end with the same rows, folded where they should be, with nothing lost and every refusal in Couldn't
sync; and with Live chosen, a change on one shows on the other within two seconds.

| #   | ID                               | Task                                   | Priority | Depends on | Status |
| --- | -------------------------------- | -------------------------------------- | -------- | ---------- | ------ |
| 34  | [6.1](docs/epics/sync.md)        | The sync endpoint                      | P0       | 5.3, 7.1   | 📋     |
| 35  | [6.2](docs/epics/sync.md)        | The device's store, outbox and loop    | P0       | 6.1        | 📋     |
| 36  | [6.3](docs/epics/sync.md)        | Couldn't sync                          | P1       | 6.2        | 📋     |
| 37  | [6.4](docs/epics/sync.md)        | Live updates and the freshness setting | P1       | 6.2        | 📋     |
| 38  | [1.12](docs/epics/foundation.md) | The PWA                                | P1       | 1.8        | 📋     |
| 39  | [6.5](docs/epics/sync.md)        | Opening offline                        | P1       | 6.2, 1.12  | 📋     |
| 40  | [6.6](docs/epics/sync.md)        | Keeping the history small              | P2       | 6.1, 1.6   | 📋     |

### Milestone E — The screens

The interface of `DESIGN.md` §16 on the device's data. **Done when** a person can keep their lists in their own household from first item to clearing,
at desktop and phone widths, offline.

| #   | ID                             | Task                                   | Priority | Depends on | Status |
| --- | ------------------------------ | -------------------------------------- | -------- | ---------- | ------ |
| 41  | [16.3](docs/epics/upstream.md) | `AvatarStack` (`sovereign`)            | P1       | —          | 📋     |
| 42  | [16.5](docs/epics/upstream.md) | A floating action button (`sovereign`) | P1       | —          | 📋     |
| 43  | [8.1](docs/epics/screens.md)   | The shell and its places               | P1       | 6.2, 3.3   | 📋     |
| 44  | [8.2](docs/epics/screens.md)   | A list                                 | P1       | 8.1, 5.5   | 📋     |
| 45  | [8.3](docs/epics/screens.md)   | Adding                                 | P1       | 8.2, 4.4   | 📋     |
| 46  | [8.4](docs/epics/screens.md)   | An item                                | P1       | 8.2        | 📋     |
| 47  | [8.5](docs/epics/screens.md)   | All lists                              | P1       | 8.2        | 📋     |
| 48  | [8.6](docs/epics/screens.md)   | The catalog                            | P1       | 8.1, 5.6   | 📋     |
| 49  | [8.8](docs/epics/screens.md)   | The phone                              | P1       | 8.3, 16.5  | 📋     |

### Milestone F — Shopping

The shop. **Done when** journeys 6 to 9 of `DESIGN.md` §3 pass in a browser with the network off for the whole of shopping mode.

| #   | ID                         | Task                   | Priority | Depends on | Status |
| --- | -------------------------- | ---------------------- | -------- | ---------- | ------ |
| 50  | [7.3](docs/epics/trips.md) | Shopping mode          | P1       | 8.2, 7.2   | 📋     |
| 51  | [7.4](docs/epics/trips.md) | Shopping several lists | P2       | 7.3        | 📋     |
| 52  | [7.5](docs/epics/trips.md) | The trips history      | P1       | 7.1, 8.1   | 📋     |

### Milestone G — Bringing people in

People shop together. **Done when** journey 3 of `DESIGN.md` §3 passes in a browser, alone and with no mail set up, and a list moves from a person's
own household into a shared one.

| #   | ID                              | Task                                      | Priority | Depends on    | Status |
| --- | ------------------------------- | ----------------------------------------- | -------- | ------------- | ------ |
| 53  | [9.1](docs/epics/notices.md)    | The mail outbox                           | P1       | 1.6           | 📋     |
| 54  | [16.1](docs/epics/upstream.md)  | `AUTH_SIGNUP` by invitation (`sovereign`) | P1       | —             | 📋     |
| 55  | [2.7](docs/epics/accounts.md)   | The sign-up policy                        | P1       | 2.1, 16.1     | 📋     |
| 56  | [8.7](docs/epics/screens.md)    | Household settings                        | P1       | 8.1, 3.2      | 📋     |
| 57  | [3.4](docs/epics/households.md) | Invitations                               | P1       | 9.1, 2.7, 8.7 | 📋     |
| 58  | [3.5](docs/epics/households.md) | Roles, leaving, removing and deleting     | P1       | 3.4           | 📋     |
| 59  | [3.6](docs/epics/households.md) | Moving a list between households          | P1       | 3.5, 5.6      | 📋     |

### Milestone H — Notices

People hear about what concerns them, and no more. **Done when** each kind of notice reaches the right people through the bell and, where on, by
email, never the person who acted, and a burst of adds becomes one digest.

| #   | ID                           | Task                     | Priority | Depends on | Status |
| --- | ---------------------------- | ------------------------ | -------- | ---------- | ------ |
| 60  | [9.2](docs/epics/notices.md) | Notices and the bell     | P1       | 5.2, 8.1   | 📋     |
| 61  | [9.3](docs/epics/notices.md) | The items-added digest   | P2       | 9.2, 1.6   | 📋     |
| 62  | [9.4](docs/epics/notices.md) | Preferences and delivery | P1       | 9.2, 9.1   | 📋     |

### Milestone I — The suite, and the person's data

Part of the suite, and a person can leave or arrive with their history. **Done when** it signs in through core, honours both notices, invites from the
directory, notifies through core's bell, a person's households round-trip through a file, and a plugin export imports.

| #   | ID                                | Task                         | Priority | Depends on | Status |
| --- | --------------------------------- | ---------------------------- | -------- | ---------- | ------ |
| 63  | [2.3](docs/epics/accounts.md)     | Sign-in through core         | P0       | 2.1, 3.3   | 📋     |
| 64  | [2.4](docs/epics/accounts.md)     | Core's notices               | P0       | 2.3, 2.5   | 📋     |
| 65  | [10.1](docs/epics/suite.md)       | Core's bell, email, activity | P2       | 2.3, 9.4   | 📋     |
| 66  | [10.2](docs/epics/suite.md)       | Inviting from the directory  | P2       | 2.3, 3.4   | 📋     |
| 67  | [11.1](docs/epics/portability.md) | Export                       | P2       | 7.1, 3.5   | 📋     |
| 68  | [11.2](docs/epics/portability.md) | Import                       | P2       | 11.1       | 📋     |
| 69  | [11.3](docs/epics/portability.md) | Import from the plugin       | P2       | 11.2, 4.3  | 📋     |

### Milestone J — Release

**Done when** 0.1.0 is published and hosted on the live instance.

| #   | ID                             | Task                                      | Priority | Depends on      | Status |
| --- | ------------------------------ | ----------------------------------------- | -------- | --------------- | ------ |
| 70  | [12.1](docs/epics/release.md)  | Development seed                          | P1       | 3.4, 7.1        | 📋     |
| 71  | [16.2](docs/epics/upstream.md) | Shopper's port in the guide (`sovereign`) | P3       | —               | 📋     |
| 72  | [12.3](docs/epics/release.md)  | Documents                                 | P2       | 1.10            | 📋     |
| 73  | [12.2](docs/epics/release.md)  | Security review                           | P2       | 11.3, 9.4, 10.2 | 📋     |
| 74  | [12.4](docs/epics/release.md)  | Release 0.1.0                             | P2       | 12.2, 12.3      | 📋     |
| 75  | [12.5](docs/epics/release.md)  | Hosting on an instance                    | P2       | 12.4            | 📋     |

## Phase 2 — the pantry and routines (0.2.0)

### Milestone K — Pantry, routines, shops and insights

`DESIGN.md` §22.1. **Done when** 0.2.0 is published: a household keeps a pantry with low points, staples, repeating items and templates; shops have
their own learned aisle order; insights have charts; Push reaches a phone.

| #   | ID                             | Task                             | Priority | Depends on | Status |
| --- | ------------------------------ | -------------------------------- | -------- | ---------- | ------ |
| 76  | [13.1](docs/epics/pantry.md)   | The pantry and low points        | P1       | 12.4       | 📋     |
| 77  | [13.2](docs/epics/pantry.md)   | Staples                          | P1       | 12.4       | 📋     |
| 78  | [13.3](docs/epics/pantry.md)   | Repeating items                  | P1       | 12.4       | 📋     |
| 79  | [13.4](docs/epics/pantry.md)   | Templates                        | P2       | 12.4       | 📋     |
| 80  | [13.5](docs/epics/pantry.md)   | Shops with their own aisle order | P1       | 12.4       | 📋     |
| 81  | [13.6](docs/epics/pantry.md)   | Prices per shop and over time    | P2       | 13.5       | 📋     |
| 82  | [16.6](docs/epics/upstream.md) | Charts (`sovereign`)             | P1       | —          | 📋     |
| 83  | [13.7](docs/epics/pantry.md)   | Insights                         | P1       | 13.6, 16.6 | 📋     |
| 84  | [13.8](docs/epics/pantry.md)   | Push notifications               | P2       | 12.4       | 📋     |
| 85  | [13.9](docs/epics/pantry.md)   | Release 0.2.0                    | P2       | 13.1–13.8  | 📋     |

## Phase 3 — capture (0.3.0)

### Milestone L — Barcodes, photos and receipts

`DESIGN.md` §22.2. **Done when** 0.3.0 is published: scanning a barcode in a shop finds or makes a product with no network needed for a known one, and
photos and receipts are stored sealed by Shopper itself.

| #   | ID                            | Task                         | Priority | Depends on | Status |
| --- | ----------------------------- | ---------------------------- | -------- | ---------- | ------ |
| 86  | [14.1](docs/epics/capture.md) | Barcode scanning             | P1       | 13.9       | 📋     |
| 87  | [14.2](docs/epics/capture.md) | Lookup by barcode            | P2       | 14.1       | 📋     |
| 88  | [14.3](docs/epics/capture.md) | The media store              | P1       | 13.9       | 📋     |
| 89  | [14.4](docs/epics/capture.md) | Photos on products and items | P2       | 14.3       | 📋     |
| 90  | [14.5](docs/epics/capture.md) | Receipts on trips            | P1       | 14.3       | 📋     |
| 91  | [14.6](docs/epics/capture.md) | Release 0.3.0                | P2       | 14.1–14.5  | 📋     |

## Later — candidates

None committed (`DESIGN.md` §22.3). Each waits on a decision before it is planned in detail.

| #   | ID                          | Task                               | Priority | Depends on | Status |
| --- | --------------------------- | ---------------------------------- | -------- | ---------- | ------ |
| 92  | [15.1](docs/epics/later.md) | Encrypted backup to Git            | P3       | 11.1       | 🚧     |
| 93  | [15.2](docs/epics/later.md) | Sending a trip to Ledger or Tally  | P3       | 7.5        | 🚧     |
| 94  | [15.3](docs/epics/later.md) | AI through the instance's provider | P3       | —          | 🚧     |
| 95  | [15.4](docs/epics/later.md) | Other languages                    | P3       | 4.3, 4.5   | 🚧     |

## Upstream, not placed above

| #   | ID                             | Task                                         | Priority | Depends on | Status |
| --- | ------------------------------ | -------------------------------------------- | -------- | ---------- | ------ |
| 96  | [16.4](docs/epics/upstream.md) | Grocery icons (`sovereign`)                  | P1       | —          | 📋     |
| 97  | [16.7](docs/epics/upstream.md) | `MoneyInput` (`sovereign`), if Tally's lands | P3       | —          | 📋     |

16.4 is needed by the starter catalog (4.3, row 31) and is started with Milestone A, so that it is released by then.
