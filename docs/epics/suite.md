# Epic 10: The suite

## Status

📋 Planned. **All of epic 10 is phase 2.** 0.1.0 signs in through a core (2.3) and answers its two notices (2.4), and uses nothing else of it: it asks
for no scope beyond `openid`, `profile` and `email`.

## Overview

What a Sovereign core adds when Shopper is hosted, and only adds: core's bell, email and activity page, and its directory as one more way to find
someone to invite. With no core, an older core, or a scope not granted, each call changes nothing but itself (`DESIGN.md` §15.4).

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §7.3, §14.3, §15.3, §15.4 · `docs/using-the-sdk.md` in `sovereign` · Tally's `docs/epics/suite.md`

## Tasks

#### 📋 10.1 — Core's bell, email and activity (phase 2)

**Goal:** notices and mail through core for people signed in through it. **Design:** §14.3, §15.4. **Depends on:** 2.3, 9.4.

**Technical:** `@sovereignfs/sdk` app calls from the server: `sv.app.notifications.send` for every kind on for core's bell, linking back to the
notice's place; `sv.app.email.sendToUser` for linked accounts' email in place of Shopper's SMTP (Shopper's used when `email:send` is not granted);
`sv.app.activity.log` for export, import and account deletion; each with a `key`; `NotSupportedError`, a refusal or no core changes nothing else; sent
from the job, never inside a transaction.

**Accepts when:** against `createFakeCore`, each channel delivers as §14.3 says; with the scopes withheld or no core, everything works through
Shopper's own channels.

#### 📋 10.2 — Inviting from the directory (phase 2)

**Goal:** finding someone on the instance by name. **Design:** §7.3, §15.3. **Depends on:** 2.3, 3.4.

**Technical:** the manifest's scopes gain `offline_access` and `directory` (the operator grants them again, and a person is asked again at their next
sign-in), and the `credential` table arrives by a new migration; the person's refresh token captured at core sign-in into the SDK's `tokenStore`, kept in `credential` under envelope encryption (as
Tally's 11.2 answers how better-auth hands it over; if that needs an SDK change, it is raised in `sovereign` and this waits);
`sv.as({ sub }).directory.searchUsers` behind the Invite field when the person has granted `directory`; choosing a result makes an invitation
addressed to that `sub`, delivered through core's bell and email and to Shopper's bell if they have an account here; accepted through the same
`/invite/<token>`.

**Accepts when:** against the fake core, a directory search offers people and an invitation reaches the chosen `sub`; with the scope not granted, the
field searches nothing and inviting by email works as alone.
