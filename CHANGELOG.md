# Changelog

All notable changes to Shopper are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

Each version's section is also its GitHub release notes. It is written in the change that sets the version, dated that day, and a promotion
titled `Release vX.Y.Z` is refused without it (RELEASING.md).

## [0.2.0] - 2026-11-21

**Before upgrading:** take a backup. Shopper now needs a Sovereign core of 0.126.0 or later when it is hosted. Every person who signs in with a password
signs in once more as before, and their password then moves across, once; they are shown a recovery kit. Open Shopper once with each account whose
lists should be encrypted. Encryption is the suite's and is **not yet audited**.

### Added

- **What you write is encrypted on your device,** with a key only your household holds: a new account's lists from their first item, and an account's own
  household from 0.1.0 the first time it is opened. The server stores what it cannot read. A household with more than one person in it stays sealed by
  the server's key, as before, until each of them can be given its key; Settings › Encryption says which is which.
- The server is never sent your password: your browser sends a value derived from it. A recovery kit is shown once after signing up, and opens your
  lists if you forget your password. Through a Sovereign core, core keeps your key.
- A link to an encrypted household carries its keys, after `#`, which a browser never sends.
- Notifications on a device where Shopper is not open, when its operator sets `SHOPPER_VAPID_PRIVATE_KEY` (Settings › Notifications): for now, when
  someone joins your household. A notification never names a list or an item.
- A person's export from a Sovereign core now includes what Shopper holds of them.

- Opened from Sovereign's launcher, or from any link to it, an installed Shopper now opens as itself on desktop Chrome and Edge and on Android Chrome, on the page the link names, rather than in a browser view. On an iPhone, an iPad and in Safari the link opens a browser view, as before.
- Added to an iPhone's Home Screen from Safari, it opens as an app without Safari's bars, under its own name.
- The bar around an installed Shopper takes the page's own colour in light and in dark, as the suite's other apps do.

### Fixed

- **Sharing a list shares that list and nothing else.** Before, someone given a link to one list saw every list of the household. Each list now has its
  own people, invited, removed and leaving list by list. People already sharing a household keep every list they had; a list made after is yours
  alone until you share it. Links made before this, to a household as a whole, are revoked: make a new one from the list.

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
