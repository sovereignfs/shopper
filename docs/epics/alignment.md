# Epic 17: Suite alignment

## Status

✅ Done. Before phase 2, in [workstream 0001](../workstreams/0001-suite-model.md).

## Overview

Shopper on the current releases of what `sovereign` publishes, using the shared parts instead of copies, with nothing a person would notice. Every
later task of epics 18 to 20 stands on it.

## Related

[RFC 0001](../rfcs/0001-encryption-the-server-cannot-read.md), [0002](../rfcs/0002-web-push.md), [0003](../rfcs/0003-exports-and-backups.md) ·
`docs/building-an-app.md`, `contracts/app-manifest.md` and `docs/releasing.md` in `sovereign`

## Tasks

#### ✅ 17.1 — The packages, current

**Goal:** Shopper on `@sovereignfs/sdk` 2.11.0, `@sovereignfs/ui` 0.104.0 or later, `@sovereignfs/manifest` 0.4.x and manifest 5. **Design:** §15.3,
§16.10. **Depends on:** nothing.

**Technical:** exact pins, as `AGENTS.md` requires for the design system; `ui`'s changelog read from 0.92.0 for renamed or changed components, and the
screens moved; `sovereign.manifest.json` to manifest 5 with the template's `core` range (no `encryption` or `signIn.export` yet: 18.3 and 20.1 add
them); `@sovereignfs/create` synced if a newer release changes the shared files. `@sovereignfs/push`, `pwa` and `export` are added by the tasks that
use them.

**Accepts when:** `pnpm verify`, `pnpm manifest:check` and the browser tests pass, and every screen looks as before at desktop and phone widths, in
light and dark.

**Done as:** `@sovereignfs/sdk` 2.1.0 → 2.11.0, `@sovereignfs/ui` 0.92.0 → 0.105.0, `@sovereignfs/manifest` ^0.1.0 → 0.4.0 (now exact), and
`@sovereignfs/create` 0.14.0 → 0.27.1, each listed in `minimumReleaseAgeExclude`. The SDK's own `@sovereignfs/export` 0.3.0 is listed too, with a comment saying why. `sovereign.manifest.json` is manifest 5 with
the template's `core` floor (`>=0.126.0 <1.0.0`), and `DESIGN.md` §15.3 says so. The sync of create 0.27.1 took its new shared rules into
`AGENTS.md` and `CONTRIBUTING.md`. It also now counts the `Dockerfile`, `.dockerignore` and `compose.yml` as shared. Shopper keeps its own (an image for three databases, and `deploy/`'s
setups in place of one `compose.yml`), so those three are listed under `sovereign.unmanaged`. `ui`'s changelog since 0.96 only adds
components (0.92 to 0.95 predate its changelog); nothing Shopper uses changed, and the typecheck agrees. Verified: `pnpm verify`; `pnpm test` (682
passed; one earlier run had a timing failure in a test of `core_sub` that three reruns did not repeat); `pnpm build`. The browser tests in
Chromium were run once Playwright's browser was installed, before leg 3: 100 passed, after `e2e/pwa.spec.ts`'s theme-colour check was brought up to
0.2.0's colour for each scheme (stale since `4cbe486`, before this task). Left out: a look at every screen by eye.

#### ✅ 17.2 — The worker from `@sovereignfs/pwa`

**Goal:** Shopper's service worker and web manifest made by `@sovereignfs/pwa`, not copied from Tusk. **Design:** §12.10, §16.11. **Depends on:** 17.1.

**Technical:** `serviceWorkerSource` with the shell-only allow-list, the build id and the precache Shopper has now; opening offline (6.5) and a
link opening the installed app (0.2.0 on `develop`) kept. Shopper's worker answers Background Sync (`src/sw/source.ts`); if `@sovereignfs/pwa` has no
way to, raise it in `sovereign` (16.12) and keep that handler only until it is released, through whatever extension point the package gives.
`src/sw/source.ts` is deleted once nothing of it is needed.

**Accepts when:** 6.5's acceptance passes again; no response with a person's data is cached (its test, seen to fail with the allow-list widened).

**Done as:** `src/sw/source.ts`'s `workerSource` is now `serviceWorkerSource` from `@sovereignfs/pwa` 0.2.0 (`cachePrefix: 'shopper-shell-'`, the build's
files as `precache`, `/shell` as the shell), served with `serviceWorkerResponse`, plus Shopper's Background Sync listener after the package's text. The
package has no way to add one: that is 16.12, still to raise in `sovereign`. What the pages and the worker share (`SYNC_TAG`, `SYNC_MESSAGE`, the
shell's addresses) moved to `src/sw/shared.ts`, so a page's bundle does not carry the package. **Changes in behaviour:**

- With no network, the package answers **every** navigation with the kept shell, so `OfflineApp` now decides: an address that is not a signed-in
  screen (`answersOffline`) shows "This needs a connection", as the worker's own page said before.
- The package's offline page (before a shell is kept) answers 503, not 200.
- A navigation that takes more than 8 seconds is answered from the shell.
- A new worker takes over only when a page posts `TAKE_OVER_MESSAGE`, which Shopper's never do, so it still waits for the old pages to close.
- The development server's worker (`inertWorkerSource`) is unchanged: the package has none.

`src/sw/source.test.ts` was rewritten for the package's worker. Its tour now includes a plain fetch of a list, so widening the allow-list fails it (seen:
with `keep: ['/l/', '/lists']` it fails, without it passes). Verified: `pnpm test` (682 passed); `pnpm build`; the built server's `/sw.js`
carries the shell, the precache and the sync listener; `/shell` answers with no cookie, which the package needs before it keeps a page. 6.5's
browser test (`e2e/offline.spec.ts`, Chromium only) passed once Playwright's Chromium was installed, before leg 3, with the whole Chromium suite.

#### ✅ 17.3 — Sign-in and `@sovereignfs/auth`

**Goal:** a decision, recorded, on whether Shopper's sign-in (`src/auth/`, better-auth with a password and through core) moves onto
`@sovereignfs/auth` 0.4.0. **Design:** §15.1. **Depends on:** 17.1.

**Technical:** compare `src/auth/` with the package's `/server`, `/core` and `/next`: local and core sign-in on one instance, no implicit linking,
back-channel logout, account deletion, the key secret 18.2 and 18.3 need, and finding 2 of `docs/security/0.1.0.md` (the sign-in store in plain
text). An ADR in `docs/adrs/` records the choice; moving, if chosen, is its own task.

**Accepts when:** the ADR is accepted by the owner.

**Done as (waiting on the owner):** [ADR 0001](../adrs/0001-sign-in-on-sovereignfs-auth.md) proposed moving onto `@sovereignfs/auth` (17.5) before
18.2; checked against the code before leg 3, it would have stopped 0.1.0's password accounts signing in, so its own fallback was taken: sign-in
stays on `src/auth/` for workstream 0001, and 17.5 waits on 16.10, 16.13 and 16.14. The task is done when the owner accepts the ADR as it now reads,
or replaces it. **Accepted on 2026-11-22,** once the three were released in `@sovereignfs/auth` 0.6.0 and a move of a 0.2.x store was seen to work on
all three databases (the ADR's last section).

#### ✅ 17.4 — Stale lines and the settings table

**Goal:** the documents true again, and §20.3's `account_settings` table built. **Design:** §20.3. **Depends on:** nothing.

**Technical:** `DESIGN.md`'s opening status, the roadmap's 12.4 and 12.5 (0.1.0 is tagged), §26's rows that still put push in phase 2, the missing
`[0.2.0]` link in `CHANGELOG.md`, and what the `0.2.0` on `develop` and phase 2's `0.2.0` each become (the owner decides). `account_settings` on both
dialects, handled by `People.deletePerson`, with its test.

**Accepts when:** no document contradicts another on these points, and the table round-trips on all three databases.

**Done as:** the owner's question about `0.2.0` was settled by the suite's rule, synced in 17.1, that the version follows the change: **phases carry no
version** (§2, §22, the roadmap, the epics, `docs/sharing.md`; a §26 row), and `0.2.0`, not yet released, is what `develop` holds, with leg 1's
changes added to its section and its link line. `DESIGN.md`'s status line says what is built; 12.4 is marked done (v0.1.0 was released on
2026-11-11). 12.5 is left planned: whether Shopper is hosted on the live instance is not known from here. §26's push rows were already covered by its
own note on 2026-11-09's phase numbers, and four rows for 2026-11-21 are added. `account_settings` is on both dialects (migration
`0010_account_settings`), deleted by `People.deletePerson` and in its every-table test, which was seen to fail before the deletion was added.
Nothing writes or reads it yet, and §16.3 says so. Verified: `pnpm test src/sovereign/people.test.ts`; `pnpm verify`.

#### ✅ 17.5 — Sign-in on `@sovereignfs/auth`

**Goal:** Shopper's sign-in is the suite's package, not better-auth configured by hand. **Design:** §15.1, [ADR 0001](../adrs/0001-sign-in-on-sovereignfs-auth.md).
**Depends on:** 17.3, 17.1, 16.10, 16.13, 16.14. **Not in workstream 0001** (ADR 0001's fallback).

**Technical:** `createAuthPreset` with Shopper's settings (`resolveAuthSettings` with the prefix `SHOPPER`), `signUpPolicy` for `SHOPPER_AUTH_SIGNUP`,
the user-create hook making the person and household (`onAccountCreated`), and `./core` for core in place of `genericOAuth`; `src/auth/database.ts`
wrapping Shopper's connection in the package's `Database` shape (until 16.13); `accountMigrations` under `ACCOUNT_MIGRATIONS_TABLE`, and one migration
of Shopper's that checks better-auth's existing tables and records them, changing no data; the sign-in and sign-up pages on `SignInForm` and
`SignUpForm` with the package's flows; `src/auth/auth.ts` deleted; the seed, `People.deletePerson` and the tests moved; better-auth exactly at the
package's version. Not yet the vault: 18.2 gives the package its key-store hooks.

**Accepts when:** every test of `src/auth/` and the sign-in browser tests pass on the package, against all three databases; a 0.1.0 database's
accounts still sign in; nothing of a password reaches the server in the clear once 18.2 is in.

**Done as (0.3.0):** `createAuth` is the package's preset with Shopper's settings, mail, sign-up policy and records (`userCreated` finding the
account by its address); the auth store is opened again in the package's shape (`src/auth/store.ts`: the file and the sqld namespace through
`@sovereignfs/auth/database`, PostgreSQL through a pool whose `search_path` is `shopper_auth`), so no wrapper of Shopper's was needed. At every start
`migrateAuthStore` runs `adoptAccountTables` after Shopper's own auth migrations, unmarks the passwords Shopper had already moved (`password_derived`),
and runs the package's, the core sign-in's and the SDK stores' migrations. Core is the package's `./core` on the SDK's steps, its stores in the auth
store and the refresh token sealed with Shopper's ring (`src/auth/sdk-stores.ts`); the notices are `coreNotices` behind Shopper's body cap and rate
limit (`buildNotices`); the key secret, the move of a 0.1.0 password and the sign-in flow are the package's, so `move.ts`, `secret.ts`, the two
routes, `http.ts` and `verifiers.ts` are gone. Deleting a person deletes the package's rows too, each by name. Signing out of a session from core goes
through core (`/api/account/sign-out`, the manifest's `postLogout`). **Kept Shopper's own:** the sign-in and sign-up screens, which carry the
recovery-kit step `SignInForm` has not, on the package's client flows; the fresh session that stands in for a password when deleting an account
with none. `SHOPPER_CORE_URL` must be the instance's own address, as the SDK requires; the fake Sovereign's issuer follows core's. **Seen:**
`upgrade.test.ts` (a 0.2.x store with an unmoved, a moved and a core account: kept, marked only the first, signed in after the move; seen to fail
without the unmarking), the suite on a file, sqld and PostgreSQL (725 passed; on PostgreSQL the five tests of `boot.test.ts` and `migrate.test.ts`
that list the app store's tables fail as they do on `develop` before this change: the vault's tables are not in the `shopper` schema there), the
deletion test seen to fail without the refresh token's delete; the browser suite on a SQLite file in Chromium and WebKit (199 passed, with
their expected changes: the package's wording for a wrong password, 422 for a closed sign-up, its cookie and key-secret address, `error=sovereign`,
and a notice that names the person rather than a core session; one test now waits for the page's menu before signing out, which it had raced).
**Found:** `@sovereignfs/sdk` 2.11 does not check the signature of the ID token it
takes from core's token endpoint, though sdk §9.1 says it does; `sovereign.test.ts` keeps that test as `it.fails` until a release fixes it.
