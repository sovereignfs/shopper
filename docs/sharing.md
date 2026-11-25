# Sharing

## What sharing does

**A list is what you share, and nothing else.** Each list has its own people. Share your Groceries list and the people you invite see and change
Groceries: not your other lists, their items or who else you share them with. In the sidebar, **Your lists** are the ones you made, and **Shared with
you** the ones others shared with you, each with whose it is under its name.

People who shared a household in 0.1.0 keep every list they had then; a list made after that is yours alone until you share it.

## Inviting

_Share_, on a list, opens the sharing dialog. **Make a link** gives one, shown once with _Copy_:

- **Anyone who holds the link can join the list**, whatever address it was meant for. Send it the way you would send anything private.
- It **expires in 14 days**, can be used **once**, and can be **revoked** by whoever made it, or the list's Admin, from the list of links waiting. It is
  stored only as a hash, so it cannot be shown again: make another to share again. A list can have at most 20 waiting.
- A person with no account follows the link, makes one (if the server allows it: `SHOPPER_AUTH_SIGNUP`, in the [README](../README.md)) or signs in,
  and joins. **People join only by accepting; nobody is added.** The link's page shows only who invited, and says the same for a link that has expired,
  been used or been revoked.
- Links made before lists were shared one by one were to a household as a whole, and were revoked: make a new one from the list.

## People and roles

- Whoever made a list is its **Admin**. Everyone who joins it is a **Member**. There is no read-only role.
- **Members and the Admin** can do everything to do with shopping on the list: rename, archive and restore it; add, edit, tick and delete items;
  invite; leave.
- **Only the Admin** can remove someone from the list, revoke someone else's link, and delete the list for good. **The Admin cannot leave** a list
  others are on.
- **What a person added stays when they leave or are removed**, under their name, shown as "added by Sam (left)". It is never deleted with them.
- **Deleting your account** removes everything personal of yours: your sign-in, your email, your sessions. A list nobody else is on is deleted; a
  shared list you made passes to whoever has been on it longest, who becomes its Admin. Your name stays on what you added.

## What others see of you

- Your **name**, on what you added and ticked, and in the people of the lists you share.
- Your **email address**, only to the Admin of a list you are on (so an Admin can tell who is who), and to yourself. A Member sees no one's address but
  their own.
- Nothing else of you. The server's logs hold no names, items, lists or addresses.

## What it does not do yet

Roles beyond Admin and Member; inviting by email; trips, shops and prices. [`ROADMAP.md`](../ROADMAP.md) has the order.

**Loyalty cards** are shared the way lists are, one card at a time. Open a card and choose **Share** (only its Admin, the person who added it, can): make a
link, send it any way you like, and whoever accepts it has that card and **nothing else of yours**: no list, no other card, nothing of what is in your Inventory.
The link carries the card's key and no other, after the `#` in the address, which no browser sends to a server. It is shown once, works for one person, and
expires in 14 days; you can revoke a link that has not been used, and remove someone from the card, which takes it from their devices. Someone who has a card
can leave it. **Sharing a list shares no card.** A card shared with a person is not changed when they go: what they saw of it stays what they saw, and its
key is not changed yet, which comes later for lists and cards together. Deleting a card takes it from everyone. **A card linked to a list** (in the list's settings, by its Admin) opens from shopping mode with one tap, only for the people who are on both the list and the card: someone who has the list and not the card sees no button, and cannot tell the card is there. **Your Inventory**, your own library of what you buy, **is shared with nobody**: the people on a
list you share see the names of the categories its items use, and nothing else of it.

Each list has its own catalog, the products it remembers: what someone adds on a list you share never finds or changes a product of another of your
lists. A name you use on another list still comes up as a suggestion.
