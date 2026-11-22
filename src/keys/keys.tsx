'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type CoreKeySettings, coreKeys } from './core-client';
import { addressOf, shopperVault } from './vault-client';

/**
 * The key in the page (RFC 0001, DESIGN.md §13.2): one interface over both ways an account gets its app key, core's release or Shopper's vault, chosen
 * by the server from how the account signs in (`keySourceOf`) and handed down. **The key does not gate the screens:** the device's store keeps what it
 * has opened (§12.1), so Shopper works with no network, where the key cannot be opened (the SDK keeps it wrapped by the session's secret, which only the
 * server holds). What needs the key, encrypting what is sent and opening what arrives, happens when the device syncs, which needs the network anyway;
 * a locked key holds the sync and says so (`KeyPrompt`), and never shows ciphertext.
 */
export type PageKeySource =
  | { readonly kind: 'vault'; readonly vaultId: string; readonly email: string }
  | ({ readonly kind: 'core' } & CoreKeySettings);

export type KeyState =
  | { readonly state: 'checking' }
  | { readonly state: 'open'; readonly key: CryptoKey }
  | { readonly state: 'locked' }
  /** No way to a key here: an account that came through core on an instance whose core is not set any more. */
  | { readonly state: 'none' };

export interface Keys {
  readonly current: KeyState;
  readonly kind: PageKeySource['kind'] | undefined;
  /** Opens the key again: core's release (it leaves the page), or the password for the vault. Says whether it opened. */
  unlock(password?: string): Promise<boolean>;
  /** Forgets what this browser keeps of the key: at sign-out. */
  forget(): Promise<void>;
}

const NONE: Keys = {
  current: { state: 'none' },
  kind: undefined,
  unlock: async () => false,
  forget: async () => undefined,
};

const KeysContext = createContext<Keys>(NONE);

export function useKeys(): Keys {
  return useContext(KeysContext);
}

export function KeysProvider({
  source,
  children,
}: {
  source: PageKeySource | undefined;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState<KeyState>(
    source ? { state: 'checking' } : { state: 'none' },
  );
  const ways = useMemo(() => {
    if (!source) return undefined;
    if (source.kind === 'core') return { kind: source.kind, core: coreKeys(source) } as const;
    return { kind: source.kind, vault: shopperVault(source.vaultId), email: source.email } as const;
  }, [source]);

  const open = useCallback(async (): Promise<boolean> => {
    if (!ways) return false;
    try {
      const opened = ways.kind === 'core' ? await ways.core.open() : await ways.vault.open();
      setCurrent(
        opened.state === 'open' ? { state: 'open', key: opened.key } : { state: 'locked' },
      );
      return opened.state === 'open';
    } catch {
      // No network, or the server could not say: locked for now, and asked again when the device syncs.
      setCurrent({ state: 'locked' });
      return false;
    }
  }, [ways]);

  useEffect(() => {
    void open();
    // With no network the key cannot open (the session's secret is the server's): it is tried again when the network is back.
    const retry = () => void open();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [open]);

  const keys = useMemo<Keys>(
    () => ({
      current,
      kind: ways?.kind,
      unlock: async (password) => {
        if (!ways) return false;
        if (ways.kind === 'core') {
          // Core's release leaves the page and comes back to `/keys/return`, which brings the person back here.
          await ways.core.unlock(window.location.pathname + window.location.search);
          return false;
        }
        if (!password) return false;
        const derived = await ways.vault.derive(password, addressOf(ways.email));
        const opened = await ways.vault.afterSignIn(derived.secret);
        return opened === 'locked' ? false : open();
      },
      forget: async () => {
        if (!ways) return;
        await (ways.kind === 'core' ? ways.core.forget() : ways.vault.forget()).catch(
          () => undefined,
        );
        setCurrent({ state: 'locked' });
      },
    }),
    [current, ways, open],
  );

  return <KeysContext.Provider value={keys}>{children}</KeysContext.Provider>;
}

/** A key source read back from the device (`readKeySource`), if it has the shape of one; anything else is none. */
export function parseKeySource(value: unknown): PageKeySource | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (v.kind === 'vault' && typeof v.vaultId === 'string' && typeof v.email === 'string')
    return { kind: 'vault', vaultId: v.vaultId, email: v.email };
  if (
    v.kind === 'core' &&
    typeof v.core === 'string' &&
    typeof v.clientId === 'string' &&
    typeof v.returnTo === 'string'
  )
    return { kind: 'core', core: v.core, clientId: v.clientId, returnTo: v.returnTo };
  return undefined;
}
