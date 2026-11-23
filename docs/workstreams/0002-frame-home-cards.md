# Workstream 0002 — The suite's frame, Home, Inventory and loyalty cards

**Status:** ⏳ In Progress: leg 1 done and approved by the owner on 2026-11-23; leg 2 built in `sovereign`, waiting for its releases; leg 3 under way (22.2 done; 22.8 done standalone, its suite half waits for `@sovereignfs/auth` 0.7.0; 22.7 waits for `@sovereignfs/ui` 0.107.0); legs 4 to 8 to go; see "Where it stands"\
**Date:** November 2026\
**Author:** Claude Code (design discussion with `kasunben`)\
**Goal owner:** `kasunben`\
**Governs:** RFC [0005](../rfcs/0005-the-frame-settings-and-screens.md), [0006](../rfcs/0006-home-and-inventory.md),
[0007](../rfcs/0007-loyalty-cards.md); epics [22](../epics/frame.md), [23](../epics/inventory.md), [24](../epics/cards.md), 16.17 to 16.26 of
[16](../epics/upstream.md), and 12.8 of [12](../epics/release.md)\
**Research:** a review of 0.2.0 on a desktop and a phone with the owner, item by item, 2026-11-23, against core's and Tusk's screens and
`@sovereignfs/ui` 0.106.0

---

## Goal

Shopper looks and behaves as the suite's apps do, with the suite's own frame: sign-in is core's or Shopper's, never both; Settings and a list's settings
are one dialog with a side navigation; an item opens beside its list; the header, the sidebar and the phone's footer come from `@sovereignfs/ui`, with
an app launcher in a suite. And Shopper gains three places: **Home**, where it opens; **Inventory**, a person's own library of what they buy, groceries
or not; and **loyalty cards**, shown at the till and shared with the people one shops with.

## Definition of done

- [x] `DESIGN.md` says what RFC 0005 to 0007 build, and `AGENTS.md`'s words and rules agree with it (22.1, 23.1, 24.1).
- [ ] The releases of `sovereign` this needs are published: 16.18 to 16.25 (16.17 and 16.26 are not waited on).
- [ ] In a suite, `/sign-in` and `/sign-up` go to core at once, and a failure at core shows a page rather than a loop; alone, the forms are the design
      system's, as core's are; an instance configured with both ways in starts in suite mode and says so (22.2).
- [ ] Every list has an icon and a colour, encrypted, shown in its header, the sidebar, the drawer and on Home (22.3).
- [ ] Settings and a list's settings are `SettingsDialog`, each section at its own address; Profile, Security, Preferences and Data say and do what
      RFC 0005's table says, in both modes (22.5, 22.7).
- [ ] A person downloads their data as one readable JSON file after confirming it is them, alone and in a suite (22.8).
- [ ] An item opens in the right column, and a tap on a list's row opens it (22.6); Shop mode has its new header, add and fixed Finish (22.9); every page
      has its title (22.10).
- [ ] The header, the sidebar (full, rail, hidden, in two blocks) and the phone's footer are the design system's; Shopper's copies are deleted; the
      launcher shows the person's apps in a suite (22.11).
- [ ] `/` opens Home with Continue and the lists (23.2).
- [ ] Inventory shows the starter catalog and the person's own items together; a change to a starter entry is a row of the person's; nobody else, on
      any list of theirs, pulls a row of it; suggestions draw on it first (23.3 to 23.5).
- [ ] A card is scanned, shown full screen offline, shared by a link, and opened from Shop mode on a list it is linked to (24.2 to 24.6).
- [ ] The marker test (18.12) passes with a marker written as a list's icon and colour, an Inventory item's name and note, a category's name and a
      card's name, number and note.
- [ ] The release is published with a security review of what changed (12.8).

## Decisions locked

| Decision                 | Choice                                                                                                    | Rejected alternative and why                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Ways in                  | **Suite: core only. Standalone: Shopper's only.** Never both on one instance                              | Both, with a choice page: a suite signs in through core; 2.9's linking is then not needed  |
| Sign-in pages in a suite | Redirects to core, with no page between                                                                   | A page with one button: a step that does nothing                                           |
| The forms                | `@sovereignfs/ui`'s whole forms, as core's                                                                | Shopper's own, from the small parts: they drift from core's                                |
| A list's icon and colour | Design-system icons (more added by development, never uploaded); any colour; **encrypted**; cart and blue | Plain, as Tally's colour: an icon says what a list is for                                  |
| The list's header        | Shop first, primary, labelled on a phone too; Share; the menu as a ghost, flush right                     | Three secondary buttons of different heights                                               |
| Share                    | Stays its own button and dialog                                                                           | Moved into the list's settings                                                             |
| A list's settings        | `SettingsDialog`, General and Archive and delete                                                          | A page; a plain `Dialog`                                                                   |
| An item                  | `ThreeColumnLayout`'s right column, as Tusk's card; a page of its own on a phone; a row tap opens it      | A centred dialog; a new `SidePanel`                                                        |
| Settings                 | `SettingsDialog` in `@sovereignfs/ui`: grouped sections, optional search; intercepting routes             | A dialog of Shopper's own: reusable UI is built in the design system                       |
| Settings by mode         | In a suite, core owns profile, security, appearance and notifications, and Shopper links there            | Copies of core's settings in every app                                                     |
| This device              | Under Preferences                                                                                         | A section of its own                                                                       |
| Notifications            | Under Preferences, "coming later" until 9.4                                                               | Left out until built                                                                       |
| Profile picture          | Core's in a suite; initials alone, a photo later                                                          | Upload now                                                                                 |
| Export                   | **Readable, one JSON file, made in the browser,** after confirming it is the person                       | Ciphertext (20.2 as written); the contract's zip (needs a browser writer, 16.26)           |
| Shop mode's add          | Behind _+ Add item_; _Put it straight in the basket_, off by default                                      | Always open; removed                                                                       |
| Page titles              | The list's name, set by the browser; the history caveat documented                                        | No names in titles                                                                         |
| The frame                | `Header` (brand slot), `AppSidebar`, `AppFrame` in `@sovereignfs/ui`; **Shopper adopts first**            | Each app's copies; Tusk and Tally in the same work (they follow in their own repositories) |
| The launcher             | Header, suite only, from a new core endpoint and SDK call; **none on a phone** for now                    | Read from core's database; in the phone's footer                                           |
| The phone's footer       | Home · lists drawer · Loyalty cards; Settings in the avatar's menu                                        | Lists · New list · Settings (0.2.0)                                                        |
| Where Shopper opens      | **Home,** with Continue for the last list                                                                 | The last list, Home only from the sidebar                                                  |
| Inventory's scope        | **A person's own,** with the starter catalog shown together; holds "what is at home" when it comes        | Shared with a list's people (breaks RFC 0004); the list catalogs shown together            |
| The starter in Inventory | **Layered:** a person's change is a row overriding an entry                                               | Copied into every account                                                                  |
| Recurring                | A mark; a schedule later                                                                                  | A schedule now                                                                             |
| Loyalty cards            | **In Shopper, shop cards only;** Wallet stays for what is private                                         | Wallet only                                                                                |
| Kinds of code            | QR, EAN-13, EAN-8, UPC-A, Code 128, Code 39                                                               | QR only                                                                                    |
| Scanning                 | With the cards: 14.1's decoding brought forward                                                           | Typing only until phase 4                                                                  |
| Sharing a card           | Its own people and keys, by a link, as a list                                                             | Through the lists it is linked to                                                          |
| Where in the order       | **After 12.7, before phase 2**                                                                            | After phase 2: its screens and Settings would be built twice                               |

## Settled with the owner (2026-11-23)

The points the first discussion left open, and the RFCs' open questions, were gone through the same day and settled as recommended:

1. **`prompt=create`** (16.17) is P3 and not waited on: until it is built, `/sign-up` in a suite lands one click from core's sign-up.
2. **2.9 is superseded,** and a standalone instance joining a suite with password accounts is a candidate (15.5), not now.
3. **The list's header** (RFC 0005): Shop in the accent colour as the only primary button; the menu borderless and flush right; every icon in the row at
   the small size.
4. **A list's settings** at `?settings=<section>`, with `/l/<id>/settings` redirecting.
5. **The item** in `ThreeColumnLayout`'s right column, with a page of its own on a phone (Tusk's way), in place of a new `SidePanel`.
6. **"Password protection as core's"** for the export means confirming the password before the export starts, as core does, and not a file encrypted
   with a password.
7. **Inventory's details** (RFC 0006): a new name on a list makes an Inventory item automatically, marked once; the catalog screen (8.6) becomes
   Inventory; a list shows the person's categories its items use, from its own copies.
8. **An instance configured with both ways in starts in suite mode** and logs that its local sign-in is off, rather than refusing to start, so that an
   upgraded instance keeps running.
9. **Home's edges** (RFC 0006): arriving by an invitation still opens that list; a brand-new account opens Home, whose Continue is its _Groceries_.
10. **Import reads both** the contract's export and 22.8's readable file (20.4).
11. **A person's own category** is encrypted under the group's derived key in Inventory and copied per list under the list's keys (`list_category`).
12. **Later:** a shared pantry (with kinds of group), a schedule for recurring items (13.3), moving cards to and from Wallet (15.6), a card linked to a
    shop (with 13.5).

## Prerequisites

- Workstream 0001 released (12.7).
- In `sovereign` (epic 16), released, before the leg that needs it: **16.19** (`SettingsDialog`) before leg 3; **16.18** (icons: `square-pen`, more) and 16.19 before
  leg 4; **16.20 to 16.24** (the frame and the launcher) before leg 5; **16.25** (`Barcode`) before leg 7. **16.17** (`prompt=create`) and **16.26**
  (a browser export writer) are not waited on. Owner: `sovereign`.

## Legs

| Leg | Name                 | Epic tasks                          | Gate?              | Waits on       | Done when                                                                   |
| --- | -------------------- | ----------------------------------- | ------------------ | -------------- | --------------------------------------------------------------------------- |
| 1   | The design           | 22.1, 23.1, 24.1                    | **Owner reviews**  | 12.7           | `DESIGN.md` says what RFC 0005 to 0007 build; the design is reviewed        |
| 2   | Upstream             | 16.17 to 16.26, in `sovereign`      | **Owner releases** | —              | The releases legs 3, 4, 5 and 7 wait on are published                       |
| 3   | Sign-in and Settings | 22.2, 22.7, 22.8                    | —                  | 16.19          | Both modes sign in as decided; Settings is the dialog; the export downloads |
| 4   | A list               | 22.3, 22.4, 22.5, 22.6, 22.9, 22.10 | —                  | 16.18, 16.19   | Icons and colours, the header, list settings, the item column, Shop mode    |
| 5   | The frame            | 22.11                               | **Owner reviews**  | 16.20 to 16.24 | Shopper's frame is the design system's; its copies are deleted              |
| 6   | Home and Inventory   | 23.2, 23.3, 23.4, 23.5              | —                  | leg 5          | `/` is Home; Inventory works, alone and in suggestions                      |
| 7   | Loyalty cards        | 24.2, 24.3, 24.4, 24.5, 24.6        | —                  | 16.25, leg 5   | A card is scanned, shown, shared and opened from Shop mode                  |
| 8   | Review and release   | 12.8                                | **Owner releases** | legs 3 to 7    | Ready to release; the owner publishes                                       |

One leg is one branch, one draft PR, one review gate, with one version bump. Legs 3 and 4 can run while leg 2's later releases are being made.

## Leg detail

### Leg 1 — The design

**Epic tasks:** 22.1, 23.1, 24.1

**Why here:** `DESIGN.md` wins over everything but `sovereign`'s contracts, so it must say what legs 3 to 7 build before they build it. Until it does,
the RFCs say what the rows build.

**Technical notes:** each design task lists the sections it changes. `AGENTS.md`'s words ("Inventory", "Home", "card"; "or both" removed from what this
is) and its rules (a new table in `deletePerson`, the export and the import; §13.1's table) change with it; its synced sections are not edited here.
`docs/encryption.md` gains the titles' caveat; `docs/sharing.md` gains cards.

**Do not proceed if:** the owner has not reviewed it.

### Leg 2 — Upstream

**Epic tasks:** 16.17 to 16.26

**Why here:** the screens of legs 3 to 7 are built on these, and Shopper does not fork the design system.

**Technical notes:** done in `sovereign`, following its `AGENTS.md` (a story and a gallery entry per component, a published release). `Header`'s brand
slot must not change core's own header. `AppSidebar` takes Shopper's `sidebar.ts` rules (per kind of page, remembered on the device) as its first
consumer's. The apps endpoint answers for the person signed in and only with apps that have `signIn`.

**Do not proceed if:** a component needs Shopper's data or words to work.

### Leg 3 — Sign-in and Settings

**Epic tasks:** 22.2, 22.7, 22.8

**Technical notes:** `src/auth/config.ts` takes suite mode when both ways in are set, logging once which settings to remove; `.env.example` and the manifest
say so. Settings' sections are Next's intercepting routes (read `node_modules/next/dist/docs/` on parallel and intercepting routes first). The export's
server route asks for the session and the confirmation and serves records; the browser opens them with the keys it holds and writes the file.

**Do not proceed if:** an opened name, note or price reaches the server or a log to make the export.

### Leg 4 — A list

**Epic tasks:** 22.3, 22.4, 22.5, 22.6, 22.9, 22.10

**Technical notes:** the icon and colour are two encrypted fields on `list`; a list with neither is shown with the defaults, in place of a migration
giving every list them (`DESIGN.md` §9.1, settled with the owner). The item
column is `ThreeColumnLayout`'s, as Tusk's `Frame`. Titles are set by one hook from the opened name.

**Do not proceed if:** a list's icon or colour is readable in any table.

### Leg 5 — The frame

**Epic tasks:** 22.11

**Technical notes:** delete `src/ui/AppShell.tsx`, `SidebarToggle.tsx`, `sidebar.ts`, `useSidebar.ts` and `mobile-nav.tsx` as their parts arrive; the
`no-fork` test holds. The launcher's apps are kept on the device; its icons come from core's address, which the content security policy allows for
images only, as the profile picture needs.

**Do not proceed if:** a route differs between a phone and a desktop.

### Leg 6 — Home and Inventory

**Epic tasks:** 23.2, 23.3, 23.4, 23.5

**Technical notes:** `inventory_item` is excluded from every pull but its own account's, in the statement. Suggestions stay one pure function
(`src/catalog/suggest.ts`) with Inventory as its first source; the property tests hold.

**Do not proceed if:** a person on one of the group's lists can pull an Inventory row.

### Leg 7 — Loyalty cards

**Epic tasks:** 24.2, 24.3, 24.4, 24.5, 24.6

**Technical notes:** a decoder bundled for browsers without `BarcodeDetector` has its licence checked for AGPL (14.1's note); the camera's frames
never leave the device. `card` and `card_member` follow `list` and `list_member` in every rule.

**Do not proceed if:** a card's number reaches the server unencrypted, or a camera frame is sent anywhere.

### Leg 8 — Review and release

**Epic tasks:** 12.8

**Technical notes:** the security review covers the export route, the cards' sharing and keys, and Inventory's exclusion from pulls. `CHANGELOG.md` says
"not yet audited" where it describes encryption, and that an instance with both ways in now signs in through core only.

## Where it stands (2026-11-23)

**Leg 1 is done** (22.1, 23.1, 24.1), committed on `develop`: `DESIGN.md` says what RFC 0005 to 0007 build (§2.3 lists it), and `AGENTS.md`,
`README.md`, `docs/encryption.md` and `docs/sharing.md` agree, the last three saying what is coming rather than what runs. **The owner approved the
design on 2026-11-23,** after settling the fourteen points writing it raised, all as proposed (`DESIGN.md` §26, "Settled at leg 1's review"). It
was started with 12.7's release published as v0.2.0 and its roadmap row still open, at the owner's word.

**What waits:**

- **Leg 2** (16.17 to 16.26, in `sovereign`): **built, on `sovereign`'s `develop`, not pushed or released** (2026-11-23).
  `sovereign` tracks it as its epic 21 and workstream 0012. Its `@sovereignfs/ui` 0.107.0 has the icons, `SettingsDialog`,
  `MobileFooter`'s label, `Header`'s brand, `AppSidebar`, `AppFrame` and `Barcode`; `@sovereignfs/export` 0.4.0 writes in a page; core 0.86.0,
  the SDK 2.12.0 and `@sovereignfs/auth` 0.7.0 carry `prompt=create`. **16.23** (the apps a person can open) is core's `listMyApps`, with a
  person's token and no new scope, as the owner chose; its icons are served from core's own address. Legs 3, 4, 5 and 7 wait for the owner to release them, as the table says.
