# Roadmap

The order of work. **This file tracks progress; it does not define behaviour.** [`DESIGN.md`](DESIGN.md) says what Shopper does, and where it
disagrees with this file, this file is stale and should be corrected. The detail of every task, with its technical notes and what makes it done, is in
[`docs/epics/`](docs/epics/). How a task is run is in [`AGENTS.md`](AGENTS.md).

State as of 2026-11-21: **phase 1 built and 0.1.0 tagged; [workstream 0001](docs/workstreams/0001-suite-model.md) planned before phase 2.** The
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

| #   | ID                              | Task                                                             | Priority | Depends on | Status |
| --- | ------------------------------- | ---------------------------------------------------------------- | -------- | ---------- | ------ |
| 52  | [17.1](docs/epics/alignment.md) | The packages, current                                            | P0       | —          | ✅     |
| 53  | [17.2](docs/epics/alignment.md) | The worker from `@sovereignfs/pwa`                               | P1       | 17.1       | ✅     |
| 54  | [17.3](docs/epics/alignment.md) | Sign-in and `@sovereignfs/auth`                                  | P2       | 17.1       | ⏳     |
| 55  | [17.5](docs/epics/alignment.md) | Sign-in on `@sovereignfs/auth`                                   | P0       | 17.3, 17.1 | 📋     |
| 56  | [16.13](docs/epics/upstream.md) | A SQLite and sqld database for `@sovereignfs/auth` (`sovereign`) | P3       | —          | 📋     |
| 57  | [17.4](docs/epics/alignment.md) | Stale lines and the settings table                               | P2       | —          | ✅     |
| 58  | [16.11](docs/epics/upstream.md) | The contracts and the guide, true (`sovereign`)                  | P3       | —          | 📋     |
| 59  | [16.12](docs/epics/upstream.md) | Background Sync in `@sovereignfs/pwa` (`sovereign`)              | P2       | —          | 📋     |

### Milestone S — Encryption the server cannot read

[RFC 0001](docs/rfcs/0001-encryption-the-server-cannot-read.md). **Done when** a random marker written as every encrypted field is found in no row
and no file on all three databases, both kinds of account unlock and share, and a 0.1.0 database upgrades with nothing lost.

| #   | ID                                | Task                                                   | Priority | Depends on      | Status |
| --- | --------------------------------- | ------------------------------------------------------ | -------- | --------------- | ------ |
| 60  | [18.1](docs/epics/encryption.md)  | The design                                             | P0       | 17.1            | 📋     |
| 61  | [18.2](docs/epics/encryption.md)  | Shopper's own vault                                    | P0       | 18.1, 17.5      | 📋     |
| 62  | [16.10](docs/epics/upstream.md)   | The key secret over an app's own session (`sovereign`) | P0       | —               | 📋     |
| 63  | [18.3](docs/epics/encryption.md)  | Key release through core                               | P0       | 18.1, 16.10     | 📋     |
| 64  | [18.4](docs/epics/encryption.md)  | The key in the page                                    | P0       | 18.2, 18.3      | 📋     |
| 65  | [18.5](docs/epics/encryption.md)  | Household keys                                         | P0       | 18.4            | 📋     |
| 66  | [18.6](docs/epics/encryption.md)  | Content encrypted in sync                              | P0       | 18.5            | 📋     |
| 67  | [18.11](docs/epics/encryption.md) | The server seals only what it must                     | P1       | 18.6            | 📋     |
| 68  | [18.7](docs/epics/encryption.md)  | Invitations carry the key                              | P0       | 18.5, 3.4       | 📋     |
| 69  | [16.8](docs/epics/upstream.md)    | Sharing in an app with no core (`sovereign`)           | P1       | —               | 📋     |
| 70  | [16.9](docs/epics/upstream.md)    | A document key by link (`sovereign`)                   | P3       | —               | 📋     |
| 71  | [18.8](docs/epics/encryption.md)  | Leaving and removing make a new key                    | P1       | 18.7, 3.5, 16.8 | 📋     |
| 72  | [18.9](docs/epics/encryption.md)  | The screens                                            | P1       | 18.4, 18.5      | 📋     |
| 73  | [18.10](docs/epics/encryption.md) | Moving 0.1.0's households                              | P0       | 18.6            | 📋     |

### Milestone T — Push

[RFC 0002](docs/rfcs/0002-web-push.md). **Done when** a push reaches a subscribed browser once, alone and hosted, and turning it off stops it.

| #   | ID                         | Task                                    | Priority | Depends on  | Status |
| --- | -------------------------- | --------------------------------------- | -------- | ----------- | ------ |
| 74  | [19.1](docs/epics/push.md) | Push on the server                      | P1       | 17.1, 18.11 | 📋     |
| 75  | [19.2](docs/epics/push.md) | The worker, the page and the first kind | P1       | 19.1, 17.2  | 📋     |

### Milestone U — Exports and backups

[RFC 0003](docs/rfcs/0003-exports-and-backups.md). **Done when** core's export of a person holds Shopper's part, alone a person and the operator each
take theirs, and an export imports into a second account.

| #   | ID                            | Task                              | Priority | Depends on | Status |
| --- | ----------------------------- | --------------------------------- | -------- | ---------- | ------ |
| 76  | [20.1](docs/epics/exports.md) | Core's export of a person         | P1       | 17.1, 18.6 | 📋     |
| 77  | [20.2](docs/epics/exports.md) | A person's export with no core    | P1       | 20.1       | 📋     |
| 78  | [20.3](docs/epics/exports.md) | The app's export for its operator | P2       | 20.2       | 📋     |
| 79  | [20.4](docs/epics/exports.md) | Import                            | P2       | 20.2       | 📋     |
| 80  | [20.5](docs/epics/exports.md) | Backups, written down             | P2       | 18.2       | 📋     |

### Milestone V — The release of workstream 0001

**Done when** it is published and hosted, with a security review of what changed.

| #   | ID                                | Task                           | Priority | Depends on               | Status |
| --- | --------------------------------- | ------------------------------ | -------- | ------------------------ | ------ |
| 81  | [18.12](docs/epics/encryption.md) | The marker test and the review | P0       | 18.6–18.11, 19.2, 20.4   | 📋     |
| 82  | [12.7](docs/epics/release.md)     | The release of workstream 0001 | P2       | Milestones R to U, 18.12 | 📋     |

## Phase 2 — households, trips and the rest

What `DESIGN.md` §2.2 leaves out of 0.1.0, built after workstream 0001 (12.7). The milestones are in the order that gets the most to people first; the order within a milestone is
recommended, and a milestone can start when its dependencies are met. Detailed at the start of phase 2, after 0.1.0.

### Milestone J — Households

More than one household, named and managed; the catalog and the aisle order tidied by hand. **Done when** a person makes a household, moves a list into
it, invites others, changes their roles, and edits categories and products.

| #   | ID                              | Task                                   | Priority | Depends on          | Status |
| --- | ------------------------------- | -------------------------------------- | -------- | ------------------- | ------ |
| 83  | [16.3](docs/epics/upstream.md)  | `AvatarStack` (`sovereign`)            | P1       | —                   | 📋     |
| 84  | [3.8](docs/epics/households.md) | Making households                      | P1       | 3.2, 8.1            | 📋     |
| 85  | [3.9](docs/epics/households.md) | Roles, and deleting a household        | P1       | 3.5                 | 📋     |
| 86  | [4.7](docs/epics/catalog.md)    | Editing categories and the aisle order | P1       | 4.2, 5.2            | 📋     |
| 87  | [5.6](docs/epics/items.md)      | Products: editing and merging          | P1       | 5.3                 | 📋     |
| 88  | [8.6](docs/epics/screens.md)    | The catalog                            | P1       | 8.1, 5.6, 4.7       | 📋     |
| 89  | [8.5](docs/epics/screens.md)    | All lists                              | P1       | 8.2                 | 📋     |
| 90  | [3.6](docs/epics/households.md) | Moving a list between households       | P1       | 3.8, 3.9, 5.6       | 📋     |
| 91  | [8.9](docs/epics/screens.md)    | Household settings                     | P1       | 8.7, 3.8, 3.9, 16.3 | 📋     |

### Milestone K — Trips and prices

What was bought, where and for how much. **Done when** journeys 6 to 9 of `DESIGN.md` §3 pass as written, with the network off for the whole of
shopping mode.

| #   | ID                            | Task                             | Priority | Depends on     | Status |
| --- | ----------------------------- | -------------------------------- | -------- | -------------- | ------ |
| 92  | [4.9](docs/epics/catalog.md)  | Money and unit prices            | P1       | 4.6            | 📋     |
| 93  | [7.1](docs/epics/trips.md)    | Trips and trip lines             | P1       | 5.5, 4.9, 3.8  | 📋     |
| 94  | [7.2](docs/epics/trips.md)    | Finishing trips and clearing     | P1       | 7.1, 1.6       | 📋     |
| 95  | [8.10](docs/epics/screens.md) | Prices in the item and the lists | P1       | 7.1, 8.4       | 📋     |
| 96  | [7.6](docs/epics/trips.md)    | Shopping mode, with trips        | P1       | 7.3, 7.2, 8.10 | 📋     |
| 97  | [7.4](docs/epics/trips.md)    | Shopping several lists           | P2       | 7.6            | 📋     |
| 98  | [7.5](docs/epics/trips.md)    | The trips history                | P1       | 7.1, 8.1       | 📋     |

### Milestone L — Mail, notices and invitations by email

People hear about what concerns them, and no more. **Done when** each kind of notice reaches the right people through the bell and, where on, by
email, never the person who acted, a burst of adds becomes one digest, and journey 3 of `DESIGN.md` §3 passes as written, by email.

| #   | ID                               | Task                                      | Priority | Depends on     | Status |
| --- | -------------------------------- | ----------------------------------------- | -------- | -------------- | ------ |
| 99  | [9.1](docs/epics/notices.md)     | The mail outbox                           | P1       | 1.6            | 📋     |
| 100 | [3.10](docs/epics/households.md) | Inviting by email                         | P1       | 3.4, 9.1       | 📋     |
| 101 | [16.1](docs/epics/upstream.md)   | `AUTH_SIGNUP` by invitation (`sovereign`) | P1       | —              | 📋     |
| 102 | [2.7](docs/epics/accounts.md)    | The sign-up policy                        | P1       | 2.1, 16.1      | 📋     |
| 103 | [9.2](docs/epics/notices.md)     | Notices and the bell                      | P1       | 5.2, 8.1, 3.5  | 📋     |
| 104 | [9.3](docs/epics/notices.md)     | The items-added digest                    | P2       | 9.2, 1.6       | 📋     |
| 105 | [9.4](docs/epics/notices.md)     | Preferences and delivery                  | P1       | 9.2, 9.1       | 📋     |
| 106 | [19.3](docs/epics/push.md)       | Push as a channel of notices              | P2       | 19.2, 9.2, 9.4 | 📋     |

### Milestone M — Fresher, and further

Live updates, the phone's Add button, the rest of sign-in, typing faster, and a bigger starter catalog. **Done when** with Live chosen a change on one
device shows on another within two seconds, and the rest of this milestone's tasks hold their own acceptance.

| #   | ID                             | Task                                   | Priority | Depends on | Status |
| --- | ------------------------------ | -------------------------------------- | -------- | ---------- | ------ |
| 107 | [6.4](docs/epics/sync.md)      | Live updates and the freshness setting | P1       | 6.2        | 📋     |
| 108 | [6.6](docs/epics/sync.md)      | Keeping the history small              | P2       | 6.1, 1.6   | 📋     |
| 109 | [16.5](docs/epics/upstream.md) | A floating action button (`sovereign`) | P1       | —          | 📋     |
| 110 | [8.11](docs/epics/screens.md)  | The phone's Add button                 | P1       | 8.8, 16.5  | 📋     |
| 111 | [2.8](docs/epics/accounts.md)  | Passkeys and the authenticator app     | P2       | 2.1        | 📋     |
| 112 | [2.9](docs/epics/accounts.md)  | Linking core and a local account       | P2       | 2.3        | 📋     |
| 113 | [4.5](docs/epics/catalog.md)   | Reading what is typed                  | P2       | 4.6, 4.3   | 📋     |
| 114 | [16.4](docs/epics/upstream.md) | Grocery icons (`sovereign`)            | P1       | —          | 📋     |
| 115 | [4.8](docs/epics/catalog.md)   | Growing the starter catalog            | P2       | 4.3, 16.4  | 📋     |

### Milestone N — The suite, and the person's data

More of core, and a person can leave or arrive with their history. **Done when** it notifies through core's bell and email, invites from the
directory, and a plugin export imports (a person's households round-trip through a file from 20.4).

| #   | ID                                | Task                              | Priority | Depends on | Status |
| --- | --------------------------------- | --------------------------------- | -------- | ---------- | ------ |
| 116 | [10.1](docs/epics/suite.md)       | Core's bell, email, activity      | P2       | 2.3, 9.4   | 📋     |
| 117 | [10.2](docs/epics/suite.md)       | Inviting from the directory       | P2       | 2.3, 3.4   | 📋     |
| 118 | [11.1](docs/epics/portability.md) | Export (superseded by 20.1, 20.2) | P2       | 7.1, 3.9   | ➖     |
| 119 | [11.2](docs/epics/portability.md) | Import (superseded by 20.4)       | P2       | 11.1       | ➖     |
| 120 | [11.3](docs/epics/portability.md) | Import from the plugin            | P2       | 20.4, 4.8  | 📋     |

### Milestone O — The release of phase 2

**Done when** phase 2's release is published and hosted.

| #   | ID                            | Task              | Priority | Depends on              | Status |
| --- | ----------------------------- | ----------------- | -------- | ----------------------- | ------ |
| 121 | [12.6](docs/epics/release.md) | Phase 2's release | P2       | 12.7, Milestones J to N | 📋     |

## Phase 3 — the pantry and routines

### Milestone P — Pantry, routines, shops and insights

`DESIGN.md` §22.2. **Done when** phase 3's release is published: a household keeps a pantry with low points, staples, repeating items and templates; shops have
their own learned aisle order; insights have charts.

| #   | ID                             | Task                                       | Priority | Depends on | Status |
| --- | ------------------------------ | ------------------------------------------ | -------- | ---------- | ------ |
| 122 | [13.1](docs/epics/pantry.md)   | The pantry and low points                  | P1       | 12.6       | 📋     |
| 123 | [13.2](docs/epics/pantry.md)   | Staples                                    | P1       | 12.6       | 📋     |
| 124 | [13.3](docs/epics/pantry.md)   | Repeating items                            | P1       | 12.6       | 📋     |
| 125 | [13.4](docs/epics/pantry.md)   | Templates                                  | P2       | 12.6       | 📋     |
| 126 | [13.5](docs/epics/pantry.md)   | Shops with their own aisle order           | P1       | 12.6       | 📋     |
| 127 | [13.6](docs/epics/pantry.md)   | Prices per shop and over time              | P2       | 13.5       | 📋     |
| 128 | [16.6](docs/epics/upstream.md) | Charts (`sovereign`)                       | P1       | —          | 📋     |
| 129 | [13.7](docs/epics/pantry.md)   | Insights                                   | P1       | 13.6, 16.6 | 📋     |
| 130 | [13.8](docs/epics/pantry.md)   | Push notifications (superseded by epic 19) | P2       | 12.6       | ➖     |
| 131 | [13.9](docs/epics/pantry.md)   | Phase 3's release                          | P2       | 13.1–13.7  | 📋     |

## Phase 4 — capture

### Milestone Q — Barcodes, photos and receipts

`DESIGN.md` §22.3. **Done when** phase 4's release is published: scanning a barcode in a shop finds or makes a product with no network needed for a known one, and
photos and receipts are stored sealed by Shopper itself.

| #   | ID                            | Task                         | Priority | Depends on | Status |
| --- | ----------------------------- | ---------------------------- | -------- | ---------- | ------ |
| 132 | [14.1](docs/epics/capture.md) | Barcode scanning             | P1       | 13.9       | 📋     |
| 133 | [14.2](docs/epics/capture.md) | Lookup by barcode            | P2       | 14.1       | 📋     |
| 134 | [14.3](docs/epics/capture.md) | The media store              | P1       | 13.9       | 📋     |
| 135 | [14.4](docs/epics/capture.md) | Photos on products and items | P2       | 14.3       | 📋     |
| 136 | [14.5](docs/epics/capture.md) | Receipts on trips            | P1       | 14.3       | 📋     |
| 137 | [14.6](docs/epics/capture.md) | Phase 4's release            | P2       | 14.1–14.5  | 📋     |

## Later — candidates

None committed (`DESIGN.md` §22.4). Each waits on a decision before it is planned in detail.

| #   | ID                          | Task                               | Priority | Depends on | Status |
| --- | --------------------------- | ---------------------------------- | -------- | ---------- | ------ |
| 138 | [15.1](docs/epics/later.md) | Encrypted backup to Git            | P3       | 20.3       | 🚧     |
| 139 | [15.2](docs/epics/later.md) | Sending a trip to Ledger or Tally  | P3       | 7.5        | 🚧     |
| 140 | [15.3](docs/epics/later.md) | AI through the instance's provider | P3       | —          | 🚧     |
| 141 | [15.4](docs/epics/later.md) | Other languages                    | P3       | 4.3, 4.5   | 🚧     |

## Upstream, not placed above

| #   | ID                             | Task                                         | Priority | Depends on | Status |
| --- | ------------------------------ | -------------------------------------------- | -------- | ---------- | ------ |
| 142 | [16.7](docs/epics/upstream.md) | `MoneyInput` (`sovereign`), if Tally's lands | P3       | —          | 📋     |

16.4 (grocery icons, row 114) is needed by 4.8 and is started during phase 1, so that it is released by then. 16.1, 16.3 and 16.5 are started in the same
way, a milestone ahead of the task that waits on them.
