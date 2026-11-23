import { signedInUser } from '@sovereignfs/auth/core';
import { getAuthStore } from '../db/boot';
import { pictureOf } from './core-links';
import { authSettings } from './server';
import type { Session } from './session';

/**
 * The picture core has for the person signed in, for the header's avatar and Settings › Profile (RFC 0005): what core said of them when they signed in
 * through it, kept on their session and renewed with each check (`signedInUser`), and **only if it is an address on core's own origin** (`pictureOf`). Nothing
 * when Shopper runs alone, where the avatar is the person's initials, or when core has none. It asks the auth store and no one else.
 */
export async function corePicture(session: Session): Promise<string | undefined> {
  const core = authSettings()?.sovereign?.issuer;
  if (!core) return undefined;
  const user = await signedInUser(await getAuthStore(), session);
  return pictureOf(user.picture, core);
}
