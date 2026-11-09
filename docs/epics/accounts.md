# Epic 2: Accounts and sign-in

## Status

📋 Planned.

## Overview

Signing in, locally and through a Sovereign core, from one image, with both on at once when hosted; who may sign up; core's two notices; deleting
everything personal of an account while keeping its name on the shared record. Copied from Tusk's `src/auth/` and `src/sovereign/`, renamed and
trimmed (`DESIGN.md` §5.1); the sign-up policy and the person record as Tally designs them.

## Related

[`DESIGN.md`](../../DESIGN.md) §6, §15, §17, §19 · Tusk's `DESIGN.md` §6, §22 · Tally's `docs/epics/accounts.md` · `contracts/app-manifest.md` §4,
`contracts/env.md`

## Tasks

#### 📋 2.1 — Local sign-in

**Goal:** accounts of the app's own. **Design:** §15.1, §6.3. **Depends on:** 1.5, 1.8.

**Technical:** better-auth in the `shopper_auth` store with its own migrations; password, passkeys, authenticator app with backup codes, when
`SHOPPER_AUTH_LOCAL` is `1` or `true` (404 otherwise); `SHOPPER_AUTH_SIGNUP` with `open` and `closed` in the user-creation hook (shaped so that 2.7
adds `invite` without moving it); email verification and reset only with SMTP; the `Auth` components; `getSession`, `requireAccount`. Copied: Tusk's
`src/auth/`, the mailer, `src/limits/`.

**Accepts when:** the first account can register and the second is refused with sign-up closed; sign-in works on all three databases over real
requests; the pages answer 404 with local sign-in off.

#### 📋 2.2 — Landing page and the address `/`

**Goal:** a visitor sees what Shopper is; a signed-in person lands on their last list. **Design:** §16.3, §16.4. **Depends on:** 2.1.

**Technical:** a static landing page from typed content with no client code; `proxy.ts` serves the signed-in area at `/` for a request with a session
cookie, as Tusk's; the signed-in `/` resolves the last list from the device, then `account_settings.last_list_id`, then the own household's first list
(the list screen itself is 8.2; until then, a placeholder).

**Accepts when:** `/` shows the landing page signed out and the last list signed in, with no redirect loop.

#### 📋 2.3 — Sign-in through core

**Goal:** a Sovereign core as a way in, beside local accounts or alone. **Design:** §15.1. **Depends on:** 2.1, 3.3.

**Technical:** `genericOAuth` with PKCE S256 when `SHOPPER_CORE_*` are all set; redirect `/api/auth/callback/sovereign`; scopes as the manifest
(§15.3); an account made through core whatever `SHOPPER_AUTH_SIGNUP` says; making the account makes its person and own household (3.1, 3.3); no
linking by email, linking from a signed-in session only; the fake Sovereign copied for tests. Capturing the refresh token for the directory is 10.2.

**Accepts when:** sign-in through the fake Sovereign works with local accounts on and off; a core login whose email matches a local account is refused
until linked from a session; a partial `SHOPPER_CORE_*` stops start-up; sign-up `closed` does not refuse a core sign-in; the new account has its own
household.

#### 📋 2.4 — Core's notices

**Goal:** back-channel logout and account deleted. **Design:** §15.2. **Depends on:** 2.3, 2.5.

**Technical:** `/api/sovereign/backchannel-logout` and `/api/sovereign/account-deleted`, verified by `@sovereignfs/sdk` (`verifyLogoutToken`,
`verifyAccountDeletedToken`), `notice_seen` for replays, a bounded form, a rate limit, 404 without core. Logout also closes the person's live streams
(6.4). Account deleted runs `deletePerson` and answers `200` only once done. Copied: Tusk's `src/sovereign/http.ts`, `verifiers.ts`, `identity.ts`.

**Accepts when:** against `createFakeCore`, a logout notice ends every session and live stream of the person, an account-deleted notice leaves nothing
personal of them and every shared household intact, and a replayed `jti` is refused after a restart.

#### 📋 2.5 — Deleting a person

**Goal:** one routine that removes everything personal of an account and keeps its name on the shared record. **Design:** §19. **Depends on:** 3.3.

**Technical:** `People.deletePerson` in `src/sovereign/people.ts`: the person kept as a name only (`account_id`, email and `core_sub` cleared,
`deleted_at` set; the sealed envelope rewritten with the name alone); their own household deleted by `household_id`; memberships ended and open trips
finished; a household's Admin role passed to its longest-standing member (`admin_passed` once 9.2 is in); a household with no other member deleted;
the rows listed in §19 removed; better-auth's rows and the account; the `sub` link last; safe to run twice. `/api/account/delete` after the password
or a fresh session. The test seeds one row of every table for the person and for a second person sharing a household, and fails for a table nobody
decided about. Each later task that adds a table extends it.

**Accepts when:** after deletion no table holds the person's email, sign-in or anything listed in §19; their name still shows on items and trips in
the second person's household; the second person's household is intact with a new Admin where needed; a second run succeeds.

#### 📋 2.6 — Settings

**Goal:** Settings as a page and from the avatar menu. **Design:** §17. **Depends on:** 2.1, 1.8, 3.1.

**Technical:** `/settings` with Profile (name and email, written to the account and the person together), the account sections Tusk has (sign-in
methods, passkeys, two-factor, linking core), and Data holding delete account. This device arrives with 6.3 and 6.4, Notifications with 9.4, export
and import with 11.1–11.3.

**Accepts when:** each section works on all three databases; changing the name changes it on every household the person is in, at the other members'
next sync.

#### 📋 2.7 — The sign-up policy

**Goal:** local sign-up by invitation, by default. **Design:** §6.3. **Depends on:** 2.1, 16.1.

**Technical:** `invite` added to `SHOPPER_AUTH_SIGNUP` and made the default, once `contracts/env.md` and `@sovereignfs/config` allow it (16.1); the
user-creation hook accepts the first account and a sign-up carrying a valid invitation token (checked, not consumed, until acceptance in 3.4).

**Accepts when:** with `invite`, a sign-up without a valid invitation is refused, one with it is accepted, and the first account is always accepted;
`open` and `closed` behave as before.
