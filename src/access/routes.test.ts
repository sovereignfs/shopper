import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATIONS } from '../households/ops';
import { ACCESS } from './routes';

const ROOT = path.resolve(__dirname, '../..');

/** Every page and route under `app/`, as the address it is served at: a route group, `(app)`, is not part of it. */
function addresses(folder: string, kind: 'page' | 'route'): string[] {
  const file = kind === 'page' ? /^page\.tsx?$/ : /^route\.tsx?$/;
  const out: string[] = [];
  const walk = (directory: string, parts: string[]) => {
    for (const name of readdirSync(path.join(ROOT, directory))) {
      const full = path.join(ROOT, directory, name);
      if (statSync(full).isDirectory()) {
        walk(path.join(directory, name), /^\(.*\)$/.test(name) ? parts : [...parts, name]);
      } else if (file.test(name)) {
        out.push(`/${parts.join('/')}`);
      }
    }
  };
  walk(folder, []);
  return out;
}

describe('the list of who may use what', () => {
  const listed = (kind: 'page' | 'route') =>
    ACCESS.filter((a) => a.kind === kind)
      .map((a) => a.address)
      .sort();

  it('names every page in app/, and no page that is not there', () => {
    expect(listed('page')).toEqual(addresses('app', 'page').sort());
  });

  it('names every route in app/, and no route that is not there', () => {
    expect(listed('route')).toEqual(addresses('app', 'route').sort());
  });

  it('names every operation, and no operation that is not there', () => {
    expect(
      ACCESS.filter((a) => a.kind === 'operation')
        .map((a) => a.address)
        .sort(),
    ).toEqual(OPERATIONS.map((o) => o.name).sort());
    for (const operation of OPERATIONS) {
      const entry = ACCESS.find((a) => a.kind === 'operation' && a.address === operation.name);
      expect(entry?.who, operation.name).toBe(operation.who);
    }
  });

  it('says who for each, once', () => {
    const keys = ACCESS.map((a) => `${a.kind} ${a.address}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of ACCESS) expect(entry.note.length, entry.address).toBeGreaterThan(10);
  });

  // The test is only worth anything if it can fail, so show that it does.
  it('would notice a page that is not listed', () => {
    expect(addresses('app', 'page')).toContain('/shell');
    expect(addresses('app', 'page').filter((a) => a !== '/shell')).not.toEqual(listed('page'));
  });
});
