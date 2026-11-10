# Epic 1: Foundation

## Status

📋 Planned.

## Overview

The repository that can hold Shopper as `DESIGN.md` designs it: a Next.js app that runs alone or hosted, on three forms of database, with names sealed
at rest from the first table. Nothing a person would notice. **Tusk is the model throughout, and its infrastructure is copied** (`DESIGN.md` §5.1),
renamed to `SHOPPER_`, and trimmed of what Shopper does not use (workspaces, boards, the personal cipher, backup to git). Where Tally or Roam has
already made the same copy and trimmed a file the same way, its copy may be the starting point, and the task says so. Each task says which files it
copied. **All of epic 1 is phase 1,** trimmed to what 0.1.0 needs: where a task names something only phase 2 uses, it says so.

## Related

[`DESIGN.md`](../../DESIGN.md) §5, §13, §16.11, §20, §21 · Tusk's, Tally's and Roam's `docs/epics/foundation.md`

## Tasks

#### 📋 1.1 — Repository conventions

**Goal:** the files a repository of the suite is expected to have. **Design:** §21, `AGENTS.md`. **Depends on:** nothing.

**Technical:** `LICENSE` (AGPL-3.0-or-later), `CHANGELOG.md` with `[Unreleased]`, `CONTRIBUTING.md`, `README.md`, PR template, Dependabot,
`.editorconfig`, `.node-version`; `package.json` (`@sovereignfs/shopper`, `type: module`, engines `>=24.15 <25`, pnpm 11 with `minimumReleaseAge` and
`allowBuilds`); Next.js 16 (latest stable), React 19, TypeScript strict with `noUncheckedIndexedAccess`; `@sovereignfs/ui`, `sdk`, `config`,
`manifest` pinned exactly at Tusk's versions. `git init` and the GitHub repository `sovereignfs/shopper` are made by the owner.

**Accepts when:** a clean checkout installs with `pnpm install --frozen-lockfile`, `pnpm typecheck` passes, and `git status` is clean after.

#### 📋 1.2 — Format, lint and test tooling

**Goal:** the checks every later task runs. **Design:** §21 Testing. **Depends on:** 1.1.

**Technical:** Prettier and ESLint as Tusk's (copied configs); Vitest with the design system inlined and files run one after another; `fake-indexeddb`
for the device store's tests (6.2); `fast-check` for the property tests (5.2, 5.3); scripts `format`, `format:check`, `lint`, `typecheck`
(`next typegen && tsc --noEmit`), `test`; one real test.

**Accepts when:** each check passes, and each is seen to fail on a planted fault.

#### 📋 1.3 — Continuous integration

**Goal:** CI that runs what a change can affect. **Design:** §21. **Depends on:** 1.2.

**Technical:** Tusk's `ci.yml` and its change classifier, copied; legs for format, lint, types, unit tests; the database legs join with 1.5, the image
with 1.10, the browser with 1.9. Skipped on drafts and `skip-ci`.

**Accepts when:** a PR runs only the legs its files affect, and a failing leg fails the PR.

#### 📋 1.4 — Configuration and start-up

**Goal:** settings declared once and checked before anything is served. **Design:** §7.6, §12.6, §15.1, §21 Deployment. **Depends on:** 1.2.

**Technical:** `@sovereignfs/config` with prefix `SHOPPER`: `URL`, `AUTH_SECRET`, `AUTH_LOCAL`, `AUTH_SIGNUP` (`open`, the default, and `closed`; `invite`
joins with 2.7 in phase 2, once 16.1 is released), `AUTH_PASSWORD_MIN_LENGTH`, `CORE_*`, `DB_*`, `SMTP_*` (for the mail of sign-in: verification and
reset), `ENCRYPTION_KEY(_PREVIOUS)`, `WORKER`, `SYNC_INTERVAL_SECONDS` (default 20, 5 to 600), and the five `LIMIT_*` of 0.1.0 (§7.6: members,
households of an account, lists, open items, products) with their defaults; phase 2 adds `SYNC_LIVE`, `SYNC_INTERVAL_MIN_SECONDS` and
`SYNC_LIVE_MAX_CONNECTIONS` (6.4) and the sixth limit (4.7); `_FILE` forms for secrets;
`instrumentation.ts` hands to `instrumentation-node.ts`, which checks and stops on a wrong setting; `.env.example` held to the declarations by a test;
`/api/health`. Copied: Tusk's `src/config/`, instrumentation.

**Accepts when:** a missing or malformed setting stops start-up with every problem named and no value printed; `.env.example` matches the code.

#### 📋 1.5 — The database layer

**Goal:** three forms, two dialects, migrations at start-up. **Design:** §20.1, §20.2. **Depends on:** 1.4.

**Technical:** copy Tusk's `src/db/` (config, clients, provision, migrate, boot with retries and `DB_CONNECT_TIMEOUT_MS`, `exec.ts`, the column
vocabulary, `test-support.ts` reading `SHOPPER_TEST_*`); add a `decimal` column (a canonical decimal string, checked on write) and `fseq` (JSON of field to `seq`); `money` (64-bit minor units, checked safe on
read, as Ledger's) joins with 4.9 in phase 2; the two stores `shopper` and `shopper_auth`; `pnpm db:generate`,
`pnpm db:dev`; the parity test; CI legs on sqld, a file and PostgreSQL.

**Accepts when:** an empty database of each form is provisioned and migrated at start-up, twice safely; CI fails if generating would write anything.

#### 📋 1.6 — The job runner

**Goal:** background work in the web process, safe across processes. **Design:** §5. **Depends on:** 1.5.

**Technical:** copy Tusk's `src/jobs/` (runner, `claim.ts`, `index.ts`) and `job_claim`; `SHOPPER_WORKER=off`; stopped on SIGTERM. **0.1.0 runs one
job on it, the rotation of the encryption key (1.11);** trips, mail, notices and the history (7.2, 9.1, 9.3, 6.6) are phase 2's.

**Accepts when:** a job's work is done once when two processes run it; SIGTERM stops the runner and the server cleanly.

#### 📋 1.7 — Security headers

**Goal:** the CSP and headers every response has. **Design:** §21 Security. **Depends on:** 1.4.

**Technical:** copy Tusk's `proxy.ts` and `src/security/` (nonce CSP, `connect-src 'self'`, no `'unsafe-inline'`, HSTS over https, Edge discipline).
`/api/live` (6.4, phase 2) answers `text/event-stream` with `Cache-Control: no-cache` and `X-Accel-Buffering: no`.

**Accepts when:** every response, including errors and redirects, carries the policy; a test fails if `'unsafe-inline'` appears in `script-src`.

#### 📋 1.8 — Design system boundary and shell

**Goal:** `@sovereignfs/ui` wired in, with the app's frame. **Design:** §16.1, §16.2. **Depends on:** 1.2.

**Technical:** tokens and Hanken Grotesk served by the app; `src/theme/` sets `data-theme` before paint; `AppShell` with the header (wordmark, the avatar menu; the
bell's place is left for 9.2) and the sidebar's frame (_Add item_ and the section for lists, left empty), full or a rail, remembered on the device; `MobileFooter` at a phone's width; the app's CSS check (only `--sv-*` colours); Shopper's mark in `public/icons/`; not-found
and error pages, the error page saying plainly that nothing is lost (the plugin's lesson). The places are filled by epic 8.

**Accepts when:** the shell renders in light and dark at desktop and phone widths, with no literal colour anywhere.

#### 📋 1.9 — Browser tests

**Goal:** Playwright on the built app. **Design:** §21 Testing. **Depends on:** 1.5.

**Technical:** Tusk's Playwright setup copied: Chromium and WebKit, the database form from the environment, shards in CI; a helper for a second
browser context (for sync tests), for going offline (`context.setOffline`), and for a phone's viewport.

**Accepts when:** a smoke test opens the built app on each database form in CI.

#### 📋 1.10 — The image and deployment setups

**Goal:** one image, three Compose setups. **Design:** §15.3, §21 Deployment. **Depends on:** 1.5, 1.6.

**Technical:** `sovereign.manifest.json` (§15.3, **with 0.1.0's scopes: `openid`, `profile`, `email`**; 10.2 adds the directory's) with
`pnpm manifest:check` and a test holding it to the code (port 3007 everywhere); Tusk's
Dockerfile (Debian, `USER node`, `ARG PORT`, migrations beside the server, licences) built with `sovereign-manifest docker-args`; `deploy/` for sqld,
a file and PostgreSQL; `scripts/deploy-check.sh`; `publish.yml` on a `vX.Y.Z` tag.

**Accepts when:** `scripts/deploy-check.sh` boots every setup from nothing and as an instance would host it, answering `/api/health` with `200`.

#### 📋 1.11 — Encryption at rest

**Goal:** sealed rows and the name key, before any table holds a name. **Design:** §13. **Depends on:** 1.5.

**Technical:** copy Tusk's `src/crypto/` (the instance key from `SHOPPER_ENCRYPTION_KEY`, envelope encryption with a data key per row bound to row id
and purpose, `_PREVIOUS` for rotation); the `credential` table joins with 10.2 in phase 2; add `src/crypto/sealed.ts` from Roam (one `sealed` column per row;
`seal(table, row)` and `unseal` the only way in and out; a registry of which fields each table seals, which a test holds to §13.1's table);
`src/crypto/name-key.ts` (HKDF-derived `K_name`, `HMAC-SHA-256(household_id ‖ normalised name)`); the rotation job that re-wraps data keys and
recomputes name keys, claimed and resumable. Whichever of Tally and Roam built the sealing first is copied, and the task says which.

**Accepts when:** a sealed row round-trips on all three databases and its fields are not readable in the database file; a row sealed for one id does
not open as another; rotation with `_PREVIOUS` set re-wraps every row and every name key, twice safely; the registry test fails for a table with a
sealed field not listed.

#### 📋 1.12 — The PWA

**Goal:** installable, with a service worker that keeps the shell only. **Design:** §16.11. **Depends on:** 1.8.

**Technical:** copy Tusk's `src/sw/` and `app/manifest.ts` (name Shopper, icons with a maskable one, `display: standalone`, a shortcut to the last
list); an allow-list of build files and icons; the public shell page holding nothing of a person; an offline page for every other address. Answering
signed-in addresses offline is 6.5.

**Accepts when:** the app installs in Chromium; a test of the worker's source shows it caches nothing outside the allow-list.
