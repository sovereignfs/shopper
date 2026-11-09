# Epic 3: Households

## Status

📋 Planned.

## Overview

The unit of sharing: a household and the people in it, with the permission carried in every statement. Every account has its own household from its
first sign-in; shared households are joined only by accepting an invitation. Membership is decided online (`/api/ops`), never queued (`DESIGN.md`
§12.8). Invitations follow Tally's (token, hash, link, mail), without placeholders.

## Related

[`DESIGN.md`](../../DESIGN.md) §5.2, §6, §7, §9.1, §12.8 · Tally's `docs/epics/groups.md` and `docs/epics/invites.md`

## Tasks

#### 📋 3.1 — Persons

**Goal:** Shopper's own record of who someone is. **Design:** §6.1, §6.2. **Depends on:** 2.1, 1.11.

**Technical:** `person` (§20.3), sealed name and email; made in the same transaction as the account (better-auth's after-create hook); name and email
kept in step from Settings (2.6); `kind` `account` or `imported` (11.2); the one visibility function for emails (a person themselves, an Admin of a
shared household); initials and a colour from the id for avatars.

**Accepts when:** every new account has exactly one person; a second member of a household sees the name and not the email; an Admin sees both; the
person's sealed fields are not readable in the database.

#### 📋 3.2 — Households, members and access

**Goal:** households, membership, and the permission in every statement. **Design:** §5.2, §7.1, §7.2. **Depends on:** 3.1.

**Technical:** `household`, `member` (§20.3); `src/access/` with the membership condition as a reusable SQL fragment and the Admin variant;
`src/access/routes.ts` listing every page, route and operation; `/api/ops` with `household.create` (name, colour, currency; the creator as Admin; the
starter categories once 4.2 is in; a _Groceries_ list once 5.4 is in), `household.update` (Admin), each in one transaction that increments the
household's `seq`; the second-person test harness.

**Accepts when:** a person makes a household and is its Admin; a non-member's every read and write of it reads as not found; a Member's attempt at an
Admin operation reads as not found; the harness runs for every listed route.

#### 📋 3.3 — Your own household

**Goal:** every account has a private household. **Design:** §7.4. **Depends on:** 3.2.

**Technical:** made with the account (same hook as 3.1), `own_of` set, named _Just me_ (the name sealed as any other), with the starter categories and
a _Groceries_ list as those tasks land; refused for Invite, Leave, Delete and any membership operation; existing accounts at the time this lands get
one by a migration-time job, idempotent.

**Accepts when:** every account has exactly one own household; invitations, leaving and deleting it are refused; it is otherwise a household like any
other.

#### 📋 3.4 — Invitations

**Goal:** joining a household by accepting. **Design:** §7.3. **Depends on:** 9.1, 2.7, 8.7.

**Technical:** `invitation` (§20.3): 32 random bytes, stored as a hash, compared in constant time, 14 days, single-use, revocable, at most 20 live per
household, resend at most hourly; `invite.create` with an email (sealed) and, once 10.2 is in, a `sub`; mail through the outbox (9.1) and, for an
account here named by verified email or `sub`, an `invited` notice (once 9.2 is in); `/invite/<token>` showing the household's name and the inviter's
only, the same page for every invalid link; accept in one transaction (a Member row, the `member_joined` notices); sign-up through an invitation
(2.7); the dialog says so when mail is not set up; rate limits.

**Accepts when:** journey 3 of §3 passes alone and with no mail set up; an expired, revoked, used or unknown token shows the same page; the inviter is
never told whether an address has an account; a second acceptance of one link is refused.

#### 📋 3.5 — Roles, leaving, removing and deleting

**Goal:** a household's lifecycle. **Design:** §7.2, §7.5. **Depends on:** 3.4.

**Technical:** operations `member.role` (Admins; the last Admin cannot step down), `member.remove` (Admins), `member.leave` (anyone but the last
Admin), `household.delete` (Admins, not one's own), each in one transaction incrementing `seq`; leaving or removal finishes the person's open trip
there; deletion removes everything by `household_id`; notices `removed` and `household_deleted` once 9.2 is in; pull names a left household as gone
(6.1).

**Accepts when:** the last Admin cannot leave, be removed or step down; a removed member's devices drop the household at their next sync; a deleted
household leaves no row behind; names stay on items and trips after leaving, shown as left.

#### 📋 3.6 — Moving a list between households

**Goal:** a list moves, with its items, to another of the person's households. **Design:** §9.1. **Depends on:** 3.5, 5.6.

**Technical:** `list.move` (an Admin of both, or from one's own household into a shared one they are Admin of): in one transaction, the list and its
items re-pointed; products matched by name key in the destination or copied (sealed anew under the destination's name key); categories matched by name
or set to _Other_; items bought in an open trip stay in the source trip, the moved items keeping their bought state without a trip; both households'
`seq` incremented, a tombstone in the source.

**Accepts when:** journey 10 of §3 passes; a moved list's items carry the destination's products and categories; the source household's devices drop
it and the destination's receive it; a non-Admin's attempt reads as not found.

#### 📋 3.7 — Limits

**Goal:** the operator's limits, checked by the server. **Design:** §7.6. **Depends on:** 3.2.

**Technical:** `src/limits/` reads the six `SHOPPER_LIMIT_*` settings (1.4); checked in the statement or the transaction that would exceed them
(members at acceptance, households at creation and acceptance, lists, open items, products, categories at apply); each refusal a sentence naming the
limit; in sync, a refusal to Couldn't sync (6.3).

**Accepts when:** each limit, set low in a test, refuses the change that would pass it, online and through sync, with its sentence.
