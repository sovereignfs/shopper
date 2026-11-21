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

#### 📋 21.2 — A list's people, and the leak closed

**Goal:** someone on one list sees that list and nothing else of its group. **Depends on:** 21.1.

**Technical:** `list_member` on both dialects; every gate keyed on the household keyed on the list (RFC 0004, "Who may see and change what"); a join
re-stamps the list's rows; a pull names the visible lists and the device forgets any other; invitations, leaving and removing per list; the
migration of 0.1.0's households; `deletePerson` passing a shared list on. A test calls each of them as a person on another list of the same group, and
was seen to fail before.

**Accepts when:** Grace, invited to Ada's "Groceries", sees "Groceries" and its items, and not Ada's "Hardware store", its items, products or people,
on her device or from the server; removed, the list leaves her device.

#### 📋 21.3 — A list's catalog

**Goal:** a product belongs to a list. **Depends on:** 21.2.

**Technical:** `product.list_id`, the name key unique per list; folding and duplicates within a list; suggestions from every list a person has, on the
device; the migration copies a product to each list that uses it.

**Accepts when:** an add on a shared list never folds into, nor is refused for, a product of another list.

#### 📋 21.4 — A list's keys

**Goal:** encryption per list. **Depends on:** 21.3.

**Technical:** `list_key`, `list.encryption` and `list.epoch`; values bound to the list; the name key from the list's first key; the move per list;
links carrying a list's keyring; an item moved between lists encrypted again; household keys and the household move removed.

**Accepts when:** the marker test passes per list, and a list shared by a link opens for its new person and for no one on another list.

#### 📋 21.5 — Screens without households

**Goal:** a person sees lists, never groups. **Depends on:** 21.2.

**Technical:** the sidebar's Your lists and Shared with you; Share on a list with its people and links; Settings with no household; the words.

**Accepts when:** no screen, at any width, names a household or a group.

#### 📋 21.6 — The phone

**Goal:** the phone's screens are clear. **Depends on:** 21.5.

**Technical:** a list's header (the title on one line, actions in one menu), rows whose names wrap at words with the quantity and note below them, the
side menu as a sheet that covers what is under it, and the rest of the screens looked at at 375 px.

**Accepts when:** every screen at 375 px has nothing cut mid-word, nothing overlapping, and nothing to scroll sideways.
