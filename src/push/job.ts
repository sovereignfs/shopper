import { runPushOutbox } from '@sovereignfs/push';
import { getConfig } from '../config/current';
import { getDatabase } from '../db/boot';
import type { JobDefinition } from '../jobs/runner';
import { pushStore } from './store';

/**
 * Sends what is waiting in the push outbox (RFC 0002): the package claims what is due by a lease, in one statement, so that two processes never send one
 * push, and sends it, trying again later what a push service could not take. Every 15 seconds, and nothing with no push key.
 */
export const pushOutboxJob: JobDefinition = {
  name: 'push outbox',
  everyMs: 15_000,
  async run({ now }) {
    const config = getConfig();
    if (!config.push) return;
    await runPushOutbox({
      store: pushStore(await getDatabase(), config.encryption),
      settings: config.push,
      now: now.getTime(),
    });
  },
};
