# Encryption

> **Not yet audited.** Shopper uses the Sovereign suite's encryption (`@sovereignfs/sdk`), whose design has not yet been reviewed by a cryptographer and
> whose code has not been audited. Nothing here says your data is proven safe.

## What is encrypted, and by whom

**What you write into Shopper is encrypted on your device, before it is sent,** with **keys of each list's own**, held only by the people on that list:
the names of lists, items and products, and notes. The server stores and syncs what it cannot read, and merges changes without opening them. This is
the design of [RFC 0001](rfcs/0001-encryption-the-server-cannot-read.md), [RFC 0004](rfcs/0004-lists-of-their-own.md) and `DESIGN.md` §13.

- **A new account's lists are encrypted from their first item.** When you sign in, your device makes your keys and moves anything the server held
  before (0.1.0's lists), once. Each of your lists has its own key, worked out on your devices from yours; nobody else holds yours.
- **Sharing a list by a link** gives that list's key, and no other: it travels in the link itself, after `#`, which a browser never sends to a server.
  Someone you share Groceries with cannot open anything of your other lists, even from a copy of the database. Send a link privately: whoever opens it
  first can join.
- **Lists that were shared before they could move are not encrypted yet** (a 0.1.0 household with more than one person in it): the others could not
  be given keys without a link. The server keeps them sealed with its own key, as 0.1.0 did, and **Settings › Encryption** says which of your lists
  are which.
- **Removing someone from a list does not change that list's key yet.** They stop receiving anything from the server at once, but someone who kept the
  key and also got a copy of the database could read what is added to that list after. A new key for those who remain comes later.

**Still readable by the server:** who is on which list, how many lists and items there are, quantities and units, when something was ticked, and
sizes; a person's name and email address (mail and the invitation page need them); and an invitation's email. Those are sealed at rest with the
server's own key, `SHOPPER_ENCRYPTION_KEY` (below), as is any list not encrypted yet.

## Your key

- **With a password** (an account of Shopper's own): your keys are kept on the server wrapped, and only your password, turned into a key on your
  device, opens them. **The server is never sent your password**: your browser sends a value derived from it. You are shown a **recovery kit** once,
  after signing up. If you forget your password, the kit is the only way back to your lists; with neither, they are gone for good, unless someone you shared
  a list with still has it.
- **Through a Sovereign core:** core keeps your key, and its passkeys, recovery kit and owner recovery work for Shopper as for every encrypted app.
- **On a device:** the key opens once per session and is kept wrapped by a secret only that session has; signing out forgets it. With no network, your
  lists still open from what the device kept; what you change is sent, encrypted, once the key opens again.

## What it protects against, and what it does not

- **It protects** what you write from someone who reads the server: a copied database, a backup, a stolen disk.
- **It does not protect** against whoever runs the server, which sends the app your browser runs and could send a changed one. Nor the device: a
  signed-in browser holds your lists as you see them until you sign out. Nor the people you share a list with: they see all of that list.
- **Logs** hold ids and kinds of failure, never a name, a note or an address.

## The server's key

`SHOPPER_ENCRYPTION_KEY` is still required: it seals what the server holds itself (names and emails of people, lists not encrypted yet, core's
token). Make it once (`openssl rand -base64 32`) and keep it with your secrets, **apart from the database backups**. A lost key means what it seals
cannot be read. To change it, put the new key in `SHOPPER_ENCRYPTION_KEY` and the old one in `SHOPPER_ENCRYPTION_KEY_PREVIOUS`, start the server once
(it moves what is stored to the new key), then remove the old one.

The sessions' secret, `SHOPPER_AUTH_SECRET`, is a different thing: it signs sessions and tokens, and changing it only signs everyone out.
