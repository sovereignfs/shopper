import { sql } from 'drizzle-orm';
import { onCard, onList, ownerOf, reaches } from '../access/membership';
import type { KeyRing } from '../crypto/keys';
import { unsealRow } from '../crypto/sealed';
import type { Database } from '../db/client';
import { dbAll, dbGet } from '../db/exec';
import { appTable } from '../db/tables';

/**
 * **What a person's export holds of Shopper** (RFC 0003, `contracts/export.md`): one file of records per kind under `apps/shopper/records/`. Their own
 * person, what their account keeps for itself, and of every group they are on a list of, the lists they are on: those lists, items, products and categories, and its members **by name only**, with no one else's
 * address. A household that has moved keeps its content as the ciphertext its devices wrote, marked end to end, with the person's own copy of its keys
 * beside it, so that their keys open it and nothing is in plain text on the way; one the server still seals is given as the server reads it, since it
 * is the person's and the server holds its key. Nothing the contract forbids: no password, session, token or other person's email.
 */
export interface ExportRecords {
  readonly kind: string;
  readonly records: readonly Record<string, unknown>[];
  /** Whether these are a moved household's ciphertext, which the export's contents say. */
  readonly endToEnd: boolean;
}

const CONTENT_TABLES = [
  'list',
  'item',
  'product',
  'category',
  'inventory_item',
  'list_category',
  'card',
] as const;

export async function personRecords(
  database: Database,
  ring: KeyRing,
  accountId: string,
): Promise<ExportRecords[]> {
  const person = await dbGet<{ id: string; sealed: string }>(
    database,
    sql`SELECT id, sealed FROM ${appTable(database, 'person')} WHERE account_id = ${accountId}`,
  );
  if (!person) return [];
  const own = unsealRow('person', person.id, person.sealed, ring);
  const out: ExportRecords[] = [
    {
      kind: 'person',
      endToEnd: false,
      records: [{ id: person.id, name: own.name ?? null, email: own.email ?? null }],
    },
  ];
  const settings = await accountSettings(database, accountId);
  if (settings) out.push({ kind: 'account_settings', endToEnd: false, records: [settings] });

  const households = await dbAll<{ id: string; encryption: string; own_of: string | null }>(
    database,
    sql`SELECT h.id, h.encryption, h.own_of FROM ${appTable(database, 'household')} h
        WHERE ${reaches(database, sql.raw('h.id'), accountId)} ORDER BY h.id`,
  );
  const plain: Record<string, Record<string, unknown>[]> = {
    household: [],
    member: [],
    card_member: [],
    list_card: [],
  };
  const encrypted: Record<string, Record<string, unknown>[]> = {
    household_key: [],
    list_key: [],
    card_key: [],
  };
  for (const table of CONTENT_TABLES) {
    plain[table] = [];
    encrypted[table] = [];
  }
  // Only the person's own lists and those shared with them (RFC 0004), as the pull hands them: never another list of a group they are on.
  const visible = (table: (typeof CONTENT_TABLES)[number]) =>
    table === 'list'
      ? onList(database, sql`r.id`, accountId)
      : table === 'item'
        ? onList(database, sql`r.list_id`, accountId)
        : table === 'product'
          ? sql`(${onList(database, sql`r.list_id`, accountId)} OR (r.list_id IS NULL AND ${ownerOf(database, sql`r.household_id`, accountId)}))`
          : table === 'inventory_item'
            ? // Their own Inventory only (§8.8): the group whose own account they are, and nobody's else.
              ownerOf(database, sql`r.household_id`, accountId)
            : table === 'card'
              ? // A card is its people's alone (§7.7): the cards they are on, whatever else they are on in the group.
                onCard(database, sql`r.id`, accountId)
              : table === 'list_category'
                ? // A list's copies of people's categories are the list's (§8.3), read by its people as its items are.
                  onList(database, sql`r.list_id`, accountId)
                : table === 'category'
                  ? // The starter categories of any group they are on a list of, and their own categories only in the group they own (§8.3).
                    sql`(r.starter_key IS NOT NULL OR ${ownerOf(database, sql`r.household_id`, accountId)})`
                  : sql`1 = 1`;
  for (const household of households) {
    const moved = household.encryption === 'encrypted';
    plain.household?.push({
      id: household.id,
      own: household.own_of === accountId,
      encrypted: moved,
    });
    const members = await dbAll<{
      list_id: string;
      person_id: string;
      role: string;
      joined_at: number;
      left_at: number | null;
      sealed: string;
    }>(
      database,
      sql`SELECT m.list_id, m.person_id, m.role, m.joined_at, m.left_at, p.sealed FROM ${appTable(database, 'list_member')} m
          JOIN ${appTable(database, 'person')} p ON p.id = m.person_id
          WHERE m.household_id = ${household.id} AND ${onList(database, sql`m.list_id`, accountId)}
          ORDER BY m.list_id, m.joined_at, m.person_id`,
    );
    for (const member of members)
      plain.member?.push({
        household: household.id,
        list: member.list_id,
        person: member.person_id,
        // By name only: another person's address is never in someone else's export.
        name: unsealRow('person', member.person_id, member.sealed, ring).name ?? null,
        role: member.role,
        joinedAt: Number(member.joined_at),
        leftAt: member.left_at === null ? null : Number(member.left_at),
      });
    // The people of the cards they are on, by name only, as a list's are.
    const cardMembers = await dbAll<{
      card_id: string;
      person_id: string;
      role: string;
      joined_at: number;
      left_at: number | null;
      sealed: string;
    }>(
      database,
      sql`SELECT m.card_id, m.person_id, m.role, m.joined_at, m.left_at, p.sealed FROM ${appTable(database, 'card_member')} m
          JOIN ${appTable(database, 'person')} p ON p.id = m.person_id
          WHERE m.household_id = ${household.id} AND ${onCard(database, sql`m.card_id`, accountId)}
          ORDER BY m.card_id, m.joined_at, m.person_id`,
    );
    for (const member of cardMembers)
      plain.card_member?.push({
        household: household.id,
        card: member.card_id,
        person: member.person_id,
        name: unsealRow('person', member.person_id, member.sealed, ring).name ?? null,
        role: member.role,
        joinedAt: Number(member.joined_at),
        leftAt: member.left_at === null ? null : Number(member.left_at),
      });
    // The cards linked to their lists (24.6), for the person who is on both the list and the card, as the pull hands them: the pair and an unlink, which hold nothing sealed.
    const links = await dbAll<{
      id: string;
      list_id: string;
      card_id: string;
      deleted_at: number | null;
      created_at: number;
    }>(
      database,
      sql`SELECT r.id, r.list_id, r.card_id, r.deleted_at, r.created_at FROM ${appTable(database, 'list_card')} r
          WHERE r.household_id = ${household.id} AND ${onList(database, sql`r.list_id`, accountId)} AND ${onCard(database, sql`r.card_id`, accountId)}
          ORDER BY r.id`,
    );
    for (const link of links)
      plain.list_card?.push({
        id: link.id,
        household: household.id,
        list: link.list_id,
        card: link.card_id,
        deletedAt: link.deleted_at === null ? null : Number(link.deleted_at),
        createdAt: Number(link.created_at),
      });
    for (const table of CONTENT_TABLES) {
      const rows = await dbAll<Record<string, unknown>>(
        database,
        sql`SELECT * FROM ${appTable(database, table)} r WHERE r.household_id = ${household.id} AND ${visible(table)} ORDER BY r.id`,
      );
      for (const row of rows) {
        const { sealed, encrypted: cipher, fseq: _fseq, ...rest } = row;
        // What another person made of a starter category (a name they gave it) is theirs: someone on a list of the group is given the row, not that.
        if (table === 'category' && household.own_of !== accountId) {
          plain.category?.push({ ...rest, content: {} });
          continue;
        }
        if (moved) encrypted[table]?.push({ ...rest, content: parse(cipher) });
        else
          plain[table]?.push({
            ...rest,
            content:
              typeof sealed === 'string' && sealed !== ''
                ? unsealRow(table, String(row.id), sealed, ring)
                : {},
          });
      }
    }
    if (moved) {
      const key = await dbGet<{ epoch: number; record: string }>(
        database,
        sql`SELECT epoch, record FROM ${appTable(database, 'household_key')} WHERE household_id = ${household.id} AND person_id = ${person.id}`,
      );
      if (key)
        encrypted.household_key?.push({
          household: household.id,
          epoch: Number(key.epoch),
          record: key.record,
        });
      // Their own copies of the keys of lists shared with them (RFC 0004), of lists they are on now.
      const listKeys = await dbAll<{ list_id: string; epoch: number; record: string }>(
        database,
        sql`SELECT k.list_id, k.epoch, k.record FROM ${appTable(database, 'list_key')} k
            WHERE k.household_id = ${household.id} AND k.person_id = ${person.id} AND ${onList(database, sql`k.list_id`, accountId)}
            ORDER BY k.list_id`,
      );
      for (const each of listKeys)
        encrypted.list_key?.push({
          household: household.id,
          list: each.list_id,
          epoch: Number(each.epoch),
          record: each.record,
        });
      // Their own copies of the keys of the cards they are on (RFC 0007).
      const cardKeys = await dbAll<{ card_id: string; epoch: number; record: string }>(
        database,
        sql`SELECT k.card_id, k.epoch, k.record FROM ${appTable(database, 'card_key')} k
            WHERE k.household_id = ${household.id} AND k.person_id = ${person.id} AND ${onCard(database, sql`k.card_id`, accountId)}
            ORDER BY k.card_id`,
      );
      for (const each of cardKeys)
        encrypted.card_key?.push({
          household: household.id,
          card: each.card_id,
          epoch: Number(each.epoch),
          record: each.record,
        });
    }
  }
  for (const [kind, records] of Object.entries(plain))
    if (records.length > 0) out.push({ kind, records, endToEnd: false });
  for (const [kind, records] of Object.entries(encrypted))
    if (records.length > 0)
      out.push({
        kind:
          kind === 'household_key' || kind === 'list_key' || kind === 'card_key'
            ? kind
            : `${kind}_encrypted`,
        records,
        endToEnd: true,
      });
  return out;
}

/** What an account keeps for itself on the server (DESIGN.md §20.3): its one row, by the session's own account, without the id it is kept under. */
async function accountSettings(
  database: Database,
  accountId: string,
): Promise<Record<string, unknown> | undefined> {
  const row = await dbGet<{
    last_list_id: string | null;
    inbox_seen_at: number | string | null;
    created_at: number | string;
    updated_at: number | string;
  }>(
    database,
    sql`SELECT last_list_id, inbox_seen_at, created_at, updated_at FROM ${appTable(database, 'account_settings')} WHERE account_id = ${accountId}`,
  );
  if (!row) return undefined;
  return {
    lastList: row.last_list_id,
    inboxSeenAt: row.inbox_seen_at === null ? null : Number(row.inbox_seen_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function parse(raw: unknown): Record<string, string> {
  try {
    const value: unknown = JSON.parse(typeof raw === 'string' ? raw : '{}');
    return value && typeof value === 'object' ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}
