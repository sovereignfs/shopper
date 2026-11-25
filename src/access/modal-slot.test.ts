import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const AREA = path.resolve(__dirname, '../../app/(app)');

/**
 * The address of every page under `folder`, as it is served: a route group is not part of it, nor is a slot (`@modal`), and an intercepting route, `(.)settings`, is the
 * address it intercepts. `inSlot` says whether `folder` is the slot's own, or the area, whose slot is not looked into.
 */
function pagesOf(folder: string, inSlot: boolean): string[] {
  const out: string[] = [];
  const walk = (directory: string, parts: string[]) => {
    for (const name of readdirSync(directory)) {
      const full = path.join(directory, name);
      if (statSync(full).isDirectory()) {
        if (name.startsWith('@')) {
          if (inSlot) walk(full, parts);
          continue;
        }
        const intercepts = /^\(\.+\)(.+)$/.exec(name);
        const group = /^\(.*\)$/.test(name) && intercepts === null;
        walk(full, group ? parts : [...parts, intercepts?.[1] ?? name]);
      } else if (/^page\.tsx?$/.test(name)) {
        out.push(`/${parts.join('/')}`);
      }
    }
  };
  walk(folder, []);
  return out.sort();
}

/**
 * The settings dialog's slot (`@modal`, RFC 0005) and the signed-in area it is in (`app/(app)`): Next's strict route matching (on by default since 16.4) wants every address the
 * slot matches to be one the area's pages match too. A page for the front address, or a catch-all, in the slot claims the addresses outside the area, so that the visitor's front
 * page, sign-in and sign-up are served as not found in `pnpm dev` (a production build serves them, so no other test sees it).
 */
describe('the settings dialog’s slot', () => {
  const area = pagesOf(AREA, false);
  const slot = pagesOf(path.join(AREA, '@modal'), true);

  it('finds the area’s pages, and the slot’s', () => {
    expect(area).toContain('/home');
    expect(area).toContain('/settings/[section]');
    expect(slot).toContain('/settings');
  });

  it('has a page for every address of the signed-in area, and for no other', () => {
    expect(slot).toEqual(area);
  });

  it('has no catch-all, which matches the addresses outside the area too', () => {
    expect(slot.filter((address) => /\[\[?\.\.\./.test(address))).toEqual([]);
  });
});
