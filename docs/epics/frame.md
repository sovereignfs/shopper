# Epic 22: The frame and the screens

## Status

📋 Planned. Workstream 0002, after 12.7 and before phase 2.

## Overview

[RFC 0005](../rfcs/0005-the-frame-settings-and-screens.md): sign-in is core's or Shopper's, never both, with core's forms; a list has an icon and a
colour, and a clearer header; a list's settings and Settings are one dialog with a side navigation; an item opens beside its list; Shop mode is tidied;
every page has a title; and the frame (header, sidebar, phone's footer) is the design system's, with an app launcher in a suite.

## Related

[RFC 0005](../rfcs/0005-the-frame-settings-and-screens.md) · [workstream 0002](../workstreams/0002-frame-home-cards.md) · `DESIGN.md` §15.1, §16, §17,
§18 · 16.17 to 16.24 in [epic 16](upstream.md) · Tusk's `src/screens/Frame.tsx` and `src/ui/AppShell.tsx` · core's `app/(auth)/`

## Tasks

#### 📋 22.1 — The design

**Goal:** `DESIGN.md` says what RFC 0005 builds. **Depends on:** 12.7.

**Technical:** §2.2 (what 0.3 holds), §4 (words), §6.2 (avatars: core's picture), §15.1 (suite or standalone, never both; the redirects), §16.2 (the
frame, two blocks, three states, the launcher), §16.3 (addresses: `/settings/<section>`, `?settings=`, `/l/<id>/settings` gone), §16.5 (the header's
actions, the row's tap), §16.7 (the item's column), §16.11 (the phone's footer), §11.1 (Shop mode), §17 (Settings by mode), §18 (the readable
export), §13.1 (a list's icon and colour); `AGENTS.md`'s "or both" and words; `docs/encryption.md` (the titles' caveat); RFC 0003's open question 2
marked settled by this RFC; workstream 0001's export row pointing here. The workstream's assumed points settled with the owner.

**Accepts when:** no document says an instance signs people in both ways, that Settings is a page, or that a person's own export is ciphertext only.

#### 📋 22.2 — Sign-in by mode

**Goal:** in a suite, Shopper's sign-in pages are the way to core; alone, they are core's forms. **Design:** RFC 0005, "Sign-in". **Depends on:** 22.1.

**Technical:** `src/auth/config.ts` refuses an instance with both ways in, naming the settings; `/sign-in` and `/sign-up` in a suite redirect (a session
to `next`, anyone else to `/api/auth/sign-in/sovereign?returnTo=…`), and a return with `?error=` renders the reason and _Try again_; the landing's
button says _Sign in with Sovereign_ in a suite. Alone, `SignInForm`, `SignUpForm` and the reset pair from `@sovereignfs/ui` (the current release),
Shopper's recovery-kit screen kept in `AuthCard`. With 16.17, `/sign-up` asks core for `prompt=create`. 2.9 marked superseded.

**Accepts when:** in a suite, visiting `/sign-in` signed out arrives at core's sign-in with Shopper's return, an invitation's `next` survives the round
trip, and a refused sign-in at core shows the page once with no loop; alone, the forms render as core's, and every existing auth test passes; an
instance configured both ways does not start.

#### 📋 22.3 — A list's icon and colour

**Goal:** every list has an icon and a colour, encrypted, shown wherever the list is. **Design:** RFC 0005, "A list". **Depends on:** 22.1, 16.18.

**Technical:** `icon` and `color` on `list`, encrypted in the browser, a migration on both dialects giving existing lists the cart and blue; each a
field of the one write path (merged by field); `IconPicker` and `ColorPicker` (Tally's `src/groups/colors.ts` copied, and said); shown in the list's
header, the sidebar (the rail's icon in place of the letter), the drawer, Home's tiles and Shop mode; the export and import carry both; §13.1's
registry test.

**Accepts when:** a new list has the defaults; a changed icon and colour reach a second device and survive offline edits by field; the marker test
finds neither in any table.

#### 📋 22.4 — The list's header

**Goal:** Shop first and clear, buttons of one height, the menu flush right. **Design:** RFC 0005, "A list". **Depends on:** 22.1.

**Technical:** Shop (`primary`, cart icon and label, on a phone too), Share (`secondary`, its label hidden on a phone), the menu (`ghost`, its padding
offset so its dots meet the content's edge); every icon at `sm`. `src/screens/ListScreen.tsx` and its CSS.

**Accepts when:** the three are the same height at a desktop's and a phone's width, the menu's glyph lines up with the rows' right edge, light and
dark.

#### 📋 22.5 — A list's settings in the dialog

**Goal:** a list's settings open over the list. **Design:** RFC 0005, "A list's settings". **Depends on:** 22.3, 16.19.

**Technical:** `SettingsDialog` at `?settings=general|archive`: General (name, icon, colour), Archive and delete (Admin only for delete, today's
confirmation); `/l/<id>/settings` redirects and its page is removed; from 24.6, the list's linked cards in General.

**Accepts when:** opened from the menu, closed by Back, opened by a link and offline; a Member sees no Delete; a second person's attempt to delete is
refused as not found.

#### 📋 22.6 — The item beside its list

**Goal:** an item opens in a right column, by a tap on its row. **Design:** RFC 0005, "A list's settings, and an item". **Depends on:** 22.1, 16.18.

**Technical:** `ThreeColumnLayout`'s right sidebar while `?item=` is set (Tusk's `Frame`), a page of its own on a phone; fields save as they are left;
a tap on a row (not its checkbox) opens it; `square-pen` for the edit icon; the long press removed on lists, kept in Shop mode. `ItemDialog`
becomes the column's content.

**Accepts when:** two items opened one after the other replace each other in the column; the checkbox alone ticks on a list; a tap ticks in Shop mode;
with a keyboard, the edit button opens it.

#### 📋 22.7 — Settings as a dialog, by mode

**Goal:** Settings is `SettingsDialog`, and each section says and does what RFC 0005's table says, in both modes. **Design:** RFC 0005, "Settings".
**Depends on:** 22.2, 16.19.

**Technical:** intercepting routes for `/settings/<section>` (loaded directly, over Home); `/settings?section=` redirects. Profile from the SDK
session's `name`, `email` and `picture` in a suite (refreshed at sign-in, the sealed name kept in `person` as now), editable name and initials alone;
the header's avatar the same. Security: links to core in a suite; the password change and today's encryption section alone. Preferences: the list
view's default, This device, core's link in a suite; Appearance, time zone, language and region alone; Notifications "coming later". Data: 22.8 and
delete. The content security policy allows core's address for images.

**Accepts when:** each section opens at its address, from the avatar's menu and directly; a suite account sees core's picture and links and no password
field; a standalone account changes its password and keeps its lists.

#### 📋 22.8 — A readable export

**Goal:** a person downloads their data as one readable JSON file. **Design:** RFC 0005, "A readable export". **Depends on:** 22.7. **Replaces:** 20.2
as written.

**Technical:** a route that asks for the session, the confirmation (the derived password alone, through `ExportPanel`; a fresh core sign-in with
`prompt=login` in a suite) and serves the person's records as 20.1 selects them; the browser opens them with its keys and writes
`shopper-export-<date>.json` (the contract's head, 20.1's kinds and fields, opened). From 23.3 and 24.2, Inventory and cards are in it. With 16.26, the
contract's zip.

**Accepts when:** the file holds every list, item, product, category, Inventory item and card the person may see, readable; no other person's email; a
wrong password downloads nothing; a request from a second person gets nothing of the first's; the server's logs hold no opened value.

#### 📋 22.9 — Shop mode

**Goal:** a clearer header, adding behind a button, Finish always in reach. **Design:** RFC 0005, "Shop mode". **Depends on:** 22.3.

**Technical:** the header as the list's (back, icon, name, progress); _+ Add item_ opening the add field, with _Put it straight in the basket_ off by
default; Finish in a bar fixed to the bottom with the basket's count, the list padded beneath. `src/screens/ShopScreen.tsx`.

**Accepts when:** with forty items the last is reachable above the bar on a phone; adding with the toggle on adds it bought; the network off throughout.

#### 📋 22.10 — Page titles

**Goal:** every page's title says what it shows. **Design:** RFC 0005, "Page titles". **Depends on:** 22.1.

**Technical:** one hook setting `document.title` from the opened name; `Shopper` until it is opened; the server's metadata for the pages with no
encrypted name.

**Accepts when:** every row of RFC 0005's table holds, and a list opened offline titles itself once the store has loaded.

#### 📋 22.11 — The suite's frame

**Goal:** the header, sidebar and phone's footer are the design system's, with the launcher in a suite. **Design:** RFC 0005, "The frame". **Depends
on:** 22.3, 16.20 to 16.24.

**Technical:** `AppFrame` with `Header` (Shopper's wordmark; launcher in a suite, the bell when 9.2 lands, the avatar), `AppSidebar` (Home, Inventory,
Loyalty cards; My lists with _New list_; Shared with me), `MobileFooter` (Home, the lists drawer by its own name, Loyalty cards), the header's button
opening the same drawer; no launcher on a phone. The launcher's apps from 16.23, kept on the device. `src/ui/AppShell.tsx`, `SidebarToggle.tsx`,
`sidebar.ts`, `useSidebar.ts`, `mobile-nav.tsx` and `src/screens/AppSidebar.tsx`, `PhoneFooter.tsx` deleted or reduced to Shopper's content. Inventory
and Loyalty cards link to their pages once 23.4 and 24.3 land.

**Accepts when:** the sidebar's three states are remembered per kind of page; the rail shows list icons; the phone's footer and header reach the same
places by the same addresses as the sidebar; the launcher lists a suite's apps and is absent alone and on a phone; the `no-fork` test passes.
