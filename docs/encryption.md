# Encryption

> **Not yet audited.** Shopper uses the Sovereign suite's encryption (`@sovereignfs/sdk`), whose design has not yet been reviewed by a cryptographer and
> whose code has not been audited. Nothing here says your data is proven safe.

## What is encrypted, and by whom

**What you write into Shopper is encrypted on your device, before it is sent,** with a key only the people in your household hold: the names of lists,
items and products, and notes. The server stores and syncs what it cannot read, and merges changes without opening them. This is the design of
[RFC 0001](rfcs/0001-encryption-the-server-cannot-read.md) and `DESIGN.md` §13.

- **A new account's household is encrypted from its first item.** When you sign in, your device makes the household's keys and moves anything the
  server held before (a 0.1.0 household), once.
- **A household with more than one person in it is not encrypted yet.** Its other members could not be given its keys: with accounts of Shopper's own,
  not until Sovereign lets an app share keys between its own people; with accounts from a Sovereign core, not until Shopper keeps core's token. Until
  then the server keeps it sealed with its own key, as 0.1.0 did, and **Settings › Encryption** says which of your households is which.
- **Joining by a link** gives you the household's keys: they travel in the link itself, after `#`, which a browser never sends to a server. Send a link
  privately: whoever opens it first can join.
- **Removing someone does not change the household's keys yet.** They stop receiving anything from the server at once, but someone who kept the keys
  and also got a copy of the database could read what is added after. A new key for those who remain comes when it can be sealed to each of them.

**Still readable by the server:** who is in which household, how many lists and items there are, quantities and units, when something was ticked, and
sizes; a person's name and email address (mail and the invitation page need them); and an invitation's email. Those are sealed at rest with the
server's own key, `SHOPPER_ENCRYPTION_KEY` (below), as is anything of a household not encrypted yet.

## Your key

- **With a password** (an account of Shopper's own): your keys are kept on the server wrapped, and only your password, turned into a key on your
  device, opens them. **The server is never sent your password**: your browser sends a value derived from it. You are shown a **recovery kit** once,
  after signing up. If you forget your password, the kit is the only way back to your lists; with neither, they are gone for good, unless someone else
  in the household still has them.
- **Through a Sovereign core:** core keeps your key, and its passkeys, recovery kit and owner recovery work for Shopper as for every encrypted app.
- **On a device:** the key opens once per session and is kept wrapped by a secret only that session has; signing out forgets it. With no network, your
  lists still open from what the device kept; what you change is sent, encrypted, once the key opens again.

## What it protects against, and what it does not

- **It protects** what you write from someone who reads the server: a copied database, a backup, a stolen disk.
- **It does not protect** against whoever runs the server, which sends the app your browser runs and could send a changed one. Nor the device: a
  signed-in browser holds your lists as you see them until you sign out. Nor the people you share a household with: they see all of it.
- **Logs** hold ids and kinds of failure, never a name, a note or an address.

## The server's key

`SHOPPER_ENCRYPTION_KEY` is still required: it seals what the server holds itself (names and emails of people, households not encrypted yet, core's
token). Make it once (`openssl rand -base64 32`) and keep it with your secrets, **apart from the database backups**. A lost key means what it seals
cannot be read. To change it, put the new key in `SHOPPER_ENCRYPTION_KEY` and the old one in `SHOPPER_ENCRYPTION_KEY_PREVIOUS`, start the server once
(it moves what is stored to the new key), then remove the old one.

The sessions' secret, `SHOPPER_AUTH_SECRET`, is a different thing: it signs sessions and tokens, and changing it only signs everyone out.
