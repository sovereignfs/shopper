# Epic 9: Mail and notices

## Status

📋 Planned. **All of epic 9 is phase 2:** 0.1.0 has no bell, no notices and no mail of its own beyond what sign-in sends (2.1). People share by a link
(3.4) and see each other's changes when their device syncs.

## Overview

Shopper's own mail and its own bell, so that both work with no instance; core's bell and email join through epic 10. Notices are few by design
(`DESIGN.md` §14.1): invitations and joins, trips finished, and a quiet digest of items added, off by default.

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §14 · Tally's `docs/epics/notices.md` and `docs/epics/invites.md` (8.1)

## Tasks

#### 📋 9.1 — The mail outbox (phase 2)

**Goal:** mail sent in the background, never lost, never logged. **Design:** §14.3. **Depends on:** 1.6.

**Technical:** `mail_outbox` (§20.3) with address and data sealed; rows written in the change's transaction; a mail job claiming, sending through
Shopper's SMTP (`SHOPPER_SMTP_*`), retrying with backoff, recording a failure kind and never the address or content; templates (invitation, `invited`)
as plain text and simple HTML from typed content; with no SMTP set, rows are not written and callers are told. Copied from Tally's 8.1.

**Accepts when:** against a fake SMTP server, a queued mail is sent once even with two processes; a failing server retries and gives up after the set
attempts; logs hold no address.

#### 📋 9.2 — Notices and the bell (phase 2)

**Goal:** people are told what concerns them, in Shopper. **Design:** §14.1. **Depends on:** 5.2, 8.1, 3.5.

**Technical:** `notice` (§20.3); kinds `invited`, `member_joined`, `removed`, `household_deleted`, `admin_passed`, `trip_finished` written in the
change's transaction, never for the actor (so never in a household of one); `invited` once 3.10 is in, `admin_passed` for 2.5, `removed` for 3.5,
`household_deleted` for 3.9, `trip_finished` for 7.2; words from one pure function (`src/notices/describe.ts`); the bell left of the
avatar with the unread count to "99+" and `NotificationsPanel`; `/notifications` by day; read per notice and Mark all read; 90 days and at most 500 a
person kept (a job); a notice for a household left is not shown; the unread count as last synced, offline.

**Accepts when:** each kind reaches exactly the people §14.1 names and never the actor; the bell works with no core and no mail.

#### 📋 9.3 — The items-added digest (phase 2)

**Goal:** a burst of adds is one quiet notice. **Design:** §14.1. **Depends on:** 9.2, 1.6.

**Technical:** `notice_digest`: each applied item add increments a count for every other member with `items_added` on, keyed by recipient, list, adder
and window; a removal in the window decrements; the digest job turns a window into one notice once it has been quiet for 30 minutes or is 30 minutes
old, and drops windows at zero.

**Accepts when:** ten adds in five minutes by one person give the others one notice saying ten; an add and its removal give none; nobody with the kind
off gets anything.

#### 📋 9.4 — Preferences and delivery (phase 2)

**Goal:** each person chooses what reaches them, and how. **Design:** §14.2, §14.3. **Depends on:** 9.2, 9.1.

**Technical:** `notice_pref` per kind and channel with §14.1's defaults; Settings > Notifications, saying plainly what is not available (no mail, no
core); email through the outbox for the kinds and people it is on for; the core's-bell channel's place, wired by 10.1; the Push channel designed in
the table, unused until 13.8.

**Accepts when:** turning a kind off stops it in every channel it was off for; with no mail set up, Settings says so and nothing fails.
