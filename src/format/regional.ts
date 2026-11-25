/**
 * The time zone and the language and region a person chose (Settings › Preferences, RFC 0005), and how Shopper writes a date with them. **Pure,** with `Intl` the
 * only thing it asks of the platform, so that a tag nobody has heard of and a zone that does not exist are tested with no browser. What is not chosen is the
 * browser's own (`undefined` to `Intl`), which is what every date was before.
 */

/** A language and region as a BCP 47 tag, such as `en-GB` or `de-DE`, which `Intl` knows; anything else is `undefined`. */
export function localeOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '' || value.length > 35) return undefined;
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    return canonical !== undefined && Intl.DateTimeFormat.supportedLocalesOf(canonical).length > 0
      ? canonical
      : undefined;
  } catch {
    return undefined;
  }
}

/** A time zone by its IANA name, such as `Europe/London`, which `Intl` knows; anything else is `undefined`. */
export function timeZoneOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '' || value.length > 64) return undefined;
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** What a date is written with: the person's language and zone, or the browser's for what they did not choose. */
export interface Regional {
  readonly locale?: string | undefined;
  readonly timeZone?: string | undefined;
}

/** "12 Nov 2026, 14:03". */
export const dateTime = (at: number, regional: Regional = {}): string =>
  new Date(at).toLocaleString(regional.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(regional.timeZone ? { timeZone: regional.timeZone } : {}),
  });

/** "12 Nov 2026". */
export const dateOnly = (at: number, regional: Regional = {}): string =>
  new Date(at).toLocaleDateString(regional.locale, {
    dateStyle: 'medium',
    ...(regional.timeZone ? { timeZone: regional.timeZone } : {}),
  });

/** The languages offered, as tags: what a person is likely to want, and the one they already have is added when it is another. */
export const LOCALES: readonly string[] = [
  'en-GB',
  'en-US',
  'en-AU',
  'en-CA',
  'en-IE',
  'de-DE',
  'de-AT',
  'de-CH',
  'fr-FR',
  'fr-CA',
  'es-ES',
  'es-MX',
  'it-IT',
  'pt-PT',
  'pt-BR',
  'nl-NL',
  'sv-SE',
  'da-DK',
  'nb-NO',
  'fi-FI',
  'pl-PL',
  'cs-CZ',
  'tr-TR',
  'ja-JP',
];

/** The time zones the platform knows, sorted; a short list where it cannot say (an old engine). */
export function timeZones(): string[] {
  const known = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = known ? known('timeZone') : [];
  return zones.length > 0
    ? zones
    : [
        'UTC',
        'Europe/London',
        'Europe/Berlin',
        'America/New_York',
        'America/Los_Angeles',
        'Asia/Tokyo',
      ];
}
