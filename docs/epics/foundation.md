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

#### ✅ 1.1 — Repository conventions

**Goal:** the files a repository of the suite is expected to have. **Design:** §21, `AGENTS.md`. **Depends on:** nothing.

**Technical:** `LICENSE` (AGPL-3.0-or-later), `CHANGELOG.md` with `[Unreleased]`, `CONTRIBUTING.md`, `README.md`, PR template, Dependabot,
`.editorconfig`, `.node-version`; `package.json` (`@sovereignfs/shopper`, `type: module`, engines `>=24.15 <25`, pnpm 11 with `minimumReleaseAge` and
`allowBuilds`); Next.js 16 (latest stable), React 19, TypeScript strict with `noUncheckedIndexedAccess`; `@sovereignfs/ui`, `sdk`, `config`,
`manifest` pinned exactly at Tusk's versions. `git init` and the GitHub repository `sovereignfs/shopper` are made by the owner.

**Accepts when:** a clean checkout installs with `pnpm install --frozen-lockfile`, `pnpm typecheck` passes, and `git status` is clean after.

**Done as:** `LICENSE`, `.editorconfig`, `.node-version`, `.prettierignore`, `tsconfig.json`, `.github/dependabot.yml`, the pull request template and
`CONTRIBUTING.md` copied from Tusk (renamed; Dependabot's ignore rules unchanged); `.gitignore` and `pnpm-workspace.yaml` from Tusk, trimmed (no
`peerDependencyRules` or `allowBuilds` entries until a dependency needs them); `prettier.config.ts` is Tusk's with a
150-column override for Markdown, since the documents are wrapped there. `package.json` is `@sovereignfs/shopper`, pnpm 11.14.0 (the installed one),
Next 16.4, React 19.3, TypeScript 6.0 strict with `noUncheckedIndexedAccess`, `@sovereignfs/ui`, `config` and `sdk` at Tusk's exact versions (listed in
`minimumReleaseAgeExclude`), and `@sovereignfs/manifest` as a dev dependency; it holds only what is used so far, and each task adds its own. `app/` is
a layout with the design system's tokens and one placeholder page; `README.md` and `CHANGELOG.md` are new. Left out: the Dependabot `design-system`
grouping is kept but nothing yet depends on `sdk`.

#### ✅ 1.2 — Format, lint and test tooling

**Goal:** the checks every later task runs. **Design:** §21 Testing. **Depends on:** 1.1.

**Technical:** Prettier and ESLint as Tusk's (copied configs); Vitest with the design system inlined and files run one after another; `fake-indexeddb`
for the device store's tests (6.2); `fast-check` for the property tests (5.2, 5.3); scripts `format`, `format:check`, `lint`, `typecheck`
(`next typegen && tsc --noEmit`), `test`; one real test.

**Accepts when:** each check passes, and each is seen to fail on a planted fault.

**Done as:** Prettier and ESLint as Tusk's (`prettier.config.ts`, `eslint.config.ts` and `types/` copied; the `tools/` ignore left out until there are tools); Vitest 5 with the design system inlined and files run one after another (`vitest.config.ts` is Tusk's without its operator-key setup file); `fake-indexeddb` and `fast-check` installed for 6.2 and 5.2. Scripts `format`, `format:check`, `lint`, `lint:fix`, `typecheck`, `test`; the one real test is `src/site.test.ts`. A planted unformatted file, an unused variable, a type error and a failing test were each seen to fail their check.

#### ✅ 1.3 — Continuous integration

**Goal:** CI that runs what a change can affect. **Design:** §21. **Depends on:** 1.2.

**Technical:** Tusk's `ci.yml` and its change classifier, copied; legs for format, lint, types, unit tests; the database legs join with 1.5, the image
with 1.10, the browser with 1.9. Skipped on drafts and `skip-ci`.

**Accepts when:** a PR runs only the legs its files affect, and a failing leg fails the PR.

**Done as:** `.github/workflows/ci.yml`, `scripts/ci-changes.sh` and its tests copied from Tusk (the action versions pinned by hash as there; the classifier unchanged, one test path renamed). Legs: `what changed` (the draft and `skip-ci` guard, and the classifier), `check` (format, lint, types, tests and build) and `shell scripts` (shellcheck and the classifier's own tests). Left out until their tasks: the database legs and the migrations check (1.5), the browser and image legs (1.9, 1.10), the manifest check (1.10), `test:zones` and the release script's tests (no such code here). Nothing has run on GitHub yet, since nothing is pushed.

#### ✅ 1.4 — Configuration and start-up

**Goal:** settings declared once and checked before anything is served. **Design:** §7.6, §12.6, §15.1, §21 Deployment. **Depends on:** 1.2.

**Technical:** `@sovereignfs/config` with prefix `SHOPPER`: `URL`, `AUTH_SECRET`, `AUTH_LOCAL`, `AUTH_SIGNUP` (`open`, the default, and `closed`; `invite`
joins with 2.7 in phase 2, once 16.1 is released), `AUTH_PASSWORD_MIN_LENGTH`, `CORE_*`, `DB_*`, `SMTP_*` (for the mail of sign-in: verification and
reset), `ENCRYPTION_KEY(_PREVIOUS)`, `WORKER`, `SYNC_INTERVAL_SECONDS` (default 20, 5 to 600), and the five `LIMIT_*` of 0.1.0 (§7.6: members,
households of an account, lists, open items, products) with their defaults; phase 2 adds `SYNC_LIVE`, `SYNC_INTERVAL_MIN_SECONDS` and
`SYNC_LIVE_MAX_CONNECTIONS` (6.4) and the sixth limit (4.7); `_FILE` forms for secrets;
`instrumentation.ts` hands to `instrumentation-node.ts`, which checks and stops on a wrong setting; `.env.example` held to the declarations by a test;
`/api/health`. Copied: Tusk's `src/config/`, instrumentation.

**Accepts when:** a missing or malformed setting stops start-up with every problem named and no value printed; `.env.example` matches the code.

**Done as:** `src/config/` (env, the loader, the cached settings, the Edge subset), `instrumentation.ts` and `instrumentation-node.ts`, `src/auth/config.ts` and `src/mail/config.ts` and the key parsing of `src/crypto/keys.ts` copied from Tusk and renamed to `SHOPPER_`, trimmed of everything Tusk-only (GitHub App, Web Push, operator encryption, the personal cipher). New: `src/limits/config.ts` (the five limits of 0.1.0 with their defaults), `SHOPPER_SYNC_INTERVAL_SECONDS` (default 20, 5 to 600), `SHOPPER_AUTH_SIGNUP` as `open` (the default) or `closed`. **Changes in behaviour from Tusk, stated:** the encryption key is required, since nothing is stored in plain text (Tusk's is optional); sign-up defaults to `open`. The database settings are declared and read here, and checked by 1.5 (`Config.database` arrives with it); the key ring is parsed here, and 1.11 builds the envelope on it. `.env.example` is held to the declarations in both directions by `src/config/process-env.test.ts`, which also holds `process.env` to `src/config`. `/api/health` answers 200; 1.5 makes it wait for the database. Seen working: the built server refuses to start with a missing secret and key, naming both and no value, and answers `/api/health` with 200 when they are given.

#### ✅ 1.5 — The database layer

**Goal:** three forms, two dialects, migrations at start-up. **Design:** §20.1, §20.2. **Depends on:** 1.4.

**Technical:** copy Tusk's `src/db/` (config, clients, provision, migrate, boot with retries and `DB_CONNECT_TIMEOUT_MS`, `exec.ts`, the column
vocabulary, `test-support.ts` reading `SHOPPER_TEST_*`); add a `decimal` column (a canonical decimal string, checked on write) and `fseq` (JSON of field to `seq`); `money` (64-bit minor units, checked safe on
read, as Ledger's) joins with 4.9 in phase 2; the two stores `shopper` and `shopper_auth`; `pnpm db:generate`,
`pnpm db:dev`; the parity test; CI legs on sqld, a file and PostgreSQL.

**Accepts when:** an empty database of each form is provisioned and migrated at start-up, twice safely; CI fails if generating would write anything.

**Done as:** `src/db/` (config, client, provision, migrate, boot with retries, `exec.ts`, the column vocabulary, `test-support.ts` reading `SHOPPER_TEST_*`, and their tests), the four drizzle configs, `scripts/db-generate.mjs`, `dev-db.mjs`, `boot-check.mjs` and `scripts/lib/standalone.mjs` copied from Tusk and renamed; the stores are `shopper` and `shopper_auth`; the dev containers use ports 27080, 27081 and 27432. **Changed from Tusk:** the vocabulary is `id`, `ref`, `epochMs`, `counter`, `bool`, `position` and the new `decimal`, `sealed` and `fseq` (the two date words and `fields` are gone). `decimal` is text on both dialects: the canonical-string check is in `src/quantity` (4.6) and the write path, because queries here are raw SQL and a column type cannot refuse a write; `money` joins with 4.9. The first migration of the app store holds `rate_bucket` alone (the tables of the product arrive with their tasks), and of the auth store better-auth's `user`, `session`, `account`, `verification` and `rate_limit` without the passkey and two-factor tables (2.8). `Config.database` and `/api/health` (200 only once the database answers, naming its dialect) are wired, and `instrumentation-node.ts` provisions and migrates before serving. CI gained the `tests` legs on sqld, a `file:` database and PostgreSQL (each also boots the built server with `pnpm boot-check`) and a check that generating migrations writes nothing; it has not run on GitHub. **Seen locally:** the whole suite (96 tests) on all three forms, the built server booting and answering health on each, and the migrations check clean.

#### 📋 1.6 — The job runner

**Goal:** background work in the web process, safe across processes. **Design:** §5. **Depends on:** 1.5.

**Technical:** copy Tusk's `src/jobs/` (runner, `claim.ts`, `index.ts`) and `job_claim`; `SHOPPER_WORKER=off`; stopped on SIGTERM. **0.1.0 runs one
job on it, the rotation of the encryption key (1.11);** trips, mail, notices and the history (7.2, 9.1, 9.3, 6.6) are phase 2's.

**Accepts when:** a job's work is done once when two processes run it; SIGTERM stops the runner and the server cleanly.

#### ✅ 1.7 — Security headers

**Goal:** the CSP and headers every response has. **Design:** §21 Security. **Depends on:** 1.4.

**Technical:** copy Tusk's `proxy.ts` and `src/security/` (nonce CSP, `connect-src 'self'`, no `'unsafe-inline'`, HSTS over https, Edge discipline).
`/api/live` (6.4, phase 2) answers `text/event-stream` with `Cache-Control: no-cache` and `X-Accel-Buffering: no`.

**Accepts when:** every response, including errors and redirects, carries the policy; a test fails if `'unsafe-inline'` appears in `script-src`.

**Done as:** `src/security/csp.ts` and its tests copied from Tusk and renamed (the nonce policy, `connect-src 'self'`, no `'unsafe-inline'` in `script-src`, the response headers and HSTS over https); `proxy.ts` is Tusk's reduced to the nonce, the policy and HSTS, with its own tests: the sign-in pages that answer 404 when local sign-in is off and `/` for someone with a session cookie are left to 2.1 and 2.2, which add them to it. `next.config.ts` sends the headers every response has; the layout waits for the connection so that every page is rendered per request and carries its nonce. `/api/live`'s `text/event-stream` headers are 6.4's (phase 2). **Seen on the built server:** a page, a 404 and `/api/health` each carry the security headers, and the two pages the policy with a nonce of their own.

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

#### ✅ 1.11 — Encryption at rest

**Goal:** sealed rows and the name key, before any table holds a name. **Design:** §13. **Depends on:** 1.5.

**Technical:** copy Tusk's `src/crypto/` (the instance key from `SHOPPER_ENCRYPTION_KEY`, envelope encryption with a data key per row bound to row id
and purpose, `_PREVIOUS` for rotation); the `credential` table joins with 10.2 in phase 2; add `src/crypto/sealed.ts` from Roam (one `sealed` column per row;
`seal(table, row)` and `unseal` the only way in and out; a registry of which fields each table seals, which a test holds to §13.1's table);
`src/crypto/name-key.ts` (HKDF-derived `K_name`, `HMAC-SHA-256(household_id ‖ normalised name)`); the rotation job that re-wraps data keys and
recomputes name keys, claimed and resumable. Whichever of Tally and Roam built the sealing first is copied, and the task says which.

**Accepts when:** a sealed row round-trips on all three databases and its fields are not readable in the database file; a row sealed for one id does
not open as another; rotation with `_PREVIOUS` set re-wraps every row and every name key, twice safely; the registry test fails for a table with a
sealed field not listed.

**Done as:** `src/crypto/keys.ts` (1.4) and `envelope.ts` and its tests copied from Tusk and renamed (the authenticated data now reads `shopper:sealed:…`, a row's `purpose` being its table); Roam is not built, so `sealed.ts` is new, in the shape the design gives: `sealRow` and `unsealRow` make and read a row's one `sealed` column (its fields as one JSON object, one data key, bound to table and id), and know only the fields of `SEALED`, the registry, which is **empty until the tables exist** and is held to `DESIGN.md` §13.1's table by `sealed.test.ts` (a listed field the design does not seal fails it; so does a schema table with a `sealed` column that is not listed, which the test shows with a probe table). `name-key.ts` is `HMAC-SHA-256(K_name, household_id ‖ normalised name)` with `K_name` from HKDF under a label of its own. `rotate.ts` re-wraps every row of `SEALED_TABLES` from `SHOPPER_ENCRYPTION_KEY_PREVIOUS` to the current key and recomputes what depends on it (a table's `recompute`, for the product's name key) in the row's own transaction, by an update that holds only while the row is as it was read, so two replicas move each row once and a second run moves none; `assertKeys` stops start-up naming the fingerprints of a key that is missing. Both run at start-up (`instrumentation-node.ts`), not as a job: 1.6 is not needed for it. The `credential` table is not copied (10.2, phase 2). Tests on a probe table on all three databases: round trip, the fields absent from the column and, for a file, from its bytes, rotation, two at once, a missing key. **Seen:** the suite (127 tests) on sqld, a file and PostgreSQL.

#### 📋 1.12 — The PWA

**Goal:** installable, with a service worker that keeps the shell only. **Design:** §16.11. **Depends on:** 1.8.

**Technical:** copy Tusk's `src/sw/` and `app/manifest.ts` (name Shopper, icons with a maskable one, `display: standalone`, a shortcut to the last
list); an allow-list of build files and icons; the public shell page holding nothing of a person; an offline page for every other address. Answering
signed-in addresses offline is 6.5.

**Accepts when:** the app installs in Chromium; a test of the worker's source shows it caches nothing outside the allow-list.
