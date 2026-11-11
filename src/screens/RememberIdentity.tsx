'use client';

import { useEffect } from 'react';
import { rememberIdentity } from '../identity';

/** Keeps who is signed in on this device, for the shell that opens with no network (`src/identity.ts`). Draws nothing. */
export function RememberIdentity({
  accountId,
  name,
  email,
}: {
  accountId: string;
  name: string;
  email: string;
}) {
  useEffect(() => rememberIdentity({ id: accountId, name, email }), [accountId, name, email]);
  return null;
}
