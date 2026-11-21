# RFC 0003 — Exports and backups, the suite's way

|               |                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted on 2026-11-21; being built                                                                                                                       |
| **Date**      | November 2026                                                                                                                                             |
| **Author**    | Claude Code (design discussion with `kasunben`)                                                                                                           |
| **Scope**     | `DESIGN.md` §18, §19, §21; `src/portability/`, Settings, the manifest, `deploy/README.md`                                                                 |
| **Builds on** | `sovereign`'s [RFC 0008](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0008-exports-and-backups.md), `contracts/export.md`, sdk §9.1, §9.5 |
| **Tasks**     | [epic 20](../epics/exports.md); [workstream 0001](../workstreams/0001-suite-model.md)                                                                     |

## Summary

Shopper's data leaves it in the suite's one format, `contracts/export.md` (format 1), written with `@sovereignfs/export` and offered through
`ExportPanel` from `@sovereignfs/ui`. Which part does what depends on whether there is a core, as for every app:

|                        | Hosted                                                                                                             | Alone                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **A person's export**  | Core asks Shopper for its part: `signIn.export` in the manifest (manifest 5), the SDK's `onExport`, `/auth/export` | Shopper offers it on **Settings › Your data** (`kind: "person"`), with `ExportJobs`, `ExportRunner`, `downloadExport` and `viewOf` |
| **The app's export**   | The instance's own (`sv`), not Shopper's                                                                           | Shopper's operator (the first account) takes it on **Settings › Data** (`kind: "app"`), age-encrypted to recipients they save      |
| **Backup and restore** | `sv backup` and `sv restore --app shopper`: the database and generated secrets, encrypted to the operator's key    | The operator's: the database, `SHOPPER_ENCRYPTION_KEY` and the vault's tables, as `deploy/README.md` says, kept apart and tested   |

This replaces `DESIGN.md` §18.1's "one JSON file … sealed fields in plain text" and moves export ahead of phase 2. Tasks 11.1 and 11.2 are
superseded; 11.3 (the plugin) moves to the browser.

## Encrypted content in an export

Under RFC 0001 the server holds ciphertext. As the contract says, end-to-end encrypted data is exported **as its ciphertext**, marked as envelopes in
`contents.json`, with the person's sealed household-key records beside it, so that their keys open it again and nothing is in plain text on the way.
Whether the person's browser also adds a readable copy, made after they unlock, is RFC 0001's open question 2; until it is settled, the
person's page says that the file opens with their keys.

The things the contract forbids are never in it: a password's hash, a session, a token, a refresh token, another person's email.

## Import and restore

The contract's format is what is kept, not a way to restore, and nothing in `sovereign` imports it. Shopper reads its own part of it back:

- **Import** (replacing 11.2) reads a person's export with `readExport`, opens it in the browser with the person's keys, and writes new households
  through the one path, encrypted under new household keys, folding products by name key as §18.2 says. A malformed file writes nothing.
- **Restoring an instance** is a database restore, never an import: hosted with `sv restore`, after which core re-sends account deletions and
  `People.deletePerson` runs again safely; alone from the operator's backup. People unlock exactly as before, since their vault records are in the
  same database.
- **Import from the legacy plugin** (11.3) runs in the browser, over the plugin's plain-text export, and writes through the same path.

## Backups to a destination

A scheduled, encrypted backup to Git or elsewhere (15.1) stays a candidate. It now has a format to write (the app's export, age-encrypted) and
waits on `sovereign`'s milestone 2 of RFC 0008, so that a destination is the suite's and not Shopper's.

## Alternatives considered

| Alternative                              | Why not                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Shopper's own JSON file (§18 as written) | A second format to keep, and core's export of a person would leave Shopper out                               |
| A backup endpoint core calls             | Core has none and plans none: an app's backup is its database and data, taken by the instance                |
| Plain text in every export               | The server cannot write it (RFC 0001), and a readable copy is the browser's, to be decided (open question 2) |
