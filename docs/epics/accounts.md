# Epic 2: Accounts and sign-in

## Status

📋 Planned.

## Overview

Signing in, locally and through a Sovereign core, from one image, with both on at once when hosted; who may sign up; core's two notices; deleting
everything personal of an account while keeping its name on the shared record. Copied from Tusk's `src/auth/` and `src/sovereign/`, renamed and
trimmed (`DESIGN.md` §5.1); the person record as Tally designs it.

**0.1.0 signs in with an email and a password, or through a core.** Passkeys, the authenticator app, linking a core account to a local one and the
`invite` sign-up policy are phase 2 (2.8, 2.9, 2.7); the places for them are kept, so that adding them moves nothing.

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §6, §15, §17, §19 · Tusk's `DESIGN.md` §6, §22 · Tally's `docs/epics/accounts.md` · `contracts/app-manifest.md` §4,
`contracts/env.md`

## Tasks

#### 📋 2.1 — Local sign-in

**Goal:** accounts of the app's own, with an email and a password. **Design:** §15.1, §6.3. **Depends on:** 1.5, 1.8.

**Technical:** better-auth in the `shopper_auth` store with its own migrations; email and password when `SHOPPER_AUTH_LOCAL` is `1` or `true` (404
otherwise); `SHOPPER_AUTH_SIGNUP` with `open` (the default in 0.1.0) and `closed` in the user-creation hook, shaped so that 2.7 adds `invite` without
moving it; **a sign-up carrying an invitation link is a sign-up like any other under `open`, and under `closed` the person must already have an
account** (the link's page says so); email verification and password reset only with SMTP, through the mailer copied from Tusk; the `Auth` components;
`getSession`, `requireAccount`. Passkeys and the authenticator app are not built (2.8) and the schema carries none of their tables until then. Copied:
Tusk's `src/auth/`, the mailer, `src/limits/`.

**Accepts when:** the first account can register and the second is refused with sign-up closed; sign-in works on all three databases over real
requests; the pages answer 404 with local sign-in off; the README's note says that `open` is the default and what `closed` is for.

#### 📋 2.2 — Landing page and the address `/`

**Goal:** a visitor sees what Shopper is; a signed-in person lands on their last list. **Design:** §16.3, §16.4. **Depends on:** 2.1.

**Technical:** a static landing page from typed content with no client code; `proxy.ts` serves the signed-in area at `/` for a request with a session
cookie, as Tusk's; the signed-in `/` resolves the last list from the device, then `account_settings.last_list_id`, then the account's first
household's first list (the list screen itself is 8.2; until then, a placeholder).

**Accepts when:** `/` shows the landing page signed out and the last list signed in, with no redirect loop.

#### 📋 2.3 — Sign-in through core

**Goal:** a Sovereign core as a way in, beside local accounts or alone. **Design:** §15.1. **Depends on:** 2.1, 3.3.

**Technical:** `genericOAuth` with PKCE S256 when `SHOPPER_CORE_*` are all set; redirect `/api/auth/callback/sovereign`; scopes `openid`, `profile`,
`email` (§15.3; the directory's two come with 10.2); an account made through core whatever `SHOPPER_AUTH_SIGNUP` says; making the account makes its
person and first household (3.1, 3.3); no linking by email: **a core login whose email is a local account's is refused with a sentence that says to
sign in with the password**, until 2.9 lets a signed-in person link the two; the fake Sovereign copied for tests.

**Accepts when:** sign-in through the fake Sovereign works with local accounts on and off; a core login whose email matches a local account is refused
with the sentence, and no account is made or touched; a partial `SHOPPER_CORE_*` stops start-up; sign-up `closed` does not refuse a core sign-in; the
new account has its first household.

#### 📋 2.4 — Core's notices

**Goal:** back-channel logout and account deleted. **Design:** §15.2. **Depends on:** 2.3, 2.5.

**Technical:** `/api/sovereign/backchannel-logout` and `/api/sovereign/account-deleted`, verified by `@sovereignfs/sdk` (`verifyLogoutToken`,
`verifyAccountDeletedToken`), `notice_seen` for replays, a bounded form, a rate limit, 404 without core. Logout also closes the person's live streams
once 6.4 is in. Account deleted runs `deletePerson` and answers `200` only once done. Copied: Tusk's `src/sovereign/http.ts`, `verifiers.ts`,
`identity.ts`.

**Accepts when:** against `createFakeCore`, a logout notice ends every session of the person, an account-deleted notice leaves nothing personal of
them and every shared household intact, and a replayed `jti` is refused after a restart.

#### 📋 2.5 — Deleting a person

**Goal:** one routine that removes everything personal of an account and keeps its name on the shared record. **Design:** §19. **Depends on:** 3.3.

**Technical:** `People.deletePerson` in `src/sovereign/people.ts`: the person kept as a name only (`account_id`, email and `core_sub` cleared,
`deleted_at` set; the sealed envelope rewritten with the name alone); memberships ended; **a household where they were the only Admin passes to its
longest-standing member** (told by `admin_passed` once 9.2 is in), and **a household with no other member is deleted**, by `household_id`, with
everything of it; the rows of §19 that exist removed; better-auth's rows and the account; the `sub` link last; safe to run twice.
`/api/account/delete` after the password or a fresh session. The test seeds one row of every table for the person and for a second person sharing a
household, and fails for a table nobody decided about. Each later task that adds a table extends it.

**Accepts when:** after deletion no table holds the person's email, sign-in or anything listed in §19; their name still shows on items they added in
the second person's household; that household is intact with a new Admin where needed; a household they were alone in is gone; a second run
succeeds.

#### 📋 2.6 — Settings

**Goal:** Settings as a page and from the avatar menu. **Design:** §17. **Depends on:** 2.1, 1.8, 3.1.

**Technical:** `/settings` with Profile (name and email, written to the account and the person together), Sign-in (change password), and Data holding
delete account. This device arrives with 6.3, which adds Couldn't sync and Reset this device. In phase 2: the freshness choice with 6.4,
Notifications with 9.4, passkeys and two-factor with 2.8, linking core with 2.9, export and import with 11.1–11.3.

**Accepts when:** each section works on all three databases; changing the name changes it on every household the person is in, at the other members'
next sync.

#### 📋 2.7 — The sign-up policy (phase 2)

**Goal:** local sign-up by invitation, by default. **Design:** §6.3. **Depends on:** 2.1, 16.1.

**Technical:** `invite` added to `SHOPPER_AUTH_SIGNUP` once `contracts/env.md` and `@sovereignfs/config` allow it (16.1), and **made the default**,
which is a change of behaviour for a server that never set the value and says so in the changelog and the upgrade note; the user-creation hook
accepts the first account and a sign-up carrying a valid invitation token (checked, not consumed, until acceptance in 3.4). If 16.1 is released
before phase 1 ends, this moves into 0.1.0 as a task of Milestone G.

**Accepts when:** with `invite`, a sign-up without a valid invitation is refused, one with it is accepted, and the first account is always accepted;
`open` and `closed` behave as before.

#### 📋 2.8 — Passkeys and the authenticator app (phase 2)

**Goal:** stronger ways in for local accounts. **Design:** §15.1, §17. **Depends on:** 2.1.

**Technical:** better-auth's passkey and two-factor plugins as Tusk configures them, with backup codes, their tables in the auth store through a new
migration, their sections in Settings > Sign-in, and the sign-in flow's second step; removing one can never remove an account's last way in. Copied:
Tusk's `src/auth/` parts left out of 2.1.

**Accepts when:** a passkey and an authenticator app can each be added, used to sign in, and removed; the last way in cannot be removed; backup
codes work once each.

#### 📋 2.9 — Linking core and a local account (phase 2)

**Goal:** one person, two ways in, never joined by guessing. **Design:** §15.1. **Depends on:** 2.3.

**Technical:** from a signed-in session, link the other kind of account when the addresses match; the sentence of 2.3 becomes a link to do it;
unlinking can never remove the last way in; no linking at sign-in, ever. Copied: Tusk's linking.

**Accepts when:** a person signed in locally links a core account with the same address and then signs in either way to one account and one person;
a core login for an address that is a local account's is still refused until linked.
