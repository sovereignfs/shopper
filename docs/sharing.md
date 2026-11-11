# Sharing

## What sharing does

**A household is the unit of sharing.** Everyone in a household sees and edits **every list** in it: sharing is not per list. Every account has a household of its own,
made with it and shown to you as _My lists_ (and to the people in it as "Ada's lists"). You share by inviting people into it.

To keep a list private beside shared ones you would make a second household and move the list into it. **0.1.0 cannot do that yet** (several households, naming them and
moving a list between them arrive in 0.2.0).

## Inviting

_Share_, on a list and under a household in the sidebar, opens the sharing dialog. **Make a link** gives one, shown once with _Copy_:

- **Anyone who holds the link can join**, whatever address it was meant for. Send it the way you would send anything private.
- It **expires in 14 days**, can be used **once**, and can be **revoked** by whoever made it, or an Admin, from the list of links waiting. It is stored only as a hash,
  so it cannot be shown again: make another to share again. A household can have at most 20 waiting.
- A person with no account follows the link, makes one (if the server allows it: `SHOPPER_AUTH_SIGNUP`, in the [README](../README.md)) or signs in, and joins. **People join
  only by accepting; nobody is added.** The link's page shows only the household's name and who invited, and says the same for a link that has expired, been used or been revoked.
- No mail is sent in 0.1.0 and none is needed.

## People and roles

- The person whose household it is, and who made it, is its **Admin**. Everyone who joins is a **Member**. There is no read-only role.
- **Members and the Admin** can do everything to do with shopping: make, rename, reorder, archive and restore lists; add, edit, tick and delete items; invite; leave.
- **Only the Admin** can remove a member, revoke someone else's link, and delete a list for good. **The Admin cannot leave** their household: nobody could take it over (passing the role arrives with 0.2.0).
- **What a person added stays when they leave or are removed**, under their name, shown as "added by Sam (left)". It is never deleted with them.
- **Deleting your account** removes everything personal of yours: your sign-in, your email, your sessions. A household you were the only person in is deleted; one with others in it goes on, with the Admin role passed to
  whoever had been in longest. Your name stays on what you added.

## What others see of you

- Your **name**, on what you added and ticked, and in the list of people.
- Your **email address**, only if you are the household's **Admin** looking at a member (so an Admin can tell who is who), and to yourself. A Member sees no one's address but their own.
- Nothing else of you. The server's logs hold no names, items, lists or addresses.

## What 0.1.0 does not do yet

Several households and naming them; roles beyond Admin and Member; moving a list between households; inviting by email, and notices that someone joined; trips, shops and prices;
export and import. [`ROADMAP.md`](../ROADMAP.md) has the order.
