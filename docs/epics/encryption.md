# Epic 18: Encryption the server cannot read

## Status

📋 Planned. Legs 2 to 6 and 9 of [workstream 0001](../workstreams/0001-suite-model.md); before phase 2. **Not yet audited**, as everything built
on `sovereign`'s RFC 0005 is, and every task's words say so.

## Overview

What people write into Shopper encrypted in the browser under a key only their household holds, always, with the app key from core when hosted and
from Shopper's own vault when alone. The design is [RFC 0001](../rfcs/0001-encryption-the-server-cannot-read.md); this epic is its order. It
replaces §13's encryption at rest (1.11) for content and §13.2's name key (4.1).

## Related

[RFC 0001](../rfcs/0001-encryption-the-server-cannot-read.md) · `docs/encrypting-an-app.md`, `docs/specs/sdk.md` §9.3 to §9.5 and RFC 0005 in
`sovereign` · Tally's `src/keys/` for the screens' words

## Tasks

#### 📋 18.1 — The design

**Goal:** `DESIGN.md` says what RFC 0001 to 0003 build. **Design:** RFC 0001's scope. **Depends on:** 17.1.

**Technical:** §5, §7.3, §8.7, §12.4, §13 (rewritten), §14, §15.3, §18, §19, §20.3, §22.2, §26 (the decision, superseding the rows that ruled end to
end out); `docs/encryption.md` rewritten in a person's words with "not yet audited"; `docs/sharing.md`; `AGENTS.md`'s rules of an app (sealing, the
name key, what the server may read); `docs/epics/README.md`'s "every task holds". The RFCs' status lines move to "Accepted; being built".

**Accepts when:** the owner has reviewed it, and no document says Shopper is not end to end or that the server reads every field.

#### 📋 18.2 — Shopper's own vault

**Goal:** a password account has keys, kept in Shopper's database and unlocked at sign-in. **Design:** RFC 0001, "Keys". **Depends on:** 18.1.

**Technical:** `AppVault`, `vaultMigrations` (sqlite for a file and sqld, postgres), applied apart from Shopper's migrations under
`VAULT_MIGRATIONS_TABLE`, and `vaultRoute(vault, { origin: SHOPPER_URL })` at `/auth/vault`, in `src/access/routes.ts`; the session's secret
(`newSessionSecret`) kept with better-auth's session and served at `/auth/key-secret`; sign-up, sign-in, reset and change sending `derive()`'s value
where they sent the password, with existing 0.1.0 accounts moved on their next sign-in; `'wasm-unsafe-eval'` in `script-src` on the pages that
derive, and nowhere else; `vault.deleteAccount` in `People.deletePerson`'s transaction, with its test.

**Accepts when:** sign-up makes a vault, sign-out and sign-in open it, the old password of a 0.1.0 account still works once and then only the new
value is stored, deleting a person deletes their vault rows; a second person cannot read the first's vault.

#### 📋 18.3 — Key release through core

**Goal:** an account that signs in through core gets its app key from core. **Design:** RFC 0001, "Keys". **Depends on:** 18.1, 16.10.

**Technical:** `encryption: { "return": "/keys/return" }` in the manifest; `keys` in `SOVEREIGN_SCOPES` and the manifest's scopes; `/keys/return`
calling `receive()`; `/auth/key-secret` as 18.2; the referrer policy keeping the origin; `createFakeCore` from `@sovereignfs/sdk/testing` for the
tests.

**Accepts when:** against the fake core, an account signs in, its key is released and opened, a refused or tampered answer opens nothing, and a
back-channel logout leaves nothing that opens.

#### 📋 18.4 — The key in the page

**Goal:** one interface over both ways, and nothing shown that cannot be opened. **Design:** RFC 0001, "Keys", "The screens". **Depends on:** 18.2,
18.3.

**Technical:** `src/keys/`: `open()`, `unlock()`, `forget()`, `identity()`, choosing core's `appKeys` or `localVault` by how the account signed in;
`LockedState` wherever a key is missing; `forget()` and the store's deletion at sign-out.

**Accepts when:** both kinds of account reach their lists after unlocking, and a locked device shows `LockedState`, never ciphertext.

#### 📋 18.5 — Household keys

**Goal:** every household has a key every member holds. **Design:** RFC 0001, "The household key". **Depends on:** 18.4.

**Technical:** `household_key` (`household_id`, `epoch`, `person_id`, `record`) on both dialects; a key made with every household, the account's own
included, sealed to its maker with `share()`; opened with `openShared`; the device keeping every epoch it was given; the server refusing a write under
a past epoch; `People.deletePerson` deleting the person's records; export (20.1) carrying them.

**Accepts when:** a new account's household has a key after its first unlock; a second person gets no record; deleting a person leaves no record of
theirs.

#### 📋 18.6 — Content encrypted in sync

**Goal:** names, notes and the rest leave the device only as ciphertext. **Design:** RFC 0001, "The fields", "The name key", "What changes on the
server". **Depends on:** 18.5.

**Technical:** `encryptBytes`/`decryptBytes` under the household's content key, with household, table, row, field and epoch bound; the registry
`src/keys/fields.ts` and its test, replacing `src/crypto/sealed.ts`'s for content; the name key made in the browser under `K_name`; the validators
checking sizes; fold's note join moved to the first device that pulls the alias; suggestions, totals, aisle order and search on the device only.

**Accepts when:** the property tests of apply and fold pass with opaque values; two browsers, one offline, end with the same rows; the marker test
(18.12) finds nothing for a household made after this task.

#### 📋 18.7 — Invitations carry the key

**Goal:** joining by a link gives the newcomer the household's key and nobody else. **Design:** RFC 0001, "Invitations". **Depends on:** 18.5, 3.4.

**Technical:** a 32-byte secret in the link's fragment; the current key wrapped under it, stored with the token's hash and deleted on accept, revoke
or expiry; the fragment read and removed first on `/invite/<token>`; the newcomer sealing the key to themselves in the accepting operation; the dialog
saying to send the link privately. Moved onto `sovereign`'s if 16.9 publishes one.

**Accepts when:** journey 3 of §3 passes encrypted; a used, revoked or expired link opens nothing; no request, log or `Referer` carries the secret.

#### 📋 18.8 — Leaving and removing make a new key

**Goal:** someone who leaves cannot read what is added after. **Design:** RFC 0001, "The household key", "Two kinds of account". **Depends on:** 18.7,
3.5; its standalone form on 16.8.

**Technical:** the household marked as needing a new epoch; the next device that can check every remaining member (`checkPerson`, `keys.person` for
core accounts) makes it and seals it to them; until 16.8 is released, a household of standalone accounts keeps its epoch and its settings say what
that means; the words when removing.

**Accepts when:** hosted, a removed member's device cannot open a row written after; standalone, the household says what RFC 0001 says it says.

#### 📋 18.9 — The screens

**Goal:** a person knows what is protected and keeps what they need. **Design:** RFC 0001, "The screens". **Depends on:** 18.4, 18.5.

**Technical:** Settings › Encryption; `RecoveryKit` once after a standalone sign-up and again from Settings; unlocking with the kit; a household
waiting for its key; the words of `AGENTS.md` and "not yet audited"; a keyboard, light and dark, a phone's width.

**Accepts when:** each state of RFC 0001's screens is reached in a browser test.

#### 📋 18.10 — Moving 0.1.0's households

**Goal:** a household sealed by the server becomes encrypted, with nothing lost. **Design:** RFC 0001, "Moving 0.1.0's households". **Depends on:**
18.6.

**Technical:** on first unlock by its Admin (or a member where none is left), rows pulled with the server opening them for that household only, encrypted,
and written in batches through the one path; the `sealed` content columns emptied with the last batch; a household's state readable to the server
(`sealed`, `moving`, `encrypted`); `CHANGELOG.md` asking the operator to open every household once.

**Accepts when:** a seeded 0.1.0 database on all three forms upgrades, every opened household is encrypted with every field equal to before, and an
interrupted move resumes.

#### 📋 18.11 — The server seals only what it must

**Goal:** `src/crypto/` holds credentials and identity, and nothing else. **Design:** RFC 0001, "What is encrypted, and what is not". **Depends on:**
18.6.

**Technical:** the envelope kept for person name and email, invitation email, core's refresh token and push device keys; `rotate.ts`'s name-key
re-computing deleted; the server-sealed registry and its test reduced to those fields.

**Accepts when:** no content field is read or written through `src/crypto/` (a test over the registries).

#### 📋 18.12 — The marker test and the review

**Goal:** proof that the server holds no content, and a review of the change. **Design:** RFC 0001. **Depends on:** 18.6 to 18.11, 19.2, 20.4.

**Technical:** a random marker written as every encrypted field, then searched for in plain text, base64 and hex in every row of every table, the
vault's included, on sqld, a `file:` database and PostgreSQL, and in an export; `docs/security/` for the release, as 12.2 was.

**Accepts when:** the marker is found nowhere, the test fails when one field is written in plain text, and the review's findings are answered.
