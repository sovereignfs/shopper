/* eslint-disable @typescript-eslint/no-non-null-assertion -- a test reads rows it has just made, and a missing one should fail it loudly */
import { expect, type Page } from '@playwright/test';
import { anotherDevice, deviceRows, accountOf, makeLink, signUp, test } from './helpers';

/**
 * The review of phase 1 (`docs/security/0.1.0.md`), as tests that keep it true: what a second person can and cannot do through the doors a browser has, with
 * two real accounts against the built app. Each is something the review tried by hand; the ones that found something were seen to fail first.
 */
type Json = Record<string, unknown>;
const post = (
  page: Page,
  base: string,
  path: string,
  data: Json,
  headers: Record<string, string> = {},
) =>
  page.request.post(path, {
    headers: { origin: base, 'content-type': 'application/json', ...headers },
    data,
  });

interface Pull {
  households: {
    household: string;
    lists: { id: string }[];
    members: { personId: string; self: boolean; email: string | null }[];
  }[];
  gone: string[];
}
const pull = async (page: Page, base: string, cursors: Json = {}): Promise<Pull> =>
  (await (await post(page, base, '/api/sync', { version: 1, outbox: [], cursors })).json()) as Pull;

const mutation = (
  household: string,
  list: string,
  addedBy: string,
  over: Json = {},
  ids = { product: crypto.randomUUID(), item: crypto.randomUUID() },
) => ({
  mutationId: crypto.randomUUID(),
  householdId: household,
  changes: [
    {
      table: 'product',
      id: ids.product,
      create: true,
      fields: { name: `Probe ${ids.item.slice(0, 4)}`, createdAt: 1, lastAddedAt: 1 },
    },
    {
      table: 'item',
      id: ids.item,
      create: true,
      fields: {
        listId: list,
        productId: ids.product,
        name: 'Probe',
        quantity: '1',
        unit: null,
        note: null,
        categoryId: null,
        position: 'a0',
        addedBy,
        addedAt: 1,
        ...over,
      },
    },
  ],
});
const sync = async (page: Page, base: string, outbox: unknown[]) =>
  (await (await post(page, base, '/api/sync', { version: 1, outbox, cursors: {} })).json()) as {
    applied: unknown[];
    refused: { reason: string }[];
  };

async function twoPeople(page: Page, browser: Parameters<typeof anotherDevice>[0], base: string) {
  await signUp(page, { name: 'Ada' });
  const eve = await anotherDevice(browser, base);
  await signUp(eve.page, { name: 'Eve' });
  const ada = (await pull(page, base)).households[0]!;
  const eves = (await pull(eve.page, base)).households[0]!;
  return {
    eve,
    ada: { household: ada.household, list: ada.lists[0]!.id, person: ada.members[0]!.personId },
    eves: { household: eves.household, list: eves.lists[0]!.id, person: eves.members[0]!.personId },
  };
}

test('a person who is not in a household cannot write to it, point at it, or hear of it', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  const { eve, ada, eves } = await twoPeople(page, browser, base);
  // A control, so that a refusal below is for the reason and not for a mistake in the request.
  expect(
    (await sync(page, base, [mutation(ada.household, ada.list, ada.person)])).applied,
  ).toHaveLength(1);

  const into = await sync(eve.page, base, [mutation(ada.household, ada.list, eves.person)]);
  expect(into.applied).toHaveLength(0);
  expect(into.refused[0]?.reason).toBe('not_found');
  const pointing = await sync(eve.page, base, [mutation(eves.household, ada.list, eves.person)]);
  expect(pointing.applied).toHaveLength(0);
  expect(pointing.refused[0]?.reason).toBe('not_found');
  // Another person's household and one that does not exist are refused alike.
  const nowhere = await sync(eve.page, base, [
    mutation(crypto.randomUUID(), ada.list, eves.person),
  ]);
  expect(nowhere.refused[0]?.reason).toBe(into.refused[0]?.reason);
  // Asking for what changed in it gets nothing, and is told it is gone.
  const asked = await pull(eve.page, base, { [ada.household]: 0 });
  expect(asked.households.some((h) => h.household === ada.household)).toBe(false);
  expect(asked.gone).toContain(ada.household);
  // Nor can they use the doors for operations.
  for (const body of [{ op: 'invite.create' }, { op: 'invite.list' }, { op: 'member.leave' }]) {
    const reply = await post(eve.page, base, '/api/ops', { household: ada.household, ...body });
    expect(reply.status(), String(body.op)).toBe(404);
  }
  await eve.context.close();
});

test('a member cannot put another member’s name on what they add or tick', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  const { eve, ada } = await twoPeople(page, browser, base);
  const itemId = crypto.randomUUID();
  await sync(page, base, [
    mutation(
      ada.household,
      ada.list,
      ada.person,
      {},
      { product: crypto.randomUUID(), item: itemId },
    ),
  ]);
  const link = await makeLink(page, base);
  const accepted = await post(eve.page, base, '/api/invite/accept', {
    token: link.path.split('/').pop(),
  });
  expect((await accepted.json()).status).toBe('joined');

  const forgedAdd = await sync(eve.page, base, [mutation(ada.household, ada.list, ada.person)]);
  expect(forgedAdd.applied).toHaveLength(0);
  const forgedTick = await sync(eve.page, base, [
    {
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: [{ table: 'item', id: itemId, fields: { boughtAt: 5, boughtBy: ada.person } }],
    },
  ]);
  expect(forgedTick.applied).toHaveLength(0);
  // Their own name is accepted.
  const eves = (await pull(eve.page, base)).households
    .find((h) => h.household === ada.household)!
    .members.find((m) => m.self)!;
  const honest = await sync(eve.page, base, [
    {
      mutationId: crypto.randomUUID(),
      householdId: ada.household,
      changes: [{ table: 'item', id: itemId, fields: { boughtAt: 5, boughtBy: eves.personId } }],
    },
  ]);
  expect(honest.applied).toHaveLength(1);

  // A Member is given no one's address but their own; an Admin is given a member's. A Member cannot remove the Admin.
  const asMember = (await pull(eve.page, base)).households.find(
    (h) => h.household === ada.household,
  )!;
  expect(asMember.members.find((m) => m.personId === ada.person)?.email ?? null).toBeNull();
  const asAdmin = (await pull(page, base)).households.find((h) => h.household === ada.household)!;
  expect(typeof asAdmin.members.find((m) => !m.self)?.email).toBe('string');
  const removal = await post(eve.page, base, '/api/ops', {
    op: 'member.remove',
    household: ada.household,
    person: ada.person,
  });
  expect(removal.status()).toBe(404);
  await eve.context.close();
});

test('every route that changes something refuses a request from nowhere, from another site, and from "null"', async ({
  page,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const routes: [string, Json][] = [
    ['/api/sync', { version: 1, outbox: [], cursors: {} }],
    ['/api/ops', { op: 'invite.list', household: crypto.randomUUID() }],
    ['/api/invite/accept', { token: 'x'.repeat(43) }],
    ['/api/account/profile', { name: 'X' }],
    ['/api/account/delete', { password: 'x' }],
  ];
  for (const [path, data] of routes) {
    for (const origin of [undefined, 'https://evil.example', 'null']) {
      const reply = await page.request.post(path, {
        headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
        data,
      });
      expect(reply.status(), `${path} with origin ${String(origin)}`).toBe(403);
    }
  }
  expect(base).toBeTruthy();
});

test('what is a person’s is not cacheable, every page carries a nonce policy, and no page is frameable', async ({
  page,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const ada = (await pull(page, base)).households[0]!;
  for (const path of [
    '/',
    '/settings',
    `/l/${ada.lists[0]!.id}`,
    `/shop?l=${ada.lists[0]!.id}`,
    '/sign-in',
    '/invite/' + 'A'.repeat(43),
  ]) {
    const reply = await page.request.get(path);
    expect(reply.headers()['cache-control'], path).toMatch(/no-store/);
    const csp = reply.headers()['content-security-policy'] ?? '';
    expect(csp, path).toMatch(/script-src [^;]*'nonce-/);
    expect(csp, path).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(reply.headers()['x-content-type-options'], path).toBe('nosniff');
    expect(reply.headers()['referrer-policy'], path).toBe('no-referrer');
  }
  expect(
    (await post(page, base, '/api/sync', { version: 1, outbox: [], cursors: {} })).headers()[
      'cache-control'
    ],
  ).toMatch(/no-store/);
});

test('sign-in sends no one to another site, whatever it is asked to', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  for (const callbackURL of [
    'https://evil.example/',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
  ]) {
    const reply = await page.request.post('/api/auth/sign-in/email', {
      headers: {
        origin: base,
        'content-type': 'application/json',
        'x-forwarded-for': `10.88.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`,
      },
      data: { email: 'nobody@example.test', password: 'correct horse battery', callbackURL },
    });
    expect(reply.status(), callbackURL).toBe(403);
    expect((await reply.json()).code).toBe('INVALID_CALLBACK_URL');
  }
});

test('a request is bounded: too many mutations, too many bytes', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const ada = (await pull(page, base)).households[0]!;
  const many = Array.from({ length: 2000 }, () =>
    mutation(ada.household, ada.lists[0]!.id, ada.members[0]!.personId),
  );
  expect(
    (await post(page, base, '/api/sync', { version: 1, outbox: many, cursors: {} })).status(),
  ).toBe(400);
  expect(
    (
      await post(page, base, '/api/sync', {
        version: 1,
        outbox: [],
        cursors: {},
        pad: 'a'.repeat(3_000_000),
      })
    ).status(),
  ).toBe(413);
});

test('the session cookie is HttpOnly and SameSite=Lax, and the device’s copy of a deleted account is refused at once', async ({
  page,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name.endsWith('session_token'));
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  expect(session?.name.startsWith('shopper')).toBe(true);
  const account = await accountOf(page);
  expect(await deviceRows(page, account, 'household')).not.toBeNull();
  const deleted = await post(page, base, '/api/account/delete', {
    password: 'correct horse battery',
  });
  expect(deleted.status()).toBe(204);
  expect(
    (await post(page, base, '/api/sync', { version: 1, outbox: [], cursors: {} })).status(),
  ).toBe(401);
});
