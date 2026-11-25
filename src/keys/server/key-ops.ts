import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { isId } from '../../actions/format';
import { dbAll } from '../../db/exec';
import { appTable } from '../../db/tables';
import { onCard } from '../../access/membership';
import type { Operation } from '../../households/ops';

/**
 * **`list.key.mine`** (RFC 0001; RFC 0004, task 21.4): someone on a list keeps their own copy of the list's keyring, wrapped under their own app key,
 * which only their browser opens: after joining by a link, which gave it to them wrapped under the link's secret. Only their own row is written, only
 * for a list they are on (`dispatch` holds it to that) in a group that has moved; anything else reads as not found. The list's maker needs none: their
 * devices derive it from the group's keyring.
 */
export const keepListKeys: Operation = {
  name: 'list.key.mine',
  who: 'member',
  scope: 'list',
  input: z.object({
    list: z.string().refine(isId, 'not an id'),
    record: z
      .string()
      .regex(/^lr1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      .max(8192),
  }),
  async run({ database, personId, household, now }, input) {
    const h = appTable(database, 'household');
    const kept = await dbAll<{ person_id: string }>(
      database,
      sql`INSERT INTO ${appTable(database, 'list_key')} (list_id, person_id, household_id, epoch, record, created_at)
          SELECT ${String(input.list)}, ${personId}, h.id, h.epoch, ${String(input.record)}, ${now} FROM ${h} h
          WHERE h.id = ${household} AND h.encryption = 'encrypted'
          ON CONFLICT (list_id, person_id) DO UPDATE SET record = excluded.record, epoch = excluded.epoch
          RETURNING person_id`,
    );
    return kept.length > 0
      ? { ok: true as const }
      : { ok: false as const, refused: 'That list is not encrypted.' };
  },
};

/**
 * **`card.key.mine`** (RFC 0007, task 24.5): someone on a card keeps their own copy of the card's keyring, wrapped under their own app key, which only their browser opens: after joining by a link,
 * which gave it to them wrapped under the link's secret. As `list.key.mine` is, and the card's Admin needs none (their devices derive it from the group's keyring). **The statement carries the
 * permission**: only the account's own row, only for a card they are on (`onCard`) that is in the group the request names, which must have moved; anything else reads as not found or refused.
 */
export const keepCardKeys: Operation = {
  name: 'card.key.mine',
  who: 'member',
  scope: 'card',
  input: z.object({
    card: z.string().refine(isId, 'not an id'),
    record: z
      .string()
      .regex(/^cr1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      .max(8192),
  }),
  async run({ database, accountId, personId, household, now }, input) {
    const card = String(input.card);
    const h = appTable(database, 'household');
    const kept = await dbAll<{ person_id: string }>(
      database,
      sql`INSERT INTO ${appTable(database, 'card_key')} (card_id, person_id, household_id, epoch, record, created_at)
          SELECT ${card}, ${personId}, h.id, h.epoch, ${String(input.record)}, ${now} FROM ${h} h
          WHERE h.id = ${household} AND h.encryption = 'encrypted'
            AND EXISTS (SELECT 1 FROM ${appTable(database, 'card')} c WHERE c.id = ${card} AND c.household_id = h.id)
            AND ${onCard(database, card, accountId)}
          ON CONFLICT (card_id, person_id) DO UPDATE SET record = excluded.record, epoch = excluded.epoch
          RETURNING person_id`,
    );
    return kept.length > 0
      ? { ok: true as const }
      : { ok: false as const, refused: 'That card is not encrypted.' };
  },
};
