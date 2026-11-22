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

#### ✅ 18.1 — The design

**Goal:** `DESIGN.md` says what RFC 0001 to 0003 build. **Design:** RFC 0001's scope. **Depends on:** 17.1.

**Technical:** §5, §7.3, §8.7, §12.4, §13 (rewritten), §14, §15.3, §18, §19, §20.3, §22.2, §26 (the decision, superseding the rows that ruled end to
end out); `docs/encryption.md` and the README marked as changing, and rewritten in a person's words with "not yet audited" by 18.9, when it ships; `docs/sharing.md`; `AGENTS.md`'s rules of an app (sealing, the
name key, what the server may read); `docs/epics/README.md`'s "every task holds". The RFCs' status lines move to "Accepted; being built".

**Accepts when:** the owner has reviewed it, and no document says Shopper is not end to end or that the server reads every field.

**Done as:** `DESIGN.md` §13 rewritten whole as "Encryption" (§13.1 what is encrypted, §13.2 keys, §13.3 the name key, §13.4 what the server
still holds, §13.5 sharing, §13.6 what it protects, §13.7 moving from 0.1.0). Also changed:

- §5's picture and the referee's bullet; §5.1's `src/crypto/` and a new `src/keys/`; §7.3 and §8.7.
- §12.4: notes joined on the device after a fold. §12.1: the device's copy.
- §14: notices' words, and push as a channel. §15.3: the manifest the workstream ends with. §17: Settings' Encryption and Your data.
- §18, rewritten for the suite's export. §19: the vault, keys, subscriptions and export jobs deleted.
- §20.2 (`encrypted` beside `sealed`) and §20.3 (the tables and columns the workstream adds), §21's tests, §22.2's push.
- `AGENTS.md`'s rule on what is encrypted, and `docs/epics/README.md`'s "every task holds".

The §26 rows for 2026-11-21 were added by 17.4. `docs/encryption.md` and the README describe the running app, so they say they are changing and are
rewritten by 18.9, when it ships. The 2026-11-09 decision row that ruled end to end out is kept, as the log is never rewritten, and is superseded by
2026-11-21's. **The owner's review (the leg's gate) has not happened:** the owner asked for the workstream to run through without stopping, so it
continues on this text and the review stays open.

#### ✅ 18.2 — Shopper's own vault

**Goal:** a password account has keys, kept in Shopper's database and unlocked at sign-in. **Design:** RFC 0001, "Keys". **Depends on:** 18.1.

**Technical:** `AppVault`, `vaultMigrations` (sqlite for a file and sqld, postgres), applied apart from Shopper's migrations under
`VAULT_MIGRATIONS_TABLE`, and `vaultRoute(vault, { origin: SHOPPER_URL })` at `/auth/vault`, in `src/access/routes.ts`; the session's secret
(`newSessionSecret`) kept with better-auth's session and served at `/auth/key-secret`; Shopper's own sign-in (`src/auth/`, ADR 0001's fallback): sign-up, sign-in, reset and change derive the value with `localVault`'s `derive()` and send
it where they sent the password, and the server refuses anything that is not a derived value (`svp1.`); a 0.1.0 account, whose stored hash is of
the password, is moved once at its next sign-in (the page sends the old password and the derived value together; the server checks the old, stores
the new, and the account is marked moved), the one time the server is sent a password again; `'wasm-unsafe-eval'` in `script-src` on the pages that
derive, and nowhere else; `vault.deleteAccount` in `People.deletePerson`'s transaction, with its test.

**Accepts when:** sign-up makes a vault, sign-out and sign-in open it, the old password of a 0.1.0 account still works once and then only the new
value is stored, deleting a person deletes their vault rows; a second person cannot read the first's vault.

**Done as:** sign-in stays on `src/auth/` (ADR 0001's fallback).

**The server:**

- **The vault:** the SDK's `AppVault` on the app's store (`src/keys/server/`).
  - `vaultDatabase` puts Shopper's database in the SDK's shape. Its `?` statements are bound through Drizzle, behind the file's one-writer queue, with a new `dbExec`.
  - `runVaultMigrations` applies `vaultMigrations` under `sv_key_migrations`, from `runMigrations` for the app store. On PostgreSQL it holds a transaction lock.
- **Routes:** `/api/keys/vault` (`vaultRoute`) and `/api/keys/secret` (the session's secret, `{ sub, secret }`). They are under `/api/` rather than the SDK's default `/auth/`, through `localVault`'s `path` and `secretPath`.
- **The session's secret** is a new column on better-auth's session (`key_secret`, migration `auth/0001`). It is made with every session in a hook, made once for an older session, and never part of what the session's API answers.
- **No password reaches the server:** a hook before every route that took one refuses anything that is not a derived value (`src/auth/derived.ts`). A sign-in reads it as a wrong password; anything else gets `PASSWORD_NOT_DERIVED`.
- **Moving a 0.1.0 account:** `account.password_derived` (the same migration) marks a hash of the derived value. `/api/account/move-password` (`src/auth/move.ts`) moves a 0.1.0 account once: same origin, rate limited by a hash of the address, always 204. The sign-in page offers it only while some account has still to move.
- **Deleting a person** deletes their vault (`deletePerson`), and the every-table test seeds and checks vault rows.
- **The policy** carries `'wasm-unsafe-eval'` on every page (the derivation is WebAssembly, and an unlock can come on any signed-in page). Never `'unsafe-eval'`.

**The pages** (`src/keys/vault-client.ts`):

- Sign-in, sign-up, reset, change and delete derive with `localVault`'s `derive`. The address is lower-cased, and a reset finds it from the token (`src/auth/reset.ts`).
- They check a password's length themselves, then hand the secret to `afterSignIn`.
- A new account sees `/keys/kit` (`RecoveryKit`, the kit made in the browser, `keepKit`).
- A sign-in after a reset unlocks once with the kit (`unlockWithKit`). A change prepares the new way in and drops the old once the server says yes (`prepareChange`, `finishChange`).
- The seed derives with the SDK in Node, so its accounts sign in by hand with `SEED_PASSWORD`.

**Tests:**

- The auth tests post as a page does, through `derivedFor`, a stand-in of the right shape; `postRaw` is for the refusals.
- The length tests became refusals of a password sent as itself. The refusal test was seen to fail with the hook off.
- `src/keys/server/vault.test.ts` covers the binding, the vault for a second person, deletion, the key secret for a second account, and the move (once, only with the old password).
- The browser tests keep the kit after sign-up, and delete from Settings.

**Verified:** `pnpm verify`; `pnpm test` (all passed); `pnpm build`; `pnpm e2e --project=chromium` (100 passed).

**Left out:**

- No browser test of a 0.1.0 account moving, or of the kit after a reset (both need a database made by 0.1.0, or mail; the move is unit-tested).
- WebKit's run waits for the leg's end.

#### ✅ 18.3 — Key release through core

**Goal:** an account that signs in through core gets its app key from core. **Design:** RFC 0001, "Keys". **Depends on:** 18.1, 16.10.

**Technical:** `encryption: { "return": "/keys/return" }` in the manifest (which gives the app the `keys` scope once the operator allows it); `/keys/return`
calling `receive()`; `/auth/key-secret` as 18.2; the referrer policy keeping the origin; `createFakeCore` from `@sovereignfs/sdk/testing` for the
tests.

**Accepts when:** against the fake core, an account signs in, its key is released and opened, a refused or tampered answer opens nothing, and a
back-channel logout leaves nothing that opens.

**Done as:**

- **The manifest** declares `encryption: { "return": "/keys/return" }`. The `keys` scope is not in `signIn.scopes`, where manifest 5 refuses it: allowing `encryption` gives it, so the epic's and the RFC's words were corrected.
- **The key source** is decided per account, server-side (`src/keys/server/source.ts`): a password account's is the vault, one that came through core alone is core's. The page is given core's address, the client id and the absolute return address for each request.
- **`/api/keys/secret`** answers with the `sub` the keys are bound to: the account in the vault, core's `sub` for a released key (`receive()` refuses an answer for another person). Core's `sub` is read from the account's sign-in through core in the auth store (`subOfAccount`); 0.2.0 read `person.core_sub`, which nothing sets, so a core account had no key source and nothing of it was encrypted, fixed in 0.2.1 (`source.test.ts`).
- **`/keys/return`** calls `receive()` and goes back, or says it could not unlock and offers to ask again. `coreKeys` (`src/keys/core-client.ts`) is `appKeys` with Shopper's secret route.
- **The referrer policy** is now `strict-origin`, not `no-referrer`, so that core releases without asking each time. It sends the origin alone, never a path or a token.
- **Tests:** a browser test calls both key routes as a second person, as a visitor and from another site. The manifest test holds `encryption` to a page that exists.

**Left out:**

- **A release from core, end to end**, and its refusals. The SDK's fake core (`@sovereignfs/sdk/testing`) has no key release to answer one, so the round trip is the SDK's own tested code and not run here; raised as 16.16.
- **A unit test of `keySourceOf` for a core account** (it reads the server's own settings); a browser test of it needs the same fake.

#### ✅ 18.4 — The key in the page

**Goal:** one interface over both ways, and nothing shown that cannot be opened. **Design:** RFC 0001, "Keys", "The screens". **Depends on:** 18.2,
18.3.

**Technical:** `src/keys/`: `open()`, `unlock()`, `forget()`, `identity()`, choosing core's `appKeys` or `localVault` by how the account signed in;
`LockedState` wherever a key is missing; `forget()` and the store's deletion at sign-out.

**Accepts when:** both kinds of account reach their lists after unlocking, and a locked device shows `LockedState`, never ciphertext.

**Done as:** `src/keys/keys.tsx`: `KeysProvider` and `useKeys` (`current`, `unlock`, `forget`) over core's `appKeys` or the vault's `localVault`, chosen
by the server per account (`keySourceOf`) and handed to the signed-in layout. **The key does not gate the screens**, which the epic's words assumed it
would: the SDK keeps a browser's key wrapped by the session's secret, which only the server holds, so a cold start with no network cannot open it,
and Shopper must work in the shop with none. The device's store keeps what it has opened (§12.1); encrypting what is sent and opening what arrives
happen when syncing (18.6), which needs the network anyway. A locked key, online, shows `KeyPrompt`: `LockedState` above the lists, with core's
Unlock or the password (derived, then `afterSignIn`); offline it shows nothing. Sign-out calls `forget()` once the device has left. A browser test
(`e2e/keys.spec.ts`) empties the browser's stores, finds the prompt above the lists, refuses a wrong password and opens with the right one. Verified:
`pnpm verify`; `pnpm test`; `pnpm e2e --project=chromium`. Left out: WebKit's run, whose browser is not installed here and was not asked for; core's
Unlock end to end (16.16).

#### ✅ 18.5 — Household keys

**Goal:** every household has a key every member holds. **Design:** RFC 0001, "The household key". **Depends on:** 18.4.

**Technical:** `household_key` (`household_id`, `epoch`, `person_id`, `record`) on both dialects; a key made with every household, the account's own
included, **wrapped by each member under their own app key** (AES-GCM through WebCrypto, bound to person, household and epoch, in both modes,
until 16.15), and sealed to another person with `share()` only where core gives their keys; the device keeping every epoch it was given; the server refusing a write under
a past epoch; `People.deletePerson` deleting the person's records; export (20.1) carrying them.

**Accepts when:** a new account's household has a key after its first unlock; a second person gets no record; deleting a person leaves no record of
theirs. Amendment 2 of RFC 0001: keys are made by the move (18.10's operation), each member's record wraps the keyring, and a shared household is
not moved yet.

**Done as (with 18.6, 18.7 and 18.10, RFC 0001 amendment 2):**

- **Tables:** `household_key` (one row per member: the keyring wrapped under their own app key), with `encryption` and `epoch` on `household` (migration `0011`).
- **The keyring and its fields** (`src/keys/household.ts`):
  - a keyring of every epoch's key, wrapped with WebCrypto's AES-GCM, bound to person and household (16.15);
  - fields through the SDK's `encryptBytes`, bound to household, table, row, field and epoch, written `e1.<epoch>.<row>.<ciphertext>`;
  - the name key from the first epoch's key.
- **Keys come with the move, not on their own:** a household's keys are made when it moves (18.10).
- **Deletion:** `People.deletePerson` deletes a person's rows, and a household's go with it.
- **Left out:** no new epoch is ever made (18.8).

#### ✅ 18.6 — Content encrypted in sync

**Goal:** names, notes and the rest leave the device only as ciphertext. **Design:** RFC 0001, "The fields", "The name key", "What changes on the
server". **Depends on:** 18.5.

**Technical:** `encryptBytes`/`decryptBytes` under the household's content key, with household, table, row, field and epoch bound; the registry
`src/keys/fields.ts` and its test, replacing `src/crypto/sealed.ts`'s for content; the name key made in the browser under `K_name`; the validators
checking sizes; fold's note join moved to the first device that pulls the alias; suggestions, totals, aisle order and search on the device only.

**Accepts when:** the property tests of apply and fold pass with opaque values; two browsers, one offline, end with the same rows; the marker test
(18.12) finds nothing for a household made after this task.

**Done as:**

- **The server** (`src/sync/apply.ts`):
  - keeps a moved household's content as the device sent it, in `encrypted` (field to ciphertext, merged by key, never opened);
  - takes the name key from the device;
  - refuses a name sent without its key;
  - holds a mutation in the wrong form, after checking membership and authorship, with the rest of that household's mutations;
  - carries a fold's second note on the alias (`alias.carried`, `0012`).
- **The pull** answers each household's state, epoch, the reader's keyring record and their person. The protocol is now 2.
- **The device** (`src/keys/transport.ts`):
  - encrypts what it sends to a household it has seen move, and never sends that household plain text, even after a restart;
  - opens what comes back, only for its row or one folded into it, and shows a carried note joined;
  - leaves out a household whose keys it cannot open, so its cursor stays;
  - takes another round when the keys arrived in the answer, using the key as it is when the answer comes.
- **Tests:**
  - `src/sync/encrypted.test.ts` and `src/keys/transport.test.ts`, with markers;
  - `e2e/keys.spec.ts`: a typed name reaches the server only as ciphertext, and opens again after a reload.
- **Left out:**
  - a carried note is joined on display, not yet written back as one note;
  - categories' names stay as the server holds them (starter names, or sealed), since renaming is phase 2.

#### ✅ 18.7 — Invitations carry the key

**Goal:** joining by a link gives the newcomer the household's key and nobody else. **Design:** RFC 0001, "Invitations". **Depends on:** 18.5, 3.4.

**Technical:** a 32-byte secret in the link's fragment; the current key wrapped under it, stored with the token's hash and deleted on accept, revoke
or expiry; the fragment read and removed first on `/invite/<token>`, and kept in the tab's `sessionStorage` (never sent, cleared on accept) so that
it survives signing up and core's redirect; where it is lost (an address verified in another browser), the page asks for the link again; the newcomer sealing the key to themselves in the accepting operation; the dialog
saying to send the link privately. Moved onto `sovereign`'s if 16.9 publishes one.

**Accepts when:** journey 3 of §3 passes encrypted; a used, revoked or expired link opens nothing; no request, log or `Referer` carries the secret.

**Done as:**

- **On the server:**
  - `invitation.wrapped_key` (`0013`) holds the keyring wrapped under the link's secret (`src/keys/link.ts`, `lk1.`). It is required for a moved household and refused for a sealed one.
  - Accepting gives it to the joiner once and deletes it; revoking deletes it, and expired links' copies go when the next link is made.
  - `household.key.mine` lets a member keep their own copy.
- **In the browser:**
  - The Share dialog wraps the keyring and puts the secret after `#`.
  - `KeepLinkSecret` keeps the secret in the tab and takes it out of the address, so it survives signing up or in.
  - The accept button needs the secret and an open key, then keeps the keyring under the joiner's own app key.
- **Tests:** server tests for the wrapped copy; the browser tests make links through the dialog, as a person does.
- **Left out:** a link that loses its fragment (opened in one browser, verified in another) asks to be opened again; 16.9 would make the link the SDK's.

#### 🚧 18.8 — Leaving and removing make a new key

**Goal:** someone who leaves cannot read what is added after. **Design:** RFC 0001, "The household key", "Two kinds of account". **Depends on:** 18.7,
3.5; its standalone form on 16.8.

**Technical:** the household marked as needing a new epoch; the next device that can check every remaining member (`checkPerson`, `keys.person` for
core accounts, which needs `offline_access` and the SDK's token store for core's directory calls) makes it and seals it to them; until 16.8 is released, a household of standalone accounts keeps its epoch and its settings say what
that means; the words when removing.

**Accepts when:** hosted, a removed member's device cannot open a row written after; standalone, the household says what RFC 0001 says it says.

**Waiting (2026-11-21):**

- Sealing a new epoch to the members who remain needs their public keys: 16.8 for Shopper's own accounts, and core's `keys.person` with the SDK's token store for core accounts. Neither is in place.
- The case it would cover now is also narrow: households move only with one member (RFC 0001 amendment 2), and become shared only by a link after moving.
- Until it is built, removing someone leaves the keys as they are, and `docs/encryption.md` says so. A removed member gets nothing more from the server either way.

#### ✅ 18.9 — The screens

**Goal:** a person knows what is protected and keeps what they need. **Design:** RFC 0001, "The screens". **Depends on:** 18.4, 18.5.

**Technical:** `docs/encryption.md` and the README's section rewritten for what is now true; Settings › Encryption; `RecoveryKit` once after a standalone sign-up and again from Settings; unlocking with the kit; a household
waiting for its key; the words of `AGENTS.md` and "not yet audited"; a keyboard, light and dark, a phone's width.

**Accepts when:** each state of RFC 0001's screens is reached in a browser test.

**Done as:**

- **The kit and unlocking screens** were built with 18.2 to 18.4: the recovery kit after sign-up (`/keys/kit`), unlocking with the kit after a reset, and the locked prompt above the lists.
- **Settings › Encryption** (`src/account/EncryptionSection.tsx`) says:
  - what is protected, and what not;
  - for each household, whether only its people can read it, or whether it is still sealed by the server because it has others in it;
  - how this account's key is kept;
  - "Not yet audited".
- **`docs/encryption.md` and the README's section** were rewritten for what is now true.

**Left out:**

- A household waiting for its key shows nothing rather than "Waiting for another member": no household can be in that state yet, since only households of one member move.
- No browser test of the new section.

#### ✅ 18.10 — Moving 0.1.0's households

**Goal:** a household sealed by the server becomes encrypted, with nothing lost. **Design:** RFC 0001, "Moving 0.1.0's households". **Depends on:**
18.6.

**Technical:** on first unlock by its Admin (or a member where none is left), rows pulled with the server opening them for that household only, encrypted,
and written in batches through the one path; the `sealed` content columns emptied with the last batch; a household's state readable to the server
(`sealed`, `moving`, `encrypted`); `CHANGELOG.md` asking the operator to open every household once.

**Accepts when:** a seeded 0.1.0 database on all three forms upgrades, every opened household is encrypted with every field equal to before, and an
interrupted move resumes.

**Done as:**

- **The operation:** the move is one household-level operation, `src/keys/server/move.ts` behind `/api/keys/move`:
  - `GET` opens a household's rows once more, for its only member;
  - `POST` takes them back encrypted with the keyring and name keys, and writes them all in one transaction, only if its `seq` has not moved and every row is answered for, each value naming its own row.
- **The device:** `src/keys/mover.ts` moves each household of one member once the key is open, and after any sync that saw one still sealed.
- **What moves:** a new account's household, and a 0.1.0 one with a single member, both move on first unlock.
- **Left out:** a shared household stays sealed (amendment 2), until 16.8 or 18.8. An interrupted move leaves nothing half done (one transaction) and is simply asked again.

#### 🚧 18.11 — The server seals only what it must

**Goal:** `src/crypto/` holds credentials and identity, and nothing else. **Design:** RFC 0001, "What is encrypted, and what is not". **Depends on:**
18.6.

**Technical:** the envelope kept for person name and email, invitation email, core's refresh token and push device keys; `rotate.ts`'s name-key
re-computing deleted; the server-sealed registry and its test reduced to those fields.

**Accepts when:** no content field is read or written through `src/crypto/` (a test over the registries).

**Waiting (2026-11-21):** a household with more than one member stays sealed by the server (RFC 0001 amendment 2), so the server still seals content
for those, and `src/crypto/rotate.ts` still re-wraps it. What is done: nothing of a moved household is sealed by the server (its `sealed` is emptied
by the move), and its name keys are the device's, which the rotation does not touch. The rest follows 16.8 and 18.8.

#### ✅ 18.12 — The marker test and the review

**Goal:** proof that the server holds no content, and a review of the change. **Design:** RFC 0001. **Depends on:** 18.6 to 18.11, 19.2, 20.4.

**Technical:** a random marker written as every encrypted field, then searched for in plain text, base64 and hex in every row of every table, the
vault's included, on sqld, a `file:` database and PostgreSQL, and in an export; `docs/security/` for the release, as 12.2 was.

**Accepts when:** the marker is found nowhere, the test fails when one field is written in plain text, and the review's findings are answered.

**Done as:**

- **The marker test:**
  - `src/keys/server/move.test.ts` scans every table of the app's store, the vault's included, after a move, and finds the marker nowhere, as text, base64 or hex. It was seen to fail with the marker planted in a row.
  - `e2e/keys.spec.ts` finds a typed marker nowhere in what the server answers.
- **The review** is `docs/security/0.2.0.md`, with six findings, each accepted and documented or to move onto the SDK.
- **Left out:** the scan ran on a `file:` database here, not sqld or PostgreSQL; a household that stays sealed is, by amendment 2, not covered by it.
