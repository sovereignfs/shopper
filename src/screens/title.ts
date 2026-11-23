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
 * the name is opened a screen passes no parts, and the title is the server's, which is the app's name.
 *
 * **The browser's title is kept while the screen is there.** Next makes the page's `<title>` again when it moves between routes, and does it late when its
 * metadata streams in, which writes the app's name over what was set here: seen in WebKit, after a move from a list's settings to Settings. So a change to
 * the head puts the title back, for as long as this screen is mounted.
 *
 * When the screen goes it puts back what it found, **unless the next page has already set its own** (a title that is no longer ours is left alone).
 */
export function useTitle(parts: readonly string[]): void {
  const title = titleOf(parts);
  useEffect(() => {
    const before = document.title;
    document.title = title;
    const keep = () => {
      if (document.title !== title) document.title = title;
    };
    const observer = new MutationObserver(keep);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (document.title === title) document.title = before;
    };
  }, [title]);
}
