'use client';

import { createAuthClient } from 'better-auth/react';

/** better-auth in the browser, talking to `/api/auth` on the same origin. Passkeys and the authenticator app add their clients with task 2.8. */
export const authClient = createAuthClient();
