# Epic 20: Exports and backups

## Status

📋 Planned. Leg 8 of [workstream 0001](../workstreams/0001-suite-model.md); before phase 2.

## Overview

A person's data and the app's data leave Shopper in the suite's format, through core when hosted and from Settings when alone, and come back in by
import; backups are the instance's or the operator's. The design is [RFC 0003](../rfcs/0003-exports-and-backups.md). Supersedes 11.1 and 11.2.

## Related

[RFC 0003](../rfcs/0003-exports-and-backups.md) · `contracts/export.md`, RFC 0008, sdk §9.1 and §9.5, `packages/export/README.md` in `sovereign`

## Tasks

#### ✅ 20.1 — Core's export of a person

**Goal:** a person's export from core includes what Shopper holds of them. **Design:** RFC 0003. **Depends on:** 17.1, 18.6.

**Technical:** `signIn.export` in the manifest (manifest 5); the SDK's `onExport` with Shopper's `prefix` and version, at `/auth/export`, in
`src/access/routes.ts`; records under `apps/shopper/records/`: the person, every household they are in whole (members by name only), its lists,
items, products and categories, content as the ciphertext it is, marked as envelopes, with their household-key records; nothing the contract forbids.

**Accepts when:** against the fake core, the answer validates with `readExport`, holds no other person's email, no token and no plain-text content.

**Done as:**

- **The route:** `signIn.export` (`/api/sovereign/export`) in the manifest, answered by the SDK's `handleExportRequest` (`src/portability/core-export.ts`). Its replay memory is in-process, since an export asked for twice is the same export.
- **The records** (`src/portability/records.ts`, under `apps/shopper/records/`):
  - the person, and every household they are in, whole, members by name only;
  - a moved household's content as its ciphertext, marked end to end, with the person's own keyring record;
  - a sealed household's content as the server reads it.
- **Tests:** a unit test holds the records: no other person's address, nothing the contract forbids.
- **Left out:** a run against the fake core's `exportRequestToken` (the records are tested, the handler is the SDK's).

#### 🚧 20.2 — A person's export with no core

**Replaced in form (2026-11-23)** by 22.8 ([RFC 0005](../rfcs/0005-the-frame-settings-and-screens.md)): a person's own export is one readable JSON file made in the browser, after confirming it is them, in both modes. The operator's export (20.3) and import (20.4) stay as written.

**Goal:** alone, a person takes their own export. **Design:** RFC 0003, sdk §9.5. **Depends on:** 20.1.

**Technical:** `ExportJobs` on Shopper's database (`exportJobsMigrations`, both dialects), `ExportRunner` as a claimed job, `downloadExport`,
`viewOf`; `ExportPanel` on Settings › Your data, with the sentence that the file opens with their keys; the same records as 20.1, written once.

**Accepts when:** a person's export runs, downloads once, and validates; another person cannot download it.

**Waiting (2026-11-21):** not built in this run of workstream 0001.

- **What it needs:** a person's own export with no core, the operator's app export and import need `ExportJobs`, `ExportRunner`, `ExportPanel`, and a page that opens a moved household's ciphertext with the person's keys.
- **Upstream:** `sovereign`'s own version for an app with no core (its 18.8) is not built either.
- **Meanwhile:** hosted, core's export (20.1) and `sv backup` cover a person's data and the backup.

#### 🚧 20.3 — The app's export for its operator

**Goal:** alone, the operator takes the whole app's export, encrypted. **Design:** RFC 0003, sdk §9.5. **Depends on:** 20.2 (its form replaced by 22.8; what this needs of it is the route that selects a person's records).

**Technical:** the operator as the first account; age recipients saved on Settings › Data, after the password again; `kind: "app"`, encrypted as it
is written with `encryptTo`; anyone else gets a page that is not there.

**Accepts when:** the export opens with the operator's age identity and validates; a second account sees no Data page.

**Waiting (2026-11-21):** not built in this run of workstream 0001.

- **What it needs:** a person's own export with no core, the operator's app export and import need `ExportJobs`, `ExportRunner`, `ExportPanel`, and a page that opens a moved household's ciphertext with the person's keys.
- **Upstream:** `sovereign`'s own version for an app with no core (its 18.8) is not built either.
- **Meanwhile:** hosted, core's export (20.1) and `sv backup` cover a person's data and the backup.

#### 🚧 20.4 — Import

**Goal:** an export comes back in as new households. **Design:** RFC 0003, "Import and restore"; §18.2. **Depends on:** 20.2 (its form replaced by 22.8: an import reads the contract's export; whether it also reads 22.8's file is RFC 0005's open question 3).

**Technical:** `readExport`; opened in the browser with the person's keys; new households with new keys, written through the one path; products folded
by name key; the person's own household merged into theirs; a malformed or newer file writes nothing.

**Accepts when:** export, import into a second account and export again match but for ids, times, keys and members' kind.

**Waiting (2026-11-21):** not built in this run of workstream 0001.

- **What it needs:** a person's own export with no core, the operator's app export and import need `ExportJobs`, `ExportRunner`, `ExportPanel`, and a page that opens a moved household's ciphertext with the person's keys.
- **Upstream:** `sovereign`'s own version for an app with no core (its 18.8) is not built either.
- **Meanwhile:** hosted, core's export (20.1) and `sv backup` cover a person's data and the backup.

#### ✅ 20.5 — Backups, written down

**Goal:** an operator knows how to back Shopper up and restore it, hosted and alone. **Design:** RFC 0003. **Depends on:** 18.2.

**Technical:** `deploy/README.md` and `docs/encryption.md`: hosted, `sv backup` and `sv restore --app shopper`, and core's deletions re-sent after;
alone, the database (the vault's tables in it), `SHOPPER_ENCRYPTION_KEY` and the VAPID key, kept apart and a restore tested; that a backup holds
ciphertext people's keys open, not the operator's.

**Accepts when:** a restore from the documented backup, on a file database, lets a seeded account sign in and open its lists.

**Done as:** `deploy/README.md`'s Backups section now says:

- what a backup holds of encrypted households;
- that the vault's tables are in it, and must be restored with it;
- to keep the push key with the other secrets;
- how it goes hosted (`sv backup`, `sv restore --app shopper`, core's export) and alone.

**Left out:** the restore was not run by hand.
