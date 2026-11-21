'use client';

import { useEffect } from 'react';
import { rememberIdentity, rememberKeySource } from '../identity';
import type { PageKeySource } from '../keys/keys';

/** Keeps who is signed in on this device, for the shell that opens with no network (`src/identity.ts`). Draws nothing. */
export function RememberIdentity({
  accountId,
  name,
  email,
  keys,
}: {
  accountId: string;
  name: string;
  email: string;
  /** Where the account's key comes from, for the shell too (RFC 0001). */
  keys?: PageKeySource | undefined;
}) {
  useEffect(() => rememberIdentity({ id: accountId, name, email }), [accountId, name, email]);
  useEffect(() => rememberKeySource(keys), [keys]);
  return null;
}
