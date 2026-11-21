# RFC 0004 — Lists of their own

|                |                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted on 2026-11-21; being built                                                                                     |
| **Date**       | November 2026                                                                                                           |
| **Author**     | Claude Code (design discussion with `kasunben`)                                                                         |
| **Scope**      | `DESIGN.md` §2, §4, §5.2, §7, §8, §9, §12, §13, §16, §19, §20; `src/households/`, `src/sync/`, `src/keys/`, the screens |
| **Supersedes** | The household as the unit of sharing (§7); RFC 0001's household keys and amendment 2's household move                   |
| **Tasks**      | [epic 21](../epics/lists.md)                                                                                            |

## Summary

**A list is what is shared, and nothing else.** Each list a person makes has its own people, its own catalog and its own keys, and is shared on its own by
a link. Sharing one list shows that list and nothing more: today, sharing shares the household, so a person invited to one list sees every list of the
household. That is the bug this fixes.

**The group** (today's `household`) stays, as each account's own, made with it, and holds its lists; **nobody sees it**. No screen, word or setting names
a group or a household in this phase. Kinds of group (a household, a group of friends) are a later concern.

## The model

| Was                                                   | Is                                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A household, shared; its members see all its lists    | A **group**, one an account, made with it, never shared, never shown                                                                         |
| `member` of a household, Admin or Member              | **`list_member`** of a list: Admin (its owner) or Member, joined and left list by list. A group's only `member` is its own account           |
| An invitation to a household                          | An invitation to **a list** (`invitation.list_id`)                                                                                           |
| A household's catalog (products), shared by its lists | **A list's catalog**: `product.list_id`, a name key unique per list. Suggestions draw from every list a person has, worked out on the device |
| A household's categories and aisle order              | Still the group's: starter categories and their order, readable by everyone on any of its lists (they name no one's shopping)                |
| A household's keys, moved when it had one member      | **A list's keys** (`list_key`), moved when the list has one person; a link to a list carries that list's keys                                |
| The Admin passes the household on, when deleting      | **A shared list passes to its longest-standing other person**, who becomes its Admin, and it moves into their group                          |

## Who may see and change what

**The permission is still in the statement** (§5.2), at the list: an account reads or writes a row of a list only if it is an active `list_member` of
that list. A list, its items and its products carry `list_id`; a tombstone and an alias carry the `list_id` of the row they are about. A category is
the group's, and is read by anyone on one of its lists. Everything else reads as not found, as now. Each of these that keyed on the household is keyed on
the list: the sync's apply and pull, the online operations (invite, revoke, list links, leave, remove, delete a list), the people a pull names (only
those of lists the reader is on, and an address only as §6.1 allows, to a list's Admin), the push when someone joins, the export, `deletePerson`,
the limits, and the move.

## Sync

The group stays the unit of order (`household.seq`, a cursor per group on the device), so nothing of §12's merging, folding or paging changes. What
changes is what a pull hands a reader, and two cases a per-group cursor would miss:

- **Joining a list** re-stamps that list's rows (the list, its items and products, their tombstones and aliases) at the join's `seq`, so a device whose
  cursor for the group is past them pulls them.
- **Each pull names the lists the reader may see** in that group, and the device forgets any other it holds: leaving or being removed from one list
  while still on another of the same group takes it off the device.

A person's own lists and the lists shared with them arrive as today, by group; the device shows lists, never groups.

## Encryption (replacing RFC 0001's household keys)

_As built in task 21.4; the first draft of this section, a stored keyring per list for everyone, a per-list encryption state and a per-list move, was
changed as below._

- **Each list has a keyring of its own, derived from its group's:** each epoch's key through HKDF (`shopper:list-key:v1`) with the list's id. The
  group's keyring stays the account's own, wrapped under its app key (`household_key`, handed only to the group's own account), so its devices hold
  every list's keys with nothing more stored, and **one list's keyring opens nothing of another list's, nor gives back the group's**.
- **Someone given a list by a link keeps their own copy of its keyring** (`list_key`: list, person, epoch, record, wrapped under their own app key),
  kept by `list.key.mine` (which replaces `household.key.mine`), handed back to them in each pull of a list they are on, and deleted when they leave or
  are removed, with the list and with the person. Until the server has it, the copy waits in the browser and is used meanwhile.
- **A value is bound to its list**, not its group, and says so: `e2.<epoch>.<list>.<row>.<ciphertext>`, encrypted for
  `shopper/<list>/<table>/<row>/<field>`. The server refuses a value whose list is not its row's (a row moved on another device in between), and an
  item that changes list must bring its name and note encrypted again for the new one.
- **An item's product is always on the item's list** (21.3), so nobody is handed a product whose keys they do not hold: a move takes the product of
  its name on the other list, or makes one there; products from before that items of several lists used are copied, one per list, at start.
- **The name key** comes from the list's first key, with the list in it (`n3.`), and is unique per list.
- **The move stays per group,** for an account nobody else is on any list of, as amendment 2 said of households; its values are each encrypted under
  their list's keys. **A link to a list carries that list's keyring, and no other.** A list from 0.1.0 shared with others stays sealed by the server
  until each of them can be given its keys (16.8, 18.8).
- **On the device,** a change for a list whose keys it holds is encrypted; a group whose keys are not open yet is held, in order; a change for a list
  it will not get keys for (taken off it while offline) goes to Couldn't sync rather than holding everything after it.
- **Not yet:** a list's keys are not changed when someone leaves it (no epoch is added, as none was for a household); they stop receiving it at once.
- Nothing is migrated from household-bound values: no released version encrypted anything (0.1.0 did not; 0.2.0 is not released). A development
  database made by `develop` before this is made again (`pnpm seed -- --reset`).

## Existing data

A migration of the server, in one transaction per group, for 0.1.0's households:

- each list gets `list_member` rows for every active member of its household, the household's Admins as the list's Admins, so **nobody loses a list
  they had**, and anyone can then be removed list by list;
- every `member` row but the group's own account's is ended, so nobody sees a list made after;
- every product is copied to each list whose items use it (a new id per copy, items re-pointed, name keys made again per list), and a product no item
  uses stays with the group's first list;
- invitations waiting for a household are revoked (a link cannot say which list it meant).

## What the screens say

Lists, never households or groups: **Your lists** and **Shared with you** in the sidebar, **Share** on a list (its people and its links), and nothing on
any screen, in any word, about a group. The words of `AGENTS.md` lose "household" for now; "list", "item", "catalog", "shop", "bought", "basket",
"shopping", "Admin" and "Member" stay.

## Alternatives considered

| Alternative                           | Why not                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| One hidden group per list             | Offered; the owner chose lists inside one group, which keeps a person's lists together for what comes later (kinds of group)             |
| A group catalog with per-list sharing | An add on a shared list would fold into a product of a list its person cannot see, telling them what the owner buys                      |
| A cursor per list                     | Would rewrite §12's ordering and paging; re-stamping a list on joining and naming the visible lists in each pull keeps the group's order |
