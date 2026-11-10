import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from './proxy';

const request = (path: string, base = 'https://shopper.example.com') =>
  new NextRequest(`${base}${path}`);

/** The `x-middleware-request-*` headers Next copies onto a response: what the page will see as its request's. */
const forwarded = (response: Response, name: string) =>
  response.headers.get(`x-middleware-request-${name}`);

afterEach(() => vi.unstubAllEnvs());

describe('the proxy', () => {
  it('sends a page with a Content-Security-Policy that carries the nonce the page is given', () => {
    vi.stubEnv('SHOPPER_URL', 'https://shopper.example.com');
    const response = proxy(request('/'));
    const policy = response.headers.get('content-security-policy') ?? '';
    const nonce = forwarded(response, 'x-nonce') ?? '';
    expect(nonce).not.toBe('');
    expect(policy).toContain(`'nonce-${nonce}'`);
    // The page's own copy of the request is given the same policy, which is where Next reads the nonce from.
    expect(forwarded(response, 'content-security-policy')).toBe(policy);
  });

  it('makes a new nonce for every request', () => {
    const nonces = new Set(
      Array.from({ length: 50 }, () => forwarded(proxy(request('/l/1')), 'x-nonce')),
    );
    expect(nonces.size).toBe(50);
  });

  it('puts the policy on every kind of page: the landing page, a list, a missing route and sign-in', () => {
    for (const path of ['/', '/l/abc', '/no-such-page', '/sign-in', '/settings', '/invite/x']) {
      expect(proxy(request(path)).headers.get('content-security-policy'), path).toContain(
        "script-src 'self' 'nonce-",
      );
    }
  });

  it('puts no page policy on an API answer, and does not forward a nonce to it', () => {
    const reply = proxy(request('/api/health'));
    expect(reply.headers.get('content-security-policy')).toBeNull();
    expect(forwarded(reply, 'x-nonce')).toBeNull();
  });

  it('sends HSTS only where the app is served over https', () => {
    vi.stubEnv('SHOPPER_URL', 'https://shopper.example.com');
    expect(proxy(request('/')).headers.get('strict-transport-security')).toContain('max-age=');
    vi.stubEnv('SHOPPER_URL', 'http://localhost:3007');
    expect(
      proxy(request('/', 'http://localhost:3007')).headers.get('strict-transport-security'),
    ).toBeNull();
  });

  it('is not run for the build’s static files, the service worker or the manifest', () => {
    const source = config.matcher[0]?.source ?? '';
    const pattern = new RegExp(`^${source.replace(/^\/\(/, '/(')}$`);
    for (const path of ['/_next/static/x.js', '/icons/icon.svg', '/sw.js', '/manifest.webmanifest'])
      expect(pattern.test(path), path).toBe(false);
    for (const path of ['/', '/l/abc', '/api/health']) expect(pattern.test(path), path).toBe(true);
  });
});
