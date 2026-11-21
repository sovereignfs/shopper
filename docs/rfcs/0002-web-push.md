# RFC 0002 — Web Push, the suite's way

|               |                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Accepted on 2026-11-21; not built                                                                                           |
| **Date**      | November 2026                                                                                                               |
| **Author**    | Claude Code (design discussion with `kasunben`)                                                                             |
| **Scope**     | `DESIGN.md` §14.3, §19, §20.3, §22.2; `src/push/`, `src/sw/`, Settings; the manifest, `.env.example`, `Dockerfile`, Compose |
| **Builds on** | `sovereign`'s [RFC 0009](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0009-web-push.md)                     |
| **Tasks**     | [epic 19](../epics/push.md); [workstream 0001](../workstreams/0001-suite-model.md)                                          |

## Summary

Shopper notifies a person on a device where it is not open, with the suite's published implementation and none of its own:
`@sovereignfs/push` on the server, `@sovereignfs/pwa` in the worker and the page, and `PushControl` from `@sovereignfs/ui` in Settings. It works
**the same alone and hosted**: core never sends pushes for an app (RFC 0009, "What this does not do"), so the only difference is where the key comes
from. Hosted, the instance generates it from the manifest; alone, the operator makes it with `npx @sovereignfs/push keys`. With no key, Shopper sends
nothing and Settings shows no control.

This replaces `DESIGN.md` §22.2's plan to copy Tally's §21.4 and moves push from phase 3 to before phase 2. Task 13.8 is superseded.

## What is built

- **The key:** `SHOPPER_VAPID_PRIVATE_KEY` (32 bytes; the public key is derived) and `SHOPPER_VAPID_SUBJECT` (defaults to `SHOPPER_URL` when it is
  https), read by `pushSettings('SHOPPER')` and declared through `@sovereignfs/config`. The manifest's `generate` lists
  `{ "name": "SHOPPER_VAPID_PRIVATE_KEY", "bytes": 32 }`. Both are in `.env.example`, the `Dockerfile` and the Compose files.
- **The store:** `push_subscription` on both dialects, as the package's README gives it: at most ten devices an account, the device's keys sealed
  through `src/crypto/` (one of the few things the server still seals, RFC 0001). Shopper implements `PushStore` over it and runs
  `pushStoreConformance` from `@sovereignfs/push/testing` in its tests on sqld, a `file:` database and PostgreSQL.
- **The route:** `pushSubscriptionHandlers({ store, settings, account, origin })` at `/api/push`, with the session found first and `Origin` checked
  on a write, listed in `src/access/routes.ts` with a test as a second person.
- **Sending:** `enqueuePush` in the change's own transaction (the online operation, or `src/sync/apply.ts`), and `runPushOutbox` as a job that
  claims its work in the database (`src/jobs/`). A push carries a **kind and a path** on Shopper's own origin, and nothing anyone wrote: the server
  cannot read it (RFC 0001), and a push service must not.
- **The worker:** `serviceWorkerSource({ push: { name: 'Shopper', icon, badge } })` from `@sovereignfs/pwa`, which 17.2 moves Shopper's worker onto.
  The worker shows a kind's words from a table in the app, with no names.
- **The page:** `PushControl` in **Settings › Notifications**, "Notifications on this device". On iPhone it says that Shopper must first be added to
  the home screen. `turnOffPush` runs before sign-out; deleting an account (`People.deletePerson`) forgets its devices, in the same transaction.

## What is pushed

Before notices exist (they are phase 2, 9.2), one kind: **someone joined your household**, to its other members, never to whoever joined. Once
notices exist, **Push is a channel of `notice_pref`** beside the bell and email (§14.2, §14.3), for every kind that is on, and the digest job
(9.3) pushes a digest, not each add. That is 19.3, in phase 2.

The words say what happened and who did it, and never a name of a list, item or household: "Sam joined your household", "Sam added 3 items to a
list". Opening the push goes to the path it carries, where the app shows the rest once the device has opened its key.

## Alternatives considered

| Alternative                               | Why not                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Copy Tusk's or Waymark's push             | RFC 0009 exists to end those copies; a copy would be a sixth implementation                                       |
| Core sends pushes for Shopper when hosted | Core does not, by RFC 0009's decision; it would need a relay core does not have, and alone Shopper still needs it |
| Wait for phase 3 as planned               | The package is released now, and phase 2's notices are built with the channel already there                       |
