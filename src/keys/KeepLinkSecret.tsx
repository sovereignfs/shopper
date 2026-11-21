'use client';

import { useEffect } from 'react';
import { linkSecretKey } from './link';

/**
 * Keeps an invitation link's secret (after `#`, RFC 0001) in this tab, the moment the page opens, and takes it out of the address: signing up or in
 * leaves this page and comes back without it, and an address with it would be copied, kept in history or shown. It is never sent. Draws nothing.
 */
export function KeepLinkSecret({ token }: { token: string }) {
  useEffect(() => {
    const secret = window.location.hash.replace(/^#/, '');
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return;
    try {
      window.sessionStorage.setItem(linkSecretKey(token), secret);
    } catch {
      // Storage that is blocked: the secret is in this page only, and joining from it still works.
    }
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    (window as unknown as { __shopperLinkSecret?: string }).__shopperLinkSecret = secret;
  }, [token]);
  return null;
}

/** The link's secret, as `KeepLinkSecret` kept it. */
export function readLinkSecret(token: string): string | null {
  try {
    const kept = window.sessionStorage.getItem(linkSecretKey(token));
    if (kept) return kept;
  } catch {
    // Blocked storage: what this page kept, if anything.
  }
  return (window as unknown as { __shopperLinkSecret?: string }).__shopperLinkSecret ?? null;
}

export function forgetLinkSecret(token: string): void {
  try {
    window.sessionStorage.removeItem(linkSecretKey(token));
  } catch {
    // Nothing to remove.
  }
  delete (window as unknown as { __shopperLinkSecret?: string }).__shopperLinkSecret;
}
