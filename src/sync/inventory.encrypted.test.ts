import { sql } from 'drizzle-orm';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_RING, join, somebody, type Someone } from '../access/test-support';
import type { Mutation } from '../actions/format';
import { canonicalName } from '../catalog/canonical';
import { starterEntryByKey } from '../catalog/starter';
import { ringOf } from '../crypto/keys';
import { SEALED_TABLES, rotateSealed } from '../crypto/rotate';
import type { Database } from '../db/client';
import { dbAll, dbGet, dbRun } from '../db/exec';
import { runMigrations } from '../db/migrate';
import { appTable } from '../db/tables';
import { freshDatabase, testTarget } from '../db/test-support';
import {
  type Keyring,
  deriveInventoryKeyring,
  deriveListKeyring,
  deviceInventoryNameKey,
  listNameKey,
  newKeyring,
  openField,
  sealField,
} from '../keys/household';
import type { Limits } from '../limits/config';
import { type ApplyResult, applyMutation } from './apply';
import { mergeChange } from './merge';
import { pullHousehold } from './pull';

/**
 * A person's Inventory in a group that has moved to device encryption (task 23.3, step 4; DESIGN.md §13.1 to §13.3): kept as its device sent it, **for the
 * group in the place of a list, under the group's Inventory keys**, with the name key the device made, never opened or shown by the server, and the same owner
 * only as before. The marker is a word that must be in no row once it is encrypted.
 */
const { leg } = testTarget();
const LIMITS: Limits = {
  householdMembers: 20,
  accountHouseholds: 20,
  householdLists: 100,
  listOpenItems: 500,
  householdProducts: 5000,
  inventoryItems: 5000,
  householdCategories: 100,
  accountCards: 100,
};
const MARKER = 'MARKERinv9Tea';

let database: Database;
let ada: Someone;
let grace: Someone;
let group: Keyring;
let inventory: Keyring;
const deps = () => ({ database, ring: TEST_RING, limits: LIMITS });
const mutation = (household: string, changes: Mutation['changes'][number][]): Mutation => ({
  mutationId: crypto.randomUUID(),
  householdId: household,
  changes,
});
const applied = (result: ApplyResult) => {
  if (result.status !== 'applied') throw new Error(`expected applied, got ${result.status}`);
  return result;
};
/** A value for an Inventory row, as its device makes it: for the group (in the place of a list), under the group's Inventory keys. */
const cipher = (
  row: string,
  field: string,
  text: string,
  options: { slot?: string; keys?: Keyring } = {},
) =>
  sealField(
    options.keys ?? inventory,
    { list: options.slot ?? ada.household, table: 'inventory_item', row, field },
    text,
  );
const nameKeyOf = (name: string) =>
  deviceInventoryNameKey(inventory, ada.household, canonicalName(name));

/** A make, from the device: the name and the note encrypted, and the name key. */
const make = async (
  id: string,
  name: string,
  extra: Record<string, string | number | null> = {},
) => ({
  table: 'inventory_item' as const,
  id,
  create: true as const,
  fields: {
    createdAt: 1,
    name: await cipher(id, 'name', name),
    nameKey: await nameKeyOf(name),
    ...extra,
  } as Record<string, string | number | null>,
});
const edit = (id: string, fields: Record<string, string | number | null>) => ({
  table: 'inventory_item' as const,
  id,
  fields,
});
const rowOf = (id: string) =>
  dbGet<Record<string, unknown>>(
    database,
    sql`SELECT * FROM ${appTable(database, 'inventory_item')} WHERE id = ${id}`,
  );
const pull = async (who: Someone, household: string) => {
  const found = await pullHousehold(database, TEST_RING, who.accountId, household, 0);
  if (!found) throw new Error('no pull');
  return found;
};

beforeAll(async () => {
  ({ database } = await freshDatabase('app'));
  await runMigrations(database);
  ada = await somebody(database, 'Ada');
  grace = await somebody(database, 'Grace');
  await dbRun(
    database,
    sql`UPDATE ${appTable(database, 'household')} SET encryption = 'encrypted', epoch = 1 WHERE id = ${ada.household}`,
  );
  // Grace is on one of Ada's lists, as someone it is shared with.
  await join(database, ada.household, grace);
  group = newKeyring();
  inventory = await deriveInventoryKeyring(group, ada.household);
});
afterAll(async () => database.close());

describe(`an encrypted group’s Inventory on the server (${leg})`, () => {
  it('keeps an item as its device sent it, for the group, with the name key the device made, and nothing in plain text', async () => {
    const id = crypto.randomUUID();
    const first = await make(id, `Good tea ${MARKER}`, { recurring: 1, hidden: 0 });
    first.fields.note = await cipher(id, 'note', `loose leaf ${MARKER}`);
    applied(await applyMutation(deps(), ada.accountId, mutation(ada.household, [first])));
    const row = await rowOf(id);
    expect(row?.sealed).toBe('');
    expect(String(row?.name_key)).toMatch(/^n3\./);
    expect(row?.name_key).toBe(await nameKeyOf(`Good tea ${MARKER}`));
    expect(JSON.stringify(row)).not.toContain(MARKER);
    // The pull hands the owner its ciphertext and its flags as booleans; it opens under the group's Inventory keys, and under no list's.
    const pulled = (await pull(ada, ada.household)).inventory?.find((each) => each.id === id) as
      { encrypted?: Record<string, string>; recurring: boolean; name: unknown } | undefined;
    expect(pulled?.recurring).toBe(true);
    const at = (field: string) => ({
      list: ada.household,
      table: 'inventory_item',
      row: id,
      field,
    });
    expect(await openField(inventory, at('name'), pulled?.encrypted?.name ?? '')).toBe(
      `Good tea ${MARKER}`,
    );
    expect(await openField(inventory, at('note'), pulled?.encrypted?.note ?? '')).toBe(
      `loose leaf ${MARKER}`,
    );
    expect(
      await openField(
        await deriveListKeyring(group, ada.household),
        at('name'),
        pulled?.encrypted?.name ?? '',
      ),
    ).toBeUndefined();
  });

  it('holds plain text sent to it, which the device sends again encrypted, and takes a change that is no content without the name key', async () => {
    const plain = await applyMutation(
      deps(),
      ada.accountId,
      mutation(ada.household, [
        {
          table: 'inventory_item',
          id: crypto.randomUUID(),
          create: true,
          fields: { createdAt: 1, name: `Plain ${MARKER}` },
        },
      ]),
    );
    expect(plain.status).toBe('held');
    const id = crypto.randomUUID();
    applied(
      await applyMutation(deps(), ada.accountId, mutation(ada.household, [await make(id, 'Rice')])),
    );
    const key = (await rowOf(id))?.name_key;
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [
          edit(id, { hidden: 1, recurring: 1, note: await cipher(id, 'note', 'basmati') }),
        ]),
      ),
    );
    const after = await rowOf(id);
    // The name key stays as it was: a note and a flag are not a name.
    expect(after?.name_key).toBe(key);
    expect(after?.hidden === true || after?.hidden === 1).toBe(true);
  });

  it('refuses a value for a list, for another group, or for a row of a list, and an Inventory value put into an item', async () => {
    const id = crypto.randomUUID();
    const wrong: [string, string][] = [
      ['a list', ada.list],
      ['another group', crypto.randomUUID()],
      ['a list of the same group, with its own keys', ada.list],
    ];
    for (const [what, slot] of wrong) {
      const keys = what.includes('own keys') ? await deriveListKeyring(group, slot) : inventory;
      const bad = await make(id, `Bad ${what}`);
      bad.fields.name = await cipher(id, 'name', 'x', { slot, keys });
      expect(
        await applyMutation(deps(), ada.accountId, mutation(ada.household, [bad])),
        what,
      ).toMatchObject({ status: 'refused', reason: 'not_found' });
    }
    expect(await rowOf(id)).toBeUndefined();
    // A note of a row that is there, for a list.
    const there = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [await make(there, 'Salt')]),
      ),
    );
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [
          edit(there, { note: await cipher(there, 'note', 'x', { slot: ada.list }) }),
        ]),
      ),
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
    // An Inventory value in an item, bound to the group and not to the item's list (and its table is Inventory's, so it would not open there either).
    const productId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const listKeys = await deriveListKeyring(group, ada.list);
    const product = {
      table: 'product' as const,
      id: productId,
      create: true as const,
      fields: {
        listId: ada.list,
        name: await sealField(
          listKeys,
          { list: ada.list, table: 'product', row: productId, field: 'name' },
          'Smuggled',
        ),
        nameKey: await listNameKey(listKeys, ada.list, 'smuggled'),
        createdAt: 1,
      },
    };
    const item = (name: string) => ({
      table: 'item' as const,
      id: itemId,
      create: true as const,
      fields: {
        listId: ada.list,
        productId,
        name,
        quantity: '1',
        position: 'a0',
        addedBy: ada.personId,
        addedAt: 1,
      },
    });
    expect(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [product, item(await cipher(itemId, 'name', 'Smuggled'))]),
      ),
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
    // The same item with its own list's value is taken, so it was the Inventory value that was refused.
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [
          product,
          item(
            await sealField(
              listKeys,
              { list: ada.list, table: 'item', row: itemId, field: 'name' },
              'Fine',
            ),
          ),
        ]),
      ),
    );
  });

  it('asks for the name key with every make and every name, `null` too, and never alone, and keeps a row of the person’s own named', async () => {
    const outcome = async (changes: Mutation['changes'][number][]) =>
      (await applyMutation(deps(), ada.accountId, mutation(ada.household, changes))).status;
    // What a device that did not send the key sent is either refused or held for it to be sent again (a value a plain household would take is held): never taken.
    const notTaken = (status: string) => expect(['refused', 'held']).toContain(status);
    const id = crypto.randomUUID();
    const noKey = await make(id, 'Soap');
    delete noKey.fields.nameKey;
    notTaken(await outcome([noKey]));
    expect(await rowOf(id)).toBeUndefined();
    // A make of a starter entry with no name still needs the key (the device makes it from the starter's name).
    const override = crypto.randomUUID();
    const bread = starterEntryByKey('bread')?.name ?? '';
    const overrideOf = async (withKey: boolean) => ({
      table: 'inventory_item' as const,
      id: override,
      create: true as const,
      fields: {
        createdAt: 1,
        starterKey: 'bread',
        hidden: 1,
        ...(withKey ? { nameKey: await nameKeyOf(bread) } : {}),
      },
    });
    notTaken(await outcome([await overrideOf(false)]));
    expect(await rowOf(override)).toBeUndefined();
    expect(await outcome([await overrideOf(true)])).toBe('applied');
    // A name with no key, and a key with no name, are not taken, and change nothing.
    const own = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [await make(own, 'Tape')]),
      ),
    );
    const was = JSON.stringify(await rowOf(own));
    notTaken(await outcome([edit(own, { name: await cipher(own, 'name', 'Tape 2') })]));
    expect(await outcome([edit(own, { nameKey: await nameKeyOf('Tape 2') })])).toBe('refused');
    expect(JSON.stringify(await rowOf(own))).toBe(was);
    // An override renamed has the key of its new name, and given back to the starter's it has the starter entry's: from the key its device sent, as the server cannot
    // read either name. Said as `null` with no key, it is not taken.
    expect(
      await outcome([
        edit(override, {
          name: await cipher(override, 'name', 'Sourdough'),
          nameKey: await nameKeyOf('Sourdough'),
        }),
      ]),
    ).toBe('applied');
    expect((await rowOf(override))?.name_key).toBe(await nameKeyOf('Sourdough'));
    notTaken(await outcome([edit(override, { name: null })]));
    expect((await rowOf(override))?.name_key).toBe(await nameKeyOf('Sourdough'));
    expect(await outcome([edit(override, { name: null, nameKey: await nameKeyOf(bread) })])).toBe(
      'applied',
    );
    expect((await rowOf(override))?.name_key).toBe(await nameKeyOf(bread));
    // A row of the person's own with no name and no starter entry has nothing to be shown by: refused, key or no key, which `derive` does in a group the server
    // seals and nothing else would here.
    expect(await outcome([edit(own, { name: null, nameKey: await nameKeyOf('Tape') })])).toBe(
      'refused',
    );
    expect(JSON.stringify(await rowOf(own))).toBe(was);
  });

  it('folds one name made twice into one row without reading either, and the second note opens through the alias; and one override of a starter entry, whatever either was renamed to', async () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [await make(first, 'Dish Sponges')]),
      ),
    );
    const twin = await make(second, 'dish  sponges');
    twin.fields.note = await cipher(second, 'note', `green ${MARKER}`);
    const result = applied(
      await applyMutation(deps(), ada.accountId, mutation(ada.household, [twin])),
    );
    expect(result.folds).toEqual([{ table: 'inventory_item', from: second, to: first }]);
    const pulled = await pull(ada, ada.household);
    const stands = pulled.inventory?.find((each) => each.id === first) as
      { encrypted?: Record<string, string> } | undefined;
    const aliases = pulled.aliases
      .filter((alias) => alias.table === 'inventory_item' && alias.to === first)
      .map((alias) => alias.from);
    expect(aliases).toEqual([second]);
    expect(
      await openField(
        inventory,
        { list: ada.household, table: 'inventory_item', row: first, field: 'note' },
        stands?.encrypted?.note ?? '',
        aliases,
      ),
    ).toBe(`green ${MARKER}`);
    // An override of one starter entry, made twice and renamed differently: one row, and the later folds into the earlier.
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [await make(a, 'Seeded loaf', { starterKey: 'rice' })]),
      ),
    );
    const folded = applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [await make(b, 'Brown rice', { starterKey: 'rice' })]),
      ),
    );
    expect(folded.folds).toEqual([{ table: 'inventory_item', from: b, to: a }]);
  });

  it('is the person’s own account alone: someone on a list of the group is refused as not found, and has none of its rows, aliases or tombstones, nor its keyring', async () => {
    const mine = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [await make(mine, 'Own')]),
      ),
    );
    const before = JSON.stringify(await rowOf(mine));
    for (const changes of [
      [await make(crypto.randomUUID(), 'Sneaky')],
      [edit(mine, { hidden: 1 })],
      [edit(mine, { deletedAt: 3 })],
      [edit(mine, { note: await cipher(mine, 'note', 'from a guest') })],
    ])
      expect(
        await applyMutation(deps(), grace.accountId, mutation(ada.household, changes)),
      ).toMatchObject({ status: 'refused', reason: 'not_found' });
    expect(JSON.stringify(await rowOf(mine))).toBe(before);
    // Ada has deleted one and folded one, so there are tombstones and aliases of Inventory in the group: the guest has none of it.
    const gone = crypto.randomUUID();
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [await make(gone, 'Gone')]),
      ),
    );
    applied(
      await applyMutation(
        deps(),
        ada.accountId,
        mutation(ada.household, [edit(gone, { deletedAt: 5 })]),
      ),
    );
    const theirs = await pull(grace, ada.household);
    expect(theirs.encryption.state).toBe('encrypted');
    expect(theirs.encryption.keyring).toBeNull();
    expect(theirs.inventory ?? []).toEqual([]);
    expect(theirs.aliases.some((alias) => alias.table === 'inventory_item')).toBe(false);
    expect(theirs.tombstones.some((each) => each.table === 'inventory_item')).toBe(false);
    const hers = await pull(ada, ada.household);
    expect(hers.aliases.some((alias) => alias.table === 'inventory_item')).toBe(true);
  });

  it('holds ciphertext sent to a group the server still seals, and is rotated around: an encrypted row has no envelope to move and keeps the name key its device made', async () => {
    const owner = await somebody(database, 'Still-sealed');
    const cipherFor = async (id: string) =>
      sealField(
        await deriveInventoryKeyring(group, owner.household),
        { list: owner.household, table: 'inventory_item', row: id, field: 'name' },
        'x',
      );
    const id = crypto.randomUUID();
    expect(
      await applyMutation(
        deps(),
        owner.accountId,
        mutation(owner.household, [
          {
            table: 'inventory_item',
            id,
            create: true,
            fields: {
              createdAt: 1,
              name: await cipherFor(id),
              nameKey: await deviceInventoryNameKey(
                await deriveInventoryKeyring(group, owner.household),
                owner.household,
                'x',
              ),
            },
          },
        ]),
      ),
    ).toMatchObject({ status: 'held' });
    expect(await rowOf(id)).toBeUndefined();

    // Rotation: one row sealed under the old key (a group still sealed) is moved to the new one, and the encrypted rows, which have no envelope, are left as they
    // are, with the name keys their devices made (it must not recompute one from a name it cannot read).
    const old = ringOf(Buffer.alloc(32, 1));
    const next = ringOf(Buffer.alloc(32, 2), Buffer.alloc(32, 1));
    if (!old || !next) throw new Error('no ring');
    const sealedId = crypto.randomUUID();
    applied(
      await applyMutation(
        { database, ring: old, limits: LIMITS },
        owner.accountId,
        mutation(owner.household, [
          {
            table: 'inventory_item',
            id: sealedId,
            create: true,
            fields: { createdAt: 1, name: 'Sealed by the server', recurring: 0, hidden: 0 },
          },
        ]),
      ),
    );
    const keysBefore = await dbAll<{ id: string; name_key: string }>(
      database,
      sql`SELECT id, name_key FROM ${appTable(database, 'inventory_item')} WHERE household_id = ${ada.household} ORDER BY id`,
    );
    expect(keysBefore.length).toBeGreaterThan(3);
    const spec = SEALED_TABLES.find((each) => each.table === 'inventory_item');
    if (!spec) throw new Error('inventory_item is not a sealed table');
    expect(await rotateSealed(database, next, [spec], undefined, () => undefined)).toBe(1);
    const keysAfter = await dbAll<{ id: string; name_key: string }>(
      database,
      sql`SELECT id, name_key FROM ${appTable(database, 'inventory_item')} WHERE household_id = ${ada.household} ORDER BY id`,
    );
    expect(keysAfter).toEqual(keysBefore);
    expect(keysAfter.every((row) => row.name_key.startsWith('n3.'))).toBe(true);
  });
});

describe(`the order of arrival decides for an encrypted group’s Inventory too (${leg})`, () => {
  it('leaves the rows the merge says, ciphertext as opaque as any value, for any order of one account’s devices’ changes, flags included, with the counter one for each mutation', async () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const [i, id] of ids.entries())
      applied(
        await applyMutation(
          deps(),
          ada.accountId,
          mutation(ada.household, [await make(id, `Property thing ${i}`)]),
        ),
      );
    // Two notes a device could have written for each row, as ciphertext: the server can tell them apart and not read either.
    const notes = new Map<string, { a: string; b: string }>();
    for (const id of ids)
      notes.set(id, { a: await cipher(id, 'note', 'a'), b: await cipher(id, 'note', 'b') });
    const seqOf = async () =>
      Number(
        (
          await dbGet<{ seq: number | string }>(
            database,
            sql`SELECT seq FROM ${appTable(database, 'household')} WHERE id = ${ada.household}`,
          )
        )?.seq,
      );
    const contentOf = (row: Record<string, unknown> | undefined) =>
      JSON.parse(String(row?.encrypted ?? '{}')) as Record<string, string>;
    const field = fc.oneof(
      fc.record({ recurring: fc.constantFrom(0, 1) }),
      fc.record({ hidden: fc.constantFrom(0, 1) }),
      fc.record({ note: fc.constantFrom('a', 'b', null) }),
      fc.record({ deletedAt: fc.constantFrom(7, null) }),
      fc.record({ recurring: fc.constantFrom(0, 1), hidden: fc.constantFrom(0, 1) }),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 2 }), field), { minLength: 1, maxLength: 12 }),
        async (changes) => {
          const start = await seqOf();
          const model = new Map<
            string,
            { values: Record<string, string | number | null>; fseq: Record<string, number> }
          >();
          for (const id of ids) {
            const row = await rowOf(id);
            model.set(id, {
              values: {
                name: contentOf(row).name ?? null,
                note: contentOf(row).note ?? null,
                recurring: row?.recurring ? 1 : 0,
                hidden: row?.hidden ? 1 : 0,
                deletedAt: (row?.deleted_at as number | null) ?? null,
                starterKey: null,
                categoryId: null,
                icon: null,
                unit: null,
                quantity: null,
                createdAt: 1,
              },
              fseq: JSON.parse(String(row?.fseq)) as Record<string, number>,
            });
          }
          let seq = start;
          for (const [index, fields] of changes) {
            const id = ids[index] ?? '';
            // A note says which of its two ciphertexts, or nothing.
            const sent =
              'note' in fields
                ? {
                    note:
                      fields.note === null
                        ? null
                        : (notes.get(id)?.[fields.note as 'a' | 'b'] ?? null),
                  }
                : fields;
            const result = applied(
              await applyMutation(deps(), ada.accountId, mutation(ada.household, [edit(id, sent)])),
            );
            seq += 1;
            expect(result.seq).toBe(seq);
            const entry = model.get(id);
            if (entry) {
              const merged = mergeChange(entry.values, entry.fseq, sent, seq);
              model.set(id, { values: { ...merged.values }, fseq: { ...merged.fseq } });
            }
          }
          expect(await seqOf()).toBe(seq);
          for (const id of ids) {
            const row = await rowOf(id);
            const want = model.get(id);
            expect({
              note: contentOf(row).note ?? null,
              recurring: row?.recurring ? 1 : 0,
              hidden: row?.hidden ? 1 : 0,
              deletedAt: (row?.deleted_at as number | null) ?? null,
              fseq: JSON.parse(String(row?.fseq)),
            }).toEqual({
              note: want?.values.note ?? null,
              recurring: want?.values.recurring,
              hidden: want?.values.hidden,
              deletedAt: want?.values.deletedAt ?? null,
              fseq: want?.fseq,
            });
          }
        },
      ),
      { numRuns: 15 },
    );
  });
});
