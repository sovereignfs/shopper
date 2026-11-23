# RFC 0005 — The frame, settings and the screens

|                |                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**     | Accepted on 2026-11-23; to be built in [workstream 0002](../workstreams/0002-frame-home-cards.md)                                    |
| **Date**       | November 2026                                                                                                                        |
| **Author**     | Claude Code (design discussion with `kasunben`)                                                                                      |
| **Scope**      | `DESIGN.md` §2.2, §4, §6.2, §15.1, §16, §17, §18; `src/auth/`, `src/account/`, `src/screens/`, `src/ui/`; `@sovereignfs/ui` and core |
| **Supersedes** | Sign-in "locally, through core, or both" (§15.1) and task 2.9; the list settings page; Settings as a page; 20.2's export as written  |
| **Tasks**      | [epic 22](../epics/frame.md), and 16.17 to 16.24 of [epic 16](../epics/upstream.md)                                                  |

## Summary

A review of 0.2.0 on a desktop and a phone, item by item, with the owner. Shopper's screens are made to look and behave as the suite's do: sign-in is
**core's or Shopper's, never both**, with core's forms; Settings and a list's settings are **one dialog with a side navigation**, as Claude's settings
are; an item opens in a **right column**, as a card does in Tusk; Shop mode is tidied; every page says what it is in its title. The frame around every
signed-in page (the header, the sidebar in three states, the phone's footer) **moves into `@sovereignfs/ui`**, and the header gains an **app launcher**
fed by a new core endpoint. Shopper adopts it first; Tusk and Tally are not part of this.

## Sign-in: core's or Shopper's

| Was                                                                   | Is                                                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| One image signs people in locally, through core, **or both** (§15.1)  | **Suite mode** (a core is configured): through core only. **Standalone mode** (no core): Shopper's own accounts only |
| `/sign-in` shows a page with _Sign in with Sovereign_ beside the form | Suite mode: `/sign-in` and `/sign-up` render nothing; they send the browser to core at once                          |
| Shopper's own forms, built from `AuthForm`, `AuthField`, `AuthButton` | `@sovereignfs/ui`'s whole forms (`SignInForm`, `SignUpForm`, the reset pair), as core renders them                   |
| The landing page's button says _Sign in_                              | Suite mode: _Sign in with Sovereign_                                                                                 |

- **Suite mode.** `/sign-in` and `/sign-up` are redirects: someone with a session goes to `next` (or `/`), anyone else to
  `/api/auth/sign-in/sovereign?returnTo=…`, keeping an invitation's `next` through the round trip. Coming back from core with `?error=` shows a small page
  with the reason and _Try again_, and does not redirect, so that a failure at core cannot loop. `/sign-up` goes to core's sign-in, one click from
  _Create account_ (core's sign-up keeps `returnTo` already), until **16.17** lets an app ask core to open on its sign-up page (`prompt=create`).
- **Standalone mode.** Shopper's sign-in, sign-up and reset render the design system's forms; Shopper keeps only what is its own: deriving the
  password, opening the vault, the recovery kit after a reset (a screen core has no equivalent of, in the same `AuthCard`), and where the person goes
  next. `@sovereignfs/ui` moves from 0.105.0 to the release that carries them as core uses them.
- **An instance with both is no longer a configuration.** Start-up refuses one that sets both ways in. Task 2.9 (linking a core and a local account)
  has nothing left to do and is superseded. A standalone instance that later joins a suite already has password accounts; giving them a way across is
  **not now**, recorded here so that it is not decided by accident.

## A list: its icon, colour and header

- **Every list has an icon and a colour.** The icon is one of the design system's icons, chosen with `IconPicker`; the colour is any `#rrggbb`, chosen
  with `ColorPicker`, which offers the nine suggestions Tusk and Tally offer (copied from Tally's `src/groups/colors.ts`). A new list has the cart and
  blue; a migration gives every existing list the same. **Both are encrypted in the browser, as the name is**, since an icon says what a list is for (a
  pill, a nappy). Each is its own field, merged as every field is (the later write wins), and each is in the export and the import.
- **Shown** before the list's name in its header, in the sidebar (where the rail shows the icon in place of today's letter), in the phone's drawer, on
  Home's tiles and in Shop mode. The icon is drawn in the list's colour on the ordinary surface; the colour is never a background or the colour of
  text, Tally's rule, so that light and dark stay readable.
- **More icons are a development task** (16.18, with 16.4): people choose from the set, and never upload their own.
- **The header's actions** are, in order, **Shop** (the primary button, the only one on the screen, with the cart icon and its label, also on a phone),
  **Share** (secondary, its icon at the small size; its label hidden on a phone, as today) and the **list's menu** (a ghost button with no border, pulled
  right by its own padding so that its dots line up with the content's right edge). Every icon in the row is at the small size, so the two labelled
  buttons are the same height. Shop shows only when the list has something to buy.
- **Share stays a button and a dialog of its own;** it does not move into the list's settings.

## A list's settings, and an item

- **A list's settings open as the settings dialog** (below), over the list, at `?settings=general` (the same pattern as `?share=1`, so Back closes it
  and a link opens it, offline). Its sections: **General** (name, icon, colour) and **Archive and delete** (archive or restore; delete, its Admin only,
  with today's confirmation). `/l/<id>/settings` redirects to it, and its page is removed.
- **The edit icon is `square-pen`** (added to the design system's icons, 16.18).
- **An item opens in the right column,** as a card does in Tusk (`ThreeColumnLayout`'s right sidebar of 360px, there only while an item is open),
  pushing the list narrower so that another item can be opened beside it; on a phone it is a page of its own in place of the list. The address stays
  `?item=<id>`. Fields save as they are left, with no Save, as Tusk's card.
- **On a list, a tap on the row opens the item**; the checkbox alone ticks, as now; `square-pen` stays, as the visible sign and for a keyboard and a
  screen reader. The long press goes. A row did nothing so that a scrolling finger never ticked; opening a panel changes nothing, so a stray tap costs
  nothing. **In Shop mode, a tap on the row still ticks.**

## Settings

**One dialog with a side navigation,** `SettingsDialog`, built in `@sovereignfs/ui` (16.19), not in Shopper: reusable UI is built there and released
(`AGENTS.md`), and core and a list's settings need it too. It is a new component on `Dialog`'s fixed-size `lg` frame, not a change to `Dialog`:

- A title row (_Settings_, close) across the whole width; on the left, sections **in groups with a divider between them**, each with an icon; an
  optional search box (off by default; Shopper's four sections do not need it); on the right, the section's content, starting at once with no repeated
  heading, scrolling inside a frame that does not change size. On a phone it is the whole screen: the sections first, then one, with a back arrow.
- **Shopper's Settings** open as it over the page they were opened from, by Next's intercepting routes: every section has an address
  (`/settings/profile`, `/settings/security`, `/settings/preferences`, `/settings/data`); loaded directly, the same address shows Home with the dialog
  open, so Settings always looks the same. `/settings?section=…` redirects.

| Section         | Suite mode                                                                                                                             | Standalone                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Profile**     | Name, email and picture from core (the SDK session's `name`, `email`, `picture`), read only, refreshed at sign-in; _Edit in Sovereign_ | Name (editable) and email; initials, a photo of one's own later                                   |
| **Security**    | Links to core's sign-in and security, and to its keys and recovery kit                                                                 | Change the password (through `@sovereignfs/auth`, as core does); encryption and the kit (today's) |
| **Preferences** | How a list shows its items by default; This device; _Appearance, language and notifications are in Sovereign_                          | The same, with Appearance, time zone, language and region; Notifications: "coming later"          |
| **Data**        | Shopper's readable export (below); core's export holds Shopper's part, encrypted; deleting the account is core's                       | The readable export; delete the account (today's)                                                 |

- **The header's avatar and the menu** use the same name and picture: core's in suite mode, Shopper's own standalone. Core's picture is loaded from
  core's own address, the one place an image comes from beyond Shopper.
- _Sign-in_ becomes **Security**, and the **Encryption** section moves into it. **Notifications** move into Preferences and wait for 9.4. **This device**
  moves into Preferences.

## A readable export

The owner's decision: a person downloads **their data unencrypted, as one JSON file**, now. It settles RFC 0003's open question (a readable copy, made
by the browser) and replaces 20.2's export of ciphertext:

- **Made in the browser,** which holds the keys: the server checks who is asking and serves the person's records as it holds them (the same records as
  20.1); the browser opens them and writes the file. The server never reads a name to make it.
- **Confirmed first, as core's export is:** standalone, the password again (as the value the browser derives, through `ExportPanel`, as core does);
  in suite mode, a fresh sign-in at core (`prompt=login`, which the SDK has).
- **One `.json` file,** `shopper-export-<date>.json`: the contract's head (`format`, `kind: "person"`, `producer`, `takenAt`) and the same kinds and
  fields of record as 20.1, opened. Not the contract's zip: `@sovereignfs/export`'s writer needs Node (16.26 records a writer for the browser, and the
  file becomes the zip when it exists). No other person's email is in it.

## Shop mode

- **The header** is the list's: back, the list's icon and name, and "12 to get · 3 in basket" under it; nothing on the right.
- **Adding** stays, behind **+ Add item**, which opens the add field and closes after adding or on Escape. _Already in basket_ (an item added as
  already bought, for what was picked up and was not on the list) becomes the toggle **Put it straight in the basket**, off by default.
- **Finish shopping** is a bar fixed to the bottom of the content, above the phone's safe area, always visible, with the basket's count:
  `3 in basket · [Finish shopping]`; the list has padding beneath so that its last row is never under it.

## Page titles

A list's name is encrypted, so the server cannot put it in a title: **the browser sets the title once the name is opened**, and until then it is
`Shopper`.

| Page              | Title                                            |
| ----------------- | ------------------------------------------------ |
| Home              | `Home · Shopper`                                 |
| A list            | `<list> · Shopper`                               |
| Shop mode         | `Shopping <list> · Shopper`                      |
| Settings          | `<section> · Settings · Shopper`                 |
| A list's settings | `Settings · <list> · Shopper`                    |
| Inventory, cards  | `Inventory · Shopper`, `Loyalty cards · Shopper` |

A title is kept in the browser's history, and a history synced by the browser leaves the device with it: the one way an opened name leaves Shopper.
Accepted, and said in `docs/encryption.md`.

## The frame, in `@sovereignfs/ui`

Shopper's and Tusk's `AppShell.tsx`, `SidebarToggle.tsx`, `sidebar.ts`, `useSidebar.ts` and `mobile-nav.tsx` are near copies, and both say the header
is "worth offering to `@sovereignfs/ui`". The design system has the parts (`Header`, `NavList`, `ThreeColumnLayout`, `MobileHeader`, `MobileFooter`,
`Drawer`, `AppsLauncher`, `NotificationsPanel`, `UserMenu`) but not the frame they make. Built in `sovereign` and released (epic 16), then used:

- **`Header` takes the app's own brand** (16.20): today it always draws an initial on the accent colour. Left, the sidebar's button and the wordmark;
  right, in this order, **the launcher, the bell, the avatar**. The launcher and the bell are drawn only when given.
- **`AppSidebar`** (16.21): **full, a rail of icons, or hidden**, remembered on the device per app and per kind of page (Shopper's `sidebar.ts`'s
  rules), with the toggle; its content is **blocks** of `NavList`, each with an optional heading and an optional trailing _+ New …_ row.
- **`AppFrame`** (16.22): the header, the sidebar, the content and an optional right column, wired; on a phone, `MobileHeader`, the content,
  `MobileFooter` and a `Drawer`. The same routes on both; only what is drawn differs.
- **The launcher's apps** (16.23): core's own launcher reads its database, and **no endpoint gives an app the apps a person may open**. Core gains one
  (name, description, icon and launch address, from each app's manifest, for the person signed in) and the SDK a call to it with the app's token;
  `AppsLauncher` shows them. **Suite mode only;** kept on the device so that it opens offline; icons served from core's own address.
- **`MobileFooter`'s middle button takes its own name** (16.24): it is named "Apps" today and an app cannot change it.

**Shopper's sidebar** has two blocks: **Home, Inventory, Loyalty cards**; then **My lists** (with _+ New list_) and **Shared with me** (whose each is,
under its name), each list with its icon and open count. Phase 2's _All lists_ and _Trips_ become part of Home and _Catalog_ part of Inventory
([RFC 0006](0006-home-and-inventory.md)), not rows of the sidebar.

**The phone** (`MobileFooter`):

| Where                    | Opens                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Left icon                | **Home** (which links to Inventory)                                                        |
| Middle button            | **The lists drawer:** every list, own then shared, with icon, colour and count; _New list_ |
| Right icon               | **Loyalty cards**                                                                          |
| The header's menu button | **The same lists drawer**                                                                  |

There is **no app launcher on a phone** for now. Settings is in the avatar's menu, as on a desktop.

## Alternatives

| Alternative                                          | Why not                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Keep "both" ways in on one instance                  | The owner's decision: a suite signs in through core; a standalone app has no core to offer |
| A settings dialog of Shopper's own                   | Reusable UI is built in `@sovereignfs/ui`; core and every app need the same                |
| A new `SidePanel` for an item                        | `ThreeColumnLayout` is it, and Tusk already uses it for a card                             |
| An export of ciphertext only (20.2 as written)       | The owner's decision: people get their data readable now                                   |
| A zip in the contract's layout, built in the browser | The writer is Node's; a dependency for a zip is not worth it before 16.26                  |
| The frame for Tusk and Tally in the same work        | The owner's decision: Shopper first; the others adopt it in their own repositories         |

## Open questions

1. Whether a standalone instance's password accounts get a way into a suite (not now).
2. When 16.17 is built: until then `/sign-up` in suite mode lands one click from core's sign-up.
3. Whether import (20.4, deferred by the owner) reads 22.8's readable JSON file, the contract's export, or both.
