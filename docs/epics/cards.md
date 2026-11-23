# Epic 24: Loyalty cards

## Status

⏳ In Progress. Workstream 0002, before phase 2: the design (24.1) is written and waits on the owner's review.

## Overview

[RFC 0007](../rfcs/0007-loyalty-cards.md): shop loyalty cards, kept with their code, scanned with the camera, shown full screen at the till offline,
shared with the people one shops with as a list is, and opened from Shop mode on the lists they are linked to. Wallet stays the place for what is
private.

## Related

[RFC 0007](../rfcs/0007-loyalty-cards.md) · [workstream 0002](../workstreams/0002-frame-home-cards.md) · RFC 0004 (sharing a list, copied for a card) ·
`DESIGN.md` §7, §11, §13, §22.3 · [epic 14](capture.md) (14.1's decoding brought forward) · 16.25 in [epic 16](upstream.md) · Wallet's `DESIGN.md`

## Tasks

#### ✅ 24.1 — The design

**Goal:** `DESIGN.md` says what RFC 0007 builds. **Depends on:** 22.1.

**Technical:** §4 (card, loyalty card), §7 (a card's people), §11 (the card button), §13.1 and §13.2 (a card's fields and keys), §16.3 (`/cards`),
§20 (`card`, `card_member`, a card's keys, `list_card`), §22.3 (scanning built with cards); `AGENTS.md`'s words and the one path's tables;
`docs/sharing.md`; 14.1 pointing here.

**Accepts when:** the design says who sees a card, and that sharing a list shares no card.

**Done as:** `DESIGN.md` says what RFC 0007 builds:

- §2.3's row; §4 (**loyalty card**, and "card" among the words); §5.2 (**a card is a list's equal**, `onCard`, and a link needing both); §7.6 (a limit,
  proposed); a new **§7.7 Loyalty cards** (what a card holds, adding and showing it, its people and keys, online operations, cards on a list, and
  **sharing a list shares no card**).
- §11.1 (the card button in shopping mode's header); §12.1 to §12.3 and §12.8 (the store, what syncs, the pull hands a card and its links only to its
  people, the online operations); §13.1 (a card's fields, under its own keys), §13.2 (a card's keyring and `card_key`), §13.5 (a link to a card) and
  §13.6.
- §16.3 (`/cards`, `/cards/<id>`), §16.5 (the list's settings' **Cards** section), a new **§16.14 Loyalty cards**; §18.1 (cards in the export), §19
  (cards pass on as lists do), §20.3 (`card`, `card_member`, `card_key`, `list_card`; `invitation`'s and `tombstone`'s `card_id`) and the device's
  store; §21 (the camera's frames); §22.3 (scanning built with cards); §25 (six points for the owner's review); §26 (a row).
- `AGENTS.md`: joining a card only by accepting, its operations online, `onCard`, the one path's tables, the device's store and the words.
  `docs/sharing.md`: cards and Inventory, as coming. 14.1 already pointed here.

Beyond the RFC, each in §25 for the owner: a card's invitation kept in `invitation`; a card's keys following a list's until 16.8 (24.5 asks for a new
key when someone leaves); a third section of the list's settings for its cards; a limit; the link handed only to someone on both; the card button on
the right of shopping mode's header; its Admin alone inviting, as RFC 0007 says (a list's Member may).

#### 📋 24.2 — Cards: the data and the keys

**Goal:** a card is kept, encrypted, with its own people and keys. **Design:** RFC 0007, "A card", "Sharing a card". **Depends on:** 24.1.

**Technical:** `card` (shop name, number, code kind and value, colour, icon, name on the card, note; the person's words encrypted), `card_member` and the
card's key records on both dialects, as `list`, `list_member` and `list_key`; the permission in the statement; written through the one path; every
route in `src/access/routes.ts` with a test as a second person; `People.deletePerson` (a shared card passes on), the export and the import; §13.1's
registry test.

**Accepts when:** a card's rows hold nothing readable (the marker test); a second person reads nothing of a card they are not on.

#### 📋 24.3 — The cards screen, and showing one

**Goal:** `/cards`, and a card shown at the till. **Design:** RFC 0007, "A card", "Screens". **Depends on:** 24.2, 22.11, 16.25.

**Technical:** a grid, own then shared; adding by typing the number and choosing its kind (checked: EAN and UPC check digits); a card full screen
(`QrCode` or `Barcode`, the number beneath, `useWakeLock`), offline; edit and delete for its Admin.

**Accepts when:** a card of each kind shows a code a scanner reads (each kind's test vector); the network off throughout; a Member sees no edit.

#### 📋 24.4 — Scanning a card

**Goal:** a card is added by pointing the camera at it. **Design:** RFC 0007, "A card". **Depends on:** 24.3. **Brings forward:** 14.1's decoding.

**Technical:** the browser's `BarcodeDetector`, else a WebAssembly decoder bundled with Shopper (ZXing's, licence checked for AGPL), the camera through
`getUserMedia`, no frame leaving the device; the six kinds; typing kept as the fallback. Written so that 14.1 uses it for products.

**Accepts when:** each kind is read from a test image in both decoders; the camera refused leaves typing; nothing is requested over the network while
scanning.

#### 📋 24.5 — Sharing a card

**Goal:** a card shared by a link, as a list is. **Design:** RFC 0007, "Sharing a card". **Depends on:** 24.2.

**Technical:** invitations to a card (token hashed, single-use, expiring; the card's keys in the link's fragment), accepting, leaving and removing, as
for a list; a removed person's device forgets the card; a new key when someone leaves.

**Accepts when:** Grace accepts Ada's card and shows it offline, and sees none of Ada's lists or other cards; removed, the card leaves her device.

#### 📋 24.6 — Cards on a list, in Shop mode

**Goal:** the card for this shop, one tap from Shop mode. **Design:** RFC 0007, "Cards and lists". **Depends on:** 24.3, 22.5, 22.9.

**Technical:** `list_card` (a list and a card of the same group, nothing else), linked by a list's Admin from the list's settings among the cards they
may see; Shop mode's header button, a choice when several; nobody sees a button for a card they are not on.

**Accepts when:** a linked card opens from Shop mode offline; a person on the list but not the card sees no button; linking a card of another group is
refused as not found.
