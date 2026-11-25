# Epic 22: The frame and the screens

## Status

⏳ In Progress. Workstream 0002, before phase 2: the design (22.1) is done and approved by the owner (2026-11-23); the rest waits on `sovereign`'s releases (epic 16).

## Overview

[RFC 0005](../rfcs/0005-the-frame-settings-and-screens.md): sign-in is core's or Shopper's, never both, with core's forms; a list has an icon and a
colour, and a clearer header; a list's settings and Settings are one dialog with a side navigation; an item opens beside its list; Shop mode is tidied;
every page has a title; and the frame (header, sidebar, phone's footer) is the design system's, with an app launcher in a suite.

## Related

[RFC 0005](../rfcs/0005-the-frame-settings-and-screens.md) · [workstream 0002](../workstreams/0002-frame-home-cards.md) · `DESIGN.md` §15.1, §16, §17,
§18 · 16.17 to 16.24 in [epic 16](upstream.md) · Tusk's `src/screens/Frame.tsx` and `src/ui/AppShell.tsx` · core's `app/(auth)/`

## Tasks

#### ✅ 22.1 — The design

**Goal:** `DESIGN.md` says what RFC 0005 builds. **Depends on:** 12.7.

**Technical:** §2.2 (what 0.3 holds), §4 (words), §6.2 (avatars: core's picture), §15.1 (suite or standalone, never both; the redirects), §16.2 (the
frame, two blocks, three states, the launcher), §16.3 (addresses: `/settings/<section>`, `?settings=`, `/l/<id>/settings` gone), §16.5 (the header's
actions, the row's tap), §16.7 (the item's column), §16.11 (the phone's footer), §11.1 (Shop mode), §17 (Settings by mode), §18 (the readable
export), §13.1 (a list's icon and colour); `AGENTS.md`'s "or both" and words; `docs/encryption.md` (the titles' caveat); RFC 0003's open question 2
marked settled by this RFC; workstream 0001's export row pointing here.

**Accepts when:** no document says an instance signs people in both ways, that Settings is a page, or that a person's own export is ciphertext only.

**Done as:** `DESIGN.md` says what RFC 0005 builds:

- A new **§2.3** (what workstream 0002 changes, area by area) in place of "what 0.3 holds", since 0.3.0 was already written up; linking taken out of
  §2 and §2.2's phase 2.
- §4's **suite mode** and **standalone mode**; §6.1 (the name kept in step from core), §6.2 (core's picture), §6.3 (the sign-up policy is standalone's),
  §7.3 (the invitation page by mode), §7.4 (_My lists_, _Shared with me_).
- §9.1 a list's **icon and colour**, encrypted; §11.1 **shopping mode** (the list's header, _+ Add item_, _Put it straight in the basket_, the fixed
  _Finish shopping_); §12.5 and §12.6 (This device under Preferences); §13.1 (a list's icon and colour) and §13.2 (the key follows the mode).
- §15.1 rewritten (**one way in per instance**, the redirects, the error page, the design system's forms, both configured starting in suite mode, no
  linking); §14.3 and §15.4 by mode.
- §16.2 rewritten as **the frame** (`Header`, the launcher, `AppSidebar` in two blocks, `AppFrame`); §16.3 (`/settings/<section>`, `?settings=`,
  `/l/<id>/settings` redirecting); §16.5 (the header's Shop, Share and menu; the row's tap; `square-pen`; the list's settings); §16.7 (**the item's
  column**); §16.10 (what 16.18 to 16.24 build); §16.11 (**the phone's footer**); §16.12's lessons; a new **§16.13 page titles**.
- §17 rewritten (**`SettingsDialog`**, each section at its address, the table by mode); §18.1 (**the readable export**) and §18.2 (import reads both);
  §19 (deleting is core's in suite mode); §20.3 (`list`'s icon and colour); §21 (`img-src` for core's address; hosted is suite mode); §22.1; §25 (two
  points for the owner's review); §26 (three rows of 2026-11-23).
- `AGENTS.md`: "or both" in what Shopper is, and core as the way in, in its rules. `docs/encryption.md`: the titles' caveat, as coming.
  `README.md`: its sign-in marked as changing, as 18.1 did, since it describes the running app. RFC 0001's open question 2 and RFC 0003's text marked
  settled. Workstream 0001's export row already pointed here.
- `src/crypto/sealed.test.ts` finds §13.1's table by `| Household: name; list:` (it matched `list: name;`, which the list's icon and colour change).

Changed from the RFC: **a list's default icon and colour are not written by a migration,** since the server cannot encrypt them and a plain value
would say what they are: a list with neither is shown with the cart and blue (§9.1, 22.3's technical changed to match; settled with the owner, §26). And with one way in, someone sent a link with no account at core can join only if
core lets them sign up (settled with the owner, §26).

#### ✅ 22.2 — Sign-in by mode

**Goal:** in a suite, Shopper's sign-in pages are the way to core; alone, they are core's forms. **Design:** RFC 0005, "Sign-in". **Depends on:** 22.1.

**Technical:** `src/auth/config.ts` takes suite mode when both ways in are set, logging once which settings to remove; `/sign-in` and `/sign-up` in a suite redirect (a session
to `next`, anyone else to `/api/auth/sign-in/sovereign?returnTo=…`), and a return with `?error=` renders the reason and _Try again_; the landing's
button says _Sign in with Sovereign_ in a suite. Alone, `SignInForm`, `SignUpForm` and the reset pair from `@sovereignfs/ui` (the current release),
Shopper's recovery-kit screen kept in `AuthCard`. `/sign-up` asks core for `prompt=create`. 2.9 marked superseded.

**Accepts when:** in a suite, visiting `/sign-in` signed out arrives at core's sign-in with Shopper's return, an invitation's `next` survives the round
trip, and a refused sign-in at core shows the page once with no loop; alone, the forms render as core's, and every existing auth test passes; an
instance configured both ways starts in suite mode and logs it once.

**Done as (0.4.0, 2026-11-23):** `resolveAuth` makes suite mode win: with a core, `local` is off wherever it is read (so `@sovereignfs/auth`'s
password routes are not mounted) and `localIgnored` names the settings set beside it, which `instrumentation-node.ts` says once at start, names
only; the proxy's `edgeSettings` agrees and keeps `/sign-in` and `/sign-up` in suite mode. Those two pages are `SuitePage`
(`src/auth/suite-page.tsx`, its three outcomes pure in `src/auth/suite.ts`): a session goes to `next`, `?error=` shows the reason and _Try again_
once, anyone else goes to `/api/auth/sign-in/sovereign?returnTo=…`. **The proxy makes that last redirect** for a visitor with no session cookie
and no `?error=` (a 307 from the server): a page's own `redirect()` comes after the root loading state has sent a 200, which a browser follows
but which is no redirect, as the deploy check found; the destination is Shopper's `next` or the package's `returnTo`, only ever an
invitation's page. Core unreachable when a sign-in starts (an error answered or thrown by the package's start route) becomes
`/sign-in?error=sovereign_unreachable`, said in a sentence, in `app/api/auth/[...all]/route.ts`. The landing's button says _Sign in with
Sovereign_ in a suite, and offers no sign-up there. Standalone, `SignInForm`, `SignUpForm`, `ForgotPasswordForm` and `ResetPasswordForm` from
`@sovereignfs/ui` 0.105.0 (already pinned: it has all four), with Shopper's derivation, vault, kit and _Send the link again_ around them; the
reset page reads its token when the form is sent, no longer while rendering. **Behaviour that changed:** sign-up and a new password ask for the
password twice; `/sign-up`'s own footer is the form's. Tests: `suite.test.ts`, the config, proxy and route tests (three seen to fail without the
change); the browser tests rewritten for suite mode (`e2e/sovereign.spec.ts`: `/sign-in` and `/sign-up` go through core, the both-ways instance
has no password form and its sign-up route is 404, core's logout checked by the session, as a fresh `/sign-in` signs straight in again), and
the sign-up helper fills the confirmation; `scripts/deploy-check.sh`'s `sovereign` setup checks that `/sign-in` and `/sign-up` answer 307 to
core, and that a core that cannot be reached ends on the sign-in page saying so, with no password field. **`prompt=create` (done on `@sovereignfs/auth` 0.7.0 and the SDK 2.12.0, 2026-11-23):** `/sign-up` in suite mode sends the browser to core asking for its sign-up
(`toCore(next, 'create')`, from the proxy and from `SuitePage` for the retry after a failure), which the package passes on and drops for any other value; it needs **Sovereign 0.140.0 or later** (core's own package is 0.86.0; the platform's releases are 0.140.0 for this, 0.141.0 for the launcher's apps and 0.142.0 for `coreSignedInAt`)
(before it, core shows its sign-in); tests: `suite.test.ts`, `proxy.test.ts`, `sovereign.test.ts` (the prompt reaches core's authorization request) and `e2e/sovereign.spec.ts` (what the fake core was asked),
and `scripts/deploy-check.sh` expects the new address. **Left out:** the `Sovereign beside
local` unit test in `sovereign.test.ts` stays, since it holds the package to never matching by email, which is what protects those accounts now.

#### ✅ 22.3 — A list's icon and colour

**Goal:** every list has an icon and a colour, encrypted, shown wherever the list is. **Design:** RFC 0005, "A list". **Depends on:** 22.1, 16.18.

**Technical:** `icon` and `color` on `list`, two fields of its `encrypted`, written by the browser; a list with neither (every existing one) is shown
with the cart and blue, since no migration can encrypt a default (`DESIGN.md` §9.1, settled with the owner in place of RFC 0005's migration); each a
field of the one write path (merged by field); `IconPicker` and `ColorPicker` (Tally's `src/groups/colors.ts` copied, and said); shown in the list's
header, the sidebar (the rail's icon in place of the letter), the drawer and Shop mode (Home's tiles take them in 23.2); the export and import carry both; §13.1's
registry test.

**Accepts when:** a new list has the defaults; a changed icon and colour reach a second device and survive offline edits by field; the marker test
finds neither in any table.

**Done as (0.5.0, 2026-11-23; the cart and the larger icon set with `@sovereignfs/ui` 0.107.0, the same day):** `icon` and `color` are fields of a list's sealed content, in `CONTENT`
(`src/actions/format.ts`), the sealed registry and `src/sync/tables.ts`, so **no migration**: encrypted in the browser once a household has moved, sealed by the
server before, in no column. Validated as typed (a colour is exactly `#rrggbb`, an icon a name's shape) and, on reading, held to `src/lists/appearance.ts`
(its swatches **copied from Tally's `src/groups/colors.ts`**), where a value this build does not know is the default; `ListGlyph` draws the icon in the colour
on the ordinary surface, as a style no value but a checked one reaches. A default is never written, so a list that has neither is shown the defaults; `styleList`
writes each by field, and `null` puts the defaults back. Shown in the list's header, the sidebar's rows (the rail's icon in place of the letter) and the
phone's drawer, which are one component. Chosen in today's list settings (`IconPicker`, `ColorPicker` with the default as _none_, the colour written once
it has been still for 400 ms); 22.5 moves them into the dialog's General. The readable export carries both with every sealed field. Tests: `actions.test.ts`,
`apply.test.ts` and `encrypted.test.ts` (merged by field, the marker in no column, plain text held in a moved group, a value for another list refused;
seen to fail without the registry), `readable.test.ts`, `sealed.test.ts` (which now reads _colour_ and `color` as one word) and `e2e/appearance.spec.ts` in
Chromium and WebKit (the default blue, a chosen icon and colour in the sidebar and the header, the server's answer holding neither as text, a reload).
A second device of the account signs in and draws the same colour (`e2e/appearance.spec.ts`); the move of a household to the browser's encryption carries both
(`move.test.ts`: the markers are in no table afterwards). **With 0.107.0:** the cart is the default (`DEFAULT_LIST_ICON`) and `LIST_ICONS` has the
larger set: a shop, hardware, electronics, clothing, a gift, the garden, the office, the pharmacy, a baby, a pet and home. **Left to other tasks:** Home's tiles' icon
(23.2) and the import of both (20.4); shopping mode's header shows it from 22.9. **Gaps to raise in `sovereign`:** `IconPicker`'s options have no
accessible names (a screen reader hears an unnamed option, and a test can choose only by position), and its panel opens aligned to its button's right edge and
is clipped by a scrolling container, so the button sits at the right of its row here.

#### ✅ 22.4 — The list's header

**Goal:** Shop first and clear, buttons of one height, the menu flush right. **Design:** RFC 0005, "A list". **Depends on:** 22.1.

**Technical:** Shop (`primary`, cart icon and label, on a phone too), Share (`secondary`, its label hidden on a phone), the menu (`ghost`, its padding
offset so its dots meet the content's edge); every icon at `sm`. `src/screens/ListScreen.tsx` and its CSS.

**Accepts when:** the three are the same height at a desktop's and a phone's width, the menu's glyph lines up with the rows' right edge, light and
dark.

**Done as (0.5.0, 2026-11-23):** `src/screens/ListScreen.tsx`'s header is Shop (`primary`, icon and label on a phone too), Share (`secondary`, its label hidden on a
phone) and the menu (`ghost`, its padding and border pulled out of the row by `.menuButton`), every icon at `sm`, which is what made the three one height (Shop had
no icon and Share's was `md`). **Shop is there only while something is left to buy,** as RFC 0005 says; `e2e/shop.spec.ts`'s "Keep" test keeps an item open for
that reason. Tests: `e2e/header.spec.ts` in Chromium and WebKit (one height, Shop first with its label, Share's label by width, the menu's glyph within a pixel
of the rows' right edge; desktop and phone, light and dark; no Shop on a list with nothing to buy), seen to fail against the old header. The cart is on Shop
from ui 0.107.0.

#### ✅ 22.5 — A list's settings in the dialog

**Goal:** a list's settings open over the list. **Design:** RFC 0005, "A list's settings". **Depends on:** 22.3, 16.19.

**Technical:** `SettingsDialog` at `?settings=general|archive`: General (name, icon, colour), Archive and delete (Admin only for delete, today's
confirmation); `/l/<id>/settings` redirects and its page is removed; from 24.6, the list's linked cards in General.

**Accepts when:** opened from the menu, closed by Back, opened by a link and offline; a Member sees no Delete; a second person's attempt to delete is
refused as not found.

**Done as (0.5.0, 2026-11-23, on `@sovereignfs/ui` 0.107.0's `SettingsDialog`):** `ListSettingsDialog` (`src/screens/ListSettingsDialog.tsx`) replaces the page
`ListSettings`, which is removed. It is the design system's dialog (`size="fixed"`, two groups so that a divider sets _Archive and delete_ apart) over the list at
`?settings=general|archive`, drawn by `ListScreen` like `ShareDialog`; **General** is the name (with its _Save name_), and Appearance, the icon and colour pickers of 22.3
moved from the page, written as they are chosen; **Archive and delete** is archive or restore and, for an archived list and its Admin, delete for good after
today's confirmation. A section is chosen in place (`useQueryParam`'s new `replace`), so Back goes to the list and not to the section before; on a phone the dialog
is the screen, the address naming a section opens it and the back arrow goes to the sections (`?settings=`, no section). The menu's _List settings_ and the archived
note's button open it with the browser's own history, so it works with no network; **from the front address, which draws the last list and would draw none once it
is archived, the dialog is opened on the list's own address** (`/l/<id>?settings=…`) so that archiving does not take the dialog away. `/l/<id>/settings` is a redirect
to `?settings=general` and no page, on the server (`app/(app)/l/[id]/settings/page.tsx`, a bad id not found) and in the offline shell (`OfflineApp`'s `ToSettings`); its
title is `Settings · <list> · Shopper`. Tests: `e2e/list-settings.spec.ts` in Chromium and WebKit (from the menu over the list, the sections, Back; a link and the old
address; no network, renamed and written when it is back; a phone's whole screen and back arrow; **a Member of an archived list can Restore and is not offered Delete, the
Admin is**), `list.spec.ts` (rename, archive, restore and delete through the dialog), `appearance.spec.ts` and `titles.spec.ts`; a second person's delete is refused as
not found by `src/lists/scope.test.ts`. **Left out:** a list's linked cards in General (24.6).

#### ✅ 22.6 — The item beside its list

**Goal:** an item opens in a right column, by a tap on its row. **Design:** RFC 0005, "A list's settings, and an item". **Depends on:** 22.1, 16.18.

**Technical:** `ThreeColumnLayout`'s right sidebar while `?item=` is set (Tusk's `Frame`), a page of its own on a phone; fields save as they are left;
a tap on a row (not its checkbox) opens it; `square-pen` for the edit icon; the long press removed on lists, kept in Shop mode. `ItemDialog`
becomes the column's content.

**Accepts when:** two items opened one after the other replace each other in the column; the checkbox alone ticks on a list; a tap ticks in Shop mode;
with a keyboard, the edit button opens it.

**Done as (0.5.0, 2026-11-23; `square-pen` with `@sovereignfs/ui` 0.107.0, the same day):** `ItemDialog` is now `ItemPanel` (`src/screens/ItemPanel.tsx`), an
`aside` with **no Save**: the quantity, unit, category, icon and list are written at once and the name (also on Enter) and the note when focus moves on,
each as one change of that field alone (`editItem` already sent only what differs), with no Undo toast for them and Delete's kept. `ItemBeside`
(`ItemEditor.tsx`) places it: `ThreeColumnLayout`'s right column while `?item=` names an item of the list, the page narrower and usable beside it; **on a
phone the panel is the page, in place of the list, with a back arrow** (rendered, not navigated, so the route is the same). Opening moves focus into the
panel and closing gives it back to the edit button when that opened it; Escape closes. A tap on a list's row (not its checkbox, label, button or link) opens it and
the long press is gone from lists; **shopping mode keeps its long press** and its whole-row tick, and opens the same panel. The column is placed by the list and
shopping screens and not by the app's frame, so that leg 5's frame replaces nothing here. Tests: `e2e/item.spec.ts` (rewritten: a tap opens and ticks nothing, each
field written as it is left and at the server, two items replacing each other, the keyboard and focus back, offline, Remember, Delete and Undo, an unknown item
closing it; on a phone, the page, the back arrow and no sideways scroll), `list.spec.ts`, `phone.spec.ts` and `shop.spec.ts` in Chromium and WebKit.
**Also:** what was typed and not left (Escape, Back, another item opened) is written as the panel goes, against the row as the device then holds it and only if the
item is still there, so that an edit never restores an item deleted elsewhere; Escape closes an open picker and then the panel. **Where the list would be
squeezed the item is the whole area in place of it,** by a container query on the area the frame gives the page (under 800px, so it follows the sidebar's
three states and not the window): at 820px with the full sidebar the list was 180px wide beside the 360px column. **Remember for next time** is applied at each
change, so turning it off afterwards does not unlearn what an earlier change taught. **The edit icon is `square-pen`** (ui 0.107.0). **Left out:** the open item is not marked in the list.

#### ✅ 22.7 — Settings as a dialog, by mode

**Goal:** Settings is `SettingsDialog`, and each section says and does what RFC 0005's table says, in both modes. **Design:** RFC 0005, "Settings".
**Depends on:** 22.2, 16.19.

**Technical:** intercepting routes for `/settings/<section>` (loaded directly, over the page `/` opens: the last list until 23.2, Home after); `/settings?section=` redirects. Profile from the SDK
session's `name`, `email` and `picture` in a suite (refreshed at sign-in, the sealed name kept in `person` as now), editable name and initials alone;
the header's avatar the same. Security: links to core in a suite; the password change and today's encryption section alone. Preferences: the list
view's default, This device, core's link in a suite; Appearance, time zone, language and region alone; Notifications "coming later". Data: 22.8 and
delete. The content security policy allows core's address for images.

**Accepts when:** each section opens at its address, from the avatar's menu and directly; a suite account sees core's picture and links and no password
field; a standalone account changes its password and keeps its lists.

**Done as (0.5.0, 2026-11-23, on ui 0.107.0):**

- **The dialog and its routes.** `SettingsHost` is `SettingsDialog` with four sections, **Profile, Security, Preferences and Data** (six from 0.8.3: **Notifications** and **This device**, which were parts of Preferences, are sections of their own, at `/settings/notifications` and `/settings/device`), rendered by the server for the mode
  (`SettingsRoute`, which asks for the session) and shown by the client. Opened from a page it is over that page by an intercepting route
  (`app/(app)/@modal/(.)settings`, with `@modal/default.tsx`, **and a page in `@modal` for each other address of the area drawing nothing (`Nothing.tsx`), so that the dialog does not
  stay open over the next page**, which Next's docs say a slot would do; it was a catch-all and a page for `/` until 0.8.2, which Next's strict route matching read as the slot claiming
  every address in the app, so that `pnpm dev` served the front page and sign-in as not found, and `src/access/modal-slot.test.ts` keeps the slot to the area's own addresses), and Back closes it; loaded directly, `app/(app)/settings` draws Home (`HomeScreen`) with the dialog open and closes to `/`.
  **The section shown is the address's** (`/settings/<section>`, a section chosen in place with the browser's own history: no round trip, one Back leaves Settings, and Back and
  Forward agree); **`/settings` alone names none**, which is the first on a wide screen and the sections alone on a phone, so that the route does not depend on the viewport.
  `/settings?section=` redirects to the section that took the old one's place (`sectionBefore`); a name that is not a section is not found. The title is `<section> · Settings · Shopper`.
- **Settings changes the page without refreshing a route.** `AccountProvider` holds the name and the time zone and language, so a saved name or choice shows in the header
  and every date at once: a `router.refresh()` of a dialog that is an intercepted route at an address it chose in place moved what was under it and broke Forward.
- **`useTitle` has one owner** (`Titles`): with Settings over a list two screens name the page, **a dialog is the title over the page under it** (loaded directly, Settings mounts first)
  and among the same kind the last opened is; two observers had reset each other's title without end, which hung the page.
- **Standalone.** Profile (name editable, initials), Security (the password and Encryption, as before), Preferences, Data (the readable export, 22.8, and delete). **Preferences** is
  how a list shows its items by default (`src/lists/view-preference.ts`, the key the list screen already used), **Appearance** (light, dark or the system's, which had no screen
  until now), **time zone and language and region**, kept on the account through `@sovereignfs/auth`'s own update and **used** for the item's date, a link's expiry and This
  device's times (`src/format/regional.ts`), This device and Notifications.
- **Suite mode** (`CoreSections.tsx`, with core's address from `SHOPPER_CORE_URL` and `coreLink`): **Profile** is who core says the person is, read only, with **core's picture** from
  `signedInUser` held to an address on core's own origin by `pictureOf` (public and cookie-less on core's side, so an `<img>` loads it), which the header's avatar draws too, and _Edit
  in Sovereign_; **Security** is links to core's security and keys and no password form, with Encryption; **Preferences** says language and time zone are Sovereign's, **used** for dates
  as `signedInUser` has them from core's claims, and links there; **Data** keeps the readable export's line and links to core's _Delete account_ in place of Shopper's own form. **The
  content security policy gains core's origin for images alone** (`img-src`, from `edgeSettings().coreOrigin` through the proxy), tested to leave every other directive as it was.
- **Deviations from RFC 0005's table, recorded in `DESIGN.md` §17.** In suite mode **Appearance stays Shopper's** (the page's theme script reads this device's choice or the system's,
  and nothing of core's can reach it, so core's link would change nothing) and **Notifications keep the push control for this device**, which works and which removing would regress; each
  kind by channel is 9.4's. **The name is refreshed** by `@sovereignfs/auth` when it renews a session (the hourly check), **not when a new session starts for an account that
  exists**, so a rename at Sovereign shows after the next check; Shopper's `person` keeps the name it had, as now. Both are Sovereign's to say; not tested.
- **Tests.** `e2e/settings.spec.ts` in Chromium and WebKit (over the page and Back; each section an address; the old addresses; Preferences kept on the device and on the account; the
  title loaded directly; a section chosen and a setting changed in place with Back and Forward; on a phone the sections alone from the footer and the dialog gone on reaching a list),
  `e2e/sovereign.spec.ts` (the policy, the avatar, each section's read-only content and links, core's language and time zone used), `query`, `view-preference`, `regional`, `title`,
  `core-links` and `csp` unit tests, and the `auth`, `device`, `export`, `pwa`, `phone`, `offline`, `security` and `titles` specs moved to the new addresses.
  **Left out:** the offline shell, which has no session, writes dates as the browser does and has no picture.

#### ✅ 22.8 — A readable export

**Goal:** a person downloads their data as one readable JSON file. **Design:** RFC 0005, "A readable export". **Depends on:** 22.7. **Replaces:** 20.2
as written.

**Technical:** a route that asks for the session, the confirmation (the derived password alone, through `ExportPanel`; a fresh core sign-in with
`prompt=login` in a suite) and serves the person's records as 20.1 selects them; the browser opens them with its keys and writes
`shopper-export-<date>.json` (the contract's head, 20.1's kinds and fields, opened). From 23.3 and 24.2, Inventory and cards are in it. With 16.26, the
contract's zip.

**Accepts when:** the file holds every list, item, product and category the person may see, readable (Inventory items and cards are added by 23.3
and 24.2, which hold their own export); no other person's email; a
wrong password downloads nothing; a request from a second person gets nothing of the first's; the server's logs hold no opened value.

**Done as, standalone (0.4.0, 2026-11-23); suite mode waits for a release:** `POST /api/account/export` (`readableExport`, `src/portability/readable-route.ts`)
takes the derived password, checks it through the package's `confirmPassword` (counted there), tries five in ten minutes per account, and serves the
session's own account's `personRecords` (the same records core's export takes) with a head, and nothing at all for a wrong password; `src/portability/readable.ts`
opens them in the browser (the group's keyring from the person's own wrapped record, a list's from their copy of its key or derived from the group's) and
writes `shopper-export-<date>.json`; `ExportSection` is Settings › Data's form, which needs the app key open. **The file holds no key and no ciphertext;** a
value that cannot be opened is `null`, counted in `unopened`, and said on the page. Deviations: **`ExportPanel` is not used,** since it is for an export a
server makes and the person downloads once, and this is made in the browser. Tests: `readable.test.ts` (a group's own list and a shared one through a link's
copy; no key in the file; the wrong app key and a changed value counted), `readable-route.test.ts` (a wrong password serves nothing and does not read
the records; **a second person gets nothing of the first's, and cannot name an account**; five tries; bad requests) and
`e2e/export.spec.ts` in Chromium and WebKit (a list and two items downloaded readable, a wrong password downloads nothing). **Suite mode (2026-11-23, on `@sovereignfs/auth` 0.7.0):** there is no password to give; the confirmation is **a sign-in at core in the last five minutes**
(`RECENT_SIGN_IN_MS`), which the route reads from `coreSignedInAt`, core's own claim for the session (`auth_time` in the ID token the package keeps) and never the app's clock or
anything the request says. An older one, or one core does not say, serves nothing and answers `SIGN_IN_AGAIN` (a sign-in dated more than a minute ahead is not trusted either), and
a password does not stand in for it; the page then says so and its button is _Sign in again_, through core with `prompt=login` and back to Settings › Data. The same five tries in ten
minutes, the same records (the session's account's, naming nothing). Tests: `readable-route.test.ts` (recent, old, never, the boundary to the millisecond, the future, a second person,
rate and bad requests) and `e2e/sovereign.spec.ts` (an hour-old sign-in refused, a password no stand-in, `prompt=login` and back, then served). The fake core says `auth_time` and
honours `prompt=login`. **Not browser-tested:** the page's button in suite mode, because the fake core does not release a key and the page stops at "your lists are locked" before it
asks the server; the route and the link it goes to are each tested. Left out: the zip (16.26, unreleased), Inventory and cards (23.3 and 24.2).

#### ✅ 22.9 — Shop mode

**Goal:** a clearer header, adding behind a button, Finish always in reach. **Design:** RFC 0005, "Shop mode". **Depends on:** 22.3.

**Technical:** the header as the list's (back, icon, name, progress); _+ Add item_ opening the add field, with _Put it straight in the basket_ off by
default; Finish in a bar fixed to the bottom with the basket's count, the list padded beneath. `src/screens/ShopScreen.tsx`.

**Accepts when:** with forty items the last is reachable above the bar on a phone; adding with the toggle on adds it bought; the network off throughout.

**Done as (0.5.0, 2026-11-23):** `src/screens/ShopScreen.tsx`'s header is back, the list's icon in its colour (`ListGlyph`) and name, and "12 to get · 3 in basket" under it,
with nothing at the right. Adding is behind **Add item**, which opens `AddField` with focus in it and closes it when the item is written or on Escape (`AddField`
gains `focused`, `onAdded` and `onEscape`; a refused add leaves it open with its reason); the checkbox _Already in basket_ is now the switch **Put it straight in the
basket**, off by default, shown with the field. **Finish shopping** is a bar at the foot with the basket's count (`3 in basket`), `position: sticky` and not `fixed`
so that it stays in its own column beside an open item, pinned to the bottom of a short page (`ItemBeside`'s wrapper fills the column) and clear of a phone's safe
area; the page has no bottom padding of its own, so the last row is above the bar and never under it. The long press and the whole-row tick are as they were.
Tests: `e2e/shop.spec.ts` in Chromium and WebKit (Add item opens and closes, the switch off by default and on adding bought, with the network cut; forty items on a
desktop and on a phone with the last row above the bar and the bar in the viewport). **The cart is Shop's icon on the list from ui 0.107.0.**

#### ✅ 22.10 — Page titles

**Goal:** every page's title says what it shows. **Design:** RFC 0005, "Page titles". **Depends on:** 22.1.

**Technical:** one hook setting `document.title` from the opened name; `Shopper` until it is opened; the server's metadata for the pages with no
encrypted name.

**Accepts when:** every row of RFC 0005's table holds for the pages that exist (Inventory's and the cards' titles come with 23.4 and 24.3), and a list opened offline titles itself once the store has loaded.

**Done as (0.5.0, 2026-11-23):** `useTitle` (`src/screens/title.ts`, with the pure `titleOf` beside it) sets `document.title` from the opened name and, when its
screen goes, puts back what it found unless the next page has already set its own, so that a list's name does not stay behind on a page whose server
title is the same `Shopper`. **No page of the signed-in area sets a server title** (the root's `Shopper` is every one's), and a page added later sets its title with the hook too. **The hook
keeps its title against Next:** Next makes the `<title>` again as it moves between routes, late when its metadata streams in, which wrote the app's name over
the browser's (seen in WebKit, intermittently, after a move from a list's settings to Settings, and once in Chromium), so a change to the head puts the title
back for as long as the screen is mounted. Used by the list (`<list> · Shopper`), shopping mode (`Shopping <list> · Shopper`), a list's settings (`Settings ·
<list> · Shopper`) and Settings (`<section> · Settings · Shopper`, by today's sections, which 22.7 renames). `docs/encryption.md` says the caveat as
running. Tests: `title.test.ts` (the table's rows) and `e2e/titles.spec.ts` in Chromium and WebKit (the title at each page, and that a name does not
outlast its page), seen to fail against the code before. **Left out:** Home's `Home · Shopper`, since `/` still drew the last list and so carried
its title; it came with 23.2.

#### ✅ 22.11 — The suite's frame

**Goal:** the header, sidebar and phone's footer are the design system's, with the launcher in a suite. **Design:** RFC 0005, "The frame". **Depends
on:** 22.3, 16.20 to 16.24.

**Technical:** `AppFrame` with `Header` (Shopper's wordmark; launcher in a suite, the bell when 9.2 lands, the avatar), `AppSidebar` (Home, Inventory,
Loyalty cards; My lists with _New list_; Shared with me), `MobileFooter` (Home, the lists drawer by its own name, Loyalty cards), the header's button
opening the same drawer; no launcher on a phone. The launcher's apps from 16.23, kept on the device. `src/ui/AppShell.tsx`, `SidebarToggle.tsx`,
`sidebar.ts`, `useSidebar.ts`, `mobile-nav.tsx` and `src/screens/AppSidebar.tsx`, `PhoneFooter.tsx` deleted or reduced to Shopper's content. Inventory
and Loyalty cards link to their pages once 23.4 and 24.3 land.

**Accepts when:** the sidebar's three states are remembered per kind of page; the rail shows list icons; the phone's footer and header reach the same
places by the same addresses as the sidebar; the launcher lists a suite's apps and is absent alone and on a phone; the `no-fork` test passes.

**Done as (0.6.0, 2026-11-24, on ui 0.107.0), with the owner's word on the launcher's scope:** `SignedInFrame` (`src/frame/SignedInFrame.tsx`) is `AppFrame`
with Shopper's wordmark (`Wordmark`, a link home), the blocks (`blocksOf`, pure, from the places the device holds: **Home**; **My lists** with its icon in its colour, the open count and
_New list_; **Shared with me** with whose it is under its name; **Archived** when asked), the avatar's menu and, on a phone, the design system's footer and drawer. Rows are Next's `Link`.
**_New list_ is a dialog** (`NewListDialog`), since a rail has no room to type in and the drawer would close under the keyboard. **The archived toggle is under the blocks, not a row of
one** (`ArchivedToggle`): the design system's rows close the phone's drawer on any click, and listing lists is not going anywhere (a gap for `sovereign`: a row that only expands
something). A page for no one in particular (the front page, a page not found, the shell when it does not know who is signed in) is `PlainFrame`: the design system's `Header` with
the wordmark, and the page. **Deleted:** `AppShell`, `SidebarToggle`, `sidebar.ts` (with its test: the rules are the design system's, tested there), `useSidebar`, `mobile-nav`,
`ShellFrame`, `screens/AppFrame`, `AppSidebar`, `ListsNav` and `PhoneFooter`; `no-fork.test.ts` no longer lists a Shopper file that asks for a width. **The sidebar's remembered choices are
carried across once** from `shopper.sidebar` to the design system's `sv.sidebar.shopper` (same shape; `migrateSidebar`, never over a choice already made). **The footer** is Home, the lists'
drawer by its own name and, **until the loyalty cards have a page (24.3), Settings** (the design system's footer needs one icon each side); Inventory and Loyalty cards join the sidebar and the
footer with 23.4 and 24.3; the footer is not drawn in shopping mode, which has the whole screen. The item's right column stays where the list and shopping mode place it (`ItemBeside`), not in
the frame's `detail`. Tests: `blocks.test.ts`, `migrate.test.ts`, `page-kind.test.ts`, and `lists`, `list`, `phone`, `settings`, `share`, `invite` and `sovereign` specs for the new headings
(_My lists_, _Shared with me_), the dialog, the toggle, the drawer's name and the footer. **The launcher** (suite mode only; `ShopperLauncher`, in the header at the right of the frame, never on a phone): the design system's `AppsLauncher` over the apps core lists for the person,
`GET /api/account/apps` asking `listMyApps` through the SDK **as the session's own person with their own refresh token** (the request names no one; any failure at core, a core that lists no
apps or a person with no token yet is `{ apps: null }`, which leaves what the device had), held to what a page may draw by `tilesOf` (a name is a line; **an icon is only an address on core's own
origin**, else the app's first letter; an address to open is `http` or `https` and never `javascript:`; Shopper itself is left out) and **kept on the device per account** (`shopper.apps.<account>`,
held to the same on the way out, gone at sign-out with the rest of the person by `forgetIdentity`), so that it opens with no network, the offline shell included (when the key comes from core).
**The owner chose (2026-11-24) to add `offline_access` to Shopper's scopes** (`SOVEREIGN_SCOPES` and the manifest, which a test holds to each other) so that the person's refresh token exists:
the SDK keeps it sealed under `SHOPPER_ENCRYPTION_KEY` (`sdkTokenStore`), it asks for no capability of its own, **an operator allows the scope in the Console before the new version starts (core refuses a sign-in that asks for one the app is not allowed, `invalid_scope`, and Shopper's retry would be refused again), and a person signed in
before gets the launcher after their next sign-in at core**. The fake core issues a refresh token for `offline_access`, rotates it as core does (and counts one used twice), says `apps` in its
instance document and lists what a test sets. Tests: `launcher-apps.test.ts`, `identity.test.ts` (sign-out takes the apps with the rest, and not another account's), `e2e/sovereign.spec.ts` (the
list, the app it is in and an address that is no address left out, an icon from another site not drawn, the refresh token used and never twice, none on a phone, the device's list when core
is out of reach, gone at sign-out, a signed-out request refused; **and as a second person:** the fake answers per person, so what core lists for one is never shown to another from the same
browser, and five requests at once, with nothing cached, spend no token twice), `src/auth/sdk-stores.test.ts` (**the token store's lease,** seen to fail with the lease taken out: three
renewals of one person at once ran together) and `e2e/frame.spec.ts` (alone: no launcher and no route). **A token's life:** the SDK has one renewal in flight per person in a process (so the
burst above passes with or without Shopper's lease, and guards that and the one client per process), and `sdkTokenStore`'s lease is what holds across processes; the token is sealed at rest,
deleted by `People.deletePerson` (seeded in `people.test.ts`), by core's account-deleted notice and by a logout notice that names no session, and is **not in any export**. **Signing out
leaves it** (the SDK ends the session, not the token, and signing out is local): a standing credential at rest, sealed, until the person signs in again or is deleted. Whether sign-out should
delete it is the owner's call. **Left out:** the Inventory and Loyalty cards rows, the footer's Inventory and cards buttons (23.4, 24.3) and the bell (9.2). **Not set by a floor:** an older core lists no `apps` and the launcher is not drawn;
the manifest's `core` floor is the owner's call (the platform's 0.141.0 lists the apps, 0.140.0 opens the sign-up, 0.142.0 has `coreSignedInAt`).
