# Working with no network

Shopper is made for a basement with no signal. This says what works, what needs a connection, and where it stops.

## What works with no network

- **Opening it.** After you have opened Shopper once on a device, it opens with no network: the front address, a list, a list's settings and shopping mode. A page
  that needs the server (the account's Settings, signing in) says so and changes nothing.
- **Everything on your lists.** Adding, with suggestions; ticking and unticking; editing an item's name, quantity, unit, category, icon and note; reordering; making,
  renaming, archiving and restoring lists; _Clear bought_ and _Undo_; shopping mode and _Finish shopping_.
- **Changes are kept on the device and sent when it can.** Nothing waits for the network and nothing asks about a conflict. When two people change the same item,
  each field's later change wins; the first tick stands; and the same thing added twice becomes one.

## What needs a network

These are decided by the server at once, so they are never queued:

- **Signing in, and the first load on a device.** A device has nothing until it has been signed in and has loaded your households once.
- **Sharing:** making an invitation link, revoking one, leaving a household and removing someone from it. Opening a link and accepting it.
- **Deleting a list for good**, which only an Admin can do, and only for an archived list.
- **Your account's Settings** and deleting your account.

Each says so when there is no network and changes nothing. If a change the server refuses was made offline (a list deleted for good by an Admin while you were
adding to it), it is not thrown away: it goes to _Couldn't sync_, where you can move it to another list or discard it.

## What cannot be hidden

- **On an iPhone, sync happens only while Shopper is open.** Safari has no way to wake a web app in the background, so changes made while it was closed are sent the next time you open it.
- **A browser can delete what a site stores.** Shopper asks the browser to keep its data (_Settings_, _This device_, says whether it agreed), but a browser that is short
  of space may still clear it. Changes that were not sent yet would be lost; ones that were are on the server.
- **A shared computer holds a signed-in person's lists until they sign out.** Signing out deletes the copy on that device, and says first if some changes have not been sent.
- **Everyone in a household sees and edits every list in it.** That is how sharing works ([`sharing.md`](sharing.md)).
- **Names and notes are plain text on your device** while you are signed in. They are encrypted on the server ([`encryption.md`](encryption.md)).
