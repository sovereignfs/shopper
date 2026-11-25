'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { dateOnly, dateTime, type Regional } from '../format/regional';

/**
 * What the signed-in page knows of the person that Settings can change (RFC 0005): their **name** and, for how dates are written, their **time zone and
 * language**. The server gives them to the signed-in layout; Settings changes them and **says so here**, so that the header and every date follow at once and
 * **no route is refreshed**: the dialog is a route of its own (opened from a page it is an intercepted one, at an address it chose in place), and refreshing it
 * moves what is under it. A fresh answer from the server (a reload, a later navigation) replaces what was chosen here. The offline shell has none: it writes
 * dates as the browser does.
 */
interface Facts extends Regional {
  readonly name?: string | undefined;
}

interface Account extends Facts {
  /** Says that the person changed these, once the server has kept them. */
  update(patch: Facts): void;
}

const Context = createContext<Account>({ update: () => undefined });

export function AccountProvider({
  name,
  locale,
  timeZone,
  children,
}: Facts & { children: ReactNode }) {
  const [changed, setChanged] = useState<Facts>({});
  // What the server says now is the truth: what was chosen here is only until it answers.
  useEffect(() => setChanged({}), [name, locale, timeZone]);
  const update = useCallback((patch: Facts) => setChanged((now) => ({ ...now, ...patch })), []);
  const value = useMemo<Account>(
    () => ({
      name: 'name' in changed ? changed.name : name,
      locale: 'locale' in changed ? changed.locale : locale,
      timeZone: 'timeZone' in changed ? changed.timeZone : timeZone,
      update,
    }),
    [changed, name, locale, timeZone, update],
  );
  return <Context value={value}>{children}</Context>;
}

/** The person's name and time zone and language as they are now, and how to say that they changed. */
export const useAccount = (): Account => useContext(Context);

/** Dates written the way the person chose: `dateTime(at)` is "12 Nov 2026, 14:03" and `dateOnly(at)` "12 Nov 2026". */
export function useFormat(): {
  dateTime: (at: number) => string;
  dateOnly: (at: number) => string;
} {
  const { locale, timeZone } = useAccount();
  return useMemo(
    () => ({
      dateTime: (at) => dateTime(at, { locale, timeZone }),
      dateOnly: (at) => dateOnly(at, { locale, timeZone }),
    }),
    [locale, timeZone],
  );
}
