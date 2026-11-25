# ADR 0001 — Sign-in on `@sovereignfs/auth`

|              |                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| **Status**   | **Accepted** by the owner on 2026-11-22, as the last section proposes; first proposed 2026-11-21; task 17.3     |
| **Deciders** | `kasunben` (owner)                                                                                              |
| **Context**  | [RFC 0001](../rfcs/0001-encryption-the-server-cannot-read.md); `docs/specs/auth.md` and RFC 0007 in `sovereign` |

## Context

Shopper signs people in with better-auth configured by hand (`src/auth/auth.ts`, about 400 lines with `config.ts` and `server.ts`): email and password,
core through better-auth's `genericOAuth`, a sign-up policy in the user-create hook, no implicit linking, rate limits in the database, and its own
sign-in and sign-up pages. `sovereign` has since published `@sovereignfs/auth` 0.4.0, "core's own sign-in, the part of it that is not about core",
which every app is meant to use (RFC 0007), and which states "An app that uses the package MUST NOT open a session, hash a password, or hold core's
refresh token any other way".

RFC 0001 changes sign-in at its root: the server must never receive a password, only the value the browser derives (`svp1.…`), and the key store must
be told after every sign-in, password change and sign-out. That is exactly what the package already does (its rule 1, and §7.2's key-store hooks).
Doing it by hand in `src/auth/` (18.2) would build twice what the package holds once.

What the package holds, against what Shopper needs:

| Shopper needs                                       | `@sovereignfs/auth` 0.4.0                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The sign-in value derived in the browser (RFC 0001) | Yes: `./client`'s flows derive it; the hash refuses anything else                                                                                                       |
| The key store told at sign-in, change and sign-out  | Yes: §7.2's hooks, given `AppVault` and `localVault`                                                                                                                    |
| Core as a way in, matched by `sub`, never by email  | Yes: `./core`, on the SDK's steps; **not** `genericOAuth`, so core's refresh token is the SDK's (phase 2's directory)                                                   |
| A sign-up policy, `open` or `closed`                | Yes: `signUpPolicy`, or the app's own function                                                                                                                          |
| Local and core sign-in on one instance              | Yes (`resolveWaysIn`)                                                                                                                                                   |
| The forms                                           | `SignInForm`, `SignUpForm` and the rest in `@sovereignfs/ui` 0.102+                                                                                                     |
| sqld, a `file:` database and PostgreSQL             | The account tables for both families; **but only PostgreSQL has a published way in** (`./postgres`). The `Database` type is `@sovereignfs/database`'s, which is private |
| The session's key secret for core's key release     | **Not built yet** for an app on the package (auth.md §8, last line)                                                                                                     |
| Shopper's tables kept                               | Its own names (`users`, `sessions`, …); an app that kept better-auth's tables moves with a migration that checks and records them (auth.md §10)                         |

## Decision

**Shopper moves its sign-in onto `@sovereignfs/auth`**, as a task of its own (**17.5**), at the start of leg 3 and before Shopper's vault (18.2), so
that the encryption legs are built once, on the package.

- Shopper gives the package its database by wrapping its own connection in the `Database` shape the package reads (`drizzle`, `family`, `run`,
  `transaction`, `session`, `ping`), in one module (`src/auth/database.ts`), until `sovereign` publishes a way in for SQLite and sqld (raised as
  **16.13**). The wrapper is the input the package takes, not a copy of the package.
- The session's key secret is kept by Shopper with its session and served at `/auth/key-secret` in the SDK's shape (`{ sub, secret }`, sdk §9.5),
  until the package or the SDK serves it (16.10).
- The package's tables replace better-auth's default ones by the migration auth.md §10 describes, which changes no data; `People.deletePerson`, the
  seed and the tests move with it.
- The sign-in and sign-up pages use `@sovereignfs/ui`'s forms and the package's flows.

## Consequences

- One sign-in for the suite, and Shopper's `src/auth/auth.ts` deleted. Phase 2's linking (2.9), passkeys (2.8) and the directory (10.2) come from the
  package instead of being built.
- A larger change before the encryption legs, and a dependency on 16.13 to drop the wrapper. If the wrapper cannot satisfy the package (its use of
  `drizzle` over libsql, for example), 17.5 stops and 18.2 is built on `src/auth/` as RFC 0001 first said. That is the fallback, and it is recorded
  here so it is not decided again mid-leg.
- better-auth stays at the one version the package names (1.7.18), exactly, as auth.md §11 requires.

## Checked before leg 3, and the fallback taken (2026-11-21)

Before 17.5 was started, what the decision rested on was checked against the code, not the documents' summaries:

1. **0.1.0's password accounts would stop signing in.** The package refuses anything that is not the derived value, before any lookup, and core's
   own move (`sovereign`'s `docs/upgrade.md`, 0.100.0) had every person set their password again by a reset link sent by mail, or made by an
   operator on the server. Shopper alone often has no mail, and has no operator tool for a link.
2. **The tables are not only renamed.** The package's are `users`, `sessions`, `accounts` and more, with columns better-auth's defaults do not have
   (`timezone`, `locale`, `deactivatedAt`) and tables Shopper has none of (`two_factors`, `passkeys`): a move that changes the schema, on both
   dialects, not a migration that only records what is there.
3. **Key release on the package is not built** (auth.md §8, last line), and the template that does it uses the SDK's own `nextAuth`.

The fallback this ADR recorded is taken: **workstream 0001 keeps Shopper's sign-in on `src/auth/`**, and 18.2 makes it send the derived value
there, with a one-time upgrade of each 0.1.0 password account at its next sign-in (RFC 0001, "Keys"). Moving onto the package (17.5) waits for
`sovereign` to give an app's existing password accounts a way across (16.14), a database for SQLite and sqld (16.13) and the key secret (16.10),
and is decided again then.

## Checked again (2026-11-22): what the fallback waited on is released

`sovereign`'s workstream 0011 built the three things the fallback waited on, released in `@sovereignfs/auth` 0.6.0 (with `@sovereignfs/ui`
0.106.0 and better-auth 1.7.27):

1. **0.1.0's passwords cross over** (16.14; `sovereign`'s RFC 0007 amendment 1, auth.md §8.1). `adoptAccountTables` renames better-auth's tables
   onto the package's, adds its columns and tables on both dialects, and marks every password for 90 days; `movePasswords` with the sign-in
   form's `passwordMove` moves a marked one at the person's next sign-in, opening no session. It is Shopper's own `move.ts`, built once for every
   app. A password Shopper has already moved (`password_derived`) is a hash of the sign-in value, so Shopper's one step of its own after the move
   is to unmark those accounts: nothing of theirs is to move, and the page then never sends their password.
2. **SQLite and sqld have a published way in** (16.13): `@sovereignfs/auth/database`. Shopper's auth store stays its own database: the
   `shopper_auth` file or namespace through `openDatabase`, and on PostgreSQL a pool whose `search_path` is `shopper_auth`, through
   `@sovereignfs/auth/postgres`. No wrapper of Shopper's.
3. **The key secret is served by the package** (16.10): `keySecrets` at `/api/auth/sv/key-secret`, `{ sub, secret }` with core's `sub` for a
   session through core and the account id otherwise, which is what `/api/keys/secret` answers today.

The sign-in value is unchanged: the package derives it with the same `derivePassword` as `localVault.derive`, from a salt the app serves, so
Shopper serves its vault id and every password moved before still opens.

**Checked against the code, not the documents:** Shopper's auth migrations (`0000_init`, `0001_key_secret_and_derived`, the schema of 0.2.0 and
0.2.1) were applied to a SQLite file, sqld and PostgreSQL, with an account whose password had not moved, one whose password had, and one through
core with a session; `adoptAccountTables` and the step above were run, and on the package's preset the first moved and signed in, the second
signed in at once, and the third was found by its `sub` with `genericOAuth`'s token cleared. All three databases passed.

**What it costs, beyond the work:** the package names its cookies itself (`__Host-` over https), so **every session open at the upgrade ends,
and each person signs in once more**: a password unlocks the keys as at any sign-in, and core releases them for an account through core.
Deleting an account with no password asked for a session made in the last ten minutes; the package keeps better-auth's
`freshAge` at 0 and asks for the password again instead, which such an account has not got. **Open, for 17.5:** what such an account
is asked instead (the one decision this leaves).

**Accepted on 2026-11-22:** move as the decision above says, on these released packages, as 17.5 (`sovereign` task 20.14).
