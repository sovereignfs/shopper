# Workstream 0001 — Shopper on the suite's encryption, push and exports

**Status:** 📋 Planned\
**Date:** November 2026\
**Author:** Claude Code (design discussion with `kasunben`)\
**Goal owner:** `kasunben`\
**Governs:** RFC [0001](../rfcs/0001-encryption-the-server-cannot-read.md), [0002](../rfcs/0002-web-push.md),
[0003](../rfcs/0003-exports-and-backups.md); epics [17](../epics/alignment.md), [18](../epics/encryption.md), [19](../epics/push.md),
[20](../epics/exports.md), and 16.8 to 16.12 of [16](../epics/upstream.md)\
**Research:** a review of Shopper against `sovereign` and the suite's apps, 2026-11-21 (in the RFCs' motivation)

---

## Goal

Shopper keeps what people write so that nobody who reads its server can read it, always and for every household, with the keys from core when it is
hosted and from its own vault when it is alone; it notifies a device where it is not open; and a person's data and the app's data leave it in the
suite's format. All three are built on what `sovereign` publishes, so that Shopper holds no cipher, push or export code of its own, and phase 2's
households, trips and notices are built encrypted from their first line.

## Definition of done

- [ ] `@sovereignfs/sdk`, `ui` and `manifest` are at their current releases, the manifest is manifest 5, and the worker is `@sovereignfs/pwa`'s (17.1,
      17.2).
- [ ] `DESIGN.md` describes RFC 0001 to 0003 as built, and no document says Shopper is "not end to end" or that the server reads every field (18.1).
- [ ] A random marker written as a list, item, product, category and household name, and as a note, appears in no row of any table and no stored
      file, in plain text, base64 or hex, on sqld, a `file:` database and PostgreSQL (18.12).
- [ ] A standalone account signs up, keeps its kit, signs out, signs in and opens its lists; a forgotten password and the kit open them again (18.2,
      18.9).
- [ ] A hosted account signs in through core, its key is released, and it opens its lists (18.3).
- [ ] Two accounts share a household by a link and both read and edit it, offline and on; removing one makes a new key that it is not given (18.7,
      18.8).
- [ ] A 0.1.0 database upgrades, and every household opened once is encrypted with nothing lost (18.10).
- [ ] A push reaches a subscribed browser once, alone and hosted; turning it off stops it; deleting the account forgets the device (19.1, 19.2).
- [ ] Core's export of a person includes Shopper's part; alone, a person and the operator each take their export from Settings; an export imports
      into a second account (20.1 to 20.4).
- [ ] The release is published with a security review of what changed (12.7).

## Decisions locked

| Decision                    | Choice                                                                                        | Rejected alternative and why                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Whose encryption            | `sovereign`'s RFC 0005 through `@sovereignfs/sdk` (`/keys`, `/local-vault`, `/vault`)         | Shopper's `t1` envelope (§13 as it stands), Tally's own cipher: the owner's decision is to adopt the suite's |
| Opt-in or always            | Always on, every household, no setting                                                        | Tusk's opt-in: two code paths, and a household is only as private as its least careful member                |
| What is encrypted           | Content: names, notes, prices, shops, barcodes, receipt totals                                | Whole rows (Wallet): the sync engine moved into the browser for little gain                                  |
| What the server still seals | Person name and email, invitation email, core's refresh token, push device keys               | Encrypting identity: mail and the invitation page need it before the reader has a key                        |
| Key source                  | Per account, by how it signs in: core's key release, or Shopper's vault                       | Per instance: an instance with both ways in would break                                                      |
| Household key               | An SDK document key, sealed to each member with `share()`, a new epoch when someone leaves    | One key per list: a household's catalog is shared by its lists                                               |
| Name key                    | HMAC under a key from the household's first key, made in the browser, not rotated with epochs | Rotated with epochs: folding would miss across devices                                                       |
| Invitation by link          | The household key wrapped under a secret in the link's fragment, built on SDK primitives      | Waiting for 16.9: sharing by link is the MVP's only way to share                                             |
| Push                        | `@sovereignfs/push` and `@sovereignfs/pwa`, the same alone and hosted                         | Core relaying pushes: it does not, by RFC 0009                                                               |
| Export                      | `contracts/export.md` through `@sovereignfs/export`; content as ciphertext                    | §18's plain JSON file                                                                                        |
| Backup                      | The instance's (`sv backup`) hosted; the operator's database backup alone                     | A backup endpoint in Shopper: core has none to call                                                          |
| Where in the order          | Before phase 2                                                                                | Folded into phase 2: households and notices would be built twice                                             |

## Prerequisites

- `@sovereignfs/sdk` 2.11.0, `@sovereignfs/ui` 0.104.0 or later (`PushControl`, `ExportPanel`, `RecoveryKit`, `LockedState`), `@sovereignfs/manifest`
  0.4.x, `@sovereignfs/push` 0.2.0, `@sovereignfs/pwa` 0.2.0 and `@sovereignfs/export` 0.3.0 are published (they are, 2026-11-21). Owner: `sovereign`.
- 16.8 to 16.12 are raised in `sovereign` at the start of leg 1. Only 18.8's full form waits on 16.8; nothing else waits on a release.
- The owner settles what the `0.2.0` on `develop` (the PWA change) and phase 2's `0.2.0` become, before leg 1's version bump.

## Legs

| Leg | Name                 | Epic tasks                   | Gate?              | Done when                                                                  |
| --- | -------------------- | ---------------------------- | ------------------ | -------------------------------------------------------------------------- |
| 1   | Suite alignment      | 17.1, 17.2, 17.3, 17.4       | —                  | `pnpm verify` and `pnpm manifest:check` pass on the new packages           |
| 2   | The design           | 18.1                         | **Owner reviews**  | `DESIGN.md` says what RFC 0001 to 0003 build                               |
| 3   | Keys                 | 17.5, 18.2, 18.3, 18.4       | —                  | Both kinds of account unlock, with nothing yet encrypted                   |
| 4   | Content encrypted    | 18.5, 18.6, 18.11            | **Owner reviews**  | The marker test passes for new households; property tests hold             |
| 5   | Sharing              | 18.7, 18.8                   | —                  | Two accounts share by a link; removal makes a new epoch                    |
| 6   | Screens and the move | 18.9, 18.10                  | —                  | A 0.1.0 database upgrades; every screen of RFC 0001 is there               |
| 7   | Push                 | 19.1, 19.2                   | —                  | A push arrives, alone and hosted                                           |
| 8   | Exports              | 20.1, 20.2, 20.3, 20.4, 20.5 | —                  | Core's export holds Shopper's part; alone, both exports and an import work |
| 9   | Review and release   | 18.12, 12.7                  | **Owner releases** | Published, with `docs/security/` for the release                           |

One leg is one branch, one draft PR, one review gate, with one version bump.

## Leg detail

### Leg 1 — Suite alignment

**Epic tasks:** 17.1, 17.2, 17.3, 17.4

**Why here:** every later leg uses the newer SDK and UI, and the worker push needs is `@sovereignfs/pwa`'s.

**Technical notes:** `@sovereignfs/ui` from 0.92.0 is a long way; read its changelog for renamed components before upgrading. The manifest's `core`
range follows the template's (`>=0.126.0` in `sovereign`'s `tools/create/template/app/`). Shopper's worker has a Background Sync handler
(`src/sw/source.ts`) that `@sovereignfs/pwa` 0.2.0 does not appear to have; check, and if it is missing raise it (16.12) rather than forking the
worker.

**Do not proceed if:** `@sovereignfs/pwa` cannot keep Shopper's shell-only allow-list or opening offline (6.5) working.

### Leg 2 — The design

**Epic tasks:** 18.1

**Why here:** `DESIGN.md` wins over everything but `sovereign`'s contracts, so it must say what legs 3 to 8 build before they build it.

**Technical notes:** the sections are listed in RFC 0001's scope. `AGENTS.md`'s rules of an app (sealing through `src/crypto/sealed.ts`, the name
key) and `docs/epics/README.md`'s "every task holds" change with it.

**Do not proceed if:** the owner has not reviewed it.

### Leg 3 — Keys

**Epic tasks:** 17.5, 18.2, 18.3, 18.4

**Why here:** nothing can be encrypted before an account has a key, and [ADR 0001](../adrs/0001-sign-in-on-sovereignfs-auth.md) puts the
sign-in on `@sovereignfs/auth` first, so that the key store's hooks are the package's.

**Technical notes:** a standalone sign-in now sends the `svp1.…` value where it sent the password: existing 0.1.0 password accounts move on their
next sign-in (better-auth checks the old password once, then stores the derived value). `/auth/key-secret` over better-auth's session is 16.10's
question; if the SDK's helper needs its own `nextAuth`, keep the secret with better-auth's session row and serve it from Shopper's route.

**Do not proceed if:** a page that derives needs anything beyond `'wasm-unsafe-eval'` in its CSP.

### Leg 4 — Content encrypted

**Epic tasks:** 18.5, 18.6, 18.11

**Why here:** the heart of the change, once keys exist.

**Technical notes:** `src/sync/apply.ts` and `src/sync/fold.ts` keep their rules; only the values become opaque. Joining two notes on a fold moves to
the first device that pulls the alias (RFC 0001). The server's validators check sizes, not text.

**Do not proceed if:** a property test needs a value's text to pass.

### Leg 5 — Sharing

**Epic tasks:** 18.7, 18.8

**Technical notes:** the fragment is read and removed before anything else on `/invite/<token>`. 18.8's form with standalone accounts depends on
16.8; build what RFC 0001 says to do until then.

**Do not proceed if:** a link's secret reaches the server, a log or an `Referer` (the invitation page keeps `strict-origin` as its referrer policy).

### Leg 6 — Screens and the move

**Epic tasks:** 18.9, 18.10

**Do not proceed if:** the move can lose a field: it is tested on a copy of a seeded 0.1.0 database on all three forms.

### Leg 7 — Push

**Epic tasks:** 19.1, 19.2 (19.3 is phase 2)

**Technical notes:** a Docker-config change: the new variables go in `.env.example`, the `Dockerfile` and the Compose files, and `generate` in the
manifest.

### Leg 8 — Exports

**Epic tasks:** 20.1 to 20.5

**Technical notes:** `sovereign`'s 18.8 (an app with no core, in the template) is not built; follow sdk §9.5's words directly.

### Leg 9 — Review and release

**Epic tasks:** 18.12, 12.7

**Do not proceed if:** the marker test finds anything, or a page describes encryption without "not yet audited".

## Risks

- **The SDK is not audited**, and Shopper's words must say so everywhere they describe it (`sovereign`'s `encrypting-an-app.md`).
- **The move of 0.1.0's data** relies on each household being opened once; one never opened stays sealed by the server until it is.
- **A standalone household's removal** cannot always make a new key until 16.8 is released (RFC 0001, "Two kinds of account").
- **A forgotten password and a lost kit** lose a standalone account's data for good; Shopper says so when it shows the kit.
- **`@sovereignfs/ui` 0.92.0 to 0.105.x** may rename what the screens use; leg 1 absorbs it before anything else changes.

## Kill criteria

If the SDK's encryption is withdrawn or changed incompatibly, legs 3 to 6 stop and Shopper stays sealed by its server, as 0.1.0 is. Leg 1 (current
packages), leg 7 (push) and leg 8 (exports, written as plain records instead of envelopes) stand on their own and ship regardless.

## Changelog

| Version | Date       | Change        |
| ------- | ---------- | ------------- |
| 0.1     | 2026-11-21 | Initial draft |
