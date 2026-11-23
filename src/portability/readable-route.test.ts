import { describe, expect, it, vi } from 'vitest';
import type { Limiter } from '../limits/rate';
import { readableExport, type ReadableExportDeps } from './readable-route';

/** A limiter that counts per key, as the real one does, with no database. */
function limiter(): Limiter {
  const counts = new Map<string, number>();
  return {
    take: async (key, rule) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= rule.limit ? { ok: true } : { ok: false, retryAfterMs: 60_000 };
    },
  };
}

/** The passwords of two accounts, and what each is served: nothing of one is in the other's. */
const PASSWORDS: Record<string, string> = { ada: 'derived-ada', grace: 'derived-grace' };
const RECORDS: Record<
  string,
  { kind: string; endToEnd: boolean; records: Record<string, unknown>[] }[]
> = {
  ada: [
    {
      kind: 'person',
      endToEnd: false,
      records: [{ id: 'ada', name: 'Ada', email: 'ada@example.com' }],
    },
  ],
  grace: [
    {
      kind: 'person',
      endToEnd: false,
      records: [{ id: 'grace', name: 'Grace', email: 'grace@example.com' }],
    },
  ],
};

function deps(over: Partial<ReadableExportDeps> = {}): ReadableExportDeps & {
  records: ReturnType<typeof vi.fn>;
} {
  const records = vi.fn(async (id: string) => RECORDS[id] ?? []);
  return {
    local: true,
    limiter: limiter(),
    now: () => Date.parse('2026-11-23T10:00:00.000Z'),
    version: '0.4.0',
    // Whose password it is: the account the session is for, as `confirmPassword` checks it, never the one a request names.
    verify: async (request, password) =>
      password === PASSWORDS[request.headers.get('x-session') ?? ''],
    records,
    ...over,
  } as ReadableExportDeps & { records: ReturnType<typeof vi.fn> };
}

const post = (as: string, body: unknown) =>
  new Request('https://shopper.example.com/api/account/export', {
    method: 'POST',
    headers: { 'x-session': as, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('/api/account/export (RFC 0005)', () => {
  it('serves the account’s own records, after its password, with the head the browser writes the file with, and caches nothing', async () => {
    const d = deps();
    const reply = await readableExport(post('ada', { password: 'derived-ada' }), 'ada', d);
    expect(reply.status).toBe(200);
    expect(reply.headers.get('cache-control')).toBe('no-store');
    expect(await reply.json()).toEqual({
      head: { version: '0.4.0', takenAt: '2026-11-23T10:00:00.000Z' },
      records: RECORDS.ada,
    });
    expect(d.records).toHaveBeenCalledExactlyOnceWith('ada');
  });

  it('serves nothing for a wrong password, and does not so much as read the records', async () => {
    const d = deps();
    const reply = await readableExport(post('ada', { password: 'not-it' }), 'ada', d);
    expect(reply.status).toBe(403);
    expect(await reply.json()).toEqual({ code: 'WRONG_PASSWORD' });
    expect(d.records).not.toHaveBeenCalled();
  });

  it('serves a second person nothing of the first: the records are the session’s account’s, and the first’s password is not the second’s', async () => {
    const d = deps();
    // Grace asks, with Ada's password: refused, and Ada's records are not read for her.
    const wrong = await readableExport(post('grace', { password: 'derived-ada' }), 'grace', d);
    expect(wrong.status).toBe(403);
    expect(d.records).not.toHaveBeenCalled();
    // With her own, she gets hers, and the request cannot name another account.
    const mine = await readableExport(
      post('grace', { password: 'derived-grace', account: 'ada', accountId: 'ada' }),
      'grace',
      d,
    );
    const body = JSON.stringify(await mine.json());
    expect(body).toContain('grace@example.com');
    expect(body).not.toContain('ada');
    expect(d.records).toHaveBeenCalledExactlyOnceWith('grace');
  });

  it('is tried at most five times in ten minutes, per account, and says how long to wait', async () => {
    const d = deps();
    for (let i = 0; i < 5; i += 1)
      expect((await readableExport(post('ada', { password: 'x' }), 'ada', d)).status).toBe(403);
    const limited = await readableExport(post('ada', { password: 'derived-ada' }), 'ada', d);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(d.records).not.toHaveBeenCalled();
    // Another account's tries are its own.
    expect(
      (await readableExport(post('grace', { password: 'derived-grace' }), 'grace', d)).status,
    ).toBe(200);
  });

  it('refuses what is not a request: no password, not JSON, a password too long, a body too large', async () => {
    const d = deps();
    for (const body of [
      {},
      { password: '' },
      { password: 7 },
      'not json',
      { password: 'x'.repeat(1001) },
    ]) {
      const reply = await readableExport(post('ada', body), 'ada', d);
      expect([400, 413], JSON.stringify(body).slice(0, 30)).toContain(reply.status);
    }
    expect((await readableExport(post('ada', 'x'.repeat(5000)), 'ada', d)).status).toBe(413);
    expect(d.records).not.toHaveBeenCalled();
  });

  it('is not there in suite mode, where the confirmation is a fresh sign-in at core (not yet released)', async () => {
    const d = deps({ local: false });
    const reply = await readableExport(post('ada', { password: 'derived-ada' }), 'ada', d);
    expect(reply.status).toBe(404);
    expect(d.records).not.toHaveBeenCalled();
  });
});
