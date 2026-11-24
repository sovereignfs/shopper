# Roadmap

The order of work. **This file tracks progress; it does not define behaviour.** [`DESIGN.md`](DESIGN.md) says what Shopper does, and where it
disagrees with this file, this file is stale and should be corrected. The detail of every task, with its technical notes and what makes it done, is in
[`docs/epics/`](docs/epics/). How a task is run is in [`AGENTS.md`](AGENTS.md).

State as of 2026-11-21: **phase 1 built and 0.1.0 tagged; [workstream 0001](docs/workstreams/0001-suite-model.md) planned before phase 2, and [workstream 0002](docs/workstreams/0002-frame-home-cards.md) after it (planned 2026-11-23).** The
developer assigns each task; the first row not done, with its dependencies met, is what the order recommends.

_Status key: ✅ Done · ⏳ In progress · 📋 Planned · 🚧 Waits on a decision · ➖ Superseded_

_Priority:_ **P0** nothing else can stand without it · **P1** the product · **P2** needed before the release of its phase · **P3** can follow the
release if it must

## How this is ordered

**Phase 1 is a minimum viable product, built to be used as soon as it can be** (`DESIGN.md` §2.2 says exactly what it holds). A person signs in,
keeps shopping lists offline, adds items quickly, ticks them off, shops with a screen made for the aisle, and shares their lists with others by a
link. Everything that is not needed for that waits for phase 2, which is the rest of what the design first put in phase 1. Nothing is dropped; each
deferred task keeps its ID and says which phase it is in.

Within phase 1, Tusk's order (building-an-app §14): conventions, configuration, database, sign-in, the shell, then the product, then the image and the
release.

1. **Encryption at rest in the foundation** (A), so that no table holding a name is ever written in plain text, not even in development.
2. **Accounts and the first household** (B): every table of the product carries `household_id` and the permission in its statement from the first
   write, and every account has a household of its own from its first sign-in, which is also what sharing later uses.
3. **The catalog and the one write path before any screen** (C): names, suggestions, quantities, field merging and folding are pure or server-side,
   and every later screen and the sync use them.
4. **Offline before the screens** (D), because the screens read the device's store: building them on server reads first would mean building them
   twice.
5. **The screens** (E), then **shopping mode** (F), then **sharing** (G). After E and F one person can use Shopper end to end; after G, two can. Those
   are the first points worth running on a phone.
6. **Sign-in through core** (H) is P0 but depends on nothing after B, so it can be built alongside C to G, as Tusk's and Tally's were.
7. **The image and the release** (I).

**Between phase 1 and phase 2, [workstream 0001](docs/workstreams/0001-suite-model.md)** (R to V) moves Shopper onto what `sovereign` publishes:
the current packages, encryption the server cannot read ([RFC 0001](docs/rfcs/0001-encryption-the-server-cannot-read.md)), Web Push
([RFC 0002](docs/rfcs/0002-web-push.md)) and the suite's exports ([RFC 0003](docs/rfcs/0003-exports-and-backups.md)). It comes first so that phase
2's households, trips and notices are built encrypted from their first line. Until 18.1 rewrites `DESIGN.md`, the RFCs say what these rows build.

**After workstream 0001, [workstream 0002](docs/workstreams/0002-frame-home-cards.md)** (W to Z) gives Shopper the suite's frame and settings
([RFC 0005](docs/rfcs/0005-the-frame-settings-and-screens.md)), Home and Inventory ([RFC 0006](docs/rfcs/0006-home-and-inventory.md)) and loyalty
cards ([RFC 0007](docs/rfcs/0007-loyalty-cards.md)), before phase 2, so that phase 2's screens are built once, in the new frame. It supersedes 2.9, 4.7,
8.5 and 8.6, re-homes the pantry's 13.1 to 13.3 in Inventory, and brings 14.1's decoding forward for cards.

**Epic 16 is work in `sovereign`**, tracked here because Shopper waits on it. **Phase 1 waits on none of it.** The parts it would have needed
(grocery icons, `AvatarStack`, a floating button, `invite` as a sign-up value) are phase 2's, and each is started early enough to be released before
the task that needs it. Several are the same parts Tally and Roam wait on; whichever app needs one first has it built for all.

## Phase 1 — the MVP (0.1.0)

### Milestone A — Foundation

The repository can hold the app. Nothing a person would notice. **Done when** an empty database boots on all three forms, sealed rows round-trip, and
CI proves it.

| #   | ID                               | Task                             | Priority | Depends on | Status |
| --- | -------------------------------- | -------------------------------- | -------- | ---------- | ------ |
| 1   | [1.1](docs/epics/foundation.md)  | Repository conventions           | P0       | —          | ✅     |
| 2   | [1.2](docs/epics/foundation.md)  | Format, lint and test tooling    | P0       | 1.1        | ✅     |
| 3   | [1.3](docs/epics/foundation.md)  | Continuous integration           | P0       | 1.2        | ✅     |
| 4   | [1.4](docs/epics/foundation.md)  | Configuration and start-up       | P0       | 1.2        | ✅     |
| 5   | [1.5](docs/epics/foundation.md)  | The database layer               | P0       | 1.4        | ✅     |
| 6   | [1.11](docs/epics/foundation.md) | Encryption at rest               | P0       | 1.5        | ✅     |
| 7   | [1.8](docs/epics/foundation.md)  | Design system boundary and shell | P0       | 1.2        | ✅     |
| 8   | [1.7](docs/epics/foundation.md)  | Security headers                 | P0       | 1.4        | ✅     |
| 9   | [1.6](docs/epics/foundation.md)  | The job runner                   | P1       | 1.5        | ✅     |
| 10  | [1.9](docs/epics/foundation.md)  | Browser tests                    | P0       | 1.5        | ✅     |

### Milestone B — Accounts and your first household

A person signs in with an email and a password and finds a household of their own, with a first list; every statement carries the permission.
**Done when** a second person can reach nothing of a household they are not in, and deleting a person leaves nothing personal.

| #   | ID                              | Task                             | Priority | Depends on    | Status |
| --- | ------------------------------- | -------------------------------- | -------- | ------------- | ------ |
| 11  | [2.1](docs/epics/accounts.md)   | Local sign-in                    | P0       | 1.5, 1.8      | ✅     |
| 12  | [3.1](docs/epics/households.md) | Persons                          | P0       | 2.1, 1.11     | ✅     |
| 13  | [3.2](docs/epics/households.md) | Households, members and access   | P0       | 3.1           | ✅     |
| 14  | [3.3](docs/epics/households.md) | Your first household             | P0       | 3.2           | ✅     |
| 15  | [2.5](docs/epics/accounts.md)   | Deleting a person                | P0       | 3.3           | ✅     |
| 16  | [2.2](docs/epics/accounts.md)   | Landing page and the address `/` | P1       | 2.1           | ✅     |
| 17  | [2.6](docs/epics/accounts.md)   | Settings                         | P1       | 2.1, 1.8, 3.1 | ✅     |
| 18  | [3.7](docs/epics/households.md) | Limits                           | P2       | 3.2           | ✅     |

### Milestone C — Lists, items and the write path

Lists, items and products can be written through the one path, merged field by field, with duplicates folded, and every figure comes from one pure
module. **Done when** the property tests hold and a mutation is applied, merged, folded, refused and replayed correctly on all three databases.

| #   | ID                           | Task                                | Priority | Depends on    | Status |
| --- | ---------------------------- | ----------------------------------- | -------- | ------------- | ------ |
| 19  | [4.1](docs/epics/catalog.md) | Names and the name key              | P0       | 1.11          | ✅     |
| 20  | [4.6](docs/epics/catalog.md) | Quantities and units                | P0       | 1.2           | ✅     |
| 21  | [4.2](docs/epics/catalog.md) | Categories, units and icons         | P0       | 3.2           | ✅     |
| 22  | [5.1](docs/epics/items.md)   | Actions and validators              | P0       | 4.1, 4.2, 4.6 | ✅     |
| 23  | [5.2](docs/epics/items.md)   | Applying a mutation, field by field | P0       | 5.1, 3.2      | ✅     |
| 24  | [5.3](docs/epics/items.md)   | Folding and aliases                 | P0       | 5.2           | ✅     |
| 25  | [5.4](docs/epics/items.md)   | Lists                               | P0       | 5.2           | ✅     |
| 26  | [5.5](docs/epics/items.md)   | Items, ticking and clearing         | P0       | 5.3, 5.4      | ✅     |
| 27  | [4.3](docs/epics/catalog.md) | The starter catalog                 | P1       | 4.2           | ✅     |
| 28  | [4.4](docs/epics/catalog.md) | Suggestions                         | P1       | 4.3, 5.5      | ✅     |

### Milestone D — Offline and sync

The device holds every household the account is in and works without a network; others' changes arrive within seconds. **Done when** two browsers,
one offline, add, edit and tick on one list and both end with the same rows, folded where they should be, with nothing lost and every refusal in
Couldn't sync.

| #   | ID                               | Task                                | Priority | Depends on | Status |
| --- | -------------------------------- | ----------------------------------- | -------- | ---------- | ------ |
| 29  | [6.1](docs/epics/sync.md)        | The sync endpoint                   | P0       | 5.5        | ✅     |
| 30  | [6.2](docs/epics/sync.md)        | The device's store, outbox and loop | P0       | 6.1        | ✅     |
| 31  | [6.3](docs/epics/sync.md)        | Couldn't sync                       | P1       | 6.2        | ✅     |
| 32  | [1.12](docs/epics/foundation.md) | The PWA                             | P1       | 1.8        | ✅     |
| 33  | [6.5](docs/epics/sync.md)        | Opening offline                     | P1       | 6.2, 1.12  | ✅     |

### Milestone E — The screens

The interface of `DESIGN.md` §16 on the device's data. **Done when** a person can keep their lists from first item to clearing, at desktop and phone
widths, offline. This is the first point at which Shopper is usable by one person.

| #   | ID                           | Task                     | Priority | Depends on | Status |
| --- | ---------------------------- | ------------------------ | -------- | ---------- | ------ |
| 34  | [8.1](docs/epics/screens.md) | The shell and its places | P1       | 6.2, 3.3   | ✅     |
| 35  | [8.2](docs/epics/screens.md) | A list                   | P1       | 8.1, 5.5   | ✅     |
| 36  | [8.3](docs/epics/screens.md) | Adding                   | P1       | 8.2, 4.4   | ✅     |
| 37  | [8.4](docs/epics/screens.md) | An item                  | P1       | 8.2        | ✅     |
| 38  | [8.8](docs/epics/screens.md) | The phone                | P1       | 8.3        | ✅     |

### Milestone F — Shopping mode

The shop, in its light form: large rows, the screen kept on, ticked items dropping into the basket. **Done when** journeys 6 and 7 of `DESIGN.md` §3,
as `DESIGN.md` §2.2 words them for 0.1.0, pass in a browser with the network off for the whole of shopping mode.

| #   | ID                         | Task          | Priority | Depends on | Status |
| --- | -------------------------- | ------------- | -------- | ---------- | ------ |
| 39  | [7.3](docs/epics/trips.md) | Shopping mode | P1       | 8.2        | ✅     |

### Milestone G — Sharing

People share their lists. **Done when** journey 3 of `DESIGN.md` §3 passes in a browser, alone and with no mail set up: one person shares by a link, a
second makes an account, opens it, and both see and edit the same lists.

| #   | ID                              | Task                          | Priority | Depends on    | Status |
| --- | ------------------------------- | ----------------------------- | -------- | ------------- | ------ |
| 40  | [3.4](docs/epics/households.md) | Invitations by link           | P1       | 3.3, 2.1      | ✅     |
| 41  | [3.5](docs/epics/households.md) | Leaving and removing          | P1       | 3.4           | ✅     |
| 42  | [8.7](docs/epics/screens.md)    | Sharing: who is on your lists | P1       | 8.1, 3.4, 3.5 | ✅     |

### Milestone H — Sign-in through Sovereign

Part of the suite. Can be built any time after B. **Done when** a person signs in through a core, a core's logout ends their sessions, and a core's
account-deleted notice removes everything personal.

| #   | ID                            | Task                 | Priority | Depends on | Status |
| --- | ----------------------------- | -------------------- | -------- | ---------- | ------ |
| 43  | [2.3](docs/epics/accounts.md) | Sign-in through core | P0       | 2.1, 3.3   | ✅     |
| 44  | [2.4](docs/epics/accounts.md) | Core's notices       | P0       | 2.3, 2.5   | ✅     |

### Milestone I — Release 0.1.0

**Done when** 0.1.0 is published and hosted on the live instance.

| #   | ID                               | Task                                      | Priority | Depends on         | Status |
| --- | -------------------------------- | ----------------------------------------- | -------- | ------------------ | ------ |
| 45  | [12.1](docs/epics/release.md)    | Development seed                          | P1       | 3.4, 5.5           | ✅     |
| 46  | [1.10](docs/epics/foundation.md) | The image and deployment setups           | P2       | 1.5, 1.6           | ✅     |
| 47  | [12.3](docs/epics/release.md)    | Documents                                 | P2       | 1.10               | ✅     |
| 48  | [12.2](docs/epics/release.md)    | Security review                           | P2       | 2.4, 3.5, 6.3, 7.3 | ✅     |
| 49  | [12.4](docs/epics/release.md)    | Release 0.1.0                             | P2       | 12.2, 12.3         | ✅     |
| 50  | [12.5](docs/epics/release.md)    | Hosting on an instance                    | P2       | 12.4               | 📋     |
| 51  | [16.2](docs/epics/upstream.md)   | Shopper's port in the guide (`sovereign`) | P3       | —                  | 📋     |

## Between phases — the suite's encryption, push and exports

[Workstream 0001](docs/workstreams/0001-suite-model.md), in its legs. The owner's decision of 2026-11-21: encrypted as the suite is, always; push and
exports from the suite's packages; before phase 2.

### Milestone R — Suite alignment

Shopper on the current releases of what `sovereign` publishes. **Done when** `pnpm verify` and `pnpm manifest:check` pass on them and nothing a
person sees has changed.

| #   | ID                              | Task                                                                    | Priority | Depends on          | Status |
| --- | ------------------------------- | ----------------------------------------------------------------------- | -------- | ------------------- | ------ |
| 52  | [17.1](docs/epics/alignment.md) | The packages, current                                                   | P0       | —                   | ✅     |
| 53  | [17.2](docs/epics/alignment.md) | The worker from `@sovereignfs/pwa`                                      | P1       | 17.1                | ✅     |
| 54  | [17.3](docs/epics/alignment.md) | Sign-in and `@sovereignfs/auth`                                         | P2       | 17.1                | ✅     |
| 55  | [17.5](docs/epics/alignment.md) | Sign-in on `@sovereignfs/auth`                                          | P0       | 16.10, 16.13, 16.14 | ✅     |
| 56  | [16.13](docs/epics/upstream.md) | A SQLite and sqld database for `@sovereignfs/auth` (`sovereign`)        | P3       | —                   | 📋     |
| 57  | [16.14](docs/epics/upstream.md) | An app's password accounts, across to `@sovereignfs/auth` (`sovereign`) | P3       | —                   | 📋     |
| 58  | [17.4](docs/epics/alignment.md) | Stale lines and the settings table                                      | P2       | —                   | ✅     |
| 59  | [16.11](docs/epics/upstream.md) | The contracts and the guide, true (`sovereign`)                         | P3       | —                   | 📋     |
| 60  | [16.12](docs/epics/upstream.md) | Background Sync in `@sovereignfs/pwa` (`sovereign`)                     | P2       | —                   | 📋     |

### Milestone S — Encryption the server cannot read

[RFC 0001](docs/rfcs/0001-encryption-the-server-cannot-read.md). **Done when** a random marker written as every encrypted field is found in no row
and no file on all three databases, both kinds of account unlock and share, and a 0.1.0 database upgrades with nothing lost.

| #   | ID                                | Task                                                          | Priority | Depends on      | Status |
| --- | --------------------------------- | ------------------------------------------------------------- | -------- | --------------- | ------ |
| 61  | [18.1](docs/epics/encryption.md)  | The design                                                    | P0       | 17.1            | ✅     |
| 62  | [18.2](docs/epics/encryption.md)  | Shopper's own vault                                           | P0       | 18.1            | ✅     |
| 63  | [16.10](docs/epics/upstream.md)   | The key secret over an app's own session (`sovereign`)        | P0       | —               | 📋     |
| 64  | [18.3](docs/epics/encryption.md)  | Key release through core                                      | P0       | 18.1, 16.10     | ✅     |
| 65  | [18.4](docs/epics/encryption.md)  | The key in the page                                           | P0       | 18.2, 18.3      | ✅     |
| 66  | [18.5](docs/epics/encryption.md)  | Household keys                                                | P0       | 18.4            | ✅     |
| 67  | [18.6](docs/epics/encryption.md)  | Content encrypted in sync                                     | P0       | 18.5            | ✅     |
| 68  | [18.11](docs/epics/encryption.md) | The server seals only what it must                            | P1       | 18.6            | 🚧     |
| 69  | [18.7](docs/epics/encryption.md)  | Invitations carry the key                                     | P0       | 18.5, 3.4       | ✅     |
| 70  | [16.8](docs/epics/upstream.md)    | Sharing in an app with no core (`sovereign`)                  | P1       | —               | 📋     |
| 71  | [16.9](docs/epics/upstream.md)    | A document key by link (`sovereign`)                          | P3       | —               | 📋     |
| 72  | [16.15](docs/epics/upstream.md)   | Wrapping a document key under one's own app key (`sovereign`) | P2       | —               | 📋     |
| 73  | [16.16](docs/epics/upstream.md)   | Key release in the SDK's fake core (`sovereign`)              | P3       | —               | 📋     |
| 74  | [18.8](docs/epics/encryption.md)  | Leaving and removing make a new key                           | P1       | 18.7, 3.5, 16.8 | 🚧     |
| 75  | [18.9](docs/epics/encryption.md)  | The screens                                                   | P1       | 18.4, 18.5      | ✅     |
| 76  | [18.10](docs/epics/encryption.md) | Moving 0.1.0's households                                     | P0       | 18.6            | ✅     |

### Milestone T — Push

[RFC 0002](docs/rfcs/0002-web-push.md). **Done when** a push reaches a subscribed browser once, alone and hosted, and turning it off stops it.

| #   | ID                         | Task                                    | Priority | Depends on  | Status |
| --- | -------------------------- | --------------------------------------- | -------- | ----------- | ------ |
| 77  | [19.1](docs/epics/push.md) | Push on the server                      | P1       | 17.1, 18.11 | ✅     |
| 78  | [19.2](docs/epics/push.md) | The worker, the page and the first kind | P1       | 19.1, 17.2  | ✅     |

### Milestone U — Exports and backups

[RFC 0003](docs/rfcs/0003-exports-and-backups.md). **Done when** core's export of a person holds Shopper's part, alone a person and the operator each
take theirs, and an export imports into a second account.

| #   | ID                            | Task                                                   | Priority | Depends on | Status |
| --- | ----------------------------- | ------------------------------------------------------ | -------- | ---------- | ------ |
| 79  | [20.1](docs/epics/exports.md) | Core's export of a person                              | P1       | 17.1, 18.6 | ✅     |
| 80  | [20.2](docs/epics/exports.md) | A person's export with no core (form replaced by 22.8) | P1       | 20.1       | 🚧     |
| 81  | [20.3](docs/epics/exports.md) | The app's export for its operator                      | P2       | 20.2       | 🚧     |
| 82  | [20.4](docs/epics/exports.md) | Import                                                 | P2       | 20.2       | 🚧     |
| 83  | [20.5](docs/epics/exports.md) | Backups, written down                                  | P2       | 18.2       | ✅     |

### Milestone V — The release of workstream 0001

**Done when** it is published and hosted, with a security review of what changed.

| #   | ID                                | Task                           | Priority | Depends on               | Status |
| --- | --------------------------------- | ------------------------------ | -------- | ------------------------ | ------ |
| 84  | [18.12](docs/epics/encryption.md) | The marker test and the review | P0       | 18.6–18.11, 19.2, 20.4   | ✅     |
| 85  | [12.7](docs/epics/release.md)     | The release of workstream 0001 | P2       | Milestones R to U, 18.12 | ⏳     |

## Lists of their own

[RFC 0004](docs/rfcs/0004-lists-of-their-own.md): a list is what is shared, and nothing else; the group that holds a person's lists is never shown.
**Done when** someone on one list sees nothing else of its group, and the phone's screens are clear.

| #   | ID                          | Task                                 | Priority | Depends on | Status |
| --- | --------------------------- | ------------------------------------ | -------- | ---------- | ------ |
| 86  | [21.1](docs/epics/lists.md) | The design                           | P0       | —          | ✅     |
| 87  | [21.2](docs/epics/lists.md) | A list's people, and the leak closed | P0       | 21.1       | ✅     |
| 88  | [21.3](docs/epics/lists.md) | A list's catalog                     | P0       | 21.2       | ✅     |
| 89  | [21.4](docs/epics/lists.md) | A list's keys                        | P0       | 21.3       | ✅     |
| 90  | [21.5](docs/epics/lists.md) | Screens without households           | P1       | 21.2       | ✅     |
| 91  | [21.6](docs/epics/lists.md) | The phone                            | P1       | 21.5       | ✅     |

## Workstream 0002 — the suite's frame, Home, Inventory and cards

[Workstream 0002](docs/workstreams/0002-frame-home-cards.md): RFC [0005](docs/rfcs/0005-the-frame-settings-and-screens.md),
[0006](docs/rfcs/0006-home-and-inventory.md) and [0007](docs/rfcs/0007-loyalty-cards.md), after 12.7 and before phase 2. `DESIGN.md` says what these rows
build (22.1, 23.1, 24.1), reviewed by the owner. **Done when** its release (12.8) is published: Shopper's frame and Settings are the design
system's, `/` opens Home, Inventory and loyalty cards work, alone and in a suite.

### Milestone W — The design, and what `sovereign` builds

| #   | ID                              | Task                                               | Priority | Depends on   | Status |
| --- | ------------------------------- | -------------------------------------------------- | -------- | ------------ | ------ |
| 92  | [22.1](docs/epics/frame.md)     | The design: the frame and the screens              | P0       | 12.7         | ✅     |
| 93  | [23.1](docs/epics/inventory.md) | The design: Home and Inventory                     | P0       | 22.1         | ✅     |
| 94  | [24.1](docs/epics/cards.md)     | The design: loyalty cards                          | P0       | 22.1         | ✅     |
| 95  | [16.17](docs/epics/upstream.md) | `prompt=create` (`sovereign`)                      | P3       | —            | ⏳     |
| 96  | [16.18](docs/epics/upstream.md) | Icons: `square-pen`, and more (`sovereign`)        | P1       | —            | ⏳     |
| 97  | [16.19](docs/epics/upstream.md) | `SettingsDialog` (`sovereign`)                     | P1       | —            | ⏳     |
| 98  | [16.20](docs/epics/upstream.md) | `Header` with the app's own brand (`sovereign`)    | P1       | —            | ⏳     |
| 99  | [16.21](docs/epics/upstream.md) | `AppSidebar` (`sovereign`)                         | P1       | —            | ⏳     |
| 100 | [16.22](docs/epics/upstream.md) | `AppFrame` (`sovereign`)                           | P1       | 16.20, 16.21 | ⏳     |
| 101 | [16.23](docs/epics/upstream.md) | The apps a person can open (`sovereign`)           | P1       | —            | ⏳     |
| 102 | [16.24](docs/epics/upstream.md) | `MobileFooter`'s middle button named (`sovereign`) | P1       | —            | ⏳     |
| 103 | [16.25](docs/epics/upstream.md) | `Barcode` (`sovereign`)                            | P1       | —            | ⏳     |
| 104 | [16.26](docs/epics/upstream.md) | Writing an export in the browser (`sovereign`)     | P3       | —            | ⏳     |

### Milestone X — Sign-in, Settings and a list

**Done when** both modes sign in as decided, Settings and a list's settings are the dialog, and a list has its icon, header, item column and titles.

| #   | ID                           | Task                            | Priority | Depends on  | Status |
| --- | ---------------------------- | ------------------------------- | -------- | ----------- | ------ |
| 105 | [22.2](docs/epics/frame.md)  | Sign-in by mode                 | P0       | 22.1        | ✅     |
| 106 | [22.3](docs/epics/frame.md)  | A list's icon and colour        | P1       | 22.1, 16.18 | ✅     |
| 107 | [22.4](docs/epics/frame.md)  | The list's header               | P1       | 22.1        | ✅     |
| 108 | [22.5](docs/epics/frame.md)  | A list's settings in the dialog | P1       | 22.3, 16.19 | ✅     |
| 109 | [22.6](docs/epics/frame.md)  | The item beside its list        | P1       | 22.1, 16.18 | ✅     |
| 110 | [22.7](docs/epics/frame.md)  | Settings as a dialog, by mode   | P1       | 22.2, 16.19 | ✅     |
| 111 | [22.8](docs/epics/frame.md)  | A readable export               | P1       | 22.7        | ✅     |
| 112 | [22.9](docs/epics/frame.md)  | Shop mode                       | P1       | 22.3        | ✅     |
| 113 | [22.10](docs/epics/frame.md) | Page titles                     | P2       | 22.1        | ✅     |

### Milestone Y — The frame, Home and Inventory

**Done when** the frame is the design system's, `/` opens Home, and Inventory works alone and in suggestions.

| #   | ID                              | Task                     | Priority | Depends on        | Status |
| --- | ------------------------------- | ------------------------ | -------- | ----------------- | ------ |
| 114 | [22.11](docs/epics/frame.md)    | The suite's frame        | P1       | 22.3, 16.20–16.24 | ✅     |
| 115 | [23.2](docs/epics/inventory.md) | Home                     | P1       | 23.1, 22.3, 22.11 | ✅     |
| 116 | [23.3](docs/epics/inventory.md) | Inventory: the data      | P1       | 23.1              | ✅     |
| 117 | [23.4](docs/epics/inventory.md) | Inventory: the screen    | P1       | 23.3, 22.6, 22.11 | ✅     |
| 118 | [23.5](docs/epics/inventory.md) | Inventory in suggestions | P1       | 23.3              | ✅     |

### Milestone Z — Loyalty cards, and the release

**Done when** a card is scanned, shown, shared and opened from Shop mode, and the release is published with a security review.

| #   | ID                            | Task                              | Priority | Depends on              | Status |
| --- | ----------------------------- | --------------------------------- | -------- | ----------------------- | ------ |
| 119 | [24.2](docs/epics/cards.md)   | Cards: the data and the keys      | P1       | 24.1                    | ⏳     |
| 120 | [24.3](docs/epics/cards.md)   | The cards screen, and showing one | P1       | 24.2, 22.11, 16.25      | 📋     |
| 121 | [24.4](docs/epics/cards.md)   | Scanning a card                   | P1       | 24.3                    | 📋     |
| 122 | [24.5](docs/epics/cards.md)   | Sharing a card                    | P1       | 24.2                    | 📋     |
| 123 | [24.6](docs/epics/cards.md)   | Cards on a list, in Shop mode     | P2       | 24.3, 22.5, 22.9        | 📋     |
| 124 | [12.8](docs/epics/release.md) | The release of workstream 0002    | P2       | Milestones W to Z, 12.7 | 📋     |

## Phase 2 — households, trips and the rest

What `DESIGN.md` §2.2 leaves out of 0.1.0, built after workstreams 0001 (12.7) and 0002 (12.8). The milestones are in the order that gets the most to people first; the order within a milestone is
recommended, and a milestone can start when its dependencies are met. Detailed at the start of phase 2, after 0.1.0.

### Milestone J — Households

More than one household, named and managed; the catalog and the aisle order tidied by hand. **Done when** a person makes a household, moves a list into
it, invites others, changes their roles, and edits categories and products.

| #   | ID                              | Task                                                              | Priority | Depends on          | Status |
| --- | ------------------------------- | ----------------------------------------------------------------- | -------- | ------------------- | ------ |
| 125 | [16.3](docs/epics/upstream.md)  | `AvatarStack` (`sovereign`)                                       | P1       | —                   | 📋     |
| 126 | [3.8](docs/epics/households.md) | Making households                                                 | P1       | 3.2, 8.1            | 📋     |
| 127 | [3.9](docs/epics/households.md) | Roles, and deleting a household                                   | P1       | 3.5                 | 📋     |
| 128 | [4.7](docs/epics/catalog.md)    | Editing categories and the aisle order (superseded by 23.3, 23.4) | P1       | 4.2, 5.2            | ➖     |
| 129 | [5.6](docs/epics/items.md)      | Products: editing and merging                                     | P1       | 5.3                 | 📋     |
| 130 | [8.6](docs/epics/screens.md)    | The catalog (superseded by 23.4)                                  | P1       | 8.1, 5.6, 4.7       | ➖     |
| 131 | [8.5](docs/epics/screens.md)    | All lists (superseded by 23.2)                                    | P1       | 8.2                 | ➖     |
| 132 | [3.6](docs/epics/households.md) | Moving a list between households                                  | P1       | 3.8, 3.9, 5.6       | 📋     |
| 133 | [8.9](docs/epics/screens.md)    | Household settings                                                | P1       | 8.7, 3.8, 3.9, 16.3 | 📋     |

### Milestone K — Trips and prices

What was bought, where and for how much. **Done when** journeys 6 to 9 of `DESIGN.md` §3 pass as written, with the network off for the whole of
shopping mode.

| #   | ID                            | Task                             | Priority | Depends on     | Status |
| --- | ----------------------------- | -------------------------------- | -------- | -------------- | ------ |
| 134 | [4.9](docs/epics/catalog.md)  | Money and unit prices            | P1       | 4.6            | 📋     |
| 135 | [7.1](docs/epics/trips.md)    | Trips and trip lines             | P1       | 5.5, 4.9, 3.8  | 📋     |
| 136 | [7.2](docs/epics/trips.md)    | Finishing trips and clearing     | P1       | 7.1, 1.6       | 📋     |
| 137 | [8.10](docs/epics/screens.md) | Prices in the item and the lists | P1       | 7.1, 8.4       | 📋     |
| 138 | [7.6](docs/epics/trips.md)    | Shopping mode, with trips        | P1       | 7.3, 7.2, 8.10 | 📋     |
| 139 | [7.4](docs/epics/trips.md)    | Shopping several lists           | P2       | 7.6            | 📋     |
| 140 | [7.5](docs/epics/trips.md)    | The trips history                | P1       | 7.1, 8.1       | 📋     |

### Milestone L — Mail, notices and invitations by email

People hear about what concerns them, and no more. **Done when** each kind of notice reaches the right people through the bell and, where on, by
email, never the person who acted, a burst of adds becomes one digest, and journey 3 of `DESIGN.md` §3 passes as written, by email.

| #   | ID                               | Task                                      | Priority | Depends on     | Status |
| --- | -------------------------------- | ----------------------------------------- | -------- | -------------- | ------ |
| 141 | [9.1](docs/epics/notices.md)     | The mail outbox                           | P1       | 1.6            | 📋     |
| 142 | [3.10](docs/epics/households.md) | Inviting by email                         | P1       | 3.4, 9.1       | 📋     |
| 143 | [16.1](docs/epics/upstream.md)   | `AUTH_SIGNUP` by invitation (`sovereign`) | P1       | —              | 📋     |
| 144 | [2.7](docs/epics/accounts.md)    | The sign-up policy                        | P1       | 2.1, 16.1      | 📋     |
| 145 | [9.2](docs/epics/notices.md)     | Notices and the bell                      | P1       | 5.2, 8.1, 3.5  | 📋     |
| 146 | [9.3](docs/epics/notices.md)     | The items-added digest                    | P2       | 9.2, 1.6       | 📋     |
| 147 | [9.4](docs/epics/notices.md)     | Preferences and delivery                  | P1       | 9.2, 9.1       | 📋     |
| 148 | [19.3](docs/epics/push.md)       | Push as a channel of notices              | P2       | 19.2, 9.2, 9.4 | 📋     |

### Milestone M — Fresher, and further

Live updates, the phone's Add button, the rest of sign-in, typing faster, and a bigger starter catalog. **Done when** with Live chosen a change on one
device shows on another within two seconds, and the rest of this milestone's tasks hold their own acceptance.

| #   | ID                             | Task                                                  | Priority | Depends on | Status |
| --- | ------------------------------ | ----------------------------------------------------- | -------- | ---------- | ------ |
| 149 | [6.4](docs/epics/sync.md)      | Live updates and the freshness setting                | P1       | 6.2        | 📋     |
| 150 | [6.6](docs/epics/sync.md)      | Keeping the history small                             | P2       | 6.1, 1.6   | 📋     |
| 151 | [16.5](docs/epics/upstream.md) | A floating action button (`sovereign`)                | P1       | —          | 📋     |
| 152 | [8.11](docs/epics/screens.md)  | The phone's Add button                                | P1       | 8.8, 16.5  | 📋     |
| 153 | [2.8](docs/epics/accounts.md)  | Passkeys and the authenticator app                    | P2       | 2.1        | 📋     |
| 154 | [2.9](docs/epics/accounts.md)  | Linking core and a local account (superseded by 22.2) | P2       | 2.3        | ➖     |
| 155 | [4.5](docs/epics/catalog.md)   | Reading what is typed                                 | P2       | 4.6, 4.3   | 📋     |
| 156 | [16.4](docs/epics/upstream.md) | Grocery icons (`sovereign`)                           | P1       | —          | 📋     |
| 157 | [4.8](docs/epics/catalog.md)   | Growing the starter catalog                           | P2       | 4.3, 16.4  | 📋     |

### Milestone N — The suite, and the person's data

More of core, and a person can leave or arrive with their history. **Done when** it notifies through core's bell and email, invites from the
directory, and a plugin export imports (a person's households round-trip through a file from 20.4).

| #   | ID                                | Task                              | Priority | Depends on | Status |
| --- | --------------------------------- | --------------------------------- | -------- | ---------- | ------ |
| 158 | [10.1](docs/epics/suite.md)       | Core's bell, email, activity      | P2       | 2.3, 9.4   | 📋     |
| 159 | [10.2](docs/epics/suite.md)       | Inviting from the directory       | P2       | 2.3, 3.4   | 📋     |
| 160 | [11.1](docs/epics/portability.md) | Export (superseded by 20.1, 20.2) | P2       | 7.1, 3.9   | ➖     |
| 161 | [11.2](docs/epics/portability.md) | Import (superseded by 20.4)       | P2       | 11.1       | ➖     |
| 162 | [11.3](docs/epics/portability.md) | Import from the plugin            | P2       | 20.4, 4.8  | 📋     |

### Milestone O — The release of phase 2

**Done when** phase 2's release is published and hosted.

| #   | ID                            | Task              | Priority | Depends on              | Status |
| --- | ----------------------------- | ----------------- | -------- | ----------------------- | ------ |
| 163 | [12.6](docs/epics/release.md) | Phase 2's release | P2       | 12.8, Milestones J to N | 📋     |

## Phase 3 — the pantry and routines

### Milestone P — Pantry, routines, shops and insights

`DESIGN.md` §22.2. **Done when** phase 3's release is published: a household keeps a pantry with low points, staples, repeating items and templates; shops have
their own learned aisle order; insights have charts.

| #   | ID                             | Task                                       | Priority | Depends on | Status |
| --- | ------------------------------ | ------------------------------------------ | -------- | ---------- | ------ |
| 164 | [13.1](docs/epics/pantry.md)   | The pantry and low points                  | P1       | 12.6       | 📋     |
| 165 | [13.2](docs/epics/pantry.md)   | Staples                                    | P1       | 12.6       | 📋     |
| 166 | [13.3](docs/epics/pantry.md)   | Repeating items                            | P1       | 12.6       | 📋     |
| 167 | [13.4](docs/epics/pantry.md)   | Templates                                  | P2       | 12.6       | 📋     |
| 168 | [13.5](docs/epics/pantry.md)   | Shops with their own aisle order           | P1       | 12.6       | 📋     |
| 169 | [13.6](docs/epics/pantry.md)   | Prices per shop and over time              | P2       | 13.5       | 📋     |
| 170 | [16.6](docs/epics/upstream.md) | Charts (`sovereign`)                       | P1       | —          | 📋     |
| 171 | [13.7](docs/epics/pantry.md)   | Insights                                   | P1       | 13.6, 16.6 | 📋     |
| 172 | [13.8](docs/epics/pantry.md)   | Push notifications (superseded by epic 19) | P2       | 12.6       | ➖     |
| 173 | [13.9](docs/epics/pantry.md)   | Phase 3's release                          | P2       | 13.1–13.7  | 📋     |

## Phase 4 — capture

### Milestone Q — Barcodes, photos and receipts

`DESIGN.md` §22.3. **Done when** phase 4's release is published: scanning a barcode in a shop finds or makes a product with no network needed for a known one, and
photos and receipts are stored sealed by Shopper itself.

| #   | ID                            | Task                         | Priority | Depends on | Status |
| --- | ----------------------------- | ---------------------------- | -------- | ---------- | ------ |
| 174 | [14.1](docs/epics/capture.md) | Barcode scanning             | P1       | 13.9       | 📋     |
| 175 | [14.2](docs/epics/capture.md) | Lookup by barcode            | P2       | 14.1       | 📋     |
| 176 | [14.3](docs/epics/capture.md) | The media store              | P1       | 13.9       | 📋     |
| 177 | [14.4](docs/epics/capture.md) | Photos on products and items | P2       | 14.3       | 📋     |
| 178 | [14.5](docs/epics/capture.md) | Receipts on trips            | P1       | 14.3       | 📋     |
| 179 | [14.6](docs/epics/capture.md) | Phase 4's release            | P2       | 14.1–14.5  | 📋     |

## Later — candidates

None committed (`DESIGN.md` §22.4). Each waits on a decision before it is planned in detail.

| #   | ID                          | Task                               | Priority | Depends on | Status |
| --- | --------------------------- | ---------------------------------- | -------- | ---------- | ------ |
| 180 | [15.1](docs/epics/later.md) | Encrypted backup to Git            | P3       | 20.3       | 🚧     |
| 181 | [15.2](docs/epics/later.md) | Sending a trip to Ledger or Tally  | P3       | 7.5        | 🚧     |
| 182 | [15.3](docs/epics/later.md) | AI through the instance's provider | P3       | —          | 🚧     |
| 183 | [15.4](docs/epics/later.md) | Other languages                    | P3       | 4.3, 4.5   | 🚧     |
| 184 | [15.5](docs/epics/later.md) | A standalone instance into a suite | P3       | 22.2       | 🚧     |
| 185 | [15.6](docs/epics/later.md) | Cards to and from Wallet           | P3       | 24.2       | 🚧     |

## Upstream, not placed above

| #   | ID                             | Task                                         | Priority | Depends on | Status |
| --- | ------------------------------ | -------------------------------------------- | -------- | ---------- | ------ |
| 186 | [16.7](docs/epics/upstream.md) | `MoneyInput` (`sovereign`), if Tally's lands | P3       | —          | 📋     |

16.4 (grocery icons, row 156) is needed by 4.8 and is started during phase 1, so that it is released by then. 16.1, 16.3 and 16.5 are started in the same
way, a milestone ahead of the task that waits on them.
