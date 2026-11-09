# Epics

A domain-first map of the work. An epic groups the tasks of one domain. [`ROADMAP.md`](../../ROADMAP.md) is the same tasks in the order they are
built, with their priority and status. [`DESIGN.md`](../../DESIGN.md) is what they build; where a task and the design disagree, the design wins and
the task is corrected.

## Conventions

- **Task IDs are permanent:** `<epic>.<n>`, for example `4.3`. Use them in dependency lists and cross-references. They never appear in branch names,
  commit messages or PR titles, and an ID is never reused, even for a task that was superseded.
- **One task, one branch, one draft PR.** A task is done when its "Accepts when" holds and its PR is merged.
- **Every task** has a Goal, a Design reference, what it Depends on, Technical detail, and Accepts when. Once done it gains **Done as**: how it was
  done, where, and what was left out.
- **On completion,** the task's heading here and its row in `ROADMAP.md` are marked ✅ in the same PR, and a change in behaviour adds a line to
  `CHANGELOG.md`.
- **Every task holds these without saying so:** a data-layer test passes on sqld, a `file:` database and PostgreSQL; a new route, operation or
  mutation is in `src/access/routes.ts` with a test calling it as a second person (once 3.2 is in); a new table is handled by `People.deletePerson`
  (once 2.5 is in) and by export and import (once 11.2 is in); a table holding a name, note, price or address seals it through `src/crypto/sealed.ts`
  and is added to `DESIGN.md` §13.1's table and its test (once 1.11 is in); a write goes through the one path (once 5.2 is in); a screen works with a
  keyboard, in light and dark, at a phone's width, and offline where `DESIGN.md` §12 says it does; no name, note, price or address reaches a log; a
  safeguard's test was seen to fail with it switched off.
- **Epic 16 is done in `sovereign`,** following that repository's conventions; its tasks here record what Shopper needs and are marked done when the
  release that carries it is published. Where Tally or Roam waits on the same part, one task in `sovereign` serves all.
- **Epic 15 holds candidates,** not plans: each waits on the owner's decision (🚧) before it is detailed.

_Status key: ✅ Done · ⏳ In progress · 📋 Planned · 🚧 Waits on a decision · ➖ Superseded_

## Epics

| #   | Epic                                    | What it holds                                                                                                        | Tasks |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | [Foundation](foundation.md)             | Tooling, CI, configuration, the database, encryption at rest, jobs, the shell, the image, the PWA                    | 12    |
| 2   | [Accounts and sign-in](accounts.md)     | Local and Sovereign sign-in, the sign-up policy, core's notices, deleting a person, landing, Settings                | 7     |
| 3   | [Households](households.md)             | Persons, households and access, your own household, invitations, roles and lifecycle, moving lists, limits           | 7     |
| 4   | [The catalog](catalog.md)               | Names and the name key, categories, units and icons, the starter catalog, suggestions, parsing, quantities and money | 6     |
| 5   | [Lists and items](items.md)             | Actions and validators, the write path with field merging, folding, lists, items, products                           | 6     |
| 6   | [Offline and sync](sync.md)             | The endpoint, the device's store, Couldn't sync, live updates and freshness, opening offline, pruning                | 6     |
| 7   | [Trips and shopping](trips.md)          | Trips and lines, finishing and clearing, shopping mode, several lists, the trips history                             | 5     |
| 8   | [Screens](screens.md)                   | The shell, a list, adding, an item, all lists, the catalog, household settings, the phone                            | 8     |
| 9   | [Mail and notices](notices.md)          | The mail outbox, notices and the bell, the digest, preferences and delivery                                          | 4     |
| 10  | [The suite](suite.md)                   | Core's bell, email and activity; inviting from the directory                                                         | 2     |
| 11  | [Portability](portability.md)           | Export, import, import from the plugin                                                                               | 3     |
| 12  | [Release](release.md)                   | Seed, security review, documents, the first release, hosting                                                         | 5     |
| 13  | [Pantry and routines](pantry.md)        | Phase 2: pantry, staples, repeating items, templates, shops' aisle order, prices, insights, Push                     | 9     |
| 14  | [Capture](capture.md)                   | Phase 3: barcode scanning and lookup, the media store, photos, receipts                                              | 6     |
| 15  | [Later](later.md)                       | Candidates: Git backup, links to Ledger and Tally, AI, other languages                                               | 4     |
| 16  | [Upstream, in `sovereign`](upstream.md) | `AUTH_SIGNUP`'s `invite`, the port, `AvatarStack`, grocery icons, a floating button, charts, `MoneyInput`            | 7     |
