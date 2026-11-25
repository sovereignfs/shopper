import { index, pgSchema, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { APP_STORE } from '../../config';
import { bool, counter, decimal, epochMs, fseq, id, position, ref, sealed } from './columns';

/** The app's schema; better-auth's is `shopper_auth` (DESIGN.md §20.1). */
export const app = pgSchema(APP_STORE);

/** See `schema/sqlite/app.ts`. */
export const rateBucket = app.table(
  'rate_bucket',
  {
    key: id('key'),
    windowStart: epochMs('window_start').notNull(),
    count: counter('count').notNull(),
  },
  (table) => [index('rate_bucket_window_idx').on(table.windowStart)],
);

/**
 * Shopper's record of someone who appears on shared rows (DESIGN.md §6.1): every account has exactly one, made with it, and it keeps the name when the
 * account is deleted. The name and the email are sealed (`src/crypto/sealed.ts`). `account_id` is better-auth's user id, a reference by value because it
 * lives in the other store, and it is unique and may be null (a person whose account is gone, or an imported one); `core_sub` is unique and is
 * not set yet: the identity a core knows the person by is the account id of their sign-in through core, in the auth store (`subOfAccount`). `kind` is `account` or, with import (task 11.2), `imported`.
 */
export const person = app.table(
  'person',
  {
    id: id('id'),
    accountId: ref('account_id'),
    coreSub: ref('core_sub'),
    kind: text('kind').notNull().default('account'),
    sealed: sealed('sealed').notNull(),
    deletedAt: epochMs('deleted_at'),
    createdAt: epochMs('created_at').notNull(),
    updatedAt: epochMs('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('person_account_id_idx').on(table.accountId),
    uniqueIndex('person_core_sub_idx').on(table.coreSub),
  ],
);

/**
 * A household (DESIGN.md §7.1): the unit of sharing, and of sync (`seq` is its change counter, incremented by every transaction that writes a row of it,
 * §12.3). Everything a household shops with carries its `household_id`. `own_of` is the account whose first household this is, made with the account
 * (§7.4): unique, so making it twice is harmless, and null for any other. `sealed` holds the name and is **null while a household has none**, which in
 * 0.1.0 is always (it is shown by the rule of §7.4; naming one is task 3.8). The colour and the currency are phase 2's columns.
 */
export const household = app.table(
  'household',
  {
    id: id('id'),
    ownOf: ref('own_of'),
    sealed: sealed('sealed'),
    encrypted: sealed('encrypted'),
    seq: counter('seq').notNull().default(0),
    // RFC 0001: `sealed` (the server seals its content), or `encrypted` (each member's device does); and the latest key epoch.
    encryption: text('encryption').notNull().default('sealed'),
    epoch: counter('epoch').notNull().default(0),
    createdBy: ref('created_by').notNull(),
    createdAt: epochMs('created_at').notNull(),
    updatedAt: epochMs('updated_at').notNull(),
  },
  (table) => [uniqueIndex('household_own_of_idx').on(table.ownOf)],
);

/**
 * A person's place in a household, with a role: `admin` or `member` (DESIGN.md §7.2). A person who leaves keeps the row with `left_at` set, so that what
 * they added keeps their name and joining again is the same row; **active** means `left_at` is null, and every statement says so (§5.2).
 */
export const member = app.table(
  'member',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    personId: ref('person_id').notNull(),
    role: text('role').notNull().default('member'),
    joinedAt: epochMs('joined_at').notNull(),
    leftAt: epochMs('left_at'),
    seq: counter('seq').notNull().default(0),
  },
  (table) => [
    uniqueIndex('member_household_person_idx').on(table.householdId, table.personId),
    index('member_person_idx').on(table.personId),
  ],
);

/**
 * An invitation to a household (DESIGN.md §7.3, §20.3): a link and nothing else in 0.1.0 (no email, `core_sub` or `sent_at`; those arrive with 3.10). The
 * token is 32 random bytes and **only its hash is stored** (`token_hash`, unique), so a database read cannot make a link; it is compared in constant time,
 * valid until `expires_at` (14 days), single-use (`accepted_by` and `accepted_at` are set in the statement that accepts it) and revoked by setting
 * `revoked_at`. `created_by` is the person who made it. A live invitation is one not accepted, not revoked and not expired; a household has at most 20.
 */
export const invitation = app.table(
  'invitation',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    // The list the row is about (RFC 0004): who may see it. None for what is the group's (a category's).
    listId: ref('list_id'),
    // The card the row is about (RFC 0007), instead of a list: a link is to one or the other, never both. Whoever joins by it is on that card and nothing else of the group.
    cardId: ref('card_id'),
    tokenHash: ref('token_hash').notNull(),
    // A moved household's keyring, wrapped under the secret in the link's fragment, which the server never sees (RFC 0001). Gone on accept or
    // revoke.
    wrappedKey: text('wrapped_key'),
    createdBy: ref('created_by').notNull(),
    createdAt: epochMs('created_at').notNull(),
    expiresAt: epochMs('expires_at').notNull(),
    acceptedBy: ref('accepted_by'),
    acceptedAt: epochMs('accepted_at'),
    revokedAt: epochMs('revoked_at'),
  },
  (table) => [
    uniqueIndex('invitation_token_hash_idx').on(table.tokenHash),
    index('invitation_household_idx').on(table.householdId),
    index('invitation_card_idx').on(table.cardId),
  ],
);

/**
 * What a list remembers about something it buys (DESIGN.md §8.2, RFC 0004), so that adding is one tap and the item arrives right. **One product per name on a
 * list**: `name_key` is the HMAC of its normalised name (`src/crypto/name-key.ts`), unique with `household_id` and `list_id`, so the server finds "the same
 * product" without reading a name, and a second made for the same name is folded into the first (task 5.3). The name and the note are sealed. Its
 * category and icon are what the next add comes with; `default_quantity` and `default_unit` likewise; `times_bought`, `last_bought_at` and
 * `last_added_at` are what suggestions rank by (§8.5), kept by apply. The last unit price and the barcode are phase 2's and 4's columns. `fseq` is
 * the `seq` of each field's last change (§12.4), which merging reads without unsealing; `seq` is the household's counter at the row's last change.
 */
export const product = app.table(
  'product',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    /** The list whose catalog it is (RFC 0004, task 21.3): a name is one product per list, and an add on one list never finds another's. */
    listId: ref('list_id'),
    nameKey: ref('name_key').notNull(),
    sealed: sealed('sealed').notNull(),
    encrypted: sealed('encrypted'),
    categoryId: ref('category_id'),
    icon: text('icon'),
    defaultQuantity: decimal('default_quantity'),
    defaultUnit: text('default_unit'),
    timesBought: counter('times_bought').notNull().default(0),
    lastBoughtAt: epochMs('last_bought_at'),
    lastAddedAt: epochMs('last_added_at'),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('product_list_name_key_idx').on(table.householdId, table.listId, table.nameKey),
    index('product_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * A section of the shop, of one household (DESIGN.md §8.3): the starter categories are rows of its own, keyed by `starter_key` until renamed, and their
 * `position` is the household's **aisle order**, which lists and shopping mode group items by. **In 0.1.0 they are fixed**: made with the household
 * (`src/catalog/categories.ts`), never changed, and renaming, hiding, adding and reordering them are task 4.7's, so that the rows, the sync and the
 * sealing are the ones phase 2 edits. `sealed` holds the name once a person gives one, and is null for a starter name, which is the code's.
 */
export const category = app.table(
  'category',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    starterKey: text('starter_key'),
    sealed: sealed('sealed'),
    encrypted: sealed('encrypted'),
    icon: text('icon'),
    position: position('position').notNull(),
    hidden: bool('hidden').notNull().default(false),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
  },
  (table) => [
    uniqueIndex('category_household_starter_key_idx').on(table.householdId, table.starterKey),
    index('category_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * **An item of a person's Inventory** (DESIGN.md §8.8, RFC 0006), a row of **their own group** (`household.own_of` their account) and of nobody else's: it is
 * read and written by that account alone, in the statement (`ownerOf`), and no pull hands it to anyone on one of the group's lists. It is a person's own
 * library of what they buy, shown with the starter catalog it layers over: `starter_key` names the starter entry it overrides (null for one of their own),
 * `name` (sealed, null when an override keeps the starter's) with its **name key**, unique in the group, and `note`. `recurring` and `hidden` are flags (a hidden
 * starter entry is offered nowhere). `on_hand` and `low_point` come with the pantry (phase 3).
 */
export const inventoryItem = app.table(
  'inventory_item',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    /** The starter entry this overrides, or null for one of the person's own; one override per entry. */
    starterKey: text('starter_key'),
    nameKey: ref('name_key').notNull(),
    sealed: sealed('sealed'),
    encrypted: sealed('encrypted'),
    categoryId: ref('category_id'),
    icon: text('icon'),
    unit: text('unit'),
    quantity: decimal('quantity'),
    recurring: bool('recurring').notNull().default(false),
    hidden: bool('hidden').notNull().default(false),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('inventory_item_name_key_idx').on(table.householdId, table.nameKey),
    uniqueIndex('inventory_item_starter_key_idx').on(table.householdId, table.starterKey),
    index('inventory_item_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * **A list's copy of a person's own category** (DESIGN.md §8.3, decisions 15 to 17), a row of the **list's** group: the name of a category an item of the list uses,
 * under **the list's keys**, so that the people on the list read it and nothing else of anyone's categories. `source_key` says which category it copies, as a
 * device-made HMAC under the list's keys (never an id of the person's own group), unique on the list. Only a group that has moved has copies (a device makes the key and
 * the name), so `sealed` is always empty and `encrypted` holds the name.
 */
export const listCategory = app.table(
  'list_category',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    listId: ref('list_id').notNull(),
    sourceKey: ref('source_key').notNull(),
    sealed: sealed('sealed'),
    encrypted: sealed('encrypted'),
    icon: text('icon'),
    position: position('position').notNull(),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
  },
  (table) => [
    uniqueIndex('list_category_source_key_idx').on(table.listId, table.sourceKey),
    index('list_category_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * **A loyalty card** (DESIGN.md §7.7, RFC 0007), a row of its group: the shop, the number, the kind of code and its value, the icon, the colour, the name on the card and the note are
 * **one ciphertext per field under the card's own keys** (`encrypted`, §13.1), and the server holds nothing readable of a card. Only a group that has moved has any (a device makes the
 * keys), so `sealed` is always empty; it is there as `list_category`'s is, so that the one write path treats the table as it treats the rest. `position` orders the person's cards; a card's
 * people are `card_member`, and **who may read it is the statement's condition** (`onCard`), never the group's.
 */
export const card = app.table(
  'card',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    sealed: sealed('sealed'),
    encrypted: sealed('encrypted'),
    position: position('position').notNull(),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [index('card_household_seq_idx').on(table.householdId, table.seq)],
);

/**
 * **A card linked to a list** (DESIGN.md §7.7, RFC 0007, task 24.6): the card for this shop, one tap from Shop mode. A link names a card and a list **of the same group, and holds nothing else**, so it has
 * nothing to encrypt (`sealed` and `encrypted` are there, empty, so that the one write path treats the table as it treats the rest). Its `id` is **made from its two ids** (`src/cards/links.ts`), so that the
 * same pair is one row on every device and a link made twice is the same link (an unlink is `deleted_at`, and linking again clears it), and the pair is unique. **Who may read it is two conditions:** being on
 * the list and being on the card, in the statement; somebody on the list who is not on the card is not handed it. It goes with the list, or the card, that it is of.
 */
export const listCard = app.table(
  'list_card',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    listId: ref('list_id').notNull(),
    cardId: ref('card_id').notNull(),
    sealed: sealed('sealed'),
    encrypted: sealed('encrypted'),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('list_card_pair_idx').on(table.listId, table.cardId),
    index('list_card_household_seq_idx').on(table.householdId, table.seq),
    index('list_card_card_idx').on(table.cardId),
  ],
);

/**
 * **Every mutation the server has applied** (DESIGN.md §12.3), by the account that sent it and the id the device made, with the household's `seq` it
 * was applied at. A mutation sent again, because an answer was lost, finds its row and **writes nothing**: it is answered as it was. Pruned after ninety
 * days with the history (task 6.6, phase 2). Not a row of a household's: it is the account's, and goes with it (`deletePerson`).
 */
export const appliedMutation = app.table(
  'applied_mutation',
  {
    accountId: ref('account_id').notNull(),
    id: ref('id').notNull(),
    householdId: ref('household_id').notNull(),
    seq: counter('seq').notNull(),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.id] })],
);

/**
 * **A row made twice that became one** (DESIGN.md §12.4): the product a second device made for a name the household already had, folded into the
 * first by the server, in the mutation's transaction. `from_id` is the id the device made, `to_id` the row it became; the server re-points later changes
 * that name `from_id` before applying them, and pull hands the alias to devices, which re-point what they hold (task 6.1). The one change the server makes
 * that a device did not send. Pruned after ninety days with the history (phase 2).
 */
export const alias = app.table(
  'alias',
  {
    householdId: ref('household_id').notNull(),
    // The list the row is about (RFC 0004): who may see it. None for what is the group's (a category's).
    listId: ref('list_id'),
    tableName: text('table_name').notNull(),
    fromId: ref('from_id').notNull(),
    toId: ref('to_id').notNull(),
    seq: counter('seq').notNull(),
    createdAt: epochMs('created_at').notNull(),
    // An encrypted household's second note when two items were folded (RFC 0001): joined by a device, never read here.
    carried: text('carried'),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.tableName, table.fromId] }),
    index('alias_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * **What was removed, so that devices learn of it** (DESIGN.md §12.9): the id of a row that is gone, with the `seq` it went at, so that a device that pulls
 * past it deletes its copy. A folded id has one too. A household's row, deleted with it.
 */
export const tombstone = app.table(
  'tombstone',
  {
    householdId: ref('household_id').notNull(),
    // The list the row is about (RFC 0004): who may see it. None for what is the group's (a category's).
    listId: ref('list_id'),
    // The card the row is about (RFC 0007): who may see it, as a list's is. None for what is a list's or the group's.
    cardId: ref('card_id'),
    tableName: text('table_name').notNull(),
    id: ref('id').notNull(),
    seq: counter('seq').notNull(),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.tableName, table.id] }),
    index('tombstone_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * A shopping list of a household (DESIGN.md §9.1). `sealed` holds its name; `position` orders the household's lists (a fractional key, §9.6); `clearing` is
 * how bought items leave it, `manual` in 0.1.0 (§9.5). **Archived** (`archived_at`) lists are kept and offered to restore; **deleted** (`deleted_at`) is a
 * soft delete that an edit undoes; **deleted for good** is an Admin's online operation on an archived list that removes the row, its items, and leaves a
 * tombstone.
 */
export const list = app.table(
  'list',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    sealed: sealed('sealed').notNull(),
    encrypted: sealed('encrypted'),
    position: position('position').notNull(),
    clearing: text('clearing').notNull().default('manual'),
    archivedAt: epochMs('archived_at'),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [index('list_household_seq_idx').on(table.householdId, table.seq)],
);

/**
 * One thing on a list (DESIGN.md §9.2): **open** until ticked, then **bought**, then **cleared** from the list, or deleted. It points at a product, and
 * carries its own name, quantity, unit, category and icon (the product's at the time of adding, the item's own after). `sealed` holds the name and the
 * note. `position` is a fractional key among the items of a category on a list, ties broken by `id` (§9.6). `bought_at` and `bought_by` are the tick, **and
 * the first tick stands** (§12.4). A price and the trip are phase 2's columns.
 */
export const item = app.table(
  'item',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    listId: ref('list_id').notNull(),
    productId: ref('product_id').notNull(),
    sealed: sealed('sealed').notNull(),
    encrypted: sealed('encrypted'),
    quantity: decimal('quantity').notNull(),
    unit: text('unit'),
    categoryId: ref('category_id'),
    icon: text('icon'),
    position: position('position').notNull(),
    addedBy: ref('added_by').notNull(),
    addedAt: epochMs('added_at').notNull(),
    boughtAt: epochMs('bought_at'),
    boughtBy: ref('bought_by'),
    clearedAt: epochMs('cleared_at'),
    deletedAt: epochMs('deleted_at'),
    seq: counter('seq').notNull().default(0),
    fseq: fseq('fseq').notNull().default('{}'),
  },
  (table) => [
    index('item_household_seq_idx').on(table.householdId, table.seq),
    index('item_list_idx').on(table.listId),
  ],
);

/**
 * What an account keeps for itself on the server (DESIGN.md §20.3), one row an account: the last list it used, so that a new device can start there
 * (§16.3), and when it last looked at its notices (phase 2). `account_id` is better-auth's user id, by value. Deleted with the person
 * (`People.deletePerson`).
 */
export const accountSettings = app.table('account_settings', {
  accountId: id('account_id'),
  lastListId: ref('last_list_id'),
  inboxSeenAt: epochMs('inbox_seen_at'),
  createdAt: epochMs('created_at').notNull(),
  updatedAt: epochMs('updated_at').notNull(),
});

/**
 * The group's keys (RFC 0001, amendment 2; RFC 0004): its keyring (every epoch's key) wrapped under its own account's app key, which only that account's
 * browser opens, and from which its lists' keys are derived. One row, the account's; replaced when the keyring grows. Deleted with the person
 * (`People.deletePerson`) and the group.
 */
export const householdKey = app.table(
  'household_key',
  {
    householdId: ref('household_id').notNull(),
    personId: ref('person_id').notNull(),
    epoch: counter('epoch').notNull(),
    record: text('record').notNull(),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.personId] })],
);

/**
 * A list's keys, for someone on it (RFC 0004, task 21.4): the list's keyring wrapped under their own app key, kept after joining by a link that carried
 * it. The list's maker has none: their devices derive it from the group's. One row a person a list; deleted when they leave it or are removed, with the
 * list, and with the person.
 */
export const listKey = app.table(
  'list_key',
  {
    listId: ref('list_id').notNull(),
    personId: ref('person_id').notNull(),
    householdId: ref('household_id').notNull(),
    epoch: counter('epoch').notNull(),
    record: text('record').notNull(),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.personId] }),
    index('list_key_person_idx').on(table.personId),
  ],
);

/**
 * A device that takes Web Push (RFC 0002, `@sovereignfs/push`): an account's, at most ten. Its keys are sealed by the server (`src/crypto/`), which needs
 * them to send; the endpoint is the push service's address for the device. Deleted with the person.
 */
export const pushDevice = app.table(
  'push_device',
  {
    // The push service's address for the device, which is the row's id.
    id: id('id'),
    accountId: ref('account_id').notNull(),
    sealed: sealed('sealed').notNull(),
    savedAt: epochMs('saved_at').notNull(),
  },
  (table) => [index('push_device_account_idx').on(table.accountId, table.savedAt)],
);

/** A push waiting to be sent to one device, claimed by the outbox job with a lease. Goes with its device: every deletion here names both. */
export const pushOutbox = app.table(
  'push_outbox',
  {
    id: id('id'),
    accountId: ref('account_id').notNull(),
    endpoint: ref('endpoint').notNull(),
    message: text('message').notNull(),
    attempts: counter('attempts').notNull().default(0),
    dueAt: epochMs('due_at').notNull(),
    claimedUntil: epochMs('claimed_until').notNull().default(0),
    expiresAt: epochMs('expires_at').notNull(),
  },
  (table) => [
    index('push_outbox_due_idx').on(table.dueAt, table.claimedUntil),
    index('push_outbox_endpoint_idx').on(table.endpoint),
  ],
);

/**
 * A list's people (RFC 0004): who may see and change a list, its items and its products. Admin (its owner, who made it or to whom it passed) or Member;
 * joined by accepting an invitation to the list, and left or removed list by list. Active means `left_at` is null, and every statement says so.
 */
export const listMember = app.table(
  'list_member',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    listId: ref('list_id').notNull(),
    personId: ref('person_id').notNull(),
    role: text('role').notNull(),
    joinedAt: epochMs('joined_at').notNull(),
    leftAt: epochMs('left_at'),
    seq: counter('seq').notNull().default(0),
  },
  (table) => [
    uniqueIndex('list_member_list_person_idx').on(table.listId, table.personId),
    index('list_member_person_idx').on(table.personId),
    index('list_member_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * **A person on a card** (DESIGN.md §7.7), as `list_member` is for a list: a card's people are its own, joined only by accepting an invitation to it, and its **Admin** (who added it, or
 * to whom it passed) edits and deletes it. `left_at` keeps the person named on what they did.
 */
export const cardMember = app.table(
  'card_member',
  {
    id: id('id'),
    householdId: ref('household_id').notNull(),
    cardId: ref('card_id').notNull(),
    personId: ref('person_id').notNull(),
    role: text('role').notNull(),
    joinedAt: epochMs('joined_at').notNull(),
    leftAt: epochMs('left_at'),
    seq: counter('seq').notNull().default(0),
  },
  (table) => [
    uniqueIndex('card_member_card_person_idx').on(table.cardId, table.personId),
    index('card_member_person_idx').on(table.personId),
    index('card_member_household_seq_idx').on(table.householdId, table.seq),
  ],
);

/**
 * **A person's own copy of a card's keyring** (DESIGN.md §13.2), wrapped under that person's app key, as `list_key` is for a list: handed back to them in each pull of a card they are on,
 * and deleted when they leave it or are removed, with the card and with the person. A card's keys are derived from its group's, and someone given a card by a link keeps this copy.
 */
export const cardKey = app.table(
  'card_key',
  {
    cardId: ref('card_id').notNull(),
    personId: ref('person_id').notNull(),
    householdId: ref('household_id').notNull(),
    epoch: counter('epoch').notNull(),
    record: text('record').notNull(),
    createdAt: epochMs('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.cardId, table.personId] }),
    index('card_key_person_idx').on(table.personId),
  ],
);
