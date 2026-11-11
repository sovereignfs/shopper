# Encryption at rest

## What is sealed

Shopper's database holds what a household buys, where and who they are, so those are **sealed**: encrypted by the server under `SHOPPER_ENCRYPTION_KEY` before they are
written, and opened when they are read. In 0.1.0 that is: the names of households, lists, items, products and categories; notes; and the name and email address
Shopper keeps of each person on what they share (the `person` record).

Each row is sealed on its own. It has a random **data key**, which is wrapped under the instance key and bound to that row, so a sealed value copied to another row will not
open. Everything sealed in a row is one value, read and written only through one module (`src/crypto/sealed.ts`), which a test holds to the list of what is sealed.

**What is not sealed:** **each account's name and email address in the sign-in database** (`shopper_auth`, the `user` table), because signing in looks an account up by its address and a
sealed value cannot be searched. Someone who copies that database learns who has an account and their addresses, though nothing about what they buy. Also ids, quantities, units, icons, positions, times, roles, counts and the structure that sorting, merging and counting need. Alone, without a name, they say
little. **No sealed field is ever searched, sorted or indexed by the database**: suggestions and totals are worked out in memory, on the device. A product is found again in a
household by a **name key** (a keyed hash of its normalised name, different in each household), which reveals only that two rows of one household share a name.

## What it protects against, and what it does not

**It protects what a household buys and where from** a copied database, a backup that leaves your control, a stolen disk, a volume snapshot, and someone who reads the tables. **It does not hide who has an account** (see above).

**It does not protect against:**

- **Whoever controls the running server.** The server has the key and reads everything to do its work, so the person who runs it can read what it holds. This is not
  end-to-end encryption, and Shopper does not claim it.
- **The device.** A signed-in browser holds your households' lists in plain text (it has to, to work with no network) until you sign out, which deletes them.
- **The people you share with.** Everyone in a household sees all of it.
- **What logs say.** They hold ids and kinds of failure, never a name, a note or an address.

## The key

- **Make it once** (`openssl rand -base64 32`, 32 bytes) and keep it with your secrets, **apart from the database backups**. A backup without the key cannot be read, and the
  key without the backup is of no use.
- **A lost key means the sealed content cannot be read, and nothing can recover it.** There is no copy of it in the database, no recovery and no one to ask.
- **To change it,** put the new key in `SHOPPER_ENCRYPTION_KEY` and the old one in `SHOPPER_ENCRYPTION_KEY_PREVIOUS`, start the server once (it moves what is stored to the new
  key), and then remove the old one. It works in short batches and can be stopped and run again.
- A server with no key does not start, and one with a key that cannot open what is stored says so at start-up, naming the setting.

The sessions' secret, `SHOPPER_AUTH_SECRET`, is a different thing: it signs sessions and tokens, and changing it only signs everyone out.
