/* eslint-disable @typescript-eslint/no-non-null-assertion -- a test reads rows it has just made, and a missing one should fail it loudly */
import { expect, type Page } from '@playwright/test';
import {
  PASSWORD,
  accountOf,
  anotherDevice,
  deleteInSettings,
  deviceRows,
  makeLink,
  newEmail,
  signUp,
  test,
} from './helpers';

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
  (await (await post(page, base, '/api/sync', { version: 2, outbox: [], cursors })).json()) as Pull;

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
      fields: {
        listId: list,
        name: sealedShape(list, ids.product),
        nameKey: `n3.${ids.product.replace(/-/g, '').padEnd(43, 'A').slice(0, 43)}`,
        createdAt: 1,
        lastAddedAt: 1,
      },
    },
    {
      table: 'item',
      id: ids.item,
      create: true,
      fields: {
        listId: list,
        productId: ids.product,
        name: sealedShape(list, ids.item),
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
  (await (await post(page, base, '/api/sync', { version: 2, outbox, cursors: {} })).json()) as {
    applied: unknown[];
    refused: { reason: string }[];
  };

/**
 * A value of the shape a device sends for an encrypted field of `row` (RFC 0001). These tests are of who may write what, which the server decides
 * without opening anything: it checks the shape, and the probes are never read by a page.
 */
/** A value in the shape a device encrypts one, for its list and row (RFC 0004): the server cannot open it, and holds it to its row's list. */
const sealedShape = (list: string, row: string) => `e2.1.${list}.${row}.${'A'.repeat(24)}`;

/** Every household of the page's account has moved, as each does once its device has opened its key: the probes are written for a moved household. */
async function moved(page: Page, base: string) {
  await expect
    .poll(
      async () =>
        (await pull(page, base)).households.every(
          (h) => (h as { encryption?: { state: string } }).encryption?.state === 'encrypted',
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function twoPeople(page: Page, browser: Parameters<typeof anotherDevice>[0], base: string) {
  await signUp(page, { name: 'Ada' });
  const eve = await anotherDevice(browser, base);
  await signUp(eve.page, { name: 'Eve' });
  await moved(page, base);
  await moved(eve.page, base);
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
    const reply = await post(eve.page, base, '/api/ops', {
      household: ada.household,
      list: ada.list,
      ...body,
    });
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
    token: link.path.split('#')[0]?.split('/').pop(),
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
    list: ada.list,
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
    ['/api/sync', { version: 2, outbox: [], cursors: {} }],
    ['/api/ops', { op: 'invite.list', household: crypto.randomUUID() }],
    ['/api/invite/accept', { token: 'x'.repeat(43) }],
    ['/api/account/profile', { name: 'X' }],
    ['/api/account/delete', { password: 'x' }],
    ['/api/account/export', { password: 'x' }],
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
    '/inventory',
    '/sign-in',
    '/invite/' + 'A'.repeat(43),
  ]) {
    const reply = await page.request.get(path);
    expect(reply.headers()['cache-control'], path).toMatch(/no-store/);
    const csp = reply.headers()['content-security-policy'] ?? '';
    expect(csp, path).toMatch(/script-src [^;]*'nonce-/);
    expect(csp, path).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(reply.headers()['x-content-type-options'], path).toBe('nosniff');
    expect(reply.headers()['referrer-policy'], path).toBe('strict-origin');
  }
  expect(
    (await post(page, base, '/api/sync', { version: 2, outbox: [], cursors: {} })).headers()[
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
    (await post(page, base, '/api/sync', { version: 2, outbox: many, cursors: {} })).status(),
  ).toBe(400);
  expect(
    (
      await post(page, base, '/api/sync', {
        version: 2,
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
  // The package's name for it (ADR 0001): `__Host-` over https, bare on this http instance.
  expect(session?.name).toBe('better-auth.session_token');
  const account = await accountOf(page);
  expect(await deviceRows(page, account, 'household')).not.toBeNull();
  await deleteInSettings(page, PASSWORD);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  expect(
    (await post(page, base, '/api/sync', { version: 2, outbox: [], cursors: {} })).status(),
  ).toBe(401);
});

test('the vault and the key secret are the session’s own: another person gets theirs, a visitor nothing, and another site cannot write', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? '';
  await signUp(page, { name: 'Ada' });
  const ada = await accountOf(page);
  const adaSecret = await page.request.get(`${base}/api/auth/sv/key-secret`);
  expect(adaSecret.status()).toBe(200);
  const adaBody = (await adaSecret.json()) as { sub: string; secret: string };
  expect(adaBody.sub).toBe(ada);
  expect(adaBody.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(adaSecret.headers()['cache-control']).toContain('no-store');
  // Signing up made her keys: the vault holds them, wrapped.
  const adaVault = (await (await page.request.get(`${base}/api/keys/vault`)).json()) as {
    value?: { sub: string; account?: unknown };
  };
  expect(adaVault.value?.sub).toBe(ada);
  expect(adaVault.value?.account).toBeTruthy();

  const other = await anotherDevice(browser, base);
  await signUp(other.page, { name: 'Grace' });
  const grace = await accountOf(other.page);
  const graceBody = (await (
    await other.page.request.get(`${base}/api/auth/sv/key-secret`)
  ).json()) as {
    sub: string;
    secret: string;
  };
  expect(graceBody.sub).toBe(grace);
  expect(graceBody.secret).not.toBe(adaBody.secret);
  const graceVault = (await (await other.page.request.get(`${base}/api/keys/vault`)).json()) as {
    value?: { sub: string };
  };
  expect(graceVault.value?.sub).toBe(grace);
  // A change from another site is refused, whoever is signed in.
  const foreign = await other.page.request.post(`${base}/api/keys/vault`, {
    headers: { origin: 'https://elsewhere.test' },
    data: { op: 'confirm-kit', record: '{}' },
  });
  expect(foreign.status()).toBe(403);
  await other.context.close();

  // Push (RFC 0002): a signed-in person is told whether this server sends any; a change from another site, and a visitor, get nothing.
  expect((await page.request.get(`${base}/api/push/subscription`)).status()).toBe(200);
  const foreignPush = await page.request.post(`${base}/api/push/subscription`, {
    headers: { origin: 'https://elsewhere.test' },
    data: {},
  });
  expect([403, 503]).toContain(foreignPush.status());

  const visitor = await anotherDevice(browser, base);
  expect((await visitor.page.request.get(`${base}/api/push/subscription`)).status()).toBe(401);
  expect((await visitor.page.request.get(`${base}/api/auth/sv/key-secret`)).status()).toBe(401);
  expect((await visitor.page.request.get(`${base}/api/keys/vault`)).status()).toBe(401);
  await visitor.context.close();
});

/**
 * A form pressed before its script has run is sent by the browser itself: a GET with every named box in the address, which the history and a reverse
 * proxy's access log keep. JavaScript off stands for "not run yet". Reset password is not here: this instance sends no mail, so the page is not there,
 * and its form is checked in `src/auth/screens/reset-form.test.tsx`.
 */
test.describe('before a page’s script runs', () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ['/sign-in', '/sign-up']) {
    test(`${path} cannot be sent, so no password reaches an address`, async ({ page }) => {
      await page.goto(path);
      const boxes = page.locator('form input');
      await expect(boxes.first()).toBeVisible();
      for (const box of await boxes.all()) {
        const type = await box.getAttribute('type');
        await box.fill(type === 'email' ? newEmail() : PASSWORD);
      }
      const sent: string[] = [];
      page.on('request', (request) => {
        if (request.isNavigationRequest()) sent.push(request.url());
      });
      await page.locator('input[type="password"]').last().press('Enter');
      // Nothing is to happen, so there is nothing to wait for: a navigation the browser starts is under way well within this.
      await page.waitForTimeout(1_000);
      expect(sent).toEqual([]);
      expect(new URL(page.url()).search).toBe('');
      await expect(page.locator('form button[type="submit"]')).toBeDisabled();
    });
  }
});
