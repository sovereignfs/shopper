import type { KeyRing } from '../crypto/keys';
import type { Database } from '../db/client';
import { householdsOf } from '../households/households';
import type { Limits } from '../limits/config';
import { applyMutation } from './apply';
import { PROTOCOL, type SyncAnswer, syncRequest } from './protocol';
import { pullHousehold } from './pull';

/**
 * **`POST /api/sync`** (DESIGN.md §12.3), the logic: the outbox applied in order through `applyMutation`, each answered applied (with any fold) or refused
 * with its reason and sentence; then, for **the households the account is an active member of now** (read in the statement), what changed since each
 * cursor; and the households the device holds that the account is no longer in, named as gone. A lost answer is only a retry, since a mutation sent again
 * is answered as it was. Pure of HTTP: the route gives it the account and the body.
 */
export interface EndpointDeps {
  readonly database: Database;
  readonly ring: KeyRing;
  readonly limits: Limits;
  readonly intervalSeconds: number;
}

export type EndpointReply =
  | { readonly status: 200; readonly body: SyncAnswer }
  | {
      readonly status: 400 | 426;
      readonly body: { readonly error: 'invalid' | 'update'; readonly protocol: number };
    };

export async function handleSync(
  deps: EndpointDeps,
  accountId: string,
  input: unknown,
  now: number = Date.now(),
): Promise<EndpointReply> {
  const parsed = syncRequest.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: 'invalid', protocol: PROTOCOL } };
  // A device made for another protocol is told to update, and keeps its outbox.
  if (parsed.data.version !== PROTOCOL)
    return { status: 426, body: { error: 'update', protocol: PROTOCOL } };
  const { outbox, cursors } = parsed.data;

  const applied: SyncAnswer['applied'][number][] = [];
  const refused: SyncAnswer['refused'][number][] = [];
  for (const mutation of outbox) {
    const result = await applyMutation(deps, accountId, mutation, now);
    const mutationId =
      typeof (mutation as { mutationId?: unknown } | null)?.mutationId === 'string'
        ? String((mutation as { mutationId: string }).mutationId)
        : '';
    if (result.status === 'refused')
      refused.push({ mutationId, reason: result.reason, sentence: result.sentence });
    else applied.push({ mutationId, status: result.status, seq: result.seq, folds: result.folds });
  }

  const current = await householdsOf(deps.database, deps.ring, accountId);
  const households = [];
  for (const household of current) {
    const pulled = await pullHousehold(
      deps.database,
      deps.ring,
      accountId,
      household.id,
      cursors[household.id] ?? 0,
    );
    if (pulled) households.push(pulled);
  }
  const live = new Set(current.map((household) => household.id));
  const gone = Object.keys(cursors).filter((id) => !live.has(id));
  return {
    status: 200,
    body: {
      protocol: PROTOCOL,
      applied,
      refused,
      households,
      gone,
      settings: { intervalSeconds: deps.intervalSeconds },
    },
  };
}
