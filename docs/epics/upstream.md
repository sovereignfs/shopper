# Epic 16: Upstream, in `sovereign`

## Status

📋 Planned.

## Overview

What Shopper needs from `sovereignfs/sovereign` before it can use it: parts of the design system it lacks, a value the environment contract does not
allow yet, and its port in the guide. **The work is done in `sovereign`,** as that repository's own tasks, following its `AGENTS.md` (design system
first, a story and a gallery entry per component, a published release). **Phase 1 waits on none of them:** 0.1.0 uses the icons, components and sign-up values that exist. These entries record what Shopper needs, so that a Shopper task can depend on
them; each is marked done when the release that carries it is published. **Several are the same parts Tally and Roam wait on**; one task in
`sovereign` serves every app, and the first app to need it starts it.

## Related

[`DESIGN.md`](../../DESIGN.md) §6.3, §8.4, §16.10, §24 · `docs/specs/design-system.md` and `contracts/env.md` in `sovereign` · Tally's and Roam's
`docs/epics/upstream.md`

## Tasks

#### 📋 16.1 — `AUTH_SIGNUP` by invitation

**Goal:** `invite` as a value of `AUTH_SIGNUP` for every app. **Design:** §6.3, §24. **Depends on:** nothing here. **Needed by:** 2.7 (phase 2); if it is
released before phase 1 ends, 2.7 moves into 0.1.0.

**What Shopper needs:** `contracts/env.md` and `@sovereignfs/config` allowing `invite` (the first account and anyone holding a valid invitation). The
same as Tally's 14.5 and Roam's 17.2.

**Accepts when:** a `sovereign` release carrying it is published.

#### 📋 16.2 — Shopper's port in the guide

**Goal:** 3007 in building-an-app §2's table. **Design:** §24. **Depends on:** nothing here.

**What Shopper needs:** the table to list Shopper's 3007, with Ledger's 3003, Tally's 3004, Roam's 3005 and Wallet's 3006 if they are not there yet.

**Accepts when:** the guide on `sovereign`'s `main` lists it.

#### 📋 16.3 — `AvatarStack`

**Goal:** overlapping avatars with "+N". **Design:** §16.9, §16.10. **Depends on:** nothing here. **Needed by:** 8.9 (phase 2).

**What Shopper needs:** a household's members as initials in a row, overlapping, with a count beyond a limit and an accessible label naming everyone.
The same as Tally's 14.2 and Roam's 17.4.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

#### 📋 16.4 — Grocery icons

**Goal:** enough grocery icons for the starter catalog. **Design:** §8.4. **Depends on:** nothing here. **Needed by:** 4.8 (phase 2).

**What Shopper needs:** about 80 icons in the design system's style, added to the set `IconPicker` offers (beside the 21 the plugin added): the
fifteen starter categories and the common products of the starter catalog (fruit and vegetables by kind, bread, dairy, eggs, meat, fish, frozen, tins
and jars, pasta and rice, drinks by kind, cleaning, paper goods, toiletries, baby, pet). Token-coloured, accessible names, licence compatible with
AGPL. Started during phase 1 so that it is released by 4.8; the starter catalog of 0.1.0 uses the icons that exist.

**Accepts when:** a `@sovereignfs/ui` release carrying them is published.

#### 📋 16.5 — A floating action button

**Goal:** the phone's Add. **Design:** §16.11. **Depends on:** nothing here. **Needed by:** 8.11 (phase 2).

**What Shopper needs:** a button floating above `MobileFooter`, one primary action, an accessible label, keeping clear of the footer and safe areas.
The same as Tally's 14.3 and Roam's 17.5.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

#### 📋 16.6 — Charts

**Goal:** charts for phase 3's insights. **Design:** §22.2. **Depends on:** nothing here.

**What Shopper needs:** a bar chart (categories, products, people) and a chart over time (months, a product's price), token-coloured in light and
dark, each with an accessible table of the same data, no chart library loaded from elsewhere. The same as Tally's 14.1, which Ledger also needs.

**Accepts when:** a `@sovereignfs/ui` release carrying them is published.

#### 📋 16.7 — `MoneyInput`

**Goal:** a price input bound to a currency's decimals. **Design:** §16.10. **Depends on:** nothing here.

**What Shopper needs:** Tally's 14.4. Shopper uses it if it is published by the time 8.10 is built; otherwise `CurrencyInput` with the household's
decimals, switched when it lands. Not started for Shopper alone.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published, or Shopper decides it is not needed.

#### 📋 16.8 — Sharing in an app with no core

**Goal:** a person of an app with no core can seal a document key to another person of it. **Design:** RFC 0001, "Two kinds of account".
**Depends on:** nothing here. **Needed by:** 18.8's standalone form, and joining by email with standalone accounts (3.10, phase 2).

**What Shopper needs:** sdk §9.5's "an app with no core shares nothing yet" lifted: `AppVault` serving a person's public keys for the app, signed by
their account key, in the form `keys.person` gives, so that `checkPerson` and `share()` work over them; and, on an instance with both ways in, one
way for a page to check a core account and a local one alike. The same need as any app of the suite that runs alone and shares.

**Accepts when:** a `@sovereignfs/sdk` release carrying it is published.

#### 📋 16.9 — A document key by link

**Goal:** sharing a document key through a link's fragment, as the suite's and not one app's. **Design:** RFC 0001, "Invitations". **Depends on:**
nothing here. **Needed by:** nothing; 18.7 is built on the SDK's primitives and moves onto this if it is published.

**What Shopper needs:** a pair of SDK calls that wrap a document key under a fresh secret for a link and open it from the fragment, removing the
fragment first, with RFC 0005's words for what a leaked link gives. Tally's and Tusk's invitations would use the same.

**Accepts when:** a `@sovereignfs/sdk` release carrying it is published, or `sovereign` decides it is the app's.

#### 📋 16.10 — The key secret over an app's own session

**Goal:** `auth.keySecret` and `/auth/key-secret` usable by an app whose sessions are its own better-auth's, not the SDK's `nextAuth`. **Design:**
RFC 0001, open question 1. **Depends on:** nothing here. **Needed by:** 18.3.

**What Shopper needs:** either the SDK's helper taking a session from the app, or `@sovereignfs/auth` (17.3) serving it; documented in sdk §9.3.

**Accepts when:** the guide says how, in a published release, or 17.3 moves Shopper onto `@sovereignfs/auth` and it serves it.

#### 📋 16.11 — The environment contract and the guide, true

**Goal:** `contracts/env.md` and `docs/building-an-app.md` say what apps use. **Design:** RFC 0001, RFC 0002. **Depends on:** nothing here.

**What Shopper needs:** `<PREFIX>_VAPID_PRIVATE_KEY` and `_VAPID_SUBJECT` in `contracts/env.md`; `<PREFIX>_FIELD_ENCRYPTION_KEYS` there reconciled
with the `<PREFIX>_ENCRYPTION_KEY` and `_PREVIOUS` every app uses; `contracts/app-manifest.md`'s heading naming manifest 5; the guide's package
table listing `auth` and `export`, and its line that 16.14 is not built corrected.

**Accepts when:** `sovereign`'s `main` carries the corrections.

#### 📋 16.12 — Background Sync in `@sovereignfs/pwa`

**Goal:** the shared worker answers Background Sync, or lets an app add a handler, as it lets an app add push kinds. **Design:** §12.3. **Depends on:**
nothing here. **Needed by:** 17.2, if the package has no way today.

**What Shopper needs:** the worker posting a `sync` event to the app's open pages, or a hook for the app's own handler, so that a device sends its
outbox when the connection returns with no tab in front.

**Accepts when:** a `@sovereignfs/pwa` release carrying it is published, or 17.2 finds the package already does.

#### 📋 16.13 — A SQLite and sqld database for `@sovereignfs/auth`

**Goal:** an app on a SQLite file or sqld gives `@sovereignfs/auth` its database through a published entry, as `./postgres` does for PostgreSQL.
**Design:** [ADR 0001](../adrs/0001-sign-in-on-sovereignfs-auth.md). **Depends on:** nothing here. **Needed by:** nothing; 17.5 wraps Shopper's own
connection until it lands, and drops the wrapper then.

**What Shopper needs:** `@sovereignfs/auth/sqlite` (or the database package published), taking a libsql client for a file or sqld, so that the
`Database` type an app gives is the package's own.

**Accepts when:** a `@sovereignfs/auth` release carrying it is published.
