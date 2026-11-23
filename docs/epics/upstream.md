# Epic 16: Upstream, in `sovereign`

## Status

⏳ In Progress: 16.17 to 16.26 are built in `sovereign` (its epic 21, workstream 0012) and wait for their release.

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

#### 📋 16.14 — An app's password accounts, across to `@sovereignfs/auth`

**Goal:** an app that signed people in with passwords before the package can move onto it without everyone resetting their password. **Design:**
[ADR 0001](../adrs/0001-sign-in-on-sovereignfs-auth.md). **Depends on:** nothing here. **Needed by:** 17.5.

**What Shopper needs:** a documented way for an account whose stored hash is of a password, not of the derived value, to be moved once at its next
sign-in (the browser sends the old password and the new derived value together, once; the server checks the old and stores the new), or the
package's reason for refusing that, and a reset path that needs no mail. Core chose resets by mail for itself (`docs/upgrade.md`, 0.100.0); an app
alone often has no mail.

**Accepts when:** `sovereign` publishes the way, or decides against it and says what an app does instead.

#### 📋 16.15 — Wrapping a document key under one's own app key

**Goal:** the SDK seals a document key to the person who holds it, with no core, as `share()` does to another with one. **Design:** RFC 0001, "The
household key". **Depends on:** nothing here. **Needed by:** nothing; 18.5 does it with WebCrypto until it lands.

**What Shopper needs:** `/keys` (or `/local-vault`) taking the app key `open()` gives and a document key, and giving a record bound to the person,
the app and the document, that only that app key opens; usable from both `appKeys` and `localVault`. A household's key is kept this way by each
member in Shopper, in both modes.

**Accepts when:** a `@sovereignfs/sdk` release carrying it is published.

#### 📋 16.16 — Key release in the SDK's fake core

**Goal:** an app's tests can run core's key release end to end, as they run its sign-in against `createFakeCore`. **Design:** RFC 0001. **Depends on:**
nothing here. **Needed by:** nothing; 18.3's round trip is untested in Shopper until it lands.

**What Shopper needs:** `@sovereignfs/sdk/testing`'s fake core answering `/keys/release` as core does (the referrer check, the sealed and signed
answer in the fragment, a refusal when told to), with a way to make an answer wrong in one way, so that an app can test `receive()` on its own
return page.

**Accepts when:** a `@sovereignfs/sdk` release carrying it is published.

#### ⏳ 16.17 — `prompt=create`: an app asks core to open on its sign-up

**Goal:** an app's _Create an account_ lands on core's sign-up, not its sign-in. **Design:** [RFC 0005](../rfcs/0005-the-frame-settings-and-screens.md),
"Sign-in". **Depends on:** nothing here. **Needed by:** nothing waits; 22.2 uses it when it is released.

**What Shopper needs:** OIDC's `prompt=create` in the SDK's `beginSignIn`, in `@sovereignfs/auth`'s `/sign-in/sovereign` route, and in core's
authorize endpoint, which sends the person to `/sign-up` with the resume address as its `returnTo` (core's sign-up keeps `returnTo` already).

**Accepts when:** releases of the SDK, `@sovereignfs/auth` and core carrying it are published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.9 (its epic 21, workstream 0012), on its `develop` at `21724b3`: core 0.86.0, SDK 2.12.0, `@sovereignfs/auth` 0.7.0: `beginSignIn({ prompt: 'create' })` and `/api/auth/sign-in/sovereign?prompt=create`; core's `/sign-up` carries the app's request and ends in its sign-in. Not published yet; this is done when it is.

#### ⏳ 16.18 — Icons: `square-pen`, and more

**Goal:** the icons RFC 0005 to 0007 use are in the design system. **Design:** RFC 0005, "A list". **Depends on:** nothing here. **Needed by:** 22.3,
22.6.

**What Shopper needs:** `square-pen` (Lucide's) and, for lists, Inventory's categories and cards, icons beyond groceries: hardware, electronics,
clothing, gifts, garden, office, a card. Added by development, as 16.4's grocery icons are; people never upload their own.

**Accepts when:** a `@sovereignfs/ui` release carrying them is published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.2 (its epic 21, workstream 0012), on its `develop` at `925dbaf`: `@sovereignfs/ui` 0.107.0: twenty icons, `square-pen`, `shopping-cart` (a new list's), `store`, `hammer`, `wrench`, `plug`, `laptop`, `headphones`, `shirt`, `gift`, `sprout`, `flower-2`, `briefcase`, `paperclip`, `pill`, `baby`, `dog`, `sofa`, `wallet-cards`, `scan-barcode`. Not published yet; this is done when it is.

#### ⏳ 16.19 — `SettingsDialog`

**Goal:** settings as one dialog with a side navigation, for every app and core. **Design:** RFC 0005, "Settings". **Depends on:** nothing here.
**Needed by:** 22.5, 22.7.

**What Shopper needs:** on `Dialog`'s fixed-size `lg` frame: a title row and close across the width; sections in groups with dividers, each with an
icon; an optional search; the active section's content scrolling in a frame that does not change size; on a phone, the sections then one with a back
arrow. Controlled (`active`, `onSelect`), so that an app puts each section at an address.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.1 (its epic 21, workstream 0012), on its `develop` at `5a900be`: `@sovereignfs/ui` 0.107.0: `SettingsDialog` (`groups`, `active`, `onSelect`, `search`, `renderLink`; `active: null` is the sections alone on a phone), on `Dialog`'s new `flush`. Not published yet; this is done when it is.

#### ⏳ 16.20 — `Header` with the app's own brand

**Goal:** an app's header is the design system's, with its own wordmark. **Design:** RFC 0005, "The frame". **Depends on:** nothing here. **Needed
by:** 22.11.

**What Shopper needs:** a `brand` slot in place of the initial badge (which stays the default, for core); on the right, the launcher, the bell and the
avatar in that order, each drawn only when given.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.4 (its epic 21, workstream 0012), on its `develop` at `62c0c91`: `@sovereignfs/ui` 0.107.0: `Header`'s `brand`, beside the `leading` slot and the optional launcher, bell and avatar it already had. Not published yet; this is done when it is.

#### ⏳ 16.21 — `AppSidebar`

**Goal:** the sidebar every app copies, once. **Design:** RFC 0005, "The frame". **Depends on:** nothing here. **Needed by:** 22.11.

**What Shopper needs:** full, a rail of icons (with tooltips) or hidden, with its toggle, remembered on the device per app and per kind of page
(Shopper's `src/ui/sidebar.ts`'s rules); blocks of `NavList`, each with an optional heading and an optional trailing _+ New …_ row; an item with an icon
in a colour and a count.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.5 (its epic 21, workstream 0012), on its `develop` at `d2edbd1`: `@sovereignfs/ui` 0.107.0: `AppSidebar` and `useAppSidebar(appId, pageKind)`, with `src/ui/sidebar.ts`'s rules exported (`sidebarStateFor`, `toggleSidebarHidden`, `toggleSidebarRail`), kept under `sv.sidebar.<app>`; a rail names each row with its `title`. Not published yet; this is done when it is.

#### ⏳ 16.22 — `AppFrame`

**Goal:** the header, the sidebar, the content and a right column, wired, for every app. **Design:** RFC 0005, "The frame". **Depends on:** 16.20,
16.21. **Needed by:** 22.11.

**What Shopper needs:** desktop: `Header`, `AppSidebar`, the content, `ThreeColumnLayout`'s optional right column; phone: `MobileHeader`, the content,
`MobileFooter` and a `Drawer`; the overlays' offsets published as Tusk's `AppShell` does; nothing that changes a route by viewport.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.6 (its epic 21, workstream 0012), on its `develop` at `bdcac5a`: `@sovereignfs/ui` 0.107.0: `AppFrame` (`appId`, `brand`, `pageKind`, `blocks`, `footer`, `detail`, `renderLink`); the phone's middle button opens the drawer unless the footer gives its own `onOpenApps`. Not published yet; this is done when it is.

#### ⏳ 16.23 — The apps a person can open

**Goal:** an app's header can show the suite's launcher. **Design:** RFC 0005, "The frame". **Depends on:** nothing here. **Needed by:** 22.11.

**What Shopper needs:** a core endpoint answering, for the person signed in, the apps they may open (name, description, icon, launch address, from each
manifest with `signIn`), with icons served from core's own address; an SDK call to it with the app's token; `AppsLauncher` fed from it.

**Accepts when:** releases of core and the SDK carrying it are published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.8, on its `develop` at `6b1630e`, with a person's token and no new scope (the owner's choice): core's `GET /api/v1/apps` (`listMyApps`), the SDK's `sv.as(person).apps.list()`, and `appsLauncherItems` in `@sovereignfs/ui` for `AppsLauncher`. Its icons are served from core's own address (`/api/branding/apps/<id>`, `cb3e1a2`), fetched from each app and checked as a picture. Not published yet.

#### ⏳ 16.24 — `MobileFooter`'s middle button, named by the app

**Goal:** the middle button can be something other than the apps. **Design:** RFC 0005, "The frame". **Depends on:** nothing here. **Needed by:**
22.11.

**What Shopper needs:** a label (and so an accessible name) for the middle button, which is "Apps" today and fixed; Shopper's opens its lists.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.3 (its epic 21, workstream 0012), on its `develop` at `ede94ac`: `@sovereignfs/ui` 0.107.0: `MobileFooter`'s `launcherLabel`, beside its `launcherIcon`. Not published yet; this is done when it is.

#### ⏳ 16.25 — `Barcode`

**Goal:** a linear barcode drawn as `QrCode` draws a QR code. **Design:** [RFC 0007](../rfcs/0007-loyalty-cards.md), "A card". **Depends on:** nothing
here. **Needed by:** 24.3.

**What Shopper needs:** EAN-13, EAN-8, UPC-A, Code 128 and Code 39 as an SVG, with a quiet zone, black on white in either theme, scaled to its width;
no third-party request.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.7 (its epic 21, workstream 0012), on its `develop` at `7a48a97`: `@sovereignfs/ui` 0.107.0: `Barcode` and `encodeBarcode` (EAN-13, EAN-8, UPC-A, Code 128, Code 39), checked against bwip-js and ZXing. Not published yet; this is done when it is.

#### ⏳ 16.26 — Writing an export in the browser

**Goal:** an app whose data only the browser can open writes the contract's export there. **Design:** RFC 0005, "A readable export". **Depends on:**
nothing here. **Needed by:** nothing waits; 22.8 writes one JSON file until then.

**What Shopper needs:** `@sovereignfs/export`'s writer (the zip, the head, records) usable in a browser, with no `node:` module.

**Accepts when:** a `@sovereignfs/export` release carrying it is published.

**Built, waiting for the release (2026-11-23):** as `sovereign`'s 21.10 (its epic 21, workstream 0012), on its `develop` at `c24f270`: `@sovereignfs/export` 0.4.0: `BrowserExportWriter` from `@sovereignfs/export/browser`, the same archive as the server's writer. Not published yet; this is done when it is.
