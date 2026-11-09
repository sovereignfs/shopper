# Epic 16: Upstream, in `sovereign`

## Status

📋 Planned.

## Overview

What Shopper needs from `sovereignfs/sovereign` before it can use it: parts of the design system it lacks, a value the environment contract does not
allow yet, and its port in the guide. **The work is done in `sovereign`,** as that repository's own tasks, following its `AGENTS.md` (design system
first, a story and a gallery entry per component, a published release). These entries record what Shopper needs, so that a Shopper task can depend on
them; each is marked done when the release that carries it is published. **Several are the same parts Tally and Roam wait on**; one task in
`sovereign` serves every app, and the first app to need it starts it.

## Related

[`DESIGN.md`](../../DESIGN.md) §6.3, §8.4, §16.10, §24 · `docs/specs/design-system.md` and `contracts/env.md` in `sovereign` · Tally's and Roam's
`docs/epics/upstream.md`

## Tasks

#### 📋 16.1 — `AUTH_SIGNUP` by invitation

**Goal:** `invite` as a value of `AUTH_SIGNUP` for every app. **Design:** §6.3, §24. **Depends on:** nothing here.

**What Shopper needs:** `contracts/env.md` and `@sovereignfs/config` allowing `invite` (the first account and anyone holding a valid invitation). The
same as Tally's 14.5 and Roam's 17.2.

**Accepts when:** a `sovereign` release carrying it is published.

#### 📋 16.2 — Shopper's port in the guide

**Goal:** 3007 in building-an-app §2's table. **Design:** §24. **Depends on:** nothing here.

**What Shopper needs:** the table to list Shopper's 3007, with Ledger's 3003, Tally's 3004, Roam's 3005 and Wallet's 3006 if they are not there yet.

**Accepts when:** the guide on `sovereign`'s `main` lists it.

#### 📋 16.3 — `AvatarStack`

**Goal:** overlapping avatars with "+N". **Design:** §16.9, §16.10. **Depends on:** nothing here.

**What Shopper needs:** a household's members as initials in a row, overlapping, with a count beyond a limit and an accessible label naming everyone.
The same as Tally's 14.2 and Roam's 17.4.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

#### 📋 16.4 — Grocery icons

**Goal:** enough grocery icons for the starter catalog. **Design:** §8.4. **Depends on:** nothing here.

**What Shopper needs:** about 80 icons in the design system's style, added to the set `IconPicker` offers (beside the 21 the plugin added): the
fifteen starter categories and the common products of the starter catalog (fruit and vegetables by kind, bread, dairy, eggs, meat, fish, frozen, tins
and jars, pasta and rice, drinks by kind, cleaning, paper goods, toiletries, baby, pet). Token-coloured, accessible names, licence compatible with
AGPL. Started with Shopper's Milestone A so that it is released by 4.3.

**Accepts when:** a `@sovereignfs/ui` release carrying them is published.

#### 📋 16.5 — A floating action button

**Goal:** the phone's Add. **Design:** §16.11. **Depends on:** nothing here.

**What Shopper needs:** a button floating above `MobileFooter`, one primary action, an accessible label, keeping clear of the footer and safe areas.
The same as Tally's 14.3 and Roam's 17.5.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published.

#### 📋 16.6 — Charts

**Goal:** charts for phase 2's insights. **Design:** §22.1. **Depends on:** nothing here.

**What Shopper needs:** a bar chart (categories, products, people) and a chart over time (months, a product's price), token-coloured in light and
dark, each with an accessible table of the same data, no chart library loaded from elsewhere. The same as Tally's 14.1, which Ledger also needs.

**Accepts when:** a `@sovereignfs/ui` release carrying them is published.

#### 📋 16.7 — `MoneyInput`

**Goal:** a price input bound to a currency's decimals. **Design:** §16.10. **Depends on:** nothing here.

**What Shopper needs:** Tally's 14.4. Shopper uses it if it is published by the time 8.4 is built; otherwise `CurrencyInput` with the household's
decimals, switched when it lands. Not started for Shopper alone.

**Accepts when:** a `@sovereignfs/ui` release carrying it is published, or Shopper decides it is not needed.
