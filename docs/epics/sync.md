# Epic 6: Offline and sync

## Status

📋 Planned.

## Overview

The device holds every household the account is in and works without a network; the server checks, merges, folds, orders and hands on every change;
and each device sees others' changes within seconds. The shape is Tusk's Desk (its `src/sync/`, local store and loop, copied and adapted) with
Tally's counter per group, here per household.

**0.1.0 pulls at a fixed interval** (the operator's `SHOPPER_SYNC_INTERVAL_SECONDS`, 20 s by default, shorter in shopping mode), on every write, on
load, on focus and when the network returns. Live updates and the freshness setting each person chooses are Shopper's own and are phase 2 (6.4), as is
pruning the history (6.6).

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §12, §16.11 · Tusk's `DESIGN.md` §8, §17.9 · Tally's `docs/epics/sync.md`

## Tasks

#### ✅ 6.1 — The sync endpoint

**Goal:** `POST /api/sync`. **Design:** §12.3. **Depends on:** 5.5.

**Technical:** session and `Origin` checked; a bounded body; a protocol version; the outbox applied in order through 5.2, each answered applied (with
any fold, 5.3) or refused with its reason; then, for the account's current households (membership read in the statement), rows whose `seq` is past
each cursor, unsealed for the reader, paged at `seq` boundaries, tombstones and aliases included; households the account is no longer in named as
gone; **the answer carries the operator's sync interval**, so the browser never reads a run-time setting from its build; a rate limit. Trips and
their lines, in a snapshot of the last 180 days, join with 7.1. Shape from Tusk's `src/sync/`, with cursors per household.

**Accepts when:** a device starting at zero gets each household whole; a cursor gets only what is new; a household left between two syncs is named
gone and its rows stop; a lost answer retried applies nothing twice.

**Done as:** `POST /api/sync` in `app/api/sync/route.ts`, through `accountRoute` (session and `Origin`), a 2 MB body cap (`readCapped`), 240 requests a minute per account (database-counted), and `handleSync` in `src/sync/endpoint.ts`, which is pure of HTTP. `src/sync/protocol.ts` is the one definition of the request (a `version`, an outbox of at most 200 mutations, a cursor per household) and the answer; a device on another protocol gets 426 and keeps its outbox, a malformed body 400. The outbox is applied in order through `applyMutation`: each is answered `applied` or `replayed` (with its folds) or `refused` (reason and sentence), and a refusal does not stop the rest. Then, for the households `householdsOf` returns (active membership, in the statement), `src/sync/pull.ts` returns what is past each cursor: lists, items, products, categories, members, tombstones and aliases, unsealed and in the device's camelCase shape, with a member's address shown only as `canSeeEmail` allows. A page is cut at a whole `seq` (`PAGE_ROWS` 500, tested at 3), so a device never sees half a change, and `more` says to ask again; a household new to the device starts at 0, which is its snapshot. Households named in the cursors that the account is not in now are `gone`, which is the answer for one that never existed or was never theirs as well, so it reveals nothing. The answer carries `SHOPPER_SYNC_INTERVAL_SECONDS`. Seven tests in `src/sync/endpoint.test.ts` on all three databases, including a second person, a refused write answered as one to a household that is not there, a member who leaves, a lost answer retried, and paging; the pull's membership guard was seen to fail when removed. Left out: trips and their lines (7.1), the live stream (phase 2), and a test of the route's rate limit and body cap, which are one line each in the route and are exercised in the browser tests of 6.2.

#### ✅ 6.2 — The device's store, outbox and loop

**Goal:** screens read and write the device, and the loop syncs. **Design:** §12.1, §12.3, §12.7, §12.10. **Depends on:** 6.1.

**Technical:** `src/local/`: IndexedDB through `idb`, one database per account (`shopper-<account id>`), the tables of §20.3's device store; a write
applies to the store and the outbox in one IndexedDB transaction, through the actions of 5.1; a store reader with change events for React; the
device-side fold of an open product (the _+1_ offer); the loop (after a write, debounced 300 ms; on load, focus, coming online; **on the operator's
interval while visible**), one tab at a time (Web Locks), others told (BroadcastChannel); server rows replace local ones on pull, aliases re-point
local rows, and outbox entries still pending are re-applied on top; undo as a reversing mutation; sign-out deletes the database after trying to send;
an ended session keeps the outbox; `navigator.storage.persist()`, its answer shown in Settings. Shape from Tusk's Desk. The loop takes its interval
from a function that 6.4 later widens to the person's choice and to Live.

**Accepts when:** with `fake-indexeddb`, a write is visible at once and sent once; two tabs do not both sync; in Playwright, two browsers on one list
converge, one of them having worked offline.

**Done as:** `src/local/`, with `idb` (^8.0.4) added. **Store:** `db.ts` opens one IndexedDB database per account (`shopper-<account id>`) with `household` (carrying its pull cursor), `list`, `item`, `product`, `category`, `member`, `shadow`, `outbox` and `meta`, and lets go when another tab deletes it. `rows.ts` is the pure part: `applyChange` runs the server's own `mergeChange` (and `withoutSecondTick`) on a row, so a field is set a field at a time, an edit restores a deleted row and the first tick stands; `reversal` is the change that undoes one. `store.ts` has `commitMutation`, which writes the rows, the shadow and the outbox in **one IndexedDB transaction that aborts if anything throws**, does what the server does besides (a tick moves the product's count and last-bought time; an item put on an archived list restores it) and **returns the mutation that undoes it** (§12.7). `settle` takes an answer in one transaction: answered mutations leave the outbox, a refused one is taken back and handed to `onRefused` whole (6.3 keeps it), server rows replace local ones with what is still waiting laid over them (through the shadow), tombstones delete (a list deleted for good takes its items, which have no tombstone of their own), aliases re-point rows, items and **what waits in the outbox**, and a household the account has left is deleted with its waiting changes kept for the server to refuse. The queries are `householdsOf`, `listsOf`, `itemsOf`, `openCounts`, `productsOf`, `categoriesOf`, `membersOf`, `productNamed` (by `canonicalName`, as the server folds) and `openItemFor`, which is what the _+1_ offer is made from. **Sync:** `transport.ts` (every failure is a value), `client.ts` (`commit` validates with the server's validator, then queues; `sync` goes round while there is more; change events for React and for other tabs over a `BroadcastChannel`), `loop.ts` (after a write, debounced 300 ms; on load, focus, online and visible; on an interval **read from a function** each time, from the operator's setting as the last answer said it, and not while hidden; one tab at a time by a Web Lock; silent backoff that believes a `Retry-After`; stops on a signed-out session or a device too old, keeping the outbox), `signout.ts` (send, ask about what cannot be sent, end the session, then delete the database), `persist.ts`, and `react.tsx` (`LocalProvider`, `useLocal`, `useLocalQuery`). `app/(app)/layout.tsx` mounts the provider, the account menu signs out through `leaveDevice`, and deleting an account deletes its database. Copied from Tusk's Desk and changed: `src/local/{db,persist,store}.ts`, `src/sync/{client,loop,transport,signout}.ts` and `react.tsx`, with the Desk's per-field stamps, key cipher, snapshot and series logic left out (a pull replaces a row, and the shadow carries the waiting edits); the client is `SyncClient` as there. 36 tests in `src/local/` on fake-indexeddb against the real endpoint on all three databases: a write visible at once and sent once, offline then online, refusal taken back, a change waiting kept on top of a pull, two members converging with one offline and the first tick standing, a product two members made folded into one with the items, a household left, a list deleted for good, undo, the alias re-pointing (each guard seen to fail when removed), the loop's triggers and backoff and one tab at a time, sign-out in its order, and persistence. Three browser tests (`e2e/device.spec.ts`) show the database filled after sign-up, taken away by signing out, and one per account. Left out: **two browsers on one list converging, one offline, in Playwright**, which needs a screen that writes and is a test of 8.3 (the same convergence is tested here without a browser); showing the answer of `navigator.storage.persist()` in Settings, which is kept in `meta.persisted` and shown by 6.3's _This device_; a dialog of the design system in place of `window.confirm` for the unsent-changes question; the product's counts after a tick are the device's own until the server answers, and are replaced then.

#### 📋 6.3 — Couldn't sync

**Goal:** a refused change is kept, explained, and recoverable. **Design:** §12.5. **Depends on:** 6.2.

**Technical:** a refused change moves from the outbox to a `failed` store with its reason, and leaves the screens; a refused tick is undone with a
toast; Settings > This device lists them with Move to another list (re-made as a new mutation; to another household once 3.8 and 3.6 exist) and
Discard; a mark on the avatar while any are there; last synced time; Reset this device. Copied from Tally's.

**Accepts when:** a change refused for a removed member, a list deleted for good and a limit each land there with their sentence and can be moved or
discarded; nothing refused is silently lost.

#### 📋 6.4 — Live updates and the freshness setting (phase 2)

**Goal:** others' changes as fast as each person chose. **Design:** §12.6, §11.1. **Depends on:** 6.2.

**Technical:** `src/sync/live.ts`, an in-process hub: apply (5.2) and the operations publish `{household, seq}` after commit; `GET /api/live`, session
checked, a server-sent-event stream of the account's households' signals and a 25-second heartbeat, at most `SHOPPER_SYNC_LIVE_MAX_CONNECTIONS` per
account (the oldest closed), closed at sign-out, session end and core's logout, 404 when `SHOPPER_SYNC_LIVE=false`; on the device, a listener opened
while visible and closed while hidden, which triggers a pull, with a five-minute pull while live; the setting in Settings > This device (Live, 10 s,
30 s, 2 min, on open), choices below `SHOPPER_SYNC_INTERVAL_MIN_SECONDS` not offered, kept on the device, **the operator's
`SHOPPER_SYNC_INTERVAL_SECONDS` becoming the default choice**; shopping mode forcing the fastest offered; the README's note on more than one process
and proxy buffering; the two new settings in `.env.example`; the CSP and `X-Accel-Buffering` of 1.7 for the stream.

**Accepts when:** with Live, a change in one browser appears in another within two seconds in Playwright; with the stream cut, the device falls back
to its interval and catches up; with `SHOPPER_SYNC_LIVE=false`, Live is not offered and `/api/live` answers 404; a second person's stream never
carries the first's households; no row data ever appears on the stream (a test reads it).

#### 📋 6.5 — Opening offline

**Goal:** Shopper opens with no network. **Design:** §16.11. **Depends on:** 6.2, 1.12.

**Technical:** as Tusk's: the shell page kept with its headers; signed-in addresses (a list, shopping mode, settings) answered with it offline;
`src/identity.ts` kept by every signed-in page and removed at sign-out; the shell composes the signed-in area and reads the device's store; every
other address gets the worker's own "needs a connection" page. The allow-list grows with the screens of phase 2 (all lists, the catalog, recent
trips).

**Accepts when:** in Playwright, with the network off after a first visit, a list and shopping mode open, show their items, and accept changes that
sync when the network returns; a page needing the server says so.

#### 📋 6.6 — Keeping the history small (phase 2)

**Goal:** the database does not grow without end. **Design:** §12.9. **Depends on:** 6.1, 1.6.

**Technical:** a job hard-deletes cleared and deleted items after 30 days, and deleted products, categories, shops and lists after 30 days, leaving
tombstones; tombstones, aliases and applied-mutation records go after 90 days; a cursor older than that gets a fresh snapshot after its outbox is
sent. Trips and lines are not pruned. **0.1.0 keeps everything,** which a household's first months do not make large.

**Accepts when:** after the job, nothing past its age remains; a device with a stale cursor sends its outbox and receives a snapshot.
