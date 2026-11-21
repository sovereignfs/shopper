# Epic 17: Suite alignment

## Status

📋 Planned. Leg 1 of [workstream 0001](../workstreams/0001-suite-model.md); before phase 2.

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
passed; one earlier run had a timing failure in a test of `core_sub` that three reruns did not repeat); `pnpm build`. Left out: the browser tests
in Chromium, which Playwright had no browser for on the machine that ran them (WebKit's ran and passed), and a look at every screen by eye.

#### 📋 17.2 — The worker from `@sovereignfs/pwa`

**Goal:** Shopper's service worker and web manifest made by `@sovereignfs/pwa`, not copied from Tusk. **Design:** §12.10, §16.11. **Depends on:** 17.1.

**Technical:** `serviceWorkerSource` with the shell-only allow-list, the build id and the precache Shopper has now; opening offline (6.5) and a
link opening the installed app (0.2.0 on `develop`) kept. Shopper's worker answers Background Sync (`src/sw/source.ts`); if `@sovereignfs/pwa` has no
way to, raise it in `sovereign` (16.12) and keep that handler only until it is released, through whatever extension point the package gives.
`src/sw/source.ts` is deleted once nothing of it is needed.

**Accepts when:** 6.5's acceptance passes again; no response with a person's data is cached (its test, seen to fail with the allow-list widened).

#### 📋 17.3 — Sign-in and `@sovereignfs/auth`

**Goal:** a decision, recorded, on whether Shopper's sign-in (`src/auth/`, better-auth with a password and through core) moves onto
`@sovereignfs/auth` 0.4.0. **Design:** §15.1. **Depends on:** 17.1.

**Technical:** compare `src/auth/` with the package's `/server`, `/core` and `/next`: local and core sign-in on one instance, no implicit linking,
back-channel logout, account deletion, the key secret 18.2 and 18.3 need, and finding 2 of `docs/security/0.1.0.md` (the sign-in store in plain
text). An ADR in `docs/adrs/` records the choice; moving, if chosen, is its own task.

**Accepts when:** the ADR is accepted by the owner.

#### 📋 17.4 — Stale lines and the settings table

**Goal:** the documents true again, and §20.3's `account_settings` table built. **Design:** §20.3. **Depends on:** nothing.

**Technical:** `DESIGN.md`'s opening status, the roadmap's 12.4 and 12.5 (0.1.0 is tagged), §26's rows that still put push in phase 2, the missing
`[0.2.0]` link in `CHANGELOG.md`, and what the `0.2.0` on `develop` and phase 2's `0.2.0` each become (the owner decides). `account_settings` on both
dialects, handled by `People.deletePerson`, with its test.

**Accepts when:** no document contradicts another on these points, and the table round-trips on all three databases.
