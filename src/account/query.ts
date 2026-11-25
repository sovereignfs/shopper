/**
 * Which part of Settings an address asks for (RFC 0005, DESIGN.md §17): `/settings/<section>`, one of six. Pure, so that what a stray or hostile address does
 * is tested with no browser. The sections are **Profile**, **Security**, **Preferences**, **Notifications**, **This device** (`device`) and **Data**, in the
 * order the dialog lists them. Before 0.5.0 there were six (`/settings?section=…`), then four, with This device and Notifications under Preferences; from 0.8.3 they
 * are sections of their own again. Those addresses are still answered, with the section that took their place.
 */
export const SECTIONS = [
  'profile',
  'security',
  'preferences',
  'notifications',
  'device',
  'data',
] as const;
export type AccountSection = (typeof SECTIONS)[number];

/** The section an address segment names, or `null` for anything else (a section that does not exist is not found, and `Object.prototype`'s names are not sections). */
export function sectionOf(asked: string | undefined): AccountSection | null {
  return (SECTIONS as readonly string[]).includes(asked ?? '') ? (asked as AccountSection) : null;
}

/** Where each of the old six sections went: Sign-in and Encryption into Security; This device and Notifications are sections again (they were Preferences' in 0.5.0 to 0.8.2). */
const BEFORE: Readonly<Record<string, AccountSection>> = {
  profile: 'profile',
  device: 'device',
  notifications: 'notifications',
  'sign-in': 'security',
  encryption: 'security',
  data: 'data',
};

/** The section an old `/settings?section=…` address means, and Profile for anything that is not one (`Object.hasOwn`, so that `__proto__` is nothing). */
export function sectionBefore(asked: string | undefined): AccountSection {
  return asked !== undefined && Object.hasOwn(BEFORE, asked)
    ? (BEFORE[asked] ?? 'profile')
    : 'profile';
}

/** The first value of a search parameter, which is all one of ours is. */
export const one = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;
