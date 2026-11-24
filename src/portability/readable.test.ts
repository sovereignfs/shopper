import { describe, expect, it } from 'vitest';
import {
  deriveInventoryKeyring,
  deriveListKeyring,
  newKeyring,
  sealField,
  wrapKeyring,
  wrapListKeyring,
} from '../keys/household';
import { exportFileName, exportFileText, openServed, type ServedRecords } from './readable';

const appKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const PERSON = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const H = '11111111-1111-4111-8111-111111111111';
const LIST = '44444444-4444-4444-8444-444444444444';
const SHARED = '55555555-5555-4555-8555-555555555555';
const ITEM = '22222222-2222-4222-8222-222222222222';
const INVENTORY = '66666666-6666-4666-8666-666666666666';
const CATEGORY = '77777777-7777-4777-8777-777777777777';
const COPY = '88888888-8888-4888-8888-888888888888';
const HEAD = { version: '0.4.0', takenAt: '2026-11-23T10:00:00.000Z' };

/** What the server serves for a person with one moved group: their own list, an item on it, and a list shared with them through a link's copy of its key. */
async function served(key: CryptoKey) {
  const group = newKeyring();
  const own = await deriveListKeyring(group, LIST);
  const sharedRing = newKeyring();
  const inventory = await deriveInventoryKeyring(group, H);
  const records: ServedRecords[] = [
    {
      kind: 'person',
      endToEnd: false,
      records: [{ id: PERSON, name: 'Ada', email: 'ada@example.com' }],
    },
    { kind: 'household', endToEnd: false, records: [{ id: H, own: true, encrypted: true }] },
    {
      kind: 'member',
      endToEnd: false,
      records: [{ household: H, list: LIST, person: PERSON, name: 'Ada', role: 'admin' }],
    },
    {
      kind: 'list_encrypted',
      endToEnd: true,
      records: [
        {
          id: LIST,
          householdId: H,
          content: {
            name: await sealField(
              own,
              { list: LIST, table: 'list', row: LIST, field: 'name' },
              'Groceries',
            ),
            icon: await sealField(
              own,
              { list: LIST, table: 'list', row: LIST, field: 'icon' },
              'apple',
            ),
            color: await sealField(
              own,
              { list: LIST, table: 'list', row: LIST, field: 'color' },
              '#dc2626',
            ),
          },
        },
        {
          id: SHARED,
          householdId: 'other-household',
          content: {
            name: await sealField(
              sharedRing,
              { list: SHARED, table: 'list', row: SHARED, field: 'name' },
              'Bob’s party',
            ),
          },
        },
      ],
    },
    {
      kind: 'item_encrypted',
      endToEnd: true,
      records: [
        {
          id: ITEM,
          listId: LIST,
          content: {
            name: await sealField(
              own,
              { list: LIST, table: 'item', row: ITEM, field: 'name' },
              'Oat milk',
            ),
            note: await sealField(
              own,
              { list: LIST, table: 'item', row: ITEM, field: 'note' },
              '1 litre, the green one',
            ),
          },
        },
      ],
    },
    // The person's own Inventory and own categories (§8.8, §8.3): bound to their group, in the place of a list, under the group's Inventory keys; and a list's copy of
    // one of their categories, which is the list's, under its keys.
    {
      kind: 'inventory_item_encrypted',
      endToEnd: true,
      records: [
        {
          id: INVENTORY,
          household_id: H,
          content: {
            name: await sealField(
              inventory,
              { list: H, table: 'inventory_item', row: INVENTORY, field: 'name' },
              'Good bin bags',
            ),
            note: await sealField(
              inventory,
              { list: H, table: 'inventory_item', row: INVENTORY, field: 'note' },
              'the strong ones',
            ),
          },
        },
      ],
    },
    {
      kind: 'category_encrypted',
      endToEnd: true,
      records: [
        {
          id: CATEGORY,
          household_id: H,
          content: {
            name: await sealField(
              inventory,
              { list: H, table: 'category', row: CATEGORY, field: 'name' },
              'Hardware',
            ),
          },
        },
      ],
    },
    {
      kind: 'list_category_encrypted',
      endToEnd: true,
      records: [
        {
          id: COPY,
          household_id: H,
          list_id: LIST,
          content: {
            name: await sealField(
              own,
              { list: LIST, table: 'list_category', row: COPY, field: 'name' },
              'Hardware',
            ),
          },
        },
      ],
    },
    {
      kind: 'household_key',
      endToEnd: true,
      records: [
        {
          household: H,
          epoch: 1,
          record: await wrapKeyring(key, group, { person: PERSON, household: H }),
        },
      ],
    },
    {
      kind: 'list_key',
      endToEnd: true,
      records: [
        {
          household: 'other-household',
          list: SHARED,
          epoch: 1,
          record: await wrapListKeyring(key, sharedRing, { person: PERSON, list: SHARED }),
        },
      ],
    },
  ];
  return records;
}

describe('a readable export, opened in the browser', () => {
  it('opens a person’s lists and items under their keys: their own list from the group’s, a shared one from their copy of its key', async () => {
    const key = await appKey();
    const file = await openServed(await served(key), key, HEAD);
    expect(file.unopened).toBe(0);
    expect(file.export).toEqual({
      format: 1,
      kind: 'person',
      producer: { name: 'shopper', version: '0.4.0' },
      takenAt: HEAD.takenAt,
      readable: true,
    });
    expect(file.records.list?.map((row) => row.name)).toEqual(['Groceries', 'Bob’s party']);
    // A list's icon and colour are in the file, opened (RFC 0005); a list that has neither has neither.
    expect(file.records.list?.[0]).toMatchObject({ icon: 'apple', color: '#dc2626' });
    expect(file.records.list?.[1]).not.toHaveProperty('icon');
    expect(file.records.item).toEqual([
      { id: ITEM, listId: LIST, name: 'Oat milk', note: '1 litre, the green one' },
    ]);
    expect(file.records.person).toEqual([{ id: PERSON, name: 'Ada', email: 'ada@example.com' }]);
    // Their own Inventory and categories are opened under the group's Inventory keys, and a list's copy under the list's.
    expect(file.records.inventory_item).toEqual([
      {
        id: INVENTORY,
        household_id: H,
        name: 'Good bin bags',
        note: 'the strong ones',
      },
    ]);
    expect(file.records.category?.[0]).toMatchObject({ id: CATEGORY, name: 'Hardware' });
    expect(file.records.list_category?.[0]).toMatchObject({ id: COPY, name: 'Hardware' });
    expect(file.records.member?.[0]).toMatchObject({ name: 'Ada', role: 'admin' });
  });

  it('holds no key, wrapped or not, and no ciphertext', async () => {
    const key = await appKey();
    const text = exportFileText(await openServed(await served(key), key, HEAD));
    expect(text).not.toMatch(/hk1\.|lr1\.|e2\.\d/);
    expect(text).not.toContain('household_key');
    expect(text).not.toContain('list_key');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('counts what this browser cannot open, as null, and never leaves it out silently', async () => {
    const key = await appKey();
    const all = await served(key);
    // Another app key: nothing opens. The plain rows are still there.
    const wrong = await openServed(all, await appKey(), HEAD);
    expect(wrong.unopened).toBe(10);
    expect(wrong.records.list?.map((row) => row.name)).toEqual([null, null]);
    expect(wrong.records.item?.[0]).toMatchObject({ name: null, note: null });
    expect(wrong.records.person).toHaveLength(1);
    // A value that was changed on the way: that one only.
    const tampered = structuredClone(all);
    const items = tampered.find((part) => part.kind === 'item_encrypted');
    const content = (items?.records[0] as { content: Record<string, string> }).content;
    content.note = `${content.note?.slice(0, -4)}AAAA`;
    const some = await openServed(tampered, key, HEAD);
    expect(some.unopened).toBe(1);
    expect(some.records.item?.[0]).toMatchObject({ name: 'Oat milk', note: null });
  });

  it('gives rows of a group the server still seals as it served them, and a file name with the day', async () => {
    const key = await appKey();
    const file = await openServed(
      [
        {
          kind: 'item',
          endToEnd: false,
          records: [{ id: ITEM, listId: LIST, content: { name: 'Eggs', note: null } }],
        },
      ],
      key,
      HEAD,
    );
    expect(file.records.item).toEqual([{ id: ITEM, listId: LIST, name: 'Eggs', note: null }]);
    expect(file.unopened).toBe(0);
    expect(exportFileName('2026-11-23T10:00:00.000Z')).toBe('shopper-export-2026-11-23.json');
  });
});
