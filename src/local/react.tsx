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
import { EncryptionMemory, encryptingTransport } from '../keys/transport';
import { useKeys } from '../keys/keys';
import type { Keyring } from '../keys/household';
import { Mover } from '../keys/mover';
import { keepPending, keepPendingCards } from '../keys/pending';
import { callOperation } from './ops';
import { rowListOf } from './row-list';
import { householdsOf } from './store';

/**
 * The working copy in React (DESIGN.md §12.1): `LocalProvider` opens this account's database once the page is in the browser, makes the client and starts
 * the sync loop; `useLocalQuery` reads the working copy and reads it again whenever it changes, in this tab or another. **Nothing here waits for the network**:
 * a screen renders from the device, and `client` is `null` only for the moment the database takes to open (or for good, in a browser with no IndexedDB, where
 * a screen says so).
 */
interface Local {
  accountId: string;
  client: SyncClient | null;
  /**
   * Asks for the fastest sync the design allows while a screen is open (shopping mode, DESIGN.md §11.1): every 10 seconds, or the operator's interval if
   * that is shorter. Returns what ends the request. It syncs once at once, so that the screen opens on what others have just done.
   */
  holdFresh(): () => void;
  /** Signs out of this device: sends what is waiting, asks before losing what cannot be sent, ends the session, and deletes the working copy (§12.10). */
  leave(): Promise<Left>;
  /**
   * A household's keys on this device (RFC 0001): whether it has moved, and its keyring while the app key is open, for what needs it beside the sync
   * (an invitation link carries it, `ShareDialog`).
   */
  /** A group's encryption, and its keyring (its own account's only), or a list's keyring when `list` is given (RFC 0004). */
  keysOf(
    household: string,
    list?: string,
  ): Promise<{ encrypted: boolean; ring: Keyring | undefined }>;
  /** A card's keyring (RFC 0007): the reader's own copy of it, or derived from the group's where the reader has the group's (its Admin, who alone makes a link to it, always has). */
  cardKeysOf(
    household: string,
    card: string,
  ): Promise<{ encrypted: boolean; ring: Keyring | undefined }>;
}

const Context = createContext<Local | null>(null);

/** The freshest a screen that asks for it gets (DESIGN.md §11.1): ten seconds, unless the operator's interval is shorter. */
export const FRESH_INTERVAL_MS = 10_000;

export function LocalProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const [client, setClient] = useState<SyncClient | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const fresh = useRef(0);
  const syncNow = useRef<() => void>(() => undefined);
  const rearm = useRef<() => void>(() => undefined);
  // The key as it is at each sync (RFC 0001): read through a ref, so that unlocking needs no new loop.
  const keys = useKeys();
  const appKeyRef = useRef<CryptoKey | undefined>(undefined);
  appKeyRef.current = keys.current.state === 'open' ? keys.current.key : undefined;
  const memoryRef = useRef<EncryptionMemory | null>(null);
  const moverRef = useRef<{ mover: Mover; db: LocalDatabase } | null>(null);
  // Unlocked, sync at once (what the device held back goes now), and move each household that can move (RFC 0001), then sync it encrypted.
  useEffect(() => {
    if (keys.current.state !== 'open') return;
    const key = keys.current.key;
    syncNow.current();
    // Copies of lists' keys from a link that the server has not taken yet (RFC 0004): sent again now.
    void keepPending(storage(), async (entry) => {
      const answer = await callOperation({
        op: 'list.key.mine',
        household: entry.household,
        list: entry.list,
        record: entry.record,
      });
      return answer.ok;
    });
    // And the cards' (RFC 0007).
    void keepPendingCards(storage(), async (entry) => {
      const answer = await callOperation({
        op: 'card.key.mine',
        household: entry.household,
        card: entry.card,
        record: entry.record,
      });
      return answer.ok;
    });
    void (async () => {
      const held = moverRef.current;
      if (!held) return;
      const households = (await householdsOf(held.db)).map((each) => each.id);
      if (await held.mover.run(households, key)) syncNow.current();
    })();
  }, [keys.current]);

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
      // Which households have moved, and their keys while open (RFC 0001): one for the transport, the move and the share dialog alike.
      const memory = new EncryptionMemory(storage(), `shopper.encrypted.${accountId}`);
      memoryRef.current = memory;
      moverRef.current = { mover: new Mover(memory), db };
      const made = new SyncClient({
        db,
        transport: encryptingTransport(
          fetchTransport(),
          { appKey: () => appKeyRef.current },
          memory,
          // Where a row is, for its list's keys (RFC 0004, §8.3): its list as the server has it, which the transport follows through the outbox in order.
          rowListOf(db),
          (households) =>
            void moverRef.current?.mover
              .run(households, appKeyRef.current)
              .then((moved) => moved && syncNow.current()),
          // An item's name and note as this device holds it, for a change of list that does not carry them.
          async (id) => {
            const item = await db.get('item', id);
            return item ? { name: item.name, note: item.note } : undefined;
          },
          // An Inventory item's starter entry as this device holds it (never changed once made): the name key of a change that gives its name back to the starter.
          async (id) => (await db.get('inventory_item', id))?.starterKey,
        ),
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
        interval: () => (fresh.current > 0 ? Math.min(intervalMs, FRESH_INTERVAL_MS) : intervalMs),
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
      syncNow.current = () => void loop.syncNow();
      rearm.current = () => loop.rearm();
      const unwake = onWake(() => void loop.syncNow());
      void requestPersistence().then((granted) => rememberPersistence(db, granted));
      teardown = () => {
        syncNow.current = () => undefined;
        rearm.current = () => undefined;
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

  const holdFresh = useCallback(() => {
    fresh.current += 1;
    rearm.current();
    syncNow.current();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      fresh.current -= 1;
      rearm.current();
    };
  }, []);

  const keysOf = useCallback(async (household: string, list?: string) => {
    const memory = memoryRef.current;
    if (!memory) return { encrypted: false, ring: undefined };
    return {
      encrypted: memory.isEncrypted(household),
      ring: list
        ? await memory.listKeyring(household, list, appKeyRef.current)
        : await memory.keyring(household, appKeyRef.current),
    };
  }, []);

  const cardKeysOf = useCallback(async (household: string, card: string) => {
    const memory = memoryRef.current;
    if (!memory) return { encrypted: false, ring: undefined };
    return {
      encrypted: memory.isEncrypted(household),
      ring: await memory.cardKeyring(household, card, appKeyRef.current),
    };
  }, []);

  return (
    <Context.Provider value={{ accountId, client, leave, holdFresh, keysOf, cardKeysOf }}>
      {children}
    </Context.Provider>
  );
}

/** The working copy if there is a provider above, and `null` if there is not: the page the service worker keeps has none, since it holds nothing of a person. */
export function useLocalOptional(): Local | null {
  return useContext(Context);
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

/** The page's own storage, if it may be used: which households have moved is kept there, per account, and removed at sign-out. */
function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
