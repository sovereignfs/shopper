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

#### ✅ 24.2 — Cards: the data and the keys

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
- **Step 2, done (0.8.0, 2026-11-24): the device's logic.** `deriveCardKeyring` already stood; **`wrapCardKeyring` and `unwrapCardKeyring`** (`cr1.`, bound to the person and the card, so a list's wrapper opens
  none) are what a link and `card_key` carry. `EncryptionMemory.cardKeyring` uses **the reader's own copy first**, handed back in every pull (`hear` takes `encryption.cards`), else derives from the group's
  keyring; **a person on a card only has the copy alone**, and a card whose keys are not here takes no page, so the group's cursor stays and the next pull brings it (a locked key behaves as a list's does). The
  transport encrypts each field of a card under the card's keys, bound to the card in the place of a list (`encryptCard`), and opens a pull's cards the same way; a change for a card whose keys this device
  will not get is refused into Couldn't sync in words about the card (`NO_CARD_KEYS`, "Changed the card Boots") and sends what came after it. `src/actions/cards.ts`: `makeCard`, `changeCard` (only what differs; a
  cleared icon, colour, holder or note says `null`, which the validator now takes for a card in the only form it has), `moveCard` and `canChange` (what the screen offers; the server holds the Admin rule). **`card.delete`**
  (`src/households/card-ops.ts`, its dispatcher scope `card`, in `routes.ts`): an Admin's online operation that removes the card, its people and every copy of its keys in one transaction and steps the counter; no
  tombstone is written, since its people are gone with it and the pull's `visibleCards` makes every device forget it (a tombstone for the group would say a card was there). **The readable export opens cards**
  under the person's own copy of the keys, else the group's derived ones, and never writes a key. **Seen to fail when removed:** the encrypting, the keys a send needs, the opening on a pull, the reader's own copy,
  its binding to the card, a list's label in place of the card's, the Admin condition in the statement (called directly) and in the dispatcher, the people deleted with the card, the sentence of a refused change, and
  each of the export's two ways to the keys. Proved through the real `Mover` and the server on all three databases: a card made on a device is held as ciphertext only (the marker is in no row), another device
  of the person opens it, a person on it and on no list opens it with their own copy alone and nothing else of the group, is held until it arrives, cannot change it, takes the Admin's change, and loses the card when
  the Admin deletes it.

#### ✅ 24.3 — The cards screen, and showing one

**Goal:** `/cards`, and a card shown at the till. **Design:** RFC 0007, "A card", "Screens". **Depends on:** 24.2, 22.11, 16.25.

**Technical:** a grid, own then shared; adding by typing the number and choosing its kind (checked: EAN and UPC check digits); a card full screen
(`QrCode` or `Barcode`, the number beneath, `useWakeLock`), offline; edit and delete for its Admin.

**Accepts when:** a card of each kind shows a code a scanner reads (each kind's test vector); the network off throughout; a Member sees no edit.

**Done as (0.8.0, 2026-11-24):** `/cards` and `/cards/<id>` (`CardsScreen`, `CardScreen`), in the sidebar's first block and as the phone footer's right icon (Settings is the avatar's menu), in the access list,
and answered by the shell with no network. **What a card holds is checked and drawn by pure code** (`src/cards/codes.ts`): `checkCard` makes what a person typed into what a card holds (an EAN or a UPC with
its check digit added, or refused with a sentence that says what the kind needs; Code 128 and Code 39 held to their characters; a QR code of what is typed, which is its number unless a code is given), `guessKind`
starts the form from what the number looks like, and `drawn` is what is drawn: **`QrCode`** from the squares **`uqr`** makes (a new dependency, MIT, no dependencies of its own, exact in the lockfile; the design
system's `QrCode` takes modules and brings no encoder) and **`Barcode`** from the design system's own bars. **Each EAN-13, EAN-8 and UPC-A is read back from its bars by an independent decoder written in the
test from the specifications** (a property over every number a person could type), the QR code's three finder patterns are checked square by square, and **Code 128, Code 39 and the QR code are read by the real
decoders in 24.4's tests, which decode an image of each kind** (that part of "a code a scanner reads" waits for the decoder 24.4 brings). The form (`CardForm`) is a dialog for adding and changing: a shop, a
number, a kind (started from the number, and the person's once chosen), what a QR code holds, an icon and a colour (the same sets as a list's colour, a card's own icons), the name on the card and a note; it says
that a card can be kept once the group has moved to device encryption instead of making one that would wait for ever. The card screen shows the code as wide as the screen lets it be, the number beneath it,
`useWakeLock`, and for **its Admin alone** _Edit_ and _Delete this card…_ (a confirmation; the operation needs a connection and says so, and the device syncs at once so that the card leaves it). **Seen to
fail when removed:** the wake lock and the footer's link (browser), the kinds' checks, the check digit, and the bars (unit); the sidebar's and the shell's addresses (unit). Browser tests, in both browsers: a
card of each of the six kinds typed, a wrong check digit refused, each opened with its code and number, no network, the screen asked to stay on, a card changed with a note cleared and then deleted, and a phone.
**What was left out:** _Share_ (24.5), scanning (24.4), and a Member's view of a card, which waits for sharing to be tested with a real Member (the Admin-only controls are `canChange`, tested with the actions).

#### ✅ 24.4 — Scanning a card

**Goal:** a card is added by pointing the camera at it. **Design:** RFC 0007, "A card". **Depends on:** 24.3. **Brings forward:** 14.1's decoding.

**Technical:** the browser's `BarcodeDetector`, else a WebAssembly decoder bundled with Shopper (ZXing's, licence checked for AGPL), the camera through
`getUserMedia`, no frame leaving the device; the six kinds; typing kept as the fallback. Written so that 14.1 uses it for products.

**Accepts when:** each kind is read from a test image in both decoders; the camera refused leaves typing; nothing is requested over the network while
scanning.

**Done as (0.8.0, 2026-11-25):** _Scan card_ beside _Add card_ on `/cards` opens `ScanDialog`: the camera through `getUserMedia` (the rear one preferred), a frame drawn to a canvas every 150 ms at no
more than 960 px wide, read **on the device** by `pickDecoder` (`src/cards/zxing-client.ts`) and dropped; the first code of one of the six kinds ends the scan, the camera's tracks are stopped that moment
(and when the dialog closes any other way), and `startOf` (`src/cards/codes.ts`) starts the card's form from what was read: the kind and the number, and for a QR code whose payload is too long to be a
number (a web address) the number left to type and the payload kept as what the code holds. **Two decoders, one contract** (`src/cards/scan.ts`: `Decoder`, `Found`, written so that 14.1 reads products
with it): the browser's `BarcodeDetector` **only when it supports all six kinds** (one with some would read some cards and not others), otherwise **ZXing-C++ as WebAssembly, bundled** (`zxing-wasm`'s
reader build, 0.9 MB: new dependency, MIT, whose C++ is Apache-2.0 and zint's BSD-3-Clause, all compatible with AGPL-3.0-or-later, noted in the README), **loaded only when a scan starts** and **from this
app's own origin**: the library's default is a CDN, so `locateFile` points at the `.wasm` the build emits under `/_next/static/media/`, which the service worker already keeps, and the dialog waits for the
module to be fetched and compiled (`Decoder.ready`) before it says it is scanning, so that **nothing is requested while a card is scanned**. A UPC-A's bars are an EAN-13 with a leading zero and ZXing
says EAN-13: a thirteen-digit read with a leading zero is held as the UPC-A it is. **Typing is always the way**: a camera the person refuses, none, or a decoder that cannot start says so in a sentence
and offers _Type the number instead_. **The Permissions-Policy** was `camera=()` and is now `camera=(self)` (microphone, geolocation, payment and the rest stay off); the CSP already allowed
`'wasm-unsafe-eval'` for the keys. **Seen to fail when removed:** the all-six requirement of the native detector, the UPC-A normalisation, the one-time preparation of the module, the validity and
empty-value checks, the long-payload rule and the camera policy (unit); waiting for the decoder and pointing `locateFile` at this origin (browser, the first in WebKit only, where the file is fetched
late). Unit tests read **each of the six kinds from an image of it with the real WebAssembly** (ten vectors, a UPC-A, a long Code 128, a QR code with a web address), nothing from a blank frame or noise,
and a smaller picture; browser tests, in both browsers, with a fake camera that shows a canvas (the same in both, which a browser's own fake-camera flag is not): an EAN-13 read by the bundled decoder
after a blank spell with the `.wasm` from this origin, every request this origin's and none while it scanned, the form started and the card added with the camera let go; a stand-in native detector
(the decoder never loaded); a QR code; the camera refused; no camera. **What was left out:** a torch or zoom control, choosing among several cameras, scanning an image from a file, and a real phone's
camera, which has not been tried (the fake one is a canvas); the native detector is tried only through a stand-in, since neither test browser has one that supports all six.

#### ✅ 24.5 — Sharing a card

**Goal:** a card shared by a link, as a list is. **Design:** RFC 0007, "Sharing a card". **Depends on:** 24.2.

**Technical:** invitations to a card (token hashed, single-use, expiring; the card's keys in the link's fragment), accepting, leaving and removing, as
for a list; a removed person's device forgets the card; a new key when someone leaves only when lists get one, with 16.8 (`DESIGN.md` §13.2,
settled with the owner).

**Accepts when:** Grace accepts Ada's card and shows it offline, and sees none of Ada's lists or other cards; removed, the card leaves her device.

**Done as (0.8.0, 2026-11-25):** in two parts, the server and then the device. **The server:** `invitation.card_id` (migration `0021`, both dialects; a link is to a list or a card, never both), and the card's
half of the one accept (`src/households/card-join.ts`, called from `acceptInvitation`'s transaction so that a refusal rolls the claim of the link back): the person is added **in one statement that carries
both limits**, the people a card may have (the setting for a list's) and the cards an account is on, its own included (`SHOPPER_LIMIT_ACCOUNT_CARDS`); the card, its people and its records are stamped at the
join (`stampCard`); the card's other people are sent a notice; a person already on the card, the Admin included, changes nothing and leaves the link unused. **Only the card's Admin makes, lists and revokes
links, and removes people** (`card.invite.create`, `card.invite.revoke`, `card.invite.list`, `card.member.remove`, each with `cardAdminOf` in its statement; `src/households/card-invitations.ts`,
`card-ops.ts`, `card-member-ops.ts`), at most 20 links waiting for a card, each requiring the card's keys in the link (`ck2.`) and a group that has moved. Anyone on a card leaves it (`card.member.leave`: the
Admin never does, and deletes it instead) and keeps their own copy of its keys (`card.key.mine`, `src/keys/server/key-ops.ts`, with `onCard` and the card's being the group's in the statement). Leaving or
removal ends the row with the group's `seq`, deletes the person's copy of the keys and revokes the links they made; **deleting a card, or the last person's account, deletes the card's links, and a link revoked
by an account's deletion no longer holds a key**. The invitation preview says whether a link is to a list or a card (`kind`). **The device:** `wrapCardForLink` and `openCardFromLink` (`src/keys/link.ts`,
`ck2.`, bound to the card and to nothing else); `AcceptInvite` opens the keys from the link, wraps them under the person's own app key and keeps them (`card.key.mine`), **with a copy that waits in the browser
if that does not get through** (`src/keys/pending.ts`, a card's apart from a list's, loaded into `EncryptionMemory` and sent again by `LocalProvider`), and then opens `/cards`, **never the group's lists**,
which they are not on; the invitation page says "invited you to a loyalty card"; the card screen gives its Admin _Share_ (`CardShareDialog` at `?share=1`: the people with _Remove_, _Make a link_ shown once with
its terms, the links waiting with _Revoke_) and a Member _Leave this card…_, each after a confirmation where it changes something. **Tested:** every statement as a second person, a Member of the card, a person
on a list of the same group who is not on the card, and a stranger, both through the door and directly (`src/households/card-sharing.test.ts`, on all three databases), the whole journey on devices through the real
operations (a link, accepting, opening the card with the link's keys and nothing else of the group, removal and leaving taking the card and the group from the device, a waiting copy opening the card; `src/keys/cards.device.test.ts`),
the link's wrap (a card's never opens a list's), the waiting copies, and, in both browsers, Ada sharing and Grace adding a card, her device holding that card and no row of Ada's group, offline, removed, leaving,
a link used and revoked and every Admin operation as someone else, and a copy that does not get through. **Seen to fail when removed:** every guard above (server), and the waiting copy's loading and sending,
what a Member is shown, and the page's wording (browser). **What was left out:** a new key when someone goes (16.8, for lists and cards together; RFC 0007 item 8), the card's Admin passing the role while
alive, and showing a Member who else has the card.

#### 📋 24.6 — Cards on a list, in Shop mode

**Goal:** the card for this shop, one tap from Shop mode. **Design:** RFC 0007, "Cards and lists". **Depends on:** 24.3, 22.5, 22.9.

**Technical:** `list_card` (a list and a card of the same group, nothing else), linked by a list's Admin from the list's settings among the cards they
may see; Shop mode's header button, a choice when several; nobody sees a button for a card they are not on.

**Accepts when:** a linked card opens from Shop mode offline; a person on the list but not the card sees no button; linking a card of another group is
refused as not found.
