import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTING_NAMES } from './env';

const ROOT = path.resolve(__dirname, '../..');

/** Every file under a folder, as a path from the repository's root. */
function files(folder: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(ROOT, folder))) {
    const relative = path.join(folder, name);
    if (statSync(path.join(ROOT, relative)).isDirectory()) out.push(...files(relative));
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(relative);
  }
  return out;
}

const source = [...files('src'), ...files('app')].filter((file) => !/\.test\.tsx?$/.test(file));

/** The names `.env.example` gives, set or commented out. */
const example = new Set<string>();
for (const match of readFileSync(path.join(ROOT, '.env.example'), 'utf8').matchAll(
  /^#? ?([A-Z][A-Z0-9_]+)=/gm,
)) {
  if (match[1]) example.add(match[1]);
}

describe('where the environment is read', () => {
  it('is only in src/config: nothing else touches process.env', () => {
    const offenders = source
      .filter((file) => !file.startsWith(path.join('src', 'config') + path.sep))
      .filter((file) => readFileSync(path.join(ROOT, file), 'utf8').includes('process.env'));
    expect(offenders).toEqual([]);
  });
});

describe('.env.example', () => {
  // A secret may be declared by its `_FILE` form alone, and the plain name is the same setting.
  const isGiven = (name: string) =>
    example.has(name) || example.has(`${name}_FILE`) || example.has(name.replace(/_FILE$/, ''));

  it('gives every setting that is declared', () => {
    expect(SETTING_NAMES.filter((name) => !isGiven(name))).toEqual([]);
    expect(SETTING_NAMES.length).toBeGreaterThan(20);
  });

  it('gives nothing that is not declared', () => {
    const declared = new Set(SETTING_NAMES);
    const stray = [...example].filter(
      (name) => name.startsWith('SHOPPER_') && !declared.has(name.replace(/_FILE$/, '')),
    );
    expect(stray).toEqual([]);
  });

  it('is complete for every SHOPPER_ setting the code names', () => {
    const named = new Set<string>();
    for (const file of source) {
      for (const match of readFileSync(path.join(ROOT, file), 'utf8').matchAll(
        /['"`](SHOPPER_[A-Z0-9_]+)['"`]/g,
      )) {
        if (match[1]) named.add(match[1]);
      }
    }
    expect([...named].filter((name) => !isGiven(name))).toEqual([]);
    expect(named.size).toBeGreaterThan(5);
  });
});
