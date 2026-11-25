import { describe, expect, it } from 'vitest';
import { LOCALES, dateOnly, dateTime, localeOf, timeZoneOf, timeZones } from './regional';

// 2026-11-23 23:30 UTC: a different day, and hour, in Auckland.
const AT = Date.UTC(2026, 10, 23, 23, 30);

describe('a language and region', () => {
  it('is a tag the platform knows, in its canonical form', () => {
    expect(localeOf('en-GB')).toBe('en-GB');
    expect(localeOf('de-de')).toBe('de-DE');
    for (const tag of LOCALES) expect(localeOf(tag), tag).toBe(tag);
  });

  it('is nothing for what is not a tag', () => {
    for (const value of [
      '',
      'English',
      'en_GB',
      'x'.repeat(40),
      '../etc',
      'en-GB; DROP',
      null,
      undefined,
      4,
    ])
      expect(localeOf(value), String(value)).toBeUndefined();
  });
});

describe('a time zone', () => {
  it('is an IANA name the platform knows', () => {
    expect(timeZoneOf('Europe/London')).toBe('Europe/London');
    expect(timeZoneOf('Pacific/Auckland')).toBe('Pacific/Auckland');
    expect(timeZones()).toContain('Europe/Berlin');
  });

  it('is nothing for what is not one', () => {
    for (const value of ['', 'London', 'Mars/Olympus', '../x', 'x'.repeat(70), null, undefined, 4])
      expect(timeZoneOf(value), String(value)).toBeUndefined();
  });
});

describe('a date written with them', () => {
  it('follows the zone: the same moment is another day and hour in Auckland', () => {
    expect(dateOnly(AT, { locale: 'en-GB', timeZone: 'UTC' })).toBe('23 Nov 2026');
    expect(dateOnly(AT, { locale: 'en-GB', timeZone: 'Pacific/Auckland' })).toBe('24 Nov 2026');
    expect(dateTime(AT, { locale: 'en-GB', timeZone: 'Pacific/Auckland' })).toContain('12:30');
  });

  it('follows the language: the month is written in it', () => {
    expect(dateOnly(AT, { locale: 'de-DE', timeZone: 'UTC' })).toBe('23.11.2026');
    expect(dateOnly(AT, { locale: 'en-US', timeZone: 'UTC' })).toBe('Nov 23, 2026');
  });

  it('is the browser’s own for what was not chosen', () => {
    expect(dateTime(AT)).toBe(
      new Date(AT).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    );
  });
});
