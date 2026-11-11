# Epic 12: Release

## Status

📋 Planned.

## Overview

From a working app to a published image hosted on the live instance: a seed to develop against, a security review written up, the documents a person
and an operator read, the release, and hosting it. **12.1 to 12.5 are 0.1.0;** 12.6 is 0.2.0, and phases 3 and 4 close with their own release tasks
(13.9, 14.6).

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §21 · Tusk's `RELEASING.md` and `scripts/release.sh` · `docs/deploying.md` in `sovereign`

## Tasks

#### ✅ 12.1 — Development seed

**Goal:** `pnpm seed`. **Design:** §21 Testing. **Depends on:** 3.4, 5.5.

**Technical:** a few accounts; a household shared between two of them and the others' own; lists with open and bought items, products from the
starter catalog with some renamed; a live invitation; a folded product and item in history; someone who left. Idempotent, on every database form,
refused when `NODE_ENV` is production. Phase 2 extends it with what it adds (trips across two months in two shops with prices, notices, a second
household) as part of 12.6.

**Accepts when:** a fresh database seeded shows every screen populated, and a second run changes nothing.

**Done as:** `pnpm seed` (`scripts/seed-run.mjs`, through `jiti`, so that it uses the app's own code) runs `scripts/seed.ts`, which makes **three accounts** (`seed@example.test`, `seed2@…`, `seed3@…`, the password `SEED_PASSWORD` in the file, for a development database and nothing else) **through the app's own paths and writes no table directly**: accounts through better-auth, their person and first household as sign-up makes them (`makeAccountRecords`), lists and items through the actions and `applyMutation` the sync endpoint uses (each item with the category and icon the add field gives it, so the list is by aisle), people into a household by the invitation a member sends and the person accepts (`createInvitation`, `acceptInvitation`), and someone leaving by `member.leave`. **What it makes:** Seed's household "My lists" with Groceries (ten open items with quantities, units and notes, one retyped as "Oat milk (barista)", two bought), a Hardware store list, a Party list whose bought items were cleared, an archived list with an item on it, **a link waiting**, **Seed Two** (a member, who added and ticked) and **Seed Three** (who added an item and left: it stays, shown "added by Seed Three (left)"); Seed Two's and Seed Three's own households with a few items; and **a product and an item two people added at once and the server folded into one**, recorded as an alias. **Idempotent:** every id is derived from a name, the clock is fixed, and the whole shared block is skipped once Seed Two is in, so a second and a third run change no table (counted over eleven tables and the user table). **Refused** when `NODE_ENV` is production, when the database is not on this machine (a file, or a service on `localhost`), and without local sign-in. **`--remove`** deletes the three accounts the way a person deleting theirs would (`deletePerson`, the last to arrive first, so the households nobody else is in go too; what stays is the persons' names only, as for anyone), `--reset` is that and then the seed. Tests: `scripts/seed.test.ts` (4, on the leg's database: every shape above is there; a second and a third run change nothing; remove takes the accounts and leaves a bystander's household, and a seed can be made again; where it may run), repeated ten times; and `pnpm seed` run by hand against a throwaway SQLite file: seeded, run again with the same row counts, refused in production, removed, reset, and the app signed into as Seed and looked at (the list by aisle, the sidebar with counts, the archived list, "added by Seed Two" and "(left)"). Left out: **PostgreSQL and sqld** were not run (the code has no dialect branch beyond the auth store's table names, which the other seeds share); **trips, prices, notices and a second household of Seed's** wait for phase 2 (12.6); no catalog of a hundred products (the design's number): the starter catalog is the catalog, and the seed uses about twenty of it.

#### ✅ 12.2 — Security review

**Goal:** phase 1 reviewed before release. **Design:** §21 Security. **Depends on:** 2.4, 3.5, 6.3, 7.3.

**Technical:** a written review in `docs/security/0.1.0.md` of access (§5.2), sync and folding (§12.4, §12.5), sealing and the name key (§13),
invitations (§7.3), sign-in through core and its two notices (§15), and deletion (§19), with findings fixed or recorded as accepted by the owner.
Live updates, import and the directory are reviewed with the phase that adds them.

**Accepts when:** the review is merged and no finding is open without the owner's acceptance.

**Done as:** the review is written, in `docs/security/0.1.0.md`: access (§5.2), sync and folding (§12.4, §12.5), sealing and the name key (§13), invitations (§7.3), sign-in through core and its two notices (§15) and deletion (§19), tried against the **built app with two real accounts** and a read of the database files and the server's log, and not the code alone. **Fixed:** finding 1, a member could name another member as the one who added or ticked an item (`checkAuthorship` in `src/sync/apply.ts`, `src/sync/authorship.test.ts`, seen to fail without it). **Corrected:** finding 2's wrong statement in 12.3's README (names and addresses are sealed in the app's database but **the sign-in database holds each account's name and email in plain text**), in `docs/encryption.md` and in `DESIGN.md` §13.1. **Documented:** finding 3, that the limits on sign-in and on opening links count by `X-Forwarded-For`, so a proxy must replace what the client sent (`README.md`, `deploy/README.md`). **Recorded:** finding 4, a moderate `esbuild` advisory in a build tool that is not in the image. The probes became `e2e/security.spec.ts` (7 browser tests: a stranger cannot write to, point at or hear of a household and is refused as for one that does not exist; a member cannot name another as adder or ticker, is given no one's address but their own and cannot remove the Admin; every route that changes something refuses no origin, another site's and `null`; no-store, a nonce policy, no framing and no referrer on pages; sign-in sends no one elsewhere; a request is bounded; the cookie's flags and a deleted account's session refused at once). **Accepted:** the owner accepted findings 2, 3 and 4 as documented on 11 November 2026 (the alternatives are in the review: keeping a keyed hash of the address for the sign-in lookup, and a `SHOPPER_TRUST_PROXY` setting), so no finding is open. Left out, and listed in the review: an independent review, WebKit, a real phone, PostgreSQL and sqld, fuzzing and load, a live core, and a read of the packages.

#### ✅ 12.3 — Documents

**Goal:** what a person and an operator read. **Design:** §12.8, §13.1, §21 Deployment. **Depends on:** 1.10.

**Technical:** the README (what Shopper is, running it alone in each database form, hosting it, every setting, **what `SHOPPER_AUTH_SIGNUP=open`
means and when to set `closed`,** what encryption at rest does and does not protect); the user's documentation of what needs a network, what cannot
be hidden (§12.8), **what sharing does (everyone invited sees and edits every list of the household) and what 0.1.0 does not do yet** (export, trips,
notices, several households); `RELEASING.md` copied from Tusk.

**Accepts when:** someone following the README alone runs Shopper from the image in each database form.

**Done as:** **`README.md`** rewritten from the placeholder: what Shopper is; **what 0.1.0 does and does not do yet**; running it from the image in each database form (building it from the repository with the manifest's arguments, the one `docker run` with a SQLite file, the three Compose setups of `deploy/`, and hosting by a Sovereign instance); **every setting** in one table (all of `.env.example`, each with what it does and its default); **what `SHOPPER_AUTH_SIGNUP=open` means and when to set `closed`** (open lets a stranger who finds the address make an account of their own, so set `closed` once everyone who is to share has joined; closed refuses every other sign-up at the server, and a sign-in through core is never refused by it); and **what encryption at rest does and does not protect** (a copied database, a backup, a disk, the tables; not whoever controls the running server, nor the device, and a lost key cannot be recovered), with how to change the key. **`docs/`**: an index (`README.md`), `working-offline.md` (what works with no network, what needs one, and what cannot be hidden: iPhone syncs only while open, a browser can evict storage, a shared computer, everyone in a household sees everything, plain text on the device), `sharing.md` (a household is the unit of sharing and sharing is not per list; links: 14 days, once, revocable, anyone holding one can join; Admin and Member; what stays when someone leaves; who sees an address; what 0.1.0 does not do) and `encryption.md` (what is sealed and what is not, what it protects against and what it does not, the key, rotation). **`RELEASING.md`** copied from Tusk and renamed, with a note at the top that `scripts/release.sh` and its tests arrive with 12.4, so that until then the steps are done by hand. `CONTRIBUTING.md` corrected (it named a `pnpm e2e:fast` this repository does not have and a task-manager phrase). Every statement of what the system does was checked against the code, among them: rotation is at start-up and resumable, the start-up check refuses sealed content its keys cannot open, Settings says whether storage was persisted, an Admin's view of addresses, what deleting an account leaves, and what the offline shell serves. **`src/readme.test.ts`** (9) holds the documents to the code: every setting in `.env.example` is in the README, every one the code reads is in `.env.example` (or its `_FILE`), none in the README is invented (seen to fail with one added), the deployment files name only real settings (apart from Compose's own `SHOPPER_IMAGE` and `SHOPPER_PORT`), and what the README tells an operator to run is in the repository (its files, its port from the manifest, its commands, the two values of the sign-up setting, its links). **Accepts when, done by hand:** following the README alone, the image was built with its command and run from it in **each database form**: the `docker run` with a SQLite file, and the three Compose setups from a `.env` made from `deploy/.env.example` (sqld, a file, PostgreSQL), each answering `/api/health` with `200` on the database it names, and stopping cleanly (exit 143 for the `docker run`); everything was removed afterwards. The Compose runs used `SHOPPER_PORT=3017`, the documented override, because something of the developer's was already listening on 3007. Left out: the image on `ghcr.io` (12.4: the README names it and says how to build it meanwhile), `scripts/release.sh` (12.4), and the security review (12.2).

#### 📋 12.4 — Release 0.1.0

**Goal:** the first published image. **Depends on:** 12.2, 12.3.

**Technical:** `scripts/release.sh check | prepare | propose | tag | verify 0.1.0`, as Tusk's; the changelog's `[Unreleased]` becomes 0.1.0; the image
for amd64 and arm64 on `ghcr.io/sovereignfs/shopper`, attested, booted after publishing; the package made public.

**Accepts when:** `ghcr.io/sovereignfs/shopper:0.1.0` is published, boots, and its release page carries the changelog.

#### 📋 12.5 — Hosting on an instance

**Goal:** Shopper on the live instance. **Depends on:** 12.4.

**Technical:** in `openfs-suite`: `./sv app add shopper --image ghcr.io/sovereignfs/shopper:0.1.0`, `SHOPPER_AUTH_LOCAL=1` in `suite.yml` as the owner
chooses (it is what lets people not on the instance make an account to accept a link), `SHOPPER_SMTP_*` if the owner wants password reset, no app
scope needed, `./sv push && ./sv deploy`; checked with `./sv status` and `./sv doctor`. Done by the owner or on their instruction.

**Accepts when:** `shopper.<domain>` is in core's launcher, signs in through core, and journey 6 of §3 works on a phone.

#### 📋 12.6 — Release 0.2.0 (phase 2)

**Goal:** phase 2 published. **Depends on:** Milestones J to N of `ROADMAP.md`.

**Technical:** the seed extended (12.1); a security review of what phase 2 added (`docs/security/0.2.0.md`): notices and mail, live updates, the
directory and the refresh token, import, trips and prices, roles and moving lists; the README and the user's documentation brought up to date,
including the more-than-one-process and proxy-buffering note of 6.4; a migration note for an operator, since `invite` becomes the default sign-up
policy (2.7) and the manifest's scopes grow (10.2); the release as 12.4; hosting updated as 12.5, with the three app scopes granted.

**Accepts when:** `ghcr.io/sovereignfs/shopper:0.2.0` is published and hosted, and a 0.1.0 database upgrades in place with every household intact.
