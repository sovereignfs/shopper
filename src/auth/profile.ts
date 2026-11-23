import { signedInUser } from '@sovereignfs/auth/core';
import { getAuthStore } from '../db/boot';
import { localeOf, timeZoneOf, type Regional } from '../format/regional';
import { pictureOf } from './core-links';
import { authSettings } from './server';
import type { Session } from './session';

/** What Shopper knows of the person that is not on its own records: how they are shown and how dates are written for them. */
export interface AccountFacts extends Regional {
  /** Core's picture of them, in suite mode, if it is an address on core's own origin. */
  readonly picture?: string | undefined;
}

/**
 * The picture, the time zone and the language of the person signed in (RFC 0005). Running alone they are the account's own (`session.user`), which
 * Settings › Preferences sets. Hosted by Sovereign they are **core's**, as `signedInUser` has them: what core said when they signed in through it, kept on their
 * session and renewed with each check, falling back to the account's; the picture only if it is an address on core's own origin (`pictureOf`). It asks the auth
 * store and no one else.
 */
export async function accountFacts(session: Session): Promise<AccountFacts> {
  const own = {
    locale: localeOf(session.user.locale),
    timeZone: timeZoneOf(session.user.timezone),
  };
  const core = authSettings()?.sovereign?.issuer;
  if (!core) return own;
  const user = await signedInUser(await getAuthStore(), session);
  return {
    picture: pictureOf(user.picture, core),
    locale: localeOf(user.locale) ?? own.locale,
    timeZone: timeZoneOf(user.zoneinfo) ?? own.timeZone,
  };
}
