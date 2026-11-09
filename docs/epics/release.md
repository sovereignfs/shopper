# Epic 12: Release

## Status

📋 Planned.

## Overview

From a working app to a published image hosted on the live instance: a seed to develop against, a security review written up, the documents a person
and an operator read, the first release, and hosting it.

## Related

[`DESIGN.md`](../../DESIGN.md) §21 · Tusk's `RELEASING.md` and `scripts/release.sh` · `docs/deploying.md` in `sovereign`

## Tasks

#### 📋 12.1 — Development seed

**Goal:** `pnpm seed`. **Design:** §21 Testing. **Depends on:** 3.4, 7.1.

**Technical:** a few accounts; a shared household and their own ones; a catalog of a hundred products from the starter catalog with some renamed;
lists with open and bought items; trips across two months in two shops with prices; a live invitation; a folded product and item in history; someone
who left. Idempotent, on every database form, refused when `NODE_ENV` is production.

**Accepts when:** a fresh database seeded shows every screen populated, and a second run changes nothing.

#### 📋 12.2 — Security review

**Goal:** phase 1 reviewed before release. **Design:** §21 Security. **Depends on:** 11.3, 9.4, 10.2.

**Technical:** a written review in `docs/security/0.1.0.md` of access (§5.2), sync and folding (§12.4, §12.5), the live stream (§12.6), sealing and
the name key (§13), invitations (§7.3), import (§18) and deletion (§19), with findings fixed or recorded as accepted by the owner.

**Accepts when:** the review is merged and no finding is open without the owner's acceptance.

#### 📋 12.3 — Documents

**Goal:** what a person and an operator read. **Design:** §12.8, §13.1, §21 Deployment. **Depends on:** 1.10.

**Technical:** the README (what Shopper is, running it alone in each database form, hosting it, every setting, the freshness settings and the note on
more than one process and proxy buffering, what encryption at rest does and does not protect); the user's documentation of what needs a network and
what cannot be hidden (§12.8); `RELEASING.md` copied from Tusk.

**Accepts when:** someone following the README alone runs Shopper from the image in each database form.

#### 📋 12.4 — Release 0.1.0

**Goal:** the first published image. **Depends on:** 12.2, 12.3.

**Technical:** `scripts/release.sh check | prepare | propose | tag | verify 0.1.0`, as Tusk's; the changelog's `[Unreleased]` becomes 0.1.0; the image
for amd64 and arm64 on `ghcr.io/sovereignfs/shopper`, attested, booted after publishing; the package made public.

**Accepts when:** `ghcr.io/sovereignfs/shopper:0.1.0` is published, boots, and its release page carries the changelog.

#### 📋 12.5 — Hosting on an instance

**Goal:** Shopper on the live instance. **Depends on:** 12.4.

**Technical:** in `openfs-suite`: `./sv app add shopper --image ghcr.io/sovereignfs/shopper:0.1.0`, the three app scopes granted, `SHOPPER_SMTP_*` and
`SHOPPER_AUTH_LOCAL=1` in `suite.yml` as the owner chooses, `./sv push && ./sv deploy`; checked with `./sv status` and `./sv doctor`. Done by the
owner or on their instruction.

**Accepts when:** `shopper.<domain>` is in core's launcher, signs in through core, and journey 6 of §3 works on a phone.
