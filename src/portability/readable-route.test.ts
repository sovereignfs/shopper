import { describe, expect, it, vi } from 'vitest';
import type { Limiter } from '../limits/rate';
import { RECENT_SIGN_IN_MS, readableExport, type ReadableExportDeps } from './readable-route';

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

const NOW = Date.parse('2026-11-23T10:00:00.000Z');
/** When each of two accounts last signed in at core, in suite mode: Ada a minute ago, Grace an hour ago, and Lin never (not from core). */
const SIGNED_IN: Record<string, number | undefined> = {
  ada: NOW - 60_000,
  grace: NOW - 3_600_000,
};

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
    confirmation: 'password',
    limiter: limiter(),
    now: () => NOW,
    version: '0.4.0',
    // Whose password it is: the account the session is for, as `confirmPassword` checks it, never the one a request names.
    verify: async (request, password) =>
      password === PASSWORDS[request.headers.get('x-session') ?? ''],
    // When each account last signed in at core on its session, by the session the request names.
    signedInAt: async (request) => SIGNED_IN[request.headers.get('x-session') ?? ''],
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
});

describe('/api/account/export in suite mode: a sign-in at core in the last few minutes is the confirmation (RFC 0005)', () => {
  const suite = (over: Partial<ReadableExportDeps> = {}) => deps({ confirmation: 'core', ...over });

  it('serves the account’s own records to someone who signed in at core a minute ago, with no password in the request', async () => {
    const d = suite();
    const reply = await readableExport(post('ada', {}), 'ada', d);
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      head: { version: '0.4.0', takenAt: '2026-11-23T10:00:00.000Z' },
      records: RECORDS.ada,
    });
    expect(d.records).toHaveBeenCalledExactlyOnceWith('ada');
    // An empty body is as good as `{}`, and a password sent anyway changes nothing: it is not what confirms.
    expect((await readableExport(post('ada', ''), 'ada', suite())).status).toBe(200);
    expect(
      (await readableExport(post('ada', { password: 'whatever' }), 'ada', suite())).status,
    ).toBe(200);
  });

  it('asks to sign in again when the last sign-in at core is old, or core does not say, and serves nothing', async () => {
    for (const [who, why] of [
      ['grace', 'an hour ago'],
      ['lin', 'never from core'],
    ] as const) {
      const d = suite();
      const reply = await readableExport(post(who, {}), who, d);
      expect(reply.status, why).toBe(403);
      expect(await reply.json()).toEqual({ code: 'SIGN_IN_AGAIN' });
      expect(d.records, why).not.toHaveBeenCalled();
    }
    // The password that would do running alone does not do here.
    const d = suite();
    expect(
      (await readableExport(post('grace', { password: 'derived-grace' }), 'grace', d)).status,
    ).toBe(403);
    expect(d.records).not.toHaveBeenCalled();
  });

  it('is recent for five minutes, to the millisecond, and not from the future', async () => {
    const at = (age: number) =>
      readableExport(post('ada', {}), 'ada', suite({ signedInAt: async () => NOW - age }));
    expect(RECENT_SIGN_IN_MS).toBe(300_000);
    expect((await at(RECENT_SIGN_IN_MS)).status).toBe(200);
    expect((await at(RECENT_SIGN_IN_MS + 1)).status).toBe(403);
    expect((await at(0)).status).toBe(200);
    // A clock that disagrees by seconds is forgiven; by more than a minute, not trusted.
    expect((await at(-30_000)).status).toBe(200);
    expect((await at(-61_000)).status).toBe(403);
  });

  it('serves a second person nothing of the first: the records are the session’s account’s, whoever the request names', async () => {
    const d = suite();
    const mine = await readableExport(
      post('ada', { account: 'grace', accountId: 'grace' }),
      'ada',
      d,
    );
    expect(mine.status).toBe(200);
    expect(JSON.stringify(await mine.json())).not.toContain('grace');
    expect(d.records).toHaveBeenCalledExactlyOnceWith('ada');
  });

  it('is tried at most five times in ten minutes, and refuses what is not a request', async () => {
    const d = suite();
    for (let i = 0; i < 5; i += 1)
      expect((await readableExport(post('grace', {}), 'grace', d)).status).toBe(403);
    const limited = await readableExport(post('grace', {}), 'grace', d);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect((await readableExport(post('ada', 'x'.repeat(5000)), 'ada', suite())).status).toBe(413);
    expect((await readableExport(post('ada', 'not json'), 'ada', suite())).status).toBe(400);
    expect((await readableExport(post('ada', '[1]'), 'ada', suite())).status).toBe(400);
  });
});
