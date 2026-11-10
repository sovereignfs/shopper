import type { Config } from '../config';
import { JobRunner, realDeps, type JobDefinition, type RunnerDeps } from './runner';

/**
 * Every job the app has. Each task that has one adds it here. **0.1.0 has none:** the key rotation runs at start-up (`instrumentation-node.ts`), and
 * the jobs that wait for the clock arrive in phase 2: finishing trips (7.2), the mail (9.1), the digest and the trimming of notices (9.3, 9.2) and
 * pruning the history (6.6).
 */
export const jobs: readonly JobDefinition[] = [];

/**
 * Starts the jobs, or says why not. `SHOPPER_WORKER=off` runs nothing in this process: when several share a database, one runs the jobs and the
 * others only serve (DESIGN.md §5). Returns the runner, so that the server can stop it.
 */
export function startJobs(
  config: Pick<Config, 'worker'>,
  definitions: readonly JobDefinition[] = jobs,
  deps: RunnerDeps = realDeps,
): JobRunner | undefined {
  if (!config.worker) {
    deps.log('[shopper] jobs: off in this process (SHOPPER_WORKER=off)');
    return undefined;
  }
  const runner = new JobRunner(deps);
  for (const job of definitions) runner.register(job);
  runner.start();
  deps.log(
    `[shopper] jobs: running ${definitions.length} job${definitions.length === 1 ? '' : 's'}`,
  );
  return runner;
}
