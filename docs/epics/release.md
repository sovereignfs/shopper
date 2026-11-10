# Epic 12: Release

## Status

📋 Planned.

## Overview

From a working app to a published image hosted on the live instance: a seed to develop against, a security review written up, the documents a person
and an operator read, the release, and hosting it. **12.1 to 12.5 are 0.1.0;** 12.6 is 0.2.0, and phases 3 and 4 close with their own release tasks
(13.9, 14.6).

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §21 · Tusk's `RELEASING.md` and `scripts/release.sh` · `docs/deploying.md` in `sovereign`

## Tasks

#### 📋 12.1 — Development seed

**Goal:** `pnpm seed`. **Design:** §21 Testing. **Depends on:** 3.4, 5.5.

**Technical:** a few accounts; a household shared between two of them and the others' own; lists with open and bought items, products from the
starter catalog with some renamed; a live invitation; a folded product and item in history; someone who left. Idempotent, on every database form,
refused when `NODE_ENV` is production. Phase 2 extends it with what it adds (trips across two months in two shops with prices, notices, a second
household) as part of 12.6.

**Accepts when:** a fresh database seeded shows every screen populated, and a second run changes nothing.

#### 📋 12.2 — Security review

**Goal:** phase 1 reviewed before release. **Design:** §21 Security. **Depends on:** 2.4, 3.5, 6.3, 7.3.

**Technical:** a written review in `docs/security/0.1.0.md` of access (§5.2), sync and folding (§12.4, §12.5), sealing and the name key (§13),
invitations (§7.3), sign-in through core and its two notices (§15), and deletion (§19), with findings fixed or recorded as accepted by the owner.
Live updates, import and the directory are reviewed with the phase that adds them.

**Accepts when:** the review is merged and no finding is open without the owner's acceptance.

#### 📋 12.3 — Documents

**Goal:** what a person and an operator read. **Design:** §12.8, §13.1, §21 Deployment. **Depends on:** 1.10.

**Technical:** the README (what Shopper is, running it alone in each database form, hosting it, every setting, **what `SHOPPER_AUTH_SIGNUP=open`
means and when to set `closed`,** what encryption at rest does and does not protect); the user's documentation of what needs a network, what cannot
be hidden (§12.8), **what sharing does (everyone invited sees and edits every list of the household) and what 0.1.0 does not do yet** (export, trips,
notices, several households); `RELEASING.md` copied from Tusk.

**Accepts when:** someone following the README alone runs Shopper from the image in each database form.

#### 📋 12.4 — Release 0.1.0

**Goal:** the first published image. **Depends on:** 12.2, 12.3.

**Technical:** `scripts/release.sh check | prepare | propose | tag | verify 0.1.0`, as Tusk's; the changelog's `[Unreleased]` becomes 0.1.0; the image
for amd64 and arm64 on `ghcr.io/sovereignfs/shopper`, attested, booted after publishing; the package made public.

**Accepts when:** `ghcr.io/sovereignfs/shopper:0.1.0` is published, boots, and its release page carries the changelog.

#### 📋 12.5 — Hosting on an instance

**Goal:** Shopper on the live instance. **Depends on:** 12.4.

**Technical:** in `openfs-suite`: `./sv app add shopper --image ghcr.io/sovereignfs/shopper:0.1.0`, `SHOPPER_AUTH_LOCAL=1` in `suite.yml` as the owner
chooses (it is what lets people not on the instance make an account to accept a link), `SHOPPER_SMTP_*` if the owner wants password reset, no app
scope needed, `./sv push && ./sv deploy`; checked with `./sv status` and `./sv doctor`. Done by the owner or on their instruction.

**Accepts when:** `shopper.<domain>` is in core's launcher, signs in through core, and journey 6 of §3 works on a phone.

#### 📋 12.6 — Release 0.2.0 (phase 2)

**Goal:** phase 2 published. **Depends on:** Milestones J to N of `ROADMAP.md`.

**Technical:** the seed extended (12.1); a security review of what phase 2 added (`docs/security/0.2.0.md`): notices and mail, live updates, the
directory and the refresh token, import, trips and prices, roles and moving lists; the README and the user's documentation brought up to date,
including the more-than-one-process and proxy-buffering note of 6.4; a migration note for an operator, since `invite` becomes the default sign-up
policy (2.7) and the manifest's scopes grow (10.2); the release as 12.4; hosting updated as 12.5, with the three app scopes granted.

**Accepts when:** `ghcr.io/sovereignfs/shopper:0.2.0` is published and hosted, and a 0.1.0 database upgrades in place with every household intact.
