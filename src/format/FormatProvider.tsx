'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { dateOnly, dateTime, type Regional } from './regional';

/**
 * How dates are written for the person signed in (RFC 0005): their time zone and language, which are the account's (`session.user`), given by the signed-in
 * layout, with the browser's for whichever they have not chosen. Hosted by a Sovereign instance they are core's and arrive with the sign-in; running alone
 * they are Settings › Preferences'. The offline shell has none: it writes dates as the browser does.
 */
const Context = createContext<Regional>({});

export function FormatProvider({ locale, timeZone, children }: Regional & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, timeZone }), [locale, timeZone]);
  return <Context value={value}>{children}</Context>;
}

/** Dates written the way the person chose: `dateTime(at)` is "12 Nov 2026, 14:03" and `dateOnly(at)` "12 Nov 2026". */
export function useFormat(): {
  dateTime: (at: number) => string;
  dateOnly: (at: number) => string;
} {
  const regional = useContext(Context);
  return useMemo(
    () => ({
      dateTime: (at) => dateTime(at, regional),
      dateOnly: (at) => dateOnly(at, regional),
    }),
    [regional],
  );
}
