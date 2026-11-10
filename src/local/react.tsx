'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useToast } from '@sovereignfs/ui';
import { authClient } from '../auth/client';
import { SyncClient } from './client';
import { type LocalDatabase, openLocal } from './db';
import { DEFAULT_INTERVAL_MS, browserEnvironment, startSyncLoop } from './loop';
import { onWake, registerBackgroundSync } from './background';
import { refusalToast } from './describe';
import { requestPersistence } from './persist';
import { type Left, leaveDevice } from './signout';
import { rememberPersistence } from './store';
import { fetchTransport } from './transport';

/**
 * The working copy in React (DESIGN.md §12.1): `LocalProvider` opens this account's database once the page is in the browser, makes the client and starts
 * the sync loop; `useLocalQuery` reads the working copy and reads it again whenever it changes, in this tab or another. **Nothing here waits for the network**:
 * a screen renders from the device, and `client` is `null` only for the moment the database takes to open (or for good, in a browser with no IndexedDB, where
 * a screen says so).
 */
interface Local {
  accountId: string;
  client: SyncClient | null;
  /** Signs out of this device: sends what is waiting, asks before losing what cannot be sent, ends the session, and deletes the working copy (§12.10). */
  leave(): Promise<Left>;
}

const Context = createContext<Local | null>(null);

export function LocalProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const [client, setClient] = useState<SyncClient | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    let stopped = false;
    let teardown = () => {};
    void (async () => {
      let db: LocalDatabase;
      try {
        db = await openLocal(accountId);
      } catch {
        // No IndexedDB (a private window in some browsers): there is no working copy, and the screens say so.
        return;
      }
      if (stopped) return db.close();
      const channel =
        typeof BroadcastChannel === 'undefined'
          ? null
          : new BroadcastChannel(`shopper-${accountId}`);
      channelRef.current = channel;
      // Another tab of this account signed out: this one is not signed in any more either.
      const onLeft = (event: MessageEvent) => {
        if ((event.data as { type?: string } | null)?.type === 'left') window.location.assign('/');
      };
      channel?.addEventListener('message', onLeft);
      const made = new SyncClient({
        db,
        transport: fetchTransport(),
        channel: channel ?? undefined,
      });
      let intervalMs = DEFAULT_INTERVAL_MS;
      const learn = async () => {
        const seconds = await made.intervalSeconds();
        if (seconds) intervalMs = seconds * 1000;
      };
      await learn();
      if (stopped) {
        made.close();
        channel?.close();
        return db.close();
      }
      const loop = startSyncLoop({
        client: made,
        lockName: `shopper-sync-${accountId}`,
        environment: browserEnvironment(),
        interval: () => intervalMs,
        onOutcome: () => void learn(),
        // The session ended elsewhere: show sign-in, keep the outbox for the same account (§12.10).
        onSignedOut: () => window.location.assign('/sign-in'),
      });
      // A refused change has been taken back and kept (Couldn't sync); a toast says why, **a refused tick most of all**, since it was put back (§12.5).
      const unrefused = made.onRefused((refusals) => {
        for (const refusal of refusals)
          toastRef.current.show({
            category: 'warning',
            duration: 8000,
            ...refusalToast({ kind: refusal.kind, what: refusal.what }, refusal.sentence),
          });
      });
      // Where the browser has Background Sync, a write asks to be woken when the network is back, and the wake syncs through this loop.
      const unwrite = made.onWrite(registerBackgroundSync);
      const unwake = onWake(() => void loop.syncNow());
      void requestPersistence().then((granted) => rememberPersistence(db, granted));
      teardown = () => {
        loop.stop();
        unrefused();
        unwrite();
        unwake();
        channel?.removeEventListener('message', onLeft);
        made.close();
        channel?.close();
        db.close();
      };
      setClient(made);
    })();
    return () => {
      stopped = true;
      teardown();
      channelRef.current = null;
      setClient(null);
    };
  }, [accountId]);

  const leave = useCallback(
    () =>
      leaveDevice({
        accountId,
        client: client ?? undefined,
        confirmLosing: async (unsent) =>
          window.confirm(
            `${unsent} ${unsent === 1 ? 'change' : 'changes'} on this device could not be sent yet and will be lost if you sign out. Sign out anyway?`,
          ),
        endSession: async () => {
          const { error } = await authClient.signOut();
          // A session that is already gone is as signed out as one that was just ended; only a failure to reach the server is a failure.
          if (error && error.status !== 401) throw new Error('could not sign out');
        },
        announce: () => channelRef.current?.postMessage({ type: 'left' }),
      }),
    [accountId, client],
  );

  return <Context.Provider value={{ accountId, client, leave }}>{children}</Context.Provider>;
}

export function useLocal(): Local {
  const local = useContext(Context);
  if (!local) throw new Error('useLocal is used outside a LocalProvider');
  return local;
}

/**
 * Reads the working copy and **reads it again when it changes**. `data` is `undefined` until the first read, which is a moment on a device that has
 * synced before and never a network: a screen draws from it with no spinner. `deps` are what the query depends on, as in an effect.
 */
export function useLocalQuery<T>(
  query: (db: LocalDatabase) => Promise<T>,
  deps: readonly unknown[] = [],
): { data: T | undefined; ready: boolean } {
  const { client } = useLocal();
  const [state, setState] = useState<{ data: T | undefined; ready: boolean }>({
    data: undefined,
    ready: false,
  });
  const latest = useRef(query);
  latest.current = query;

  useEffect(() => {
    if (!client) return;
    let current = true;
    let running = false;
    let again = false;
    const run = async () => {
      // One read at a time: a change during a read is remembered and read once more when it ends.
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          const data = await client.read(latest.current);
          if (current) setState({ data, ready: true });
        } while (again && current);
      } finally {
        running = false;
      }
    };
    void run();
    const stop = client.subscribe(() => void run());
    return () => {
      current = false;
      stop();
    };
    // The caller names what the query depends on, as the dependencies of an effect.
  }, [client, ...deps]);

  return state;
}
