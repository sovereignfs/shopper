# Epic 21: Lists of their own

## Status

⏳ In progress. Before phase 2, after workstream 0001.

## Overview

A list is what is shared, and nothing else ([RFC 0004](../rfcs/0004-lists-of-their-own.md)): each list has its own people, catalog and keys, and the
group that holds a person's lists is never shown. Fixes the leak where sharing one list showed every list of its household; and the phone's screens
are made clear.

## Related

[RFC 0004](../rfcs/0004-lists-of-their-own.md) · RFC 0001 (its household keys, replaced) · `DESIGN.md` §5.2, §7, §12, §13, §16

## Tasks

#### 📋 21.1 — The design

**Goal:** `DESIGN.md` says what RFC 0004 builds. **Depends on:** nothing.

**Technical:** §2, §4 (no "household" on a screen), §5.2, §7 (rewritten: a list's people), §8 (a list's catalog), §12 (what a pull names), §13 (a list's
keys), §16 (Your lists, Shared with you), §19 (a shared list passes on), §20.3 (`list_member`, `list_key`, `list_id` on product, tombstone, alias and
invitation); `AGENTS.md`'s words and rules; `docs/sharing.md`.

**Accepts when:** no document says a household is shared, or that sharing one list shares another.

#### ✅ 21.2 — A list's people, and the leak closed

**Goal:** someone on one list sees that list and nothing else of its group. **Depends on:** 21.1.

**Technical:** `list_member` on both dialects; every gate keyed on the household keyed on the list (RFC 0004, "Who may see and change what"); a join
re-stamps the list's rows; a pull names the visible lists and the device forgets any other; invitations, leaving and removing per list; the
migration of 0.1.0's households; `deletePerson` passing a shared list on. A test calls each of them as a person on another list of the same group, and
was seen to fail before.

**Accepts when:** Grace, invited to Ada's "Groceries", sees "Groceries" and its items, and not Ada's "Hardware store", its items, products or people,
on her device or from the server; removed, the list leaves her device.

**Done as:** `list_member` on both dialects (migration `0015_list_members`, which also adds `list_id` to `invitation`, `tombstone` and `alias`), written
in `src/lists/members.ts`. `src/access/membership.ts` gains `onList`, `listAdminOf` and `ownerOf`; `memberOf` now means "on any list of the group" and
reads nothing of a list by itself. Every list-scoped operation (`invite.*`, `member.leave`, `member.remove`, `list.delete`) carries `list` and is
allowed by `dispatch` only for someone on that list of that group (its Admin for an Admin's). `src/sync/apply.ts` refuses, as not found, a change to a
list or an item on a list the sender is not on, and lets only the group's own account make a list; the maker becomes its Admin. `src/sync/pull.ts` hands
a reader only the lists they are on, their items, the products those items use, their people and their tombstones and aliases, and names the visible
lists; the device (`src/local/store.ts`, store version 3, `member` keyed by list) forgets any other. A join re-stamps the list's rows
(`stampList`). An item moved to another list leaves a tombstone of no list, handed only to a reader who cannot see the item where it is now (of no
list, so that a second move cannot keep it from those on the first). Deleting a list revokes its links, and accepting a link needs its list.
Limits count people per list and groups per account. `adoptListMembers` runs at every start and turns 0.1.0's shared households into lists of their
own (everyone keeps every list they had; household links are revoked). `People.deletePerson` passes a shared list's Admin role to the person on it
longest; **left out:** the list stays in the departed account's group rather than moving into the heir's, so the heir finds it under Shared with
you, as its Admin, with no name under it; and the
export keeps the person's lists only. The Share dialog sends the list and speaks of one list. Tests: `src/lists/scope.test.ts` (seen to fail with the
pull's and apply's checks taken out), and in `src/local/leaving.test.ts` a person removed from one of two lists keeps the other, and an item moved to a
list they are not on leaves their device, once or twice moved (each seen to fail before); a second person is refused the other list's links, people
and export; and nobody joins a deleted list by its link (seen to fail before).

#### ✅ 21.3 — A list's catalog

**Goal:** a product belongs to a list. **Depends on:** 21.2.

**Technical:** `product.list_id`, the name key unique per list; folding and duplicates within a list; suggestions from every list a person has, on the
device; the migration copies a product to each list that uses it.

**Accepts when:** an add on a shared list never folds into, nor is refused for, a product of another list.

**Done as:** `product.list_id` (migration `0016_product_lists`), the unique name key per household and list. A new product is its item's list's
(the device sends it, and `apply` gives a product made with an item the item's list if it does not); only those on a list write its products, its
list never changes, and a name folds only into a product of the same list. The pull and the export hand a reader the products of their lists (and
one an item of their lists uses). On the device (`src/lists/adding.ts`) an add finds a product only in the list's own catalog; another list's product
with the name lends its quantity, unit, category and icon to a new product of this list, so suggestions still come from every list a person has. A
refused add moved to another list (`remake`) takes its new product with it. `adoptProductLists` gives every product from before a list at start.
**Left out:** the migration does not copy a product used by items of several lists; it stays one, on the first of them, since everyone on those lists
already saw it as one household. The name key is still derived from the group (21.4 makes it the list's). Tests: `scope.test.ts` (an add on a
shared list never folds into another list's product, seen to fail before; the adoption), `adding.test.ts` (another list's product only lends its
defaults, seen to fail before).

#### 📋 21.4 — A list's keys

**Goal:** encryption per list. **Depends on:** 21.3.

**Technical:** `list_key`, `list.encryption` and `list.epoch`; values bound to the list; the name key from the list's first key; the move per list;
links carrying a list's keyring; an item moved between lists encrypted again; household keys and the household move removed.

**Accepts when:** the marker test passes per list, and a list shared by a link opens for its new person and for no one on another list.

#### ✅ 21.5 — Screens without households

**Goal:** a person sees lists, never groups. **Depends on:** 21.2.

**Technical:** the sidebar's Your lists and Shared with you; Share on a list with its people and links; Settings with no household; the words.

**Accepts when:** no screen, at any width, names a household or a group.

**Done as:** the sidebar and the phone's sheet (`src/screens/ListsNav.tsx`) show **Your lists**, with _New list_ and archived lists, and **Shared with
you**, every list others shared in one section, each with its Admin's name under it (`src/local/places.ts` reads it from the list's people on the
device); the per-group _Share_ is gone, since Share is on a list. The invitation page says whose list it is and that the person will see that list and
nothing else (`previewInvitation` no longer names a group). Settings › Encryption, Notifications, the recovery kit, accepting a link, the limit
sentences and the duplicate refusal no longer say "household"; the environment variables keep their names. `DESIGN.md` §2's sharing row, §16.2 and
§16.9, a note at §7 pointing to RFC 0004, `README.md`, `docs/sharing.md` and `docs/working-offline.md` say what this does. **Left for 21.1:** §7, §8,
§12, §13 and §20 rewritten, and `AGENTS.md`'s words (its "household" is in the synced section's neighbour, Shopper's own rules, and waits for that
task). Code and comments still say household for the hidden group.

#### ✅ 21.6 — The phone

**Goal:** the phone's screens are clear. **Depends on:** 21.5.

**Technical:** a list's header (the title on one line, actions in one menu), rows whose names wrap at words with the quantity and note below them, the
side menu as a sheet that covers what is under it, and the rest of the screens looked at at 375 px.

**Accepts when:** every screen at 375 px has nothing cut mid-word, nothing overlapping, and nothing to scroll sideways.

**Done as:** a list's header (`src/screens/ListScreen.tsx`) keeps its name on one line with an ellipsis (its whole name is its title), with Share as
its icon alone below 720 px, Shop and the menu beside it; the "‹ Lists" button on a phone went, since the header's menu and the footer's Lists open the
same sheet. A row's name wraps between words, with the quantity, note and who added it on a line under it. Looked at in the preview at 375 px: the
list, the sheet, Share, shopping mode and Settings, with nothing to scroll sideways (`scrollWidth` 375 on each) and nothing cut mid-word; and the
sidebar on a desktop width. The side menu was already a sheet from the bottom.
