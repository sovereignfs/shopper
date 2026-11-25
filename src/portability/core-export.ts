import { createSovereign } from '@sovereignfs/sdk';
import { authSettings } from '../auth/server';
import { getConfig } from '../config/current';
import { getAuthStore, getDatabase } from '../db/boot';
import { accountOfSub } from '../sovereign/identity';
import { personRecords } from './records';
import packageJson from '../../package.json';

/**
 * What the SDK remembers of a token it has seen, so that a replay is refused. Shopper keeps its own sessions with better-auth, so this holds nothing
 * else; it is in memory, since an export asked for twice is the same export (sdk §9.1) and no harm comes of a second.
 */
const seen = new Map<string, { record: unknown; expiresAt: number }>();
const replays = {
  get: (id: string) => {
    const kept = seen.get(id);
    if (!kept || kept.expiresAt < Date.now()) return undefined;
    return kept.record as never;
  },
  set: (id: string, record: unknown, expiresAt: number) => void seen.set(id, { record, expiresAt }),
  delete: (id: string) => void seen.delete(id),
  deleteMatching: () => undefined,
};

/**
 * **Core's export of a person** (RFC 0003, `signIn.export`, sdk §9.1): core asks for Shopper's part with a signed token, and the SDK checks it (a replay
 * refused), answers at once with an export in the contract's format, and finishes it as the records are written. A person Shopper does not know gets an
 * empty part. `undefined` where core is not set: the route is then not there.
 */
export async function answerCoreExport(request: Request): Promise<Response | undefined> {
  const sovereign = authSettings()?.sovereign;
  const url = getConfig().url;
  if (!sovereign || !url) return undefined;
  const client = createSovereign({
    appUrl: url,
    coreUrl: sovereign.issuer,
    clientId: sovereign.clientId,
    clientSecret: sovereign.clientSecret,
    sessionStore: replays,
  });
  return client.auth.handleExportRequest(
    request,
    { prefix: 'shopper', version: packageJson.version },
    async ({ sub, writer }) => {
      const accountId = await accountOfSub(await getAuthStore(), sub);
      if (!accountId) return;
      for (const part of await personRecords(
        await getDatabase(),
        getConfig().encryption,
        accountId,
      ))
        await writer.addRecords(
          `apps/shopper/records/${part.kind}.jsonl`,
          part.kind,
          part.records,
          {
            endToEnd: part.endToEnd,
          },
        );
    },
  );
}
