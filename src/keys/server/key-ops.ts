import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { dbAll } from '../../db/exec';
import { appTable } from '../../db/tables';
import type { Operation } from '../../households/ops';

/**
 * **`household.key.mine`** (RFC 0001): a member keeps their own copy of a moved household's keyring, wrapped under their own app key, which only their
 * browser opens: after joining by a link, which gave it to them wrapped under the link's secret. Only the member's own row is written, only for a
 * household that has moved; anything else reads as not found.
 */
export const keepOwnKeys: Operation = {
  name: 'household.key.mine',
  who: 'member',
  input: z.object({
    record: z
      .string()
      .regex(/^hk1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      .max(8192),
  }),
  async run({ database, personId, household, now }, input) {
    const h = appTable(database, 'household');
    const kept = await dbAll<{ person_id: string }>(
      database,
      sql`INSERT INTO ${appTable(database, 'household_key')} (household_id, person_id, epoch, record, created_at)
          SELECT ${household}, ${personId}, h.epoch, ${String(input.record)}, ${now} FROM ${h} h
          WHERE h.id = ${household} AND h.encryption = 'encrypted'
          ON CONFLICT (household_id, person_id) DO UPDATE SET record = excluded.record, epoch = excluded.epoch
          RETURNING person_id`,
    );
    return kept.length > 0
      ? { ok: true as const }
      : { ok: false as const, refused: 'That household is not encrypted.' };
  },
};
