import { describe, expect, it } from 'vitest';
import { destination, suiteStep, toCore } from './suite';

const INVITE = `/invite/${'a'.repeat(43)}`;

describe('suite mode’s sign-in and sign-up (RFC 0005)', () => {
  it('sends someone with no session to core at once, keeping an invitation’s page', () => {
    expect(suiteStep(false, undefined, INVITE)).toEqual({ kind: 'go', to: toCore(INVITE) });
    expect(toCore(INVITE)).toBe(
      `/api/auth/sign-in/sovereign?returnTo=${encodeURIComponent(INVITE)}`,
    );
    expect(suiteStep(false, undefined, null)).toEqual({ kind: 'go', to: toCore(null) });
    expect(toCore(null)).toBe('/api/auth/sign-in/sovereign?returnTo=%2F');
  });

  it('asks core for its sign-up for Create an account, and for a fresh sign-in when something wants one', () => {
    expect(toCore(null, 'create')).toBe('/api/auth/sign-in/sovereign?prompt=create&returnTo=%2F');
    expect(toCore(INVITE, 'create')).toBe(
      `/api/auth/sign-in/sovereign?prompt=create&returnTo=${encodeURIComponent(INVITE)}`,
    );
    expect(toCore('/settings/data', 'login')).toBe(
      '/api/auth/sign-in/sovereign?prompt=login&returnTo=%2Fsettings%2Fdata',
    );
    expect(suiteStep(false, undefined, INVITE, 'create')).toEqual({
      kind: 'go',
      to: toCore(INVITE, 'create'),
    });
    // Trying again after a failure at core's sign-up is core's sign-up again, not its sign-in.
    expect(suiteStep(false, 'sovereign', null, 'create')).toEqual({
      kind: 'show',
      error: 'sovereign',
      retry: toCore(null, 'create'),
    });
  });

  it('sends someone with a session where they were going, never to core', () => {
    expect(suiteStep(true, undefined, INVITE)).toEqual({ kind: 'go', to: INVITE });
    expect(suiteStep(true, 'sovereign', null)).toEqual({ kind: 'go', to: '/' });
  });

  it('shows a failure at core once, with a way to try again, and does not send the person back by itself', () => {
    expect(suiteStep(false, 'sovereign', INVITE)).toEqual({
      kind: 'show',
      error: 'sovereign',
      retry: toCore(INVITE),
    });
  });

  it('keeps the destination from Shopper’s `next` or the package’s `returnTo`, and only an invitation’s page', () => {
    expect(destination({ next: INVITE })).toBe(INVITE);
    expect(destination({ returnTo: INVITE })).toBe(INVITE);
    expect(destination({ returnTo: 'https://evil.example/' })).toBeNull();
    expect(destination({ next: '/settings', returnTo: '/' })).toBeNull();
  });
});
