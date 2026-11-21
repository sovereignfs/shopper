import { describe, it } from 'vitest';
import { pushStoreConformance } from '@sovereignfs/push/testing';
import { TEST_RING } from '../access/test-support';
import { runMigrations } from '../db/migrate';
import { freshDatabase, testTarget } from '../db/test-support';
import { pushStore } from './store';

/** Shopper's push store passes the package's own conformance suite (RFC 0002), on each database. */
describe(`the push store (${testTarget().leg})`, () => {
  for (const { name, run } of pushStoreConformance(async () => {
    const { database } = await freshDatabase('app');
    await runMigrations(database);
    return pushStore(database, TEST_RING);
  }))
    it(name, run, 30_000);
});
