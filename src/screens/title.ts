'use client';

import { useEffect, useRef } from 'react';
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
 * **Who sets the title.** More than one screen can be there at once (Settings is a dialog over a list), and each names what it is. **A dialog is the title over
 * the page under it, whichever mounted first** (loaded directly, Settings mounts before the list it is over has opened its name), and among the same kind the
 * one **opened last** is; when it goes the one under it is again. Pure, so that this is tested with no document; `useTitle` is the part that touches one.
 */
export interface TitleEntry {
  title: string;
  /** Whether this is a dialog, which is the title over any page. */
  readonly over: boolean;
}

export class Titles {
  private readonly entries: TitleEntry[] = [];

  /** A screen names itself. The entry is what it changes (`entry.title = …`) and gives back to leave. */
  add(title: string, over = false): TitleEntry {
    const entry = { title, over };
    this.entries.push(entry);
    return entry;
  }

  remove(entry: TitleEntry): void {
    const at = this.entries.indexOf(entry);
    if (at >= 0) this.entries.splice(at, 1);
  }

  /** The title now: the last dialog's, else the last page's, or `undefined` when none is there. */
  current(): string | undefined {
    return (this.entries.findLast((entry) => entry.over) ?? this.entries.at(-1))?.title;
  }
}

const titles = new Titles();
/** What the document's title was before the first screen set one, put back when the last has gone (unless the next page has set its own). */
let before: string | undefined;
let observer: MutationObserver | undefined;

/** Puts the current title on the document, if it is not there. */
function keep(): void {
  const now = titles.current();
  if (now !== undefined && document.title !== now) document.title = now;
}

/**
 * Sets the title from a name only the browser can open (a list's name is encrypted, so the server cannot put it in the title, and never has it). Until
 * the name is opened a screen passes no parts, and the title is the server's, which is the app's name.
 *
 * **The browser's title is kept while a screen is there.** Next makes the page's `<title>` again when it moves between routes, and does it late when its
 * metadata streams in, which writes the app's name over what was set here: seen in WebKit, after a move from a list's settings to Settings. So a change to
 * the head puts the title back, for as long as a screen is mounted: one observer, for whichever screen is the current one (`Titles`).
 *
 * When the last screen goes it puts back what it found, **unless the next page has already set its own** (a title that is no longer ours is left alone).
 */
export function useTitle(parts: readonly string[], options: { over?: boolean } = {}): void {
  const title = titleOf(parts);
  const over = options.over === true;
  const entry = useRef<TitleEntry | null>(null);

  useEffect(() => {
    if (titles.current() === undefined) {
      before = document.title;
      observer = new MutationObserver(keep);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    }
    const mine = titles.add(title, over);
    entry.current = mine;
    keep();
    return () => {
      const last = titles.current();
      titles.remove(mine);
      entry.current = null;
      if (titles.current() === undefined) {
        observer?.disconnect();
        observer = undefined;
        if (document.title === last && before !== undefined) document.title = before;
        before = undefined;
      } else keep();
    };
    // Mounted once: a change of title below updates the entry in place, so that a screen under another stays under it.
  }, []);

  useEffect(() => {
    if (entry.current) entry.current.title = title;
    keep();
  }, [title]);
}
