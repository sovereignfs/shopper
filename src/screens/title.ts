'use client';

import { useEffect } from 'react';
import { site } from '../site';

/**
 * A page's title (RFC 0005, "Page titles"): its parts, most particular first, with the app's name last, `<list> · Shopper`. With no parts
 * it is the app's name alone, which is what a page shows until it has opened the name it is about.
 */
export function titleOf(parts: readonly string[]): string {
  const named = parts.map((part) => part.trim()).filter((part) => part !== '');
  return [...named, site.name].join(' · ');
}

/**
 * Sets the title from a name only the browser can open (a list's name is encrypted, so the server cannot put it in the title, and never has it). Until
 * the name is opened a screen passes no parts, and the title stays the server's, which is the app's name.
 *
 * When the screen goes away it puts back what was there, **unless the next page has already set its own** (a title that is no longer ours is left
 * alone): the server's titles are the same text for two pages that have no name of their own, so a title left behind would stay.
 */
export function useTitle(parts: readonly string[]): void {
  const title = titleOf(parts);
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      if (document.title === title) document.title = before;
    };
  }, [title]);
}
