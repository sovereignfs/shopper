# AGENTS.md

Guidance for every AI agent working in this repository (Codex reads this file directly; Claude Code loads it through `CLAUDE.md`). It is the one copy
of the conventions. Do not duplicate them elsewhere, and do not add task history or release narrative to it: those belong in `ROADMAP.md`, the task's
epic and the PR body.

This repository follows the conventions of [`sovereignfs/sovereign`](https://github.com/sovereignfs/sovereign) (its `AGENTS.md`,
`docs/building-an-app.md` and `docs/development-workflow.md`) and of [`sovereignfs/tusk`](https://github.com/sovereignfs/tusk) (its `AGENTS.md`, the
closest model: an app of its own built from a roadmap, whose offline Desk is the shape of Shopper's sync). Tally's design is the model for shared data
offline (a counter per group) and invitations; Roam's for sealed rows. Where this file is silent, do what Tusk does; where they differ, this file says
which.

## What this is

**Shopper**, an app of the Sovereign suite exactly as Tusk, Fjord, Tally and Roam are: a household's shopping lists, a catalog that learns what the
household buys, ticking things off in the shop (into trips, from phase 2), and a shopping mode made for the aisle, all working with no network and
syncing in the background, with others' changes arriving as fast as each person chooses (up to live, from phase 2). A Sovereign instance can host it, and **it runs fully on its
own, with every feature, needing no instance**: its own accounts, people, mail and notices. It replaces the legacy plugin
`sovereignfs/sovereign-plugin-shopper`, whose behaviour is the starting point and none of whose code or interface is carried over; its export can be
imported. It is a PWA on Next.js, with its own database (sqld, a SQLite file or PostgreSQL), signing people in locally, through a Sovereign core, or
both, from one image.

**Nothing is built yet.** `DESIGN.md` is the design, `ROADMAP.md` the order, and Milestone A starts by copying Tusk's infrastructure (`DESIGN.md`
§5.1).

**Phase 1 (0.1.0) is a minimum viable product,** built to be used as soon as it can be: sign-in by password or through a core, lists and items offline,
ticking and a light shopping mode, sharing by a link, everything sealed at rest. `DESIGN.md` §2.2 says exactly what it holds and what waits. **A task
of phase 2 or later is not started before 0.1.0 is released** unless the owner decides it, and a phase 1 task builds the design's data model
and rules as written, leaving out only the screens and features §2.2 lists, so that phase 2 adds to it and moves nothing.

## Source of truth

Read the relevant document before a task. Where two disagree, the earlier one wins and the later one is stale and should be fixed:

1. **The contracts Sovereign publishes**, in the `sovereign` repository: `contracts/app-manifest.md`, `contracts/env.md`, `docs/using-the-sdk.md` and
   `docs/specs/sdk.md`, `docs/specs/design-system.md` and `docs/design-system.md`, `docs/connecting-an-app.md`. A gap is raised in `sovereign`, not
   patched here.
2. **`DESIGN.md`**: what Shopper is and how it is built, with numbered sections that tasks cite.
3. **`ROADMAP.md`**: the order of work, one row per task, canonical for status.
4. **`docs/epics/`**: each task's detail (goal, "Accepts when", and once done, how it was done and what was left out).

Directories are created when they are needed. Research (`docs/research/`), RFCs (`docs/rfcs/`), ADRs (`docs/adrs/`), workstreams (`docs/workstreams/`)
and security reviews (`docs/security/`) are used as Sovereign and Tusk use them. A documented "not now" is a valid outcome.

## Planning workflow

- **The developer assigns the task** at the start of a session. There is no "next task" pointer in any file; read `ROADMAP.md` for the queue and ask
  which to pick up.
- **Task IDs are permanent** (`4.3`): use them in cross-references and dependency lists, never in branch names, commit messages or PR titles.
- **A finished task is marked done in its roadmap row and written up in its epic** (Done as: what, where, what was left out), in the same change as
  the work.
- **Copying from Tusk, Tally, Roam or Ledger is said, not hidden:** a task that copies a file names it in its Done as, and changes in behaviour are
  stated.
- **Epic 16 is work in `sovereign`;** a Shopper task that depends on it waits for the published release. **Epic 15 is candidates;** nothing in it is
  started without the owner's decision.

## Working conventions

- **One task, one branch, one draft PR.** Branch from an up-to-date `main`, named `feat/<slug>`, `fix/<slug>`, `docs/<slug>` or `chore/<slug>`. Do not
  start a second task on a branch whose PR is not merged.
- **Nothing goes to `main` directly,** except the owner's bypass, which is theirs to use.
- **Never commit or push without being asked.** Prepare changes in the working tree and stop.
- **Commits explain why.** `type(scope): summary` under 72 characters, body wrapped at 100, a `Verified:` line naming what was run, one logical change
  per commit. Every commit an agent makes ends with `Co-Authored-By: Claude Code <noreply@anthropic.com>`: model-agnostic, never a specific model
  name.
- **PRs target `main`, are opened as drafts** (`gh pr create --draft --base main`), and are marked ready only on instruction. The body says what
  changed and why, cites the `DESIGN.md` section, carries no task numbers, and ends with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Merge with rebase and merge,** never squash and never a merge commit. **Never merge a PR automatically.**
- **Verify before claiming done.** Run the commands under Commands and show the output. A regression test is trusted only after it has been seen to
  fail against the code it guards.
- **Docs are part of the change.** A statement a change makes false is fixed in the same PR; a change to behaviour adds a line under `## [Unreleased]`
  in `CHANGELOG.md`.
- **Releases are their own PR,** as Tusk's: `scripts/release.sh`, a `vX.Y.Z` tag publishes the image. A patch has no migration and no setting change.
- **Flag Docker-config impact immediately:** a new setting, port, path or native dependency updates the `Dockerfile` and `.dockerignore` in the same
  change.

## Rules of an app

Tusk's rules, as they apply here, and Shopper's own. They describe the app as `DESIGN.md` designs it.

- **Every feature works with no Sovereign instance.** Core adds a way in, a directory, a bell and email; a feature that only works with core is not
  done. A call to core that fails, is refused or is not supported changes nothing but that call (`DESIGN.md` §15.4).
- **An account is known by its better-auth user id (`account_id`); someone on a shared row is a `person`.** Every account has exactly one person and
  exactly one household made with it (`own_of`), which others may be invited into. Names are read from `person`, never from the auth store. A `sub` is identity; an email is never matched to an account or
  a person at sign-in.
- **People join a household only by accepting an invitation;** nobody is added without agreeing. An email is shown only to whom `DESIGN.md` §6.1
  allows, through the one visibility function, and never in a notice or another person's export.
- **Everything personal of an account is removed by `People.deletePerson`** (`src/sovereign/people.ts`), which keeps only the name on the shared
  record, safe to run twice. **A new table is handled there, and exported and imported, in the same change,** with a test that seeds one of each.
- **Every row of a household carries `household_id`, and the permission is in the statement:** active membership of the household as a condition of
  the same query (`DESIGN.md` §5.2), never checked first and then touched; an Admin's operation adds the role to it. Anything a change points at must
  be the same household's, in the same statement. **A refusal reads as not found.** A route, operation, mutation or stream finds the session first,
  checks `Origin` on a write, is listed in `src/access/routes.ts`, and has a test calling it as a second person.
- **Names, notes, prices, shops, emails and barcodes are sealed at rest** through `src/crypto/sealed.ts`, never written in plain text, never in a
  `WHERE`, `ORDER BY` or index. A product's identity in a household is its **name key** (`DESIGN.md` §13.2), never its name. A table that adds a
  sealed field adds it to `DESIGN.md` §13.1's table and the registry test in the same change.
- **Lists, items, products, categories, shops, trips and trip lines are written only through the one path:** an action in `src/actions/` makes the
  mutation, and `src/sync/apply.ts` applies it, re-checking membership and limits, merging field by field, folding duplicates (`src/sync/fold.ts`), in
  one short transaction that increments the household's `seq`. A replayed mutation writes nothing. The property tests pass.
- **Changes merge by field;** a field's later write wins; an edit restores a deleted row; **the first tick stands** (and, from phase 2, a second makes no trip line);
  the same product twice in a household, or open twice on one list, folds into one, recorded as an alias. Nothing anyone typed is thrown away: a
  refused change goes to Couldn't sync, never to nowhere.
- **Households, membership, roles, invitations and moving a list between households are online operations** (`/api/ops`), decided by the server at
  once. They are not queued offline.
- **The live stream carries signals only** (`{household, seq}`), never a row; the device pulls through `/api/sync`. The hub is in the process;
  `LISTEN/NOTIFY` is not used.
- **Quantities are canonical decimal strings and money is integer minor units,** calculated in `src/quantity/`; no binary float touches either. One
  figure has one implementation, pure, shared by the browser, the server and the tests (suggestions, totals, unit prices, aisle order).
- **The device's store is per account and holds only the account's households;** it is deleted at sign-out. **The service worker caches the shell
  only,** by allow-list; no page or answer with a person's data is ever in a cache.
- **Notices are raised in the change's transaction or by the digest job, never for the person who acted.** Mail goes
  through `mail_outbox`, in the background; no address or content is logged.
- **An invitation token is random, stored only as its hash, compared in constant time,** single-use and expiring; every invalid link shows the same
  page.
- **A job claims its work in the database** and is safe to run twice and from two processes.
- **Logs hold no item, product, list, household, shop or person names, notes, prices or addresses:** an id and a kind of failure.
- **The database has three forms and two dialects:** a schema and migrations per dialect, generated with `pnpm db:generate`, never written by hand or
  `push`ed; standard SQL, values bound; no `LISTEN/NOTIFY`, trigger, extension or foreign key; every deletion names what it deletes, in a transaction;
  short transactions, nothing held across a call to core or SMTP. A data-layer test runs on sqld, a `file:` database and PostgreSQL. **Tests read
  `SHOPPER_TEST_*` and never the app's variables.**
- **A released migration is never edited:** a fix is a new migration.
- **Credentials (core's refresh token) are stored only through `src/crypto/`** (envelope encryption under `SHOPPER_ENCRYPTION_KEY`). Secrets never
  appear in an error, a log, a URL or the browser.
- **The manifest is the one copy** (`sovereign.manifest.json`) of what an instance reads. `pnpm manifest:check` passes, and the image is built with
  `pnpm exec sovereign-manifest docker-args`. The port is 3007 everywhere.
- **Environment variables carry the prefix `SHOPPER_`,** declared once through `@sovereignfs/config`; every one is in `.env.example`; every limit is a
  setting with a default; the server refuses to start on a wrong setting; no secret has a default; never `NEXT_PUBLIC_*` for a value that varies at
  run time.
- **The design system is imported from `@sovereignfs/ui` directly,** pinned exactly; style with `--sv-*` tokens only; Hanken Grotesk served by the
  app. **Reusable UI is built in `@sovereignfs/ui` in `sovereign`, released, then used** (epic 16), never forked here.
- **Never fork a navigation decision by viewport;** fork only what is rendered.
- **No third-party loads and no third-party requests from the browser.** What people write is rendered as text, never as HTML. A lookup by barcode
  (phase 4) is made by the server.
- **User-facing words are "household", "list", "item", "catalog", "trip", "shop", "bought", "basket", "shopping", "Admin", "Member", "app"**
  (`DESIGN.md` §4), never "ledger", "purchase transaction", "owner", "viewer", "editor", "tenant", "client" or "plugin".
- **Next.js tracks the latest stable release.** Read the guide bundled with the installed version (`node_modules/next/dist/docs/`) before writing Next
  code.
- **TypeScript is strict.** No `any` without a comment; prefix an intentionally unused identifier with `_`; never disable a lint rule inline without a
  comment.

## pnpm

As Tusk's: `pnpm install --frozen-lockfile` for every routine install; `pnpm-workspace.yaml` carries pnpm's settings and the Dockerfile copies it;
pnpm refuses a release less than a day old and an install script nobody decided on; an exception in `minimumReleaseAgeExclude` only for a package of
ours, exact-pinned. Never accept pnpm's offer to add one.

## Commands

Tusk's set is brought by Milestone A, and this list is where each is written as it lands. Until a command is here, `verify` for it means what the
task's "Accepts when" says.

| Command             | What                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | The app on port 3007                                                                                                                                             |
| `pnpm build`        | The production build, a standalone server                                                                                                                        |
| `pnpm typecheck`    | `next typegen && tsc --noEmit`                                                                                                                                   |
| `pnpm format:check` | Prettier over everything (`pnpm format` writes); the documents are wrapped at 150 columns                                                                        |
| `pnpm lint`         | ESLint, strict TypeScript and jsx-a11y (`pnpm lint:fix` fixes)                                                                                                   |
| `pnpm test`         | Vitest, files one after another                                                                                                                                  |
| `pnpm seed`         | Three development accounts with shared and own households, items and a link (`-- --reset` makes them again, `-- --remove` takes them away; local databases only) |
| `pnpm icons`        | The PNG icons, made again from `public/icons/icon.svg` (committed; needed only if the mark changes)                                                              |

Not yet: `manifest:check`, `scripts/deploy-check.sh`.

## Layout

`DESIGN.md` §5.1 is where things go as the app is built: `app/` for routes, `src/` for everything else, tests beside the code. Directories are made
when a task needs them.
