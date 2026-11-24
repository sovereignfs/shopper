# RFC 0007 — Loyalty cards

|                |                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted on 2026-11-23; in `DESIGN.md`, being built in [workstream 0002](../workstreams/0002-frame-home-cards.md) |
| **Date**       | November 2026                                                                                                     |
| **Author**     | Claude Code (design discussion with `kasunben`)                                                                   |
| **Scope**      | `DESIGN.md` §4, §7, §11, §13, §16, §18, §20, §22.3; `src/cards/` (new), `src/keys/`, `src/sync/`, `migrations/`   |
| **Supersedes** | Where 14.1's decoding is built (brought forward from phase 4)                                                     |
| **Tasks**      | [epic 24](../epics/cards.md), and 16.25 of [epic 16](../epics/upstream.md)                                        |

## Summary

**Shop loyalty cards in Shopper:** a card is kept with its code, shown at the till full screen, offline, shared with the people one shops with as a list
is, and linked to lists so that Shop mode opens it in one tap. Encrypted in the browser as a list's name is.

## Wallet, and why cards are here too

The suite already has **Wallet**, whose 0.1.0 keeps loyalty, transport and membership cards as QR codes, under a key only the person holds, with
"family members" later. Cards in Shopper overlap with it, on purpose:

|                                  | Shopper's cards                                          | Wallet only                                |
| -------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Shopper alone                    | Cards work                                               | No cards without Wallet deployed beside it |
| Shared with the people on a list | As a list is shared, now                                 | Waits on Wallet's family members           |
| At the till                      | One tap from Shop mode                                   | Another app                                |
| Security                         | Shopper's encryption (keys from core or Shopper's vault) | Wallet's own key, stronger                 |

**Decided: Shopper has cards, and only shop loyalty cards,** the ones shown at a checkout and shared with whoever shops. Wallet stays the place for what
is private (transport, membership, identity, documents). Moving a card between the two in a suite is later.

## A card

- **Holds:** the shop or brand's name, the number, the **kind of code** and its value, a colour and an icon (as a list's, [RFC 0005](0005-the-frame-settings-and-screens.md);
  no shop's logo, since nothing is loaded from a third party), the name on the card, a note. **Everything a person wrote is encrypted in the browser.**
- **Kinds of code:** **QR, EAN-13, EAN-8, UPC-A, Code 128 and Code 39**, which most shops' cards use (most are barcodes, not QR). `QrCode` is in
  `@sovereignfs/ui`; a **`Barcode`** for the others is added there (16.25).
- **Added** by **scanning it with the camera**, decoded on the device (the browser's `BarcodeDetector`, else a decoder bundled with Shopper, as 14.1
  planned), or by typing the number and choosing its kind. **14.1's decoding is built here,** for cards, and phase 4 uses it for products.
- **Shown** full screen on a white surface, the code large and the number in text beneath it, the screen kept on (`useWakeLock`), offline.

## Sharing a card

**As a list is** (RFC 0004): each card has its own people, joined only by accepting an invitation by link; its **Admin** (who added it) edits and
deletes it; a **Member** sees and shows it. **Each card has its own keys,** derived and wrapped as a list's are, and a link to a card carries that
card's keys. Leaving or being removed takes the card from the device. Sharing a card shows nothing else of the person's.

- `card` and `card_member` (and the card's key records) on both dialects, rows of the group with the permission in the statement, as `list` and
  `list_member`; written through the one path; in `src/access/routes.ts` with a test as a second person; handled by `People.deletePerson` (a shared card
  passes on, as a list does), the export and the import.

## Cards and lists

**A list can have cards linked to it** (a list's Admin links them, from the list's settings, among the cards the linking person may see). Shop mode's
header shows a card button when the list has one; with several, it opens a choice. A link names a card and a list and holds nothing else; someone on
the list who is not on the card sees no button for it.

## Screens

`/cards`: a grid of cards, own then shared, each with its colour, icon and name; a card opens full screen; _+ Add card_ starts the camera. Sidebar's
first block has **Loyalty cards**; on a phone it is the footer's right icon.

## Alternatives

| Alternative                                    | Why not                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Cards in Wallet only                           | Shopper alone would have none, and sharing with the people one shops with would wait      |
| QR only                                        | Most shops' cards are barcodes                                                            |
| Typing only, scanning in phase 4               | A number typed wrong fails at the till; the card is the first thing that needs the camera |
| Cards shared with a list's people, by the list | A card has its own people (RFC 0004's lesson): sharing a list must not share a card       |

## Settled with the owner (2026-11-23)

1. **Moving a card between Shopper and Wallet:** later, a candidate (15.6), through each app's export and import.
2. **A card linked to a shop:** later, when shops exist (13.5): a card can then be linked to a shop as well as a list, and Shop mode shows it when
   shopping there.

## Settled in building (2026-11-24), for the owner's review

3. **A card is only ever in a group that has moved:** its keys are derived from the group's keyring, which a group the server seals has none of, so the server refuses a card there (not held) and a
   device keeps cards for once its group has moved. Nothing of a card is ever sealed by the server. DESIGN.md §7.7 and §13.7 say it.
4. **Only the group's own account makes a card,** as only it makes a list; it is the card's Admin, and a Member of a card changes nothing of it. A person given a card by a link never makes cards in
   the group they are given it from.
5. **Someone on a card only reaches the group by it:** their device syncs the group and is handed that card, its people and their own copy of its keys, and nothing else of the group; the group is not
   a place in their sidebar. DESIGN.md §7.7 says it.
