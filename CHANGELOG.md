# Changelog

All notable changes to Shopper are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

Each version's section is also its GitHub release notes. It is written in the change that sets the version, dated that day, and a promotion
titled `Release vX.Y.Z` is refused without it (RELEASING.md).

## [0.7.0] - 2026-11-24

### Added

- **Home** (RFC 0006): Shopper now opens on Home and not on the last list. **Continue** is the list you used last, with how many items are open on it (a new account's is its
  _Groceries_, with what to do first); below it is a tile for every list, yours first and then those shared with you, with its icon in its colour, how many are open, whose it is
  when someone shared it, and who is on it. Archived lists are behind a toggle. **At a glance** says how many items are open across your lists, how many you ticked in the last week
  and what you buy most. All of it is worked out on your device, so it is there with no network. Someone who has just accepted an invitation still goes straight to that list.

### Changed

- **Under the hood, nothing to see yet:** Shopper's server and your device can now hold your **Inventory** (RFC 0006), the library of what you buy that Home and the add field will use. It is yours
  alone: no one on a list you share can reach it, and it is deleted with your account. A new setting, `SHOPPER_LIMIT_INVENTORY_ITEMS` (default 5000), says how many items it can hold. When your
  lists are kept encrypted on your device, so is your Inventory: your device encrypts it under keys of its own, which no link to a list ever carries, and the server holds only what it
  cannot read. That encryption is not yet audited.

### Fixed

- **The sidebar marks Home as the page you are on** when you are at the front address, and remembers how you left the sidebar there as its own kind of page. The front address was
  being taken for a page of its own with no name, so neither happened.

## [0.6.0] - 2026-11-24

**Before upgrading, hosted by Sovereign: allow `offline_access` for Shopper first.** Shopper now asks Sovereign for it, so that it can ask which apps you may open as you. In the
Console, open Shopper's **Technical settings** and allow it (or register the manifest again) **before** the new version starts: Sovereign refuses a sign-in that asks for a scope the
app is not allowed (`invalid_scope`, and no one can sign in) until it is. Someone already signed in gets the launcher after their next sign-in at Sovereign. No other scope is asked for.
Shopper alone, with its own accounts, is not affected.

### Added

- **The apps you may open**, hosted by Sovereign: a launcher at the right of the header (on a wide screen) lists them, from what Sovereign says, and opens with no network from what your
  device kept; it is gone when you sign out. It needs Sovereign 0.141.0 or later to list anything; before that there is no launcher.

### Changed

- **The frame is the suite's** (RFC 0005): the header, the sidebar and the phone's footer are the design system's, the same as in the other apps. The sidebar has **Home**, then
  **My lists** (each with its icon in its colour and how many items are open, and _New list_) and **Shared with me** (with whose each is under its name); it is full, a rail of
  icons or hidden, as you left it for that kind of page on this device, and what you had chosen before is kept. **_New list_ asks for the name in a dialog.** Archived lists are behind
  a toggle under the lists. On a phone the footer is Home, the lists' drawer and Settings, and the header's button opens the same drawer; shopping mode has no footer, as before.
  _Your lists_ is now _My lists_, and _Shared with you_ _Shared with me_.

## [0.5.0] - 2026-11-23

### Fixed

- **Signing in through Sovereign checks the signature of the ID token** Sovereign returns, against the keys it publishes (`@sovereignfs/sdk` 2.11.1). Before, an ID token
  signed with any key was believed, so someone able to answer for Sovereign's token endpoint could have signed a person in as anyone. Nothing to do but update.

### Added

- **A list's icon and colour** (RFC 0005): choose them in a list's settings, under Appearance. The icon is drawn in the colour before the list's name in
  its header, in the sidebar (the narrow sidebar shows it in place of the letter) and in the phone's drawer. Both are encrypted on your device as the
  list's name is (the suite's encryption is not yet audited), and a list you never gave either shows a cart and blue. Clearing the colour puts the blue back. There are icons for a shop, hardware, electronics, clothing, a gift, the garden, the office, the pharmacy, a baby, a pet and home as well as groceries.
- **Every page has its title** (RFC 0005): a list is `<list> · Shopper`, shopping mode `Shopping <list> · Shopper`, Settings `<section> · Settings · Shopper` and
  a list's settings `Settings · <list> · Shopper`. A list's name is encrypted, so your browser sets the title once it has opened the name, and until then
  it is `Shopper`. A browser keeps titles in its history, and a history it syncs leaves the device with them: the one way an opened name leaves Shopper
  (`docs/encryption.md`).

### Changed

- **Create an account**, hosted by a Sovereign instance, opens Sovereign's sign-up and not its sign-in (`prompt=create`). **This needs Sovereign 0.140.0 or later**:
  an older one shows its sign-in, where there is no way to make an account.
- **Settings is a dialog** (RFC 0005), over the page you opened it from (or over Home when you open its address), with four sections, each at its own address:
  **Profile** (`/settings/profile`), **Security**, **Preferences** and **Data**. Sign-in and Encryption are in Security; This device and Notifications are in
  Preferences, which also has how a list shows its items by default and, running alone, **Appearance** (light, dark or your system's) and your **time zone and
  language**, which dates are written in. The old addresses
  (`/settings?section=…`) go to the section that took their place. Hosted by a Sovereign instance, Profile is who Sovereign says you are, with its picture (also in the
  header), and Security, Preferences and deleting your account link to Sovereign, which owns them.
- **A list's settings are a dialog over the list** (RFC 0005), opened from the list's menu: **General** (its name, icon and colour) and **Archive and delete**, each at
  its own address (`?settings=general`, `?settings=archive`), so Back closes it and a link opens it, with no network too. On a phone it is the whole screen.
  `/l/<id>/settings` goes to it.
- **An item opens beside its list** (RFC 0005): tap an item's row, or its pencil, and it opens in a column at the right of the list, which stays where it
  is, so that you can open another beside it; on a phone, and wherever the list would be squeezed, it is a page of its own, with a back arrow on a phone. There
  is no Save: each field is kept as you leave it, and what you were typing when you press Escape or go Back is kept too, on your device, with no network. A tap on a row no longer does nothing and a long press on a list no longer opens the item; the checkbox alone ticks,
  and shopping mode is as it was.
- **Shopping mode** (RFC 0005): the header has the list's icon and name with how many are left to get and in the basket; adding is behind **Add item**, which
  opens the field and closes it when the item is added or you press Escape, and _Already in basket_ is now the switch **Put it straight in the basket**, off by
  default; **Finish shopping** is a bar at the foot of the screen, with what is in the basket, that you can always reach, and the last item is never under it.
- **A list's header** (RFC 0005): **Shop** is first and stands out, with its label on a phone too, and shows only while something is left to buy; **Share**
  and the list's menu follow, all three of one height, with the menu's dots in line with the right edge of the items below.

## [0.4.0] - 2026-11-23

**Before upgrading:** an instance set up with both a Sovereign core and its own accounts (`SHOPPER_CORE_*` and `SHOPPER_AUTH_LOCAL=1`) now signs
people in through Sovereign only, and says so once when it starts, naming the settings to remove. A person who signed in there with a password
cannot any more: a Sovereign sign-in is never matched to a password account by its email, so through Sovereign they get a new, empty account.
Before upgrading such an instance, have each of them move what they keep to an account they reach through Sovereign. An instance set up one way
changes nothing.

### Added

- **Download my data** (Settings › Data): your lists, items, products and categories, and the people on your lists by name, as one readable `.json` file made
  on your device. It is not encrypted, and it holds none of your keys. Running alone you type your password again first; **hosted by Sovereign you sign in
  there again** if your last sign-in was more than five minutes ago, and come back to Settings.

### Changed

- **One way in** (RFC 0005): hosted by a Sovereign instance, Shopper signs people in through it only, and its `/sign-in` and `/sign-up` send the
  browser there at once, keeping an invitation's page through the round trip. Coming back from Sovereign with a failure shows the reason and
  **Try again**, once, and Sovereign that cannot be reached is said so, not shown as an error. The front page's button says **Sign in with
  Sovereign**.
- Running alone, sign-in, sign-up and the password reset are the design system's forms, as Sovereign's own are; sign-up and a new password ask for
  the password twice. The recovery kit after a reset is still Shopper's, in the same card.

## [0.3.0] - 2026-11-22

**Before upgrading:** take a backup. Every session open at the upgrade ends, and each person signs in once more: with a password, which opens
their lists as at any sign-in, or through Sovereign, whose core gives their keys again. `SHOPPER_CORE_URL` is the instance's own address with no
path (`https://sovereign.example.com`); one ending in `/api/auth` now stops Shopper at start, naming the variable. The core it is registered with must
let it come back to `/sign-in` after signing out (the manifest's `postLogout`). The move of the sign-in's tables happens by itself at the first start
and cannot be undone: an older Shopper cannot read them after it.

### Changed

- **Sign-in is the suite's `@sovereignfs/auth`** (ADR 0001), not better-auth configured by hand: the same rules as Sovereign itself and every app,
  and its tables. A password 0.1.0 stored still moves across at its next sign-in, for 90 days after the upgrade.
- **Signing in through Sovereign** follows the person's Sovereign session: an hour after it was last checked, it is checked again on the next page,
  and ends if they have signed out there. Signing out of it goes through Sovereign, which decides whether it signs them out there too. A notice from
  Sovereign that one of its sessions ended ends only the sessions that came from it.
- Signing in with an address not yet confirmed no longer sends another link by itself; the sign-in page offers **Send the link again**.
- A sign-up refused because sign-up is closed is answered with 422, the package's answer, rather than 403.

## [0.2.1] - 2026-11-22

**If you sign in through a Sovereign core:** in 0.2.0 nothing of yours was encrypted on your device, and core never showed you a recovery kit. Open
Shopper once after upgrading and choose **Unlock**: core shows your recovery kit the first time, and your lists are then encrypted as 0.2.0
describes. Until then they stayed sealed by the server's key, as in 0.1.0. Accounts with a Shopper password were not affected.

### Fixed

- An account that signs in through a Sovereign core gets its key from core. 0.2.0 looked for the account's identity at core where it is never
  recorded, so it asked core for no key and encrypted nothing.

## [0.2.0] - 2026-11-22

**Before upgrading:** take a backup. Shopper now needs a Sovereign core of 0.126.0 or later when it is hosted. Every person who signs in with a password
signs in once more as before, and their password then moves across, once; they are shown a recovery kit. Open Shopper once with each account whose
lists should be encrypted. Encryption is the suite's and is **not yet audited**.

### Added

- **What you write is encrypted on your device,** with keys only the people on each list hold: a new account's lists from their first item, and an
  account's own lists from 0.1.0 the first time they are opened. The server stores what it cannot read. Lists that were already shared in 0.1.0 stay
  sealed by the server's key, as before, until each person on them can be given its key; Settings › Encryption says which is which.
- The server is never sent your password: your browser sends a value derived from it. A recovery kit is shown once after signing up, and opens your
  lists if you forget your password. Through a Sovereign core, core keeps your key.
- **Each list has keys of its own.** A link to an encrypted list carries that list's key and no other, after `#`, which a browser never sends:
  someone you share one list with cannot open your other lists, even from a copy of the database. An item moved to another list is encrypted again for
  it.
- Notifications on a device where Shopper is not open, when its operator sets `SHOPPER_VAPID_PRIVATE_KEY` (Settings › Notifications): for now, when
  someone joins a list you share. A notification never names a list or an item.
- A person's export from a Sovereign core now includes what Shopper holds of them.

- Opened from Sovereign's launcher, or from any link to it, an installed Shopper now opens as itself on desktop Chrome and Edge and on Android Chrome, on the page the link names, rather than in a browser view. On an iPhone, an iPad and in Safari the link opens a browser view, as before.
- Added to an iPhone's Home Screen from Safari, it opens as an app without Safari's bars, under its own name.
- The bar around an installed Shopper takes the page's own colour in light and in dark, as the suite's other apps do.

### Fixed

- **Sharing a list shares that list and nothing else.** Before, someone given a link to one list saw every list of the household. Each list now has its
  own people, invited, removed and leaving list by list. People already sharing a household keep every list they had; a list made after is yours
  alone until you share it. Links made before this, to a household as a whole, are revoked: make a new one from the list.
- **Each list keeps its own catalog.** Adding something on a shared list never finds or changes a product of another of your lists; a name you use
  elsewhere still comes as a suggestion, with its quantity, unit and aisle.

### Changed

- **The lists are yours and shared with you, never a household's.** The sidebar shows _Your lists_ and _Shared with you_, each shared list with whose
  it is; Share is on a list, and the invitation page says whose list it is. No screen speaks of a household.
- **A list reads better on a phone:** its name stays on one line, Share is its icon, and an item's quantity and note sit under its name, which wraps
  between words.

- Shopper's service worker is now the one every app of the suite runs (`@sovereignfs/pwa`). With no connection, a page that is not kept on the device
  says it needs one from inside Shopper, and a page that takes more than eight seconds to load opens from what is kept. What is kept is unchanged:
  never anything of a person.
- Shopper now needs a Sovereign core of 0.126.0 or later when it is hosted, and declares manifest 5, with `encryption` (core releases its key) and
  `signIn.export`.
- The referrer the browser sends from Shopper is its origin alone, so that core releases its key without asking each time.
- An account signed in through a page from before this version is asked to update it.

### For developers

- `pnpm dev` no longer writes into `AGENTS.md`, and the README says how to make a `.env` that starts the app on a SQLite file.

## [0.1.0] - 2026-11-11

### Added

- A list: items by aisle in the household's order, tick with Undo, a drag or the keyboard to reorder, Bought and Clear bought, the empty state with what is bought often, list settings (rename, archive, delete for good), and the front address opening the list used last.
- Adding: a field at the top of a list that suggests as you type from what the household buys and the starter catalog, bumps what is already on the list instead of doubling it, and stays focused for the next item.
- An item's dialog, opened by a pencil on its row: name, quantity and unit, category, icon, note, list, and Remember for next time, with Delete and Undo. It works with no network.
- The phone: a footer with Lists and Settings, a way back to the lists from a list, a long press on a row to edit it, and larger touch targets.
- Shopping mode, from a list's Shop button: large rows in aisle order, a tick dropping the item into the basket with Undo, Already in basket when adding, a long press for the item, Finish shopping offering to clear what was bought, the screen kept on, and a pull every ten seconds. It works with the network cut once open.
- Opening offline: after a first visit, a list, its settings, the front address and shopping mode open with no network from the kept shell, show their items and take changes that sync when the network returns. Signing out forgets who was signed in on the device.
- Invitations by link: any member can make a link, good for 14 days and one use, that someone opens, signs in or makes an account through, and joins the household by accepting. Links can be revoked by whoever made them or an Admin, and at most 20 wait at once.
- Leaving and removing: a member can leave a household, and its Admin can remove a member; the household goes from their devices at the next sync, and what they added stays under their name, shown as left. The only Admin cannot leave.
- Sharing: a Share dialog on every list and under each household in the sidebar. It lists the people (addresses only for an Admin), makes a link shown once with Copy, lists the links waiting with Revoke, and lets a Member leave and the Admin remove a Member.
- Sign-in through a Sovereign core is held by tests against a fake one. An account made through core is made whatever the sign-up setting says, and a core login whose address is a local account's is refused with a sentence, making and touching nothing.
- Core's notices: a Sovereign core signing a person out ends their sessions here, and one telling Shopper the person deleted their account removes everything personal of them, leaving every household they shared whole. Both are checked, rate limited and cannot be replayed.
- The image and how to run it: one Docker image, three setups (an sqld service, a SQLite file, PostgreSQL), a manifest an instance reads to host it, and a check that brings each up from nothing.
- Documents: the README (running it in each database form, every setting, what open sign-up means, what encryption at rest does and does not protect), what needs a network, what sharing does and does not do yet, and how a release is made.
- Fixed: a member of a household could put another member's name on what they added or ticked. The server now accepts only the sender's own name for either.
- The security review of 0.1.0, and a correction: the sign-in database holds each account's name and email address in plain text, which the documents now say.
- On a list, only the checkbox ticks an item: a tap anywhere else on its row does nothing. Shopping mode is unchanged, and still ticks from anywhere on the row.

[0.2.0]: https://github.com/sovereignfs/shopper/releases/tag/v0.2.0
[0.1.0]: https://github.com/sovereignfs/shopper/releases/tag/v0.1.0
