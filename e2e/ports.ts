/**
 * Every port the browser tests use, each shifted by `SHOPPER_E2E_PORT_OFFSET`, so that several runs can share a machine: `scripts/e2e-shard.mjs` (when
 * there are enough specs to want it) gives each of its shards a hundred of its own, and each then has its own instances, databases and fake services.
 * With none set they are the ports the tests have always used. Plain TypeScript with no syntax Node cannot strip, since a fake service run by Node
 * reads this too.
 */
const offset = Number(process.env.SHOPPER_E2E_PORT_OFFSET ?? 0);
if (!Number.isInteger(offset) || offset < 0 || offset > 20_000) {
  throw new Error('SHOPPER_E2E_PORT_OFFSET must be a whole number from 0 to 20000');
}

export const PORTS = {
  /** The app under test, on the database the environment names. */
  app: 3899 + offset,
  /** The instance that is closed to sign-up (`e2e/auth.spec.ts`): its own file, so that its first account is its own. */
  closed: 3898 + offset,
} as const;
