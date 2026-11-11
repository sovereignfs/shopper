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

#### ✅ 2.1 — Local sign-in

**Goal:** accounts of the app's own, with an email and a password. **Design:** §15.1, §6.3. **Depends on:** 1.5, 1.8.

**Technical:** better-auth in the `shopper_auth` store with its own migrations; email and password when `SHOPPER_AUTH_LOCAL` is `1` or `true` (404
otherwise); `SHOPPER_AUTH_SIGNUP` with `open` (the default in 0.1.0) and `closed` in the user-creation hook, shaped so that 2.7 adds `invite` without
moving it; **a sign-up carrying an invitation link is a sign-up like any other under `open`, and under `closed` the person must already have an
account** (the link's page says so); email verification and password reset only with SMTP, through the mailer copied from Tusk; the `Auth` components;
`getSession`, `requireAccount`. Passkeys and the authenticator app are not built (2.8) and the schema carries none of their tables until then. Copied:
Tusk's `src/auth/`, the mailer, `src/limits/`.

**Accepts when:** the first account can register and the second is refused with sign-up closed; sign-in works on all three databases over real
requests; the pages answer 404 with local sign-in off; the README's note says that `open` is the default and what `closed` is for.

**Done as:** `src/auth/` (better-auth in the `shopper_auth` store through its Drizzle adapter; the settings; the server's view with `getAuth`, `signUpAvailable` and `mailAvailable`; `getSession`, `requireSession` and `requireAccount`; messages that never say whether an address has an account; the session cookie's name for the proxy; the sign-in, sign-up, forgot and reset forms and the pages and `/api/auth` route), `src/mail/` (the mailer interface, SMTP, a memory mailer and an SMTP sink for tests, the two messages) and `src/limits/rate.ts` copied from Tusk and renamed, with their tests. **Left out, as the task says:** passkeys and the authenticator app (their clients, plugin, hook, forms and tables; 2.8), and `notificationMessage` (phase 2); the fake Sovereign and its test of redirects wait for 2.3, although `createAuth` already carries the `genericOAuth` configuration, which 2.3 tests and finishes (the person and household it makes, and that `closed` does not refuse it). Sign-up is `open` by default and `closed` on request, in the user-creation hook. `proxy.ts` answers the sign-in pages with the page that is not found when local sign-in is off, and keeps `/sign-in` alone when a core is set; `AuthShell` takes `src/ui/ShopperMark.tsx`, a new mark (the app's icon in the text's colour). `makeStore` joined `src/db/test-support.ts`. Browser tests (`e2e/auth.spec.ts`): an account is made and signed in, signing in again, a wrong password reading as an unknown address, a too-short password refused by the server, and a second instance closed to sign-up that takes the first account and refuses the second; each test is a visitor of its own (`X-Forwarded-For`, in the `test` fixture of `e2e/helpers.ts`), since sign-up is rate-limited per address. **Seen:** the suite (237 tests) on all three databases and the 24 browser tests in both browsers, the auth ones also on sqld.

#### ✅ 2.2 — Landing page and the address `/`

**Goal:** a visitor sees what Shopper is; a signed-in person lands on their last list. **Design:** §16.3, §16.4. **Depends on:** 2.1.

**Technical:** a static landing page from typed content with no client code; `proxy.ts` serves the signed-in area at `/` for a request with a session
cookie, as Tusk's; the signed-in `/` resolves the last list from the device, then `account_settings.last_list_id`, then the account's first
household's first list (the list screen itself is 8.2; until then, a placeholder).

**Accepts when:** `/` shows the landing page signed out and the last list signed in, with no redirect loop.

**Done as:** `src/landing/` (a server component with no client code, and typed `content.ts` that says what is so today, with a test that it promises no trips, prices, live updates, notices, export or barcodes) adapted from Tusk. `proxy.ts` answers `/` for a request with a session cookie with the signed-in area's front page, `/home`, keeping the address `/`, and sends `/home` itself to `/` once (the same rewrite and loop guard as Tusk's); only the cookie is looked at, since the page checks the session and sends a forged cookie to sign in. `app/(app)/layout.tsx` checks the session and makes the frame (`ShellFrame`, which gained an `account` slot) with `AccountMenu` (the person's name and address, and _Sign out_, which ends the session and returns to the landing page; 6.2 makes it also leave the device, and 2.6 adds Settings). **`/home` is a placeholder** that says the lists are not here: resolving the last list, from the device, then `account_settings`, then the first household's first list, is 8.2's, since neither a list nor `account_settings` exists yet. Seen in the browser tests, in both browsers: the landing page with its two links for a visitor, the signed-in area at `/` after sign-up, `/home` going to `/`, and signing out returning to the landing page (28 tests).

#### ✅ 2.3 — Sign-in through core

**Goal:** a Sovereign core as a way in, beside local accounts or alone. **Design:** §15.1. **Depends on:** 2.1, 3.3.

**Technical:** `genericOAuth` with PKCE S256 when `SHOPPER_CORE_*` are all set; redirect `/api/auth/callback/sovereign`; scopes `openid`, `profile`,
`email` (§15.3; the directory's two come with 10.2); an account made through core whatever `SHOPPER_AUTH_SIGNUP` says; making the account makes its
person and first household (3.1, 3.3); no linking by email: **a core login whose email is a local account's is refused with a sentence that says to
sign in with the password**, until 2.9 lets a signed-in person link the two; the fake Sovereign copied for tests.

**Accepts when:** sign-in through the fake Sovereign works with local accounts on and off; a core login whose email matches a local account is refused
with the sentence, and no account is made or touched; a partial `SHOPPER_CORE_*` stops start-up; sign-up `closed` does not refuse a core sign-in; the
new account has its first household.

**Done as:** Most of the plumbing was already in place from 2.1's foundation and is now held by tests: `genericOAuth` with PKCE S256, the exact redirect `/api/auth/callback/sovereign`, scopes `openid profile email` (`SOVEREIGN_SCOPES`), `requireIdTokenVerification`, `SHOPPER_CORE_*` all or none (`config.test.ts` already stops start-up on a partial set), tokens kept encrypted, no implicit linking (`disableImplicitLinking`), and the person and first household made when the account is (`onAccountCreated`, and again at the next session check). **What this task changed:** `src/auth/auth.ts`'s sign-up policy no longer applies to an account made through core: the `user.create.before` hook returns early for a callback (`context.path` includes `/callback/`), so under `SHOPPER_AUTH_SIGNUP=closed` local sign-up is still refused after the first account but anyone Sovereign signs in gets one (DESIGN.md §15.1). **A core login whose email is a local account's** is refused (`account_not_linked`), makes no account and touches nothing, whether or not that address was confirmed; the sign-in page says "There is already an account here with that email address. Sign in with your password." (already in `messages.ts`). The invitation page no longer warns that "an account is needed first" on an instance that has core, since core makes one. **The fake Sovereign** is copied from Tusk with its discovery fixture and test (`src/auth/testing/fake-sovereign.ts`, `src/auth/fixtures/sovereign-discovery.json`, `sovereign-discovery.test.ts`, `scripts/record-sovereign-discovery.mjs`), with `jose` 6.2.16 added as an exact-pinned dev dependency (already in the lockfile as better-auth's; added from the local store, nothing downloaded). Tests: `sovereign.test.ts` (copied in part from Tusk's, 19 tests over real requests: a new person's account with the sub, email and name; PKCE, the exact callback and basic auth; the same person by sub, even if the address moved; a name from the address when none; encrypted tokens; a wrong key, a wrong audience, a missing nonce, a declined login, a replayed callback; sign-out local; the local routes refused; **sign-up closed: three strangers all signed in**; **beside local with sign-up closed: local sign-up still refused, a stranger let in through core, and an address that is a local account's refused whether confirmed or not with the users and accounts as they were**; two of these were seen to fail with the hook change removed) and 8 browser tests in Chromium on two instances of their own with sign-up closed (`e2e/sovereign.spec.ts`, a fake Sovereign process and its control port in `e2e/fake-sovereign-server.ts`, ports in `e2e/ports.ts`): core only, with the local pages 404; two strangers signed in as who Sovereign says, each with their own household and Groceries list; the same person again as the same account with signing out local; a declined login; **someone invited by a link signs in through Sovereign and comes back to the invitation and joins**; and an instance with both ways: the local account still signs in, a stranger gets in through core, and an address that is the local account's is refused with the sentence and the local account is as it was. Left out: **linking the two** (2.9); **core's notices** (2.4); the manifest and its scopes check (1.10); a refresh token and the directory scopes (phase 2). Against a real core: the fake agrees with the recorded discovery document, but no real instance was signed into here. WebKit, PostgreSQL and sqld were not run.

#### ✅ 2.4 — Core's notices

**Goal:** back-channel logout and account deleted. **Design:** §15.2. **Depends on:** 2.3, 2.5.

**Technical:** `/api/sovereign/backchannel-logout` and `/api/sovereign/account-deleted`, verified by `@sovereignfs/sdk` (`verifyLogoutToken`,
`verifyAccountDeletedToken`), a replayed `jti` refused (counted in `rate_bucket`), a bounded form, a rate limit, 404 without core. Logout also closes the person's live streams
once 6.4 is in. Account deleted runs `deletePerson` and answers `200` only once done. Copied: Tusk's `src/sovereign/http.ts`, `verifiers.ts`,
`identity.ts`.

**Accepts when:** against `createFakeCore`, a logout notice ends every session of the person, an account-deleted notice leaves nothing personal of
them and every shared household intact, and a replayed `jti` is refused after a restart.

**Done as:** Copied from Tusk with Shopper's names (`src/sovereign/http.ts`, `verifiers.ts`, `identity.ts`, `server.ts`, their tests, and the two routes in `app/api/sovereign/`), changing only what Shopper's `deletePerson` needs: the key ring is passed, from `getConfig().encryption`. **`POST /api/sovereign/backchannel-logout`** ends every session of the person whose `sub` the notice names (`accountOfSub` finds the account by the `sub` kept as the Sovereign sign-in's `account_id`; `endSessionsOf` deletes its sessions); **`POST /api/sovereign/account-deleted`** runs `People.deletePerson` for that account and answers `200` only once it is done, `500` if it failed (so that core sends it again), and `200` for a person nobody here knows (core retries a deletion until it is answered). Both are checked by `@sovereignfs/sdk`'s `verifyLogoutToken` and `verifyAccountDeletedToken` (type, signature against core's keys, issuer, audience, age, event, `jti`, no `nonce`); a wrong one is `400 invalid_request`, core unreachable `503`, ours `500`; the credential is the signed token alone (no session, cookie or `Origin`); the body is a bounded form, read no further than 16 KB; one rate limit (300 a minute across both) is taken before anything is asked of core; nothing logs a token, a person or a message; the answers are never cached; and without core the routes are 404 (`src/access/routes.ts`). **Replays:** the SDK's `seen` is answered from the database that every process shares, as Tusk's: a notice's `jti` is counted against a limit of one in the existing `rate_bucket` table for as long as the notice could be replayed, so a restarted process refuses a replay too. **This differs from what the design and this epic first said (a `notice_seen` table)**: no table was added, since the rate counter does exactly that and is swept with the others (a `jti` is not personal); `DESIGN.md` §15.2, §20.3 and this epic's technical note now say so. Tests: Tusk's `http.test.ts` (15) and `verifiers.test.ts` (against the SDK's own fake core: every way a token can be wrong, one notice taken for the other, 503 not remembered, a replay, the window forgotten), and `notices.test.ts` (5, through the real wiring on the leg's database: a logout ends every session of the person named and no one else's, and an unknown person is 200 and ends nothing; a deletion leaves nothing personal, passes the Admin role, leaves every shared household whole with the name kept, and core's retry is 200; a replay is refused by another process that has just started, seen to fail with the replay record removed; wrong tokens end and delete nothing), and 4 browser tests in Chromium against the fake Sovereign, which gained a control route to sign notices (`e2e/sovereign.spec.ts`: a logout ends the sessions in two browsers and the person can sign in again; wrong, crossed, empty and replayed notices refused and the person still signed in; a deletion removes a person who joined a household, the host's household whole with the leaver shown as having left, and a retry answered 200; GET is 405 and an instance without core answers 404). Left out: **closing the person's live streams** on a logout (6.4 has no stream yet); **the activity line** at core on deletion (phase 2, `activity:write`). WebKit, PostgreSQL and sqld were not run here; no real core sent a notice.

#### ✅ 2.5 — Deleting a person

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

**Done as:** `src/sovereign/people.ts` (`deletePerson`, and `previewLeaving` for the confirmation), `delete-account.ts` (its handler: the password asked for, counted, the session's own account only; a session made in the last ten minutes where there is no password) and `app/api/account/delete/route.ts`, adapted from Tusk; `src/access/route.ts` (`accountRoute`: session, then `Origin` for a write, then the handler with the account id and nothing else) and `body.ts` are new, and the route is in `src/access/routes.ts`. One routine in a fixed order, safe to run again: the households (**the Admin role passes to the member who has been in longest** where they were its only Admin and others remain; a household nobody else is in is deleted **by `household_id` over `HOUSEHOLD_TABLES`**, a list `src/households/tables.ts` that a test holds to every schema table carrying `household_id`; otherwise they leave; each its own transaction, the household's counter stepped for what changed), the rate counters that carry their account, the sign-in store (sessions, sign-ins, pending verifications found by the address, then the account), and **last** the person, kept as a name only (the account link, the core identity and the email gone). `admin_passed` waits for notices (9.2). **`people.test.ts` decides what happens to every table of both stores and fails for one that is undecided,** seeds the sign-in rows and counters of two people, and finds nothing of the first after (the name aside) and the second's household and account intact; a run cut off before the person is finished by running it again. Browser test: the preview, a wrong password refused, deletion with the right one, and the account no longer signing in. **Seen on all three databases** (271 tests) and in both browsers (26).

#### ✅ 2.6 — Settings

**Goal:** Settings as a page and from the avatar menu. **Design:** §17. **Depends on:** 2.1, 1.8, 3.1.

**Technical:** `/settings` with Profile (name and email, written to the account and the person together), Sign-in (change password), and Data holding
delete account. This device arrives with 6.3, which adds Couldn't sync and Reset this device. In phase 2: the freshness choice with 6.4,
Notifications with 9.4, passkeys and two-factor with 2.8, linking core with 2.9, export and import with 11.1–11.3.

**Accepts when:** each section works on all three databases; changing the name changes it on every household the person is in, at the other members'
next sync.

**Done as:** `/settings` (`app/(app)/settings/page.tsx`), `src/account/` (the shell with its sections, `query.ts` and its test, `Account.module.css`, `ProfileSection`, `DeleteAccountSection` adapted from Tusk's; `PasswordSection` is new and smaller than Tusk's security section) and `src/auth/password.ts`. **0.1.0's sections are Profile, Sign-in and Data:** the name is changed through `/api/account/profile` (the session's own account only, kept in step in better-auth and in `person` by `updatePerson`), the address is shown and not changed, the password is changed asking for the current one and **ending every other session**, and deleting the account says what happens to each household before it asks for the password and then clears the session's cookie, so that the front address is the landing page; an account that came in through Sovereign alone is told it has no password here, and deletion asks for a session made in the last ten minutes. `AccountMenu` gained Settings. This device (6.3), the freshness choice (6.4), Notifications, passkeys and linking, and export and import are the tasks that add their sections. **The household settings** are not here (they are `/h/<id>/settings` and phase 2) and `/settings` shows no household's name. Seen in both browsers (32 tests): a name changed and read back, a wrong current password refused and the right one changing it, deletion from Data with the new password, and Settings at a phone's width with nothing to scroll sideways.

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
