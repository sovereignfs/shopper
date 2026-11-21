'use client';

import { appKeys } from '@sovereignfs/sdk/keys';

/**
 * The app key from core (RFC 0001, sdk §9.3), for an account that signs in through core: `appKeys` with core's address, Shopper's client id at core
 * and the key return address as registered, all handed to the page by the server (`keySourceOf`), and Shopper's own route for the session's secret.
 */
export interface CoreKeySettings {
  readonly core: string;
  readonly clientId: string;
  readonly returnTo: string;
}

export function coreKeys(settings: CoreKeySettings) {
  return appKeys({ ...settings, secretPath: '/api/keys/secret' });
}
