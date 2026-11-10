import { loadConfig } from './src/config';
import { processEnv } from './src/config/env';

/**
 * Brings the server up, or stops it. The standalone server would otherwise stay up and answer, and an instance would find the mistake from a
 * person using it:
 *
 * 1. The settings are checked, and a wrong one stops the server, naming it and never its value.
 * 2. The database is provisioned, opened and migrated (DESIGN.md §20.1), and the server does not start if it cannot. It waits for one that is
 *    still starting, up to SHOPPER_DB_CONNECT_TIMEOUT_MS, since in a compose file the app and its database come up together.
 * 3. What is sealed must be openable with the keys it was given, or the server stops, naming the fingerprints; and what is wrapped under
 *    `SHOPPER_ENCRYPTION_KEY_PREVIOUS` is moved to the current key, with the name keys that depend on it (DESIGN.md §13.1). Any replica may do it,
 *    and all of them at once.
 *
 * The background jobs (task 1.6) join here.
 */
export async function start(): Promise<void> {
  const result = loadConfig(processEnv());
  if (!result.ok) {
    console.error('Shopper cannot start, because of its settings:');
    for (const problem of result.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  try {
    const { getStores } = await import('./src/db/boot');
    const stores = await getStores(result.config.database);
    const { assertKeys, rotateSealed } = await import('./src/crypto/rotate');
    await assertKeys(stores.app, result.config.encryption);
    await rotateSealed(stores.app, result.config.encryption);
  } catch (error) {
    console.error('Shopper cannot start, because its database or its keys are not usable:');
    console.error(`  - ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
