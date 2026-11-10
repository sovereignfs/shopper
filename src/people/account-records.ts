import { getConfig } from '../config/current';
import { getDatabase } from '../db/boot';
import { ensurePerson } from './people';

/**
 * What the app keeps of an account besides better-auth's row: its person (task 3.1) and, with task 3.3, its first household. **Idempotent**: called when
 * the account is made and again by every session check, since the two stores are separate databases and no transaction spans them, so an account whose
 * records were not made then has them by its next request.
 */
export async function ensureAccountRecords(account: {
  id: string;
  name: string;
  email: string;
}): Promise<void> {
  const database = await getDatabase();
  const { encryption } = getConfig();
  await ensurePerson(database, encryption, account);
}
