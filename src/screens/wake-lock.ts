import { useEffect } from 'react';

/**
 * **Keeps the screen on** while the page is visible (DESIGN.md §11.1), by the Screen Wake Lock API where the browser has it. The browser drops the lock when
 * the page is hidden, so it is asked for again when the page is shown, and let go when the screen is left. **Where the browser lacks it, or refuses, nothing
 * is said**: a person in a shop is not told about a browser's limits.
 */
interface Sentinel {
  release(): Promise<void>;
}

export function useWakeLock(): void {
  useEffect(() => {
    const wakeLock = (
      navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }
    ).wakeLock;
    if (!wakeLock) return;
    let held: Sentinel | null = null;
    let gone = false;
    const take = async () => {
      if (gone || held || document.visibilityState !== 'visible') return;
      try {
        const lock = await wakeLock.request('screen');
        if (gone) await lock.release().catch(() => undefined);
        else held = lock;
      } catch {
        // Refused (a low battery, a permission policy): the screen simply may sleep.
      }
    };
    const onVisible = () => {
      // A hidden page has lost the lock already; forget it so that showing the page asks again.
      if (document.visibilityState !== 'visible') held = null;
      else void take();
    };
    document.addEventListener('visibilitychange', onVisible);
    void take();
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      void held?.release().catch(() => undefined);
    };
  }, []);
}
