# Epic 24: Loyalty cards

## Status

⏳ In Progress. Workstream 0002, before phase 2: the design (24.1) is done and approved by the owner (2026-11-23); the rest waits on `sovereign`'s releases (epic 16).

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

- §2.3's row; §4 (**loyalty card**, and "card" among the words); §5.2 (**a card is a list's equal**, `onCard`, and a link needing both); §7.6 (a limit); a new **§7.7 Loyalty cards** (what a card holds, adding and showing it, its people and keys, online operations, cards on a list, and
  **sharing a list shares no card**).
- §11.1 (the card button in shopping mode's header); §12.1 to §12.3 and §12.8 (the store, what syncs, the pull hands a card and its links only to its
  people, the online operations); §13.1 (a card's fields, under its own keys), §13.2 (a card's keyring and `card_key`), §13.5 (a link to a card) and
  §13.6.
- §16.3 (`/cards`, `/cards/<id>`), §16.5 (the list's settings' **Cards** section), a new **§16.14 Loyalty cards**; §18.1 (cards in the export), §19
  (cards pass on as lists do), §20.3 (`card`, `card_member`, `card_key`, `list_card`; `invitation`'s and `tombstone`'s `card_id`) and the device's
  store; §21 (the camera's frames); §22.3 (scanning built with cards); §25 (six points for the owner's review); §26 (a row).
- `AGENTS.md`: joining a card only by accepting, its operations online, `onCard`, the one path's tables, the device's store and the words.
  `docs/sharing.md`: cards and Inventory, as coming. 14.1 already pointed here.

Beyond the RFC, each settled with the owner at the leg's review (§26): a card's invitation kept in `invitation`; a card's keys following a list's until 16.8 (24.5 asks for a new
key when someone leaves); a third section of the list's settings for its cards; a limit; the link handed only to someone on both; the card button on
the right of shopping mode's header; its Admin alone inviting, as RFC 0007 says (a list's Member may).

#### ⏳ 24.2 — Cards: the data and the keys

**Goal:** a card is kept, encrypted, with its own people and keys. **Design:** RFC 0007, "A card", "Sharing a card". **Depends on:** 24.1.

**Technical:** `card` (shop name, number, code kind and value, colour, icon, name on the card, note; the person's words encrypted), `card_member` and the
card's key records on both dialects, as `list`, `list_member` and `list_key`; the permission in the statement; written through the one path; every
route in `src/access/routes.ts` with a test as a second person; `People.deletePerson` (a shared card passes on), the export and the import; §13.1's
registry test.

**Accepts when:** a card's rows hold nothing readable (the marker test); a second person reads nothing of a card they are not on.

**Built in two steps, each its own commit,** as `list_category` was (the server and the store, then the device's logic):

- **Step 1, done (0.8.0, 2026-11-24): the server and the device's store.** `card`, `card_member` and `card_key` on both dialects (`0020_add_cards`, generated), and `tombstone.card_id`
  (`invitation.card_id` comes with 24.5). **A card is only ever in a group that has moved** (its keys are derived from the group's keyring): the server refuses one in a group it seals,
  whichever form was sent, and does not hold it (`cardsNeedMove`, as copies are), and a plain value for a card in a group that has moved is held and never written, so the marker is in no row of
  any table. **Every field is a ciphertext bound to the card** in the place a list is (`e2.<epoch>.<card>.<card>.…`, `checkBoundToList`), so a value made for another card is refused;
  `deriveCardKeyring` (`shopper:card-key:v1`, the card's id) opens nothing of another card, of a list or of the group's Inventory, and none of those opens it. **The permission is in the
  statement:** `onCard` and `cardAdminOf` (`src/access/membership.ts`); the group's own account alone makes a card and is its Admin (`addCardMember`), only the Admin changes or deletes it, and a
  refusal reads as not found. **`reaches`** (on the group, or on one of its cards) is what a device syncs a group by (the household, the pull's gate and a mutation's), and `memberOf` is unchanged,
  so a person on a card only is handed that card, its people, their own copy of its keys and the tombstones that name it, and **nothing else of the group** (no list, item, product, starter category,
  alias, or a tombstone of no card), and the group is not a place in their sidebar. A join stamps the card, its people and its tombstones (`stampCard`, for 24.5, as `stampList` is for a list). The limit
  `SHOPPER_LIMIT_ACCOUNT_CARDS` (100; in `.env.example` and the README, and no change to the Dockerfile, `compose.yml` or the manifest). `People.deletePerson`: a card nobody else is on is deleted with its
  people, keys and records, one that is shared passes to the person on it longest, and the group stays while anyone is on a card; the export holds the cards a person is on (ciphertext, with their own copy
  of the keys), their people by name only, and nothing of another card; the household's move answers for no card. **On the device:** the version 6 store (`card`, `card_member`; nothing reset), the pull
  merge, a card the reader is no longer on forgotten with its people, a tombstone of a card, and a household forgotten whole. **Seen to fail when removed:** the Admin rule, the group's own account making
  one, the refusal in a sealed group, the binding to the card, the maker as its Admin, each of the pull's conditions (the cards, their people, the key copies, the tombstones, the reach), a join's stamps,
  the export's conditions, the deletion's passing on, and each of the device's forgettings.
  **Left out of step 1, recorded:** the confirmation that says what deleting an account would do (`previewLeaving`) says nothing of cards yet (a card counts apart in what `deletePerson`
  returns, `cards`); the version 5 to 6 upgrade of the device's store ran in fake-indexeddb only (23.3 ran its step also in real WebKit); and the readable export cannot open a card until step 2
  (it serves a card's ciphertext and the person's own copy of its keys, and counts what it cannot open). A refused change to a card has no sentence of its own in Couldn't sync yet.
- **Step 2:** the device's logic: a card's keys on a device (the derivation, a link's copy, `card_key` kept and handed back), encrypting and opening a card in the transport, the actions that make and
  change one, the readable export's opening of cards, and `card.delete` as an online operation.

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
for a list; a removed person's device forgets the card; a new key when someone leaves only when lists get one, with 16.8 (`DESIGN.md` §13.2,
settled with the owner).

**Accepts when:** Grace accepts Ada's card and shows it offline, and sees none of Ada's lists or other cards; removed, the card leaves her device.

#### 📋 24.6 — Cards on a list, in Shop mode

**Goal:** the card for this shop, one tap from Shop mode. **Design:** RFC 0007, "Cards and lists". **Depends on:** 24.3, 22.5, 22.9.

**Technical:** `list_card` (a list and a card of the same group, nothing else), linked by a list's Admin from the list's settings among the cards they
may see; Shop mode's header button, a choice when several; nobody sees a button for a card they are not on.

**Accepts when:** a linked card opens from Shop mode offline; a person on the list but not the card sees no button; linking a card of another group is
refused as not found.
