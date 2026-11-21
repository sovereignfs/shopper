# ADR 0001 — Sign-in on `@sovereignfs/auth`

|              |                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| **Status**   | Proposed on 2026-11-21, and followed by workstream 0001 until the owner decides; task 17.3                      |
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
