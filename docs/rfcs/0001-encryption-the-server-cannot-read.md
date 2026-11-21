# RFC 0001 — Encryption the server cannot read, the suite's way

|               |                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**    | Accepted on 2026-11-21; being built                                                                                                        |
| **Date**      | November 2026                                                                                                                              |
| **Author**    | Claude Code (design discussion with `kasunben`)                                                                                            |
| **Scope**     | `DESIGN.md` §5, §7.3, §8.7, §12.4, §13, §14, §15, §18, §19, §20, §26; `src/crypto/`, `src/sync/`, `src/auth/`, a new `src/keys/`           |
| **Builds on** | `sovereign`'s [RFC 0005](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0005-end-to-end-encryption.md), sdk §9.3 to §9.5     |
| **Tasks**     | [epic 18](../epics/encryption.md), 16.8 to 16.10 in [epic 16](../epics/upstream.md); [workstream 0001](../workstreams/0001-suite-model.md) |

> **Not yet audited.** Sovereign's design and code that this RFC adopts have not been reviewed by a cryptographer or audited. Every place Shopper
> describes the feature says so, as `docs/encrypting-an-app.md` in `sovereign` requires.

## Summary

Shopper stops encrypting with a key the server holds and adopts the suite's encryption, the one Sovereign publishes for every app. What people write
into Shopper (the names of lists, items, products, categories, shops and households, notes, prices and barcodes) is encrypted **in the browser**,
under a key only the household's members hold, and the server stores and merges ciphertext it cannot open. It is always on, for every household; there
is no setting and no opt-in.

- **Hosted**, for an account that signs in through core, the app key comes from core (`@sovereignfs/sdk/keys`, `appKeys`). Core's passkeys, recovery
  kit and escrow work for Shopper as for every encrypted app.
- **Standalone**, for an account that signs in with a password, the app keeps the keys in its own vault (`@sovereignfs/sdk/vault` on the server,
  `@sovereignfs/sdk/local-vault` in the page), unlocked at sign-in, with the recovery kit shown by Shopper.
- **A household has a key,** a document key in the SDK's terms, sealed to each member with `share()`. Every content field is encrypted under it.
- **The structure stays readable**, so sync, field merging, folding and ordering stay on the server as they are: ids, quantities, units, ticks,
  positions, times, roles, field stamps and name keys.

Shopper's own design for encryption (`DESIGN.md` §13 as it stands: `t1` envelopes under `SHOPPER_ENCRYPTION_KEY`, the server unsealing to work) is
discarded, not extended. Nothing Shopper writes is its own cipher; every primitive is the SDK's.

## Motivation

`DESIGN.md` §13.3 and §26 ruled end-to-end encryption out because folding, merging and notices needed the server to read. Two things changed:

1. **The suite has an answer.** Sovereign's RFC 0005 is implemented and published in `@sovereignfs/sdk` 2.11.0: key release from core, a vault for an
   app with no core, a recovery kit, document keys sealed to readers. Tally and Wallet encrypt everything people write, and Tusk lets a person
   encrypt their Desk. Shopper is now the app of the suite whose server reads the most.
2. **The server does not need the text.** Field merging compares field stamps, not values. Folding compares name keys, which a browser can compute.
   Suggestions, totals and aisle order are already pure functions shared with the browser (`AGENTS.md`: one figure, one implementation). Notices can
   be worded without naming what was added. What remains is small, and is set out below.

What a household buys, where and for how much says a great deal about who they are. The owner's decision is that it should be readable by the
household and nobody else, as Proton keeps mail: always on, and said honestly.

## What is encrypted, and what is not

| Encrypted in the browser, under the household's key                                                                                                                          | Readable by the server                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Household: name. List: name. Item: name, note, price. Product: name, note, barcode, last unit price. Category: name. Shop: name. Trip: receipt total. Trip line: name, price | Ids and every `*_id`, quantities and units, icons, positions, times, ticks (`boughtAt`, `boughtBy`), roles, counts, `seq`, field stamps, name keys, the currency code, sizes, who is in which household |

| Sealed by the server, under `SHOPPER_ENCRYPTION_KEY` (credentials and identity only)          | Why the server holds it                                                                                                          |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Person: name, email. Invitation: email. Core's refresh token. A push device's keys (RFC 0002) | Mail is sent by the server; `/invite/<token>` names the inviter before anyone has a key; core and better-auth hold them in plain |

A person's name and address are who they are, not what they buy. Core and better-auth already hold them in plain text, and mail and the invitation page
need them before the reader has any key. They stay sealed at rest by the server, as Tally's and Ledger's credentials are, and `docs/encryption.md` says
plainly that the server can read them.

**Prices and totals** are encrypted. A total is computed on the device from the lines it can open (`src/quantity/`), never on the server.

## Keys

### Where an account's key comes from

The key source is decided **per account**, by how it signs in, never by the instance and never by the viewport:

- **An account that signs in through core** gets the app key from core with `appKeys({ core, clientId, returnTo: '/keys/return' })` (sdk §9.3).
  `open()` gives the key or `{ state: 'locked' }`; locked, the page shows `LockedState` and `unlock()` sends the person to core's `/keys/release`
  and back to `/keys/return`, where `receive()` reads the answer. The manifest gains `encryption: { "return": "/keys/return" }` (manifest 4 and
  later), and `SOVEREIGN_SCOPES` (`src/auth/config.ts`) gains `keys`. Shopper's server serves the session's key secret at `/auth/key-secret`.
- **An account that signs in with a password** keeps its keys in Shopper's own vault (sdk §9.5): `new AppVault(database)`, its tables from
  `vaultMigrations(family)` on both dialects, applied apart from Shopper's own migrations, and `vaultRoute(vault, { origin: SHOPPER_URL })` at
  `/auth/vault`. In the page, `localVault({ clientId: 'SHOPPER', vaultId })`: `derive(password, address)` gives the sign-in value (`svp1.…`) that
  better-auth receives in place of the password, and a secret that `afterSignIn` uses to set the keys up or open them. The kit is shown once after
  sign-up (`kitPending`, `keepKit`) with `RecoveryKit` from `@sovereignfs/ui`, and `unlockWithKit` opens the vault after a forgotten password.
  `prepareChange` and `finishChange` change a password. The pages that derive need `'wasm-unsafe-eval'` in `script-src`, and nothing else is relaxed.
- **An account that has linked both** (2.9, phase 2) uses core's key once linked; linking moves the vault's records to core, as sdk §9.5 says
  the records are made to.

`src/keys/` is one interface over both: `open()`, `unlock()`, `forget()`, `identity()`, used by everything that encrypts. Signing out calls `forget()`
and deletes the device's store (§12.10, unchanged).

### The household key

- **Each household has a key:** `newDocumentKey()`, with the household id as `documentId`. It is made in the browser of the person who makes the
  household, including the household made with every account (`own_of`, §7.4), on that account's first unlock.
- **It is sealed to each member** with `share({ documentKey, documentId, to, identity })` after `checkPerson` has checked the member's keys, and the
  sealed records are kept in a new table, `household_key` (`household_id`, `epoch`, `person_id`, `record`), on both dialects. A device opens its own
  record with `openShared`.
- **A key epoch.** Removing a member, or a member leaving, makes a new key at the next write by a remaining member's device, sealed only to those who
  remain (RFC 0005 §8). Rows keep the epoch they were written under, and a device holds every epoch it was given. A removed member keeps what they
  already read, and the household's screen says so.
- **The server never sees a household key.** It stores sealed records, and refuses a write under an epoch the household has moved past.

### The fields

Each encrypted field is `encryptBytes` under the household key's content key (`importDocumentKey`), with an associated value binding household,
table, row, field and epoch, so a value moved to another row or field does not open. A mutation (§12.2) carries the ciphertext where it carried the
text; the server's validators check sizes, not contents. A registry of encrypted fields (`src/keys/fields.ts`) replaces `src/crypto/sealed.ts`'s, and
its test holds it to `DESIGN.md` §13's table, as today.

### The name key

`nameKey = HMAC-SHA-256(K_name, household_id ‖ normalised name)`, with `K_name` derived from the household's **first** key by HKDF with the label
`shopper:name-key:v2`, computed **in the browser** and sent with the product. The server folds products whose name keys are equal, as `src/sync/fold.ts`
does now, without reading a name.

`K_name` does not change with the epoch: a new epoch would change every name key and make folding across devices on different epochs miss. The cost
is stated: a removed member who also has a copy of the database can test whether the household has a product of a name they guess. That needs the
database, which a member never has.

## What changes on the server

- **Applying a mutation** (`src/sync/apply.ts`) merges ciphertext field by field, as it merges text now: field stamps decide, the value is opaque. The
  first tick stands, an edit restores a deleted row, a replay writes nothing. The property tests pass with opaque values.
- **Folding two items** keeps the larger quantity and the earlier adder, and records the alias, as now. **Joining two notes** needs the text, so the
  server keeps the later item's note ciphertext on the alias, and the first device with the key that pulls the alias joins the notes (earlier first)
  and writes the result through the one path. The result is the same on every device, and nothing anyone typed is lost.
- **Nothing on the server unseals content.** `src/crypto/rotate.ts`'s re-computing of name keys goes; the envelope stays for the fields the server
  seals (above), with rotation of those only.
- **Notices** (phase 2) raised in Shopper's own bell carry the ciphertext and are worded on the device ("Sam added Oat milk"). Anything that leaves
  the app, through core's bell, core's or Shopper's mail, or a push, says only what happened and who did it, never a name it cannot read: "Sam added
  3 items to a list".
- **Logs** hold an id and a kind of failure, as now; the server has nothing else to log.

## What moves to the browser

Suggestions (§8.5), totals and unit prices (§10.4), aisle order (§8.3), search, the summary of an import, and the import from the legacy plugin
(§18.3). Each is already, or becomes, a pure function in `src/` run by the device over the rows it has opened. The server's copy of any of them is
deleted, not kept for "help".

## Invitations

Accepting an invitation (§7.3) makes the invitee a member, and they need the household's key:

- **An invitation link** carries a link secret of 32 random bytes **in its fragment** (`/invite/<token>#<secret>`), which never reaches the server.
  The inviter's browser stores the household's current key wrapped under the secret (`encryptBytes` under `importDocumentKey(secret)`), beside the
  token's hash. The invitation page reads the fragment and removes it from the address before anything else, as `receive()` does.
- **On accepting,** the invitee's browser unwraps the key and seals it to its own person with `share()`, in the same online operation that makes
  the membership; the wrapped copy is deleted with the invitation. A used, revoked or expired invitation leaves nothing that opens.
- **An invitation by email** (3.10, phase 2) is sent by the server, so its link carries **no** fragment: a secret the server mails is a secret the
  server has. The invitee joins, and the household shows "Waiting for another member to open Shopper" until a member's device seals the key to them
  with `share()` after `checkPerson`. An invitation from the directory (10.2, phase 2) does the same, through core's `keys.person`.
- This is the one piece the SDK does not name. It uses only the SDK's primitives, and is raised in `sovereign` (16.9) so that a link that carries
  a document key is the suite's, not Shopper's. If `sovereign` publishes one, Shopper moves onto it.

**Whoever holds the link can accept it,** as now. A link that leaks before it is used gives the household's current key to whoever uses it first, as
it gives them membership today; the dialog that shows the link says to send it privately, and revoking it deletes the wrapped key.

## Two kinds of account in one household

On an instance where both core and local sign-in are set, a household can hold an account of each kind. Sealing a new epoch to every remaining
member needs each member's public keys: core serves those of core accounts (`keys.person`), and Shopper's vault holds those of its own accounts but no
SDK call serves them to another person's browser in a form `checkPerson` accepts. That is raised in `sovereign` as 16.8. **Until it is released:**

- a household of standalone accounts is encrypted, and joining by a link works, since it needs no public key;
- joining by email (phase 2) needs a member to seal the key to the newcomer, so with standalone accounts it waits on 16.8 too, and the dialog offers
  the link instead;
- removing a member, or leaving, marks the household as needing a new key, and the next device whose person can check every remaining member makes
  it. Where none can, the household keeps its current epoch, and its settings say that the removed member could still read what is added. Nothing is
  hidden from the person removing.

## Moving 0.1.0's households

0.1.0 sealed content with the server's key. On a household's first unlock after the upgrade, its Admin's browser (any member's in a household with no
Admin left) makes the household key, pulls the household's rows (which the server opens with `SHOPPER_ENCRYPTION_KEY` one last time, for that
household's members only), encrypts every content field, and writes them through the one path, in batches. When a household's every row is
encrypted, the server empties its `sealed` content columns in the same transaction as the last batch. A household that is never opened stays sealed
by the server, and the release after the next deletes the reader and asks the operator, in `CHANGELOG.md`, to open every household once before
upgrading.

## The screens

- **Settings › Encryption:** "Only the people in your households can read your lists. Not yet audited." The kit (standalone): shown once after
  sign-up, kept again from here. Hosted, a line that the kit and passkeys that unlock are core's, with a link to core's Security page.
- **Locked:** `LockedState`, never ciphertext. Hosted, its action is `unlock()`; standalone, the password (or the kit).
- **Waiting for a household's key:** a household this device cannot open yet (a new epoch it was not given) shows its name as "A household" and
  "Waiting for another member to open Shopper".
- **Removing someone:** "They keep what they already saw. What is added from now is only yours" (or, before 16.8, what is said above).
- The words of `AGENTS.md` hold; the feature is never called "zero-knowledge" or "end-to-end" on a screen, as Tally and Wallet say it: "only your
  household can read it".

## What it protects, and what it does not

As `encrypting-an-app.md` sets out, in Shopper's words for `docs/encryption.md`:

- **It protects against someone who reads the server:** a copy of the database, a backup or a disk holds ciphertext, sealed keys and public keys.
- **It does not protect against whoever runs the server,** which sends the app's code and could send changed code. `docs/encryption.md` never says
  the operator "cannot" read anything.
- **The server still sees** who is in which household, how many lists and items there are, quantities and units, when things are ticked, and sizes.
- **A forgotten password and a lost kit together lose a standalone account's households for good,** unless another member still has the key, in
  which case a new account invited again gets it. Hosted, core says what it says about its kit and escrow.

## Alternatives considered

| Alternative                                             | Why not                                                                                                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep §13 as it is (server-held key)                     | The owner's decision is to be encrypted as the suite is                                                                                                                 |
| Opt-in, per household or per person (Tusk's model)      | Two code paths for every read and write, and a household is only as private as its least careful member; the decision is always on                                      |
| Encrypt whole rows, the server a relay (Wallet's model) | Field merging, folding, `seq` and Couldn't sync would move to the browser: the sync engine rewritten for little gain, since the structure says little without the names |
| Shopper's own cipher and household keys (Tally's model) | The owner's decision is to adopt the suite's; a second implementation to audit, and a vault that could not move to core                                                 |
| A name key that changes with each epoch                 | Folding would miss between devices on different epochs                                                                                                                  |

## Open questions

1. Whether `auth.keySecret` and `/auth/key-secret` work over Shopper's own better-auth session, not only the SDK's `nextAuth` (raised as 16.10).
2. Whether a person's export should carry a readable copy made in their browser, beside the ciphertext the export contract requires (RFC 0003).
3. Whether better-auth's `user` table, which keeps name and email in plain text (finding 2 of `docs/security/0.1.0.md`), should move to
   `@sovereignfs/auth` (17.3) and whether that changes it.
