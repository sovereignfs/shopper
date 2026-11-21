# Epic 19: Push

## Status

📋 Planned. 19.1 and 19.2 are leg 7 of [workstream 0001](../workstreams/0001-suite-model.md), before phase 2; 19.3 is phase 2.

## Overview

Shopper notifies a device where it is not open, with `@sovereignfs/push` and `@sovereignfs/pwa`, the same alone and hosted. The design is
[RFC 0002](../rfcs/0002-web-push.md). Supersedes 13.8.

## Related

[RFC 0002](../rfcs/0002-web-push.md) · RFC 0009, `packages/push/README.md` and `docs/building-an-app.md` (push) in `sovereign`

## Tasks

#### 📋 19.1 — Push on the server

**Goal:** a device can subscribe, and Shopper can send to it. **Design:** RFC 0002, "What is built". **Depends on:** 17.1, 18.11.

**Technical:** `@sovereignfs/push` 0.2.0; `SHOPPER_VAPID_PRIVATE_KEY` and `SHOPPER_VAPID_SUBJECT` through `@sovereignfs/config`, in `generate`,
`.env.example`, the `Dockerfile` and the Compose files; `push_subscription` on both dialects with the device's keys sealed; `PushStore` with
`pushStoreConformance`; `pushSubscriptionHandlers` at `/api/push`, in `src/access/routes.ts` with a second-person test; `runPushOutbox` as a claimed
job; `People.deletePerson` forgetting devices.

**Accepts when:** the conformance suite passes on all three databases; with no key, the route answers that push is off and nothing is sent.

#### 📋 19.2 — The worker, the page and the first kind

**Goal:** a person turns push on and hears when someone joins their household. **Design:** RFC 0002, "What is built", "What is pushed". **Depends
on:** 19.1, 17.2.

**Technical:** `serviceWorkerSource({ push })`; `PushControl` in Settings › Notifications, with the iPhone sentence; `turnOffPush` before sign-out;
`enqueuePush` in the accepting operation (3.4) to the other members; the words "Sam joined your household" and nothing of the household's name.

**Accepts when:** a subscribed browser receives one push when someone joins, the joiner none; turning it off stops it; signing out unsubscribes.

#### 📋 19.3 — Push as a channel of notices (phase 2)

**Goal:** every notice kind can reach a device. **Design:** §14.2, §14.3, RFC 0002. **Depends on:** 19.2, 9.2, 9.4.

**Technical:** Push in `notice_pref`; `enqueuePush` in the change's transaction for each kind that is on; the digest (9.3) pushed as one; words
with no names.

**Accepts when:** a notice reaches a subscribed browser once, never the person who acted; a kind turned off for Push sends none.
