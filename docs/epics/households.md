# Epic 3: Households

## Status

📋 Planned.

## Overview

The unit of sharing: a household and the people in it, with the permission carried in every statement. Every account has a household from its first
sign-in; shared households are joined only by accepting an invitation. Membership is decided online (`/api/ops`), never queued (`DESIGN.md` §12.8).
Invitations follow Tally's (token, hash, link, mail), without placeholders.

**In 0.1.0 a household is not something a person makes or manages.** Each account has the one made with it, and **sharing is inviting someone into
it by a link**: they see and edit every list in it. Naming households, making more of them, roles, moving a list between them, deleting one and
inviting by email are phase 2 (3.6, 3.8, 3.9, 3.10). The data model, the access rules and the sync are the full design's from the first task, so
phase 2 adds screens and operations and moves nothing.

## Related

[`DESIGN.md`](../../DESIGN.md) §2.2, §5.2, §6, §7, §9.1, §12.8 · Tally's `docs/epics/groups.md` and `docs/epics/invites.md`

## Tasks

#### ✅ 3.1 — Persons

**Goal:** Shopper's own record of who someone is. **Design:** §6.1, §6.2. **Depends on:** 2.1, 1.11.

**Technical:** `person` (§20.3), sealed name and email; made in the same transaction as the account (better-auth's after-create hook); name and email
kept in step from Settings (2.6); `kind` `account` or `imported` (11.2, phase 2); the one visibility function for emails (a person themselves, an Admin
of a household they are in); initials and a colour from the id for avatars.

**Accepts when:** every new account has exactly one person; a second member of a household sees the name and not the email; an Admin sees both; the
person's sealed fields are not readable in the database.

**Done as:** `person` (`DESIGN.md` §20.3, the columns of 0.1.0) with the migration `0001_person`; `src/people/people.ts` (`ensurePerson`, `personOfAccount`, `personById`, `updatePerson`, the name and email sealed through `sealed.ts`, and `person` the first entry of `SEALED` and `SEALED_TABLES`), `src/people/visibility.ts` (`canSeeEmail`, the one function that says who sees an email: the person themselves and an Admin they share a household with; the caller supplies the second from the statement that reads the rows, 3.2) and `src/people/account-records.ts`; `src/db/tables.ts` (`appTable`, a table's name as raw SQL needs it) is new and `rotate.ts` uses it. **Not one transaction:** the account is in the auth store and the person in the app store, which are separate databases (separate pools on PostgreSQL, a namespace and a file each elsewhere), so the person is made by `createAuth`'s `onAccountCreated` after the account, never the account's failure, and **again by every `requireSession`**, idempotently, by a conflict on the unique `account_id`; two at once make one. The initials and colour of an avatar are the design system's `Avatar`'s, from the name, so nothing here makes them. **Seen on all three databases:** one person for an account however often and from however many at once, name and email absent from the whole row, concurrent edits of name and of email both kept, and a sign-up that succeeds while the app store is down and is given its person afterwards (244 tests).

#### ✅ 3.2 — Households, members and access

**Goal:** households, membership, and the permission in every statement. **Design:** §5.2, §7.1, §7.2. **Depends on:** 3.1.

**Technical:** `household`, `member` (§20.3, the columns of 0.1.0); `src/access/` with the membership condition as a reusable SQL fragment and the
Admin variant; `src/access/routes.ts` listing every page, route and operation; `/api/ops` as the one door for the operations of 3.4 and 3.5, each in
one transaction that increments the household's `seq`; the second-person test harness. A household is made by 3.3 with the account; making one by hand
(`household.create`, `household.update`) is 3.8.

**Accepts when:** a household's Admin and Members read and write it; a non-member's every read and write of it reads as not found; a Member's attempt
at an Admin operation reads as not found; the harness runs for every listed route.

**Done as:** `household` and `member` (`DESIGN.md` §20.3, the columns of 0.1.0; the household's sealed name is null while it has none) with the migration `0002_household_and_member`, and `household` added to `SEALED` and `SEALED_TABLES`. `src/access/membership.ts` holds the two conditions as SQL fragments (`memberOf`, `adminOf`) for a `WHERE`; **the first draft of them had the subquery's alias the same as the outer table's, which made the condition true for anyone who was a member of anything, and the second-person test caught it before it was committed** (the fragment's aliases are now `pm` and `pp`, and the test fails against the old). `src/households/households.ts` makes a household with its creator as Admin in one transaction stamped `seq` 1 (the first household once, by the unique `own_of`, at once from several) and reads households and members with the permission in the statement; `label.ts` is the rule of §7.4 for what a household is called. `src/households/ops.ts` is the one door's dispatcher, with an empty `OPERATIONS` for 3.4 and 3.5 to fill: an unknown operation, an unknown household, an outsider, a former member and a Member at an Admin's operation get **one answer**, `404 not_found`; a malformed request is `400`; a refusal is `409` with its sentence. `app/api/ops/route.ts` finds the session, checks `Origin` (`src/access/origin.ts`) and bounds the body. `src/access/routes.ts` lists every page, route and operation with who may use it, and `routes.test.ts` holds it to the files of `app/` and to `OPERATIONS` both ways. `src/access/test-support.ts` is the harness: people with accounts, persons and first households, `join`, `leave` and `callAs`. `zod` is a new dependency, for the inputs of operations and, with 5.1, of mutations. **Seen on all three databases** (259 tests): a non-member's every read as not found, a member's email seen by themselves and the Admin alone, access ending at the next statement when a member leaves, and the dispatcher's one answer.

#### 📋 3.3 — Your first household

**Goal:** every account has a household, where its lists start. **Design:** §7.4. **Depends on:** 3.2.

**Technical:** made with the account (same hook as 3.1) with the person as its Admin, `own_of` set to the account (unique, so making it twice is
harmless), no name of its own (it is shown by the rule of `DESIGN.md` §7.4: "My lists" to its owner, "Kasun's lists" to the others), the starter
categories and a _Groceries_ list as those tasks land; accounts that exist when this lands get one by a job that runs at start-up, idempotent. **It
can take members** (3.4); it cannot be deleted except with the account (2.5), and its Admin cannot leave it.

**Accepts when:** every account has exactly one household made with it and is its Admin; another person invited into it sees it under the owner's
name; two sign-ups at once make one household each.

#### 📋 3.4 — Invitations by link

**Goal:** joining a household by accepting a link. **Design:** §7.3. **Depends on:** 3.3, 2.1.

**Technical:** `invitation` (§20.3, without the email of phase 2): 32 random bytes, stored as a hash, compared in constant time, 14 days,
single-use, revocable by whoever made it or an Admin, at most 20 live per household; `invite.create` (any member) returns the link once;
`invite.revoke`; `/invite/<token>` showing the household's owner's name and the inviter's, and nothing else, the same page for every invalid link;
it offers to sign in or to make an account (and, under `closed`, says that an account is needed first; and, for a person signed in through core, to
carry on), and the token survives the sign-in or sign-up round trip; `invite.accept` in one transaction (a Member row, nothing else); rate limits on
creating and on opening links. No mail is sent and none is needed. In phase 2, 3.10 adds email and 9.2 adds the notices.

**Accepts when:** journey 3 of §3 passes alone with no mail set up; an expired, revoked, used or unknown token shows the same page; a second
acceptance of one link is refused; a person already in the household who opens its link is told so and nothing changes.

#### 📋 3.5 — Leaving and removing

**Goal:** people can stop sharing. **Design:** §7.2, §7.5. **Depends on:** 3.4.

**Technical:** operations `member.leave` (a Member) and `member.remove` (the Admin), each in one transaction incrementing `seq`; the household's
Admin cannot leave it (there is no way to pass the role in 0.1.0; 3.9 adds one); what the person added stays, by their name ("added by Sam (left)");
pull names a household the account is no longer in as gone, and the device deletes its copy (6.1); the `removed` notice arrives with 9.2.

**Accepts when:** a Member leaves and their devices drop the household at the next sync; the Admin removes a Member and the same happens; the Admin
cannot leave; names stay on items after leaving, shown as left; a Member's attempt to remove anyone reads as not found.

#### 📋 3.6 — Moving a list between households (phase 2)

**Goal:** a list moves, with its items, to another of the person's households. **Design:** §9.1. **Depends on:** 3.8, 3.9, 5.6.

**Technical:** `list.move` (an Admin of both): in one transaction, the list and its items re-pointed; products matched by name key in the destination
or copied (sealed anew under the destination's name key); categories matched by name or set to _Other_; items bought in an open trip stay in the
source trip, the moved items keeping their bought state without a trip; both households' `seq` incremented, a tombstone in the source. This is how
a list becomes private, or shared, after the household it began in was shared.

**Accepts when:** journey 10 of §3 passes; a moved list's items carry the destination's products and categories; the source household's devices drop
it and the destination's receive it; a non-Admin's attempt reads as not found.

#### 📋 3.7 — Limits

**Goal:** the operator's limits, checked by the server. **Design:** §7.6. **Depends on:** 3.2.

**Technical:** `src/limits/` reads the five `SHOPPER_LIMIT_*` settings of 0.1.0 (1.4: members of a household, households of an account, lists, open
items on a list, products); checked in the statement or the transaction that would exceed them (members at acceptance, households at acceptance,
lists, open items, products at apply); each refusal a sentence naming the limit; in sync, a refusal to Couldn't sync (6.3). The sixth, categories,
comes with 4.7.

**Accepts when:** each limit, set low in a test, refuses the change that would pass it, online and through sync, with its sentence.

#### 📋 3.8 — Making households (phase 2)

**Goal:** a person makes households of their own choosing, and names them. **Design:** §7.1, §7.4. **Depends on:** 3.2, 8.1.

**Technical:** `household.create` (name, colour, currency from the creator's locale; the creator as Admin; the starter categories; a _Groceries_ list)
and `household.update` (an Admin: name, colour, currency, which changes no amount and says so); the `currency` column and the `color` choice arrive
here; the sidebar's _New household_ (an online dialog); the first household can be named too, which ends the derived name; a person's first household
keeps its rule that it is deleted only with the account, **and whether it can also be left or left unshared is decided here, with its first real
use.**

**Accepts when:** a person makes a second household and is its Admin; both appear in the sidebar with their dots; a name set on the first household
replaces "My lists" for everyone who sees it; a Member's attempt to rename reads as not found.

#### 📋 3.9 — Roles, and deleting a household (phase 2)

**Goal:** a household's lifecycle, in full. **Design:** §7.2, §7.5. **Depends on:** 3.5.

**Technical:** operations `member.role` (Admins; the last Admin cannot step down, leave or be removed until another member is Admin; `member.leave` of
3.5 now allows an Admin who has passed the role), `household.delete` (Admins, never the first household while its account exists), each in one
transaction incrementing `seq`; deletion removes everything by `household_id`; the notices `removed`, `household_deleted` and `admin_passed` once
9.2 is in.

**Accepts when:** the last Admin cannot leave, be removed or step down; a deleted household leaves no row behind and its members' devices drop it;
a Member's attempt at any of these reads as not found.

#### 📋 3.10 — Inviting by email (phase 2)

**Goal:** an invitation sent to an address. **Design:** §7.3. **Depends on:** 3.4, 9.1.

**Technical:** the Invite field takes an email: the invitation's `sealed` email column arrives by a new migration, the address never shown to anyone
but the inviter and the household's Admins; mail through the outbox (9.1), with the link also always shown to copy; the dialog says plainly when mail
is not set up and that the link is the only way; for an account here named by a verified email, an `invited` notice once 9.2 is in; resend at most
hourly; the inviter is never told whether an address has an account.

**Accepts when:** journey 3 of §3 passes as written, by email; with no mail set up the dialog says so and the link still works; an address with an
account and one without give the inviter the same answer.
