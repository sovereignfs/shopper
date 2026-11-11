# Changelog

All notable changes to Shopper are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

Each release's section is also its GitHub release notes: the release workflow reads this file when a release is cut. Write the notes under
`## [Unreleased]` as you go; a release turns them into the version's section.

## [Unreleased]

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
